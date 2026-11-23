import json
from itertools import combinations
import math
import os
import platform
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import numpy as np
import torch

from .arena import evaluate
from .game import Grid
from .learner import objective, update
from .network import Evaluator, PolicyValue
from .selfplay import Replay
from .actors import coordinate, sample_group
from .storage import Registry, atomic, read, run_dir, write, load_model, locate_model


class Stopped(Exception):
    pass


def device_setup(cfg):
    if cfg.device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA unavailable. Select CPU or install the matching PyTorch CUDA build")
    if cfg.amp and not torch.cuda.is_bf16_supported():
        raise ValueError("Current CUDA device does not support BF16")
    if cfg.learner_gpus > 1 and (not torch.distributed.is_nccl_available()
                                 or torch.cuda.device_count() < cfg.learner_gpus):
        raise ValueError("DDP requires available NCCL and the configured number of CUDA devices")
    if cfg.device == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS unavailable")
    if cfg.device == "cpu":
        torch.set_num_threads(min(4,os.cpu_count() or 1))


def environment(cfg):
    git = subprocess.run(["git","rev-parse","HEAD"],capture_output=True,text=True,
                         cwd=Path(__file__).resolve().parent) if shutil.which("git") else None
    import hashlib
    root = Path(__file__).resolve().parents[1]
    sources = hashlib.sha256()
    for file in sorted([*root.glob("zero/*.py"), *root.glob("cpp/*.cpp")]):
        sources.update(file.name.encode()+file.read_bytes())
    return dict(python=platform.python_version(),torch=str(torch.__version__),numpy=np.__version__,
                platform=platform.platform(),device=cfg.device,backend="cpp" if Grid else "python",
                device_name=torch.cuda.get_device_name() if cfg.device=="cuda" else platform.machine(),
                git=git.stdout.strip() if git and git.returncode==0 else None,source_sha256=sources.hexdigest())


def seed_for(cfg, epoch, index, domain):
    return int(np.random.SeedSequence([cfg.seed,epoch,index,domain]).generate_state(1,dtype=np.uint64)[0])


class Run:
    def __init__(self, folder, cfg):
        self.folder, self.cfg = folder, cfg
        self.meta = read(folder/"status.json")
        self.registry = Registry(cfg)
        self.last = 0

    def status(self, **updates):
        self.meta.update(updates,updated=time.time())
        write(self.folder/"status.json",self.meta)

    def stopping(self):
        limit = self.meta.get("deadline")
        if limit is not None and time.time()>=limit:
            (self.folder/"stop").touch(exist_ok=True)
        return (self.folder/"stop").exists()

    def check(self):
        if self.stopping():
            raise Stopped()

    def progress(self, done, total):
        if time.monotonic()-self.last > 0.4 or done == total:
            self.status(done=done,total=total)
            self.last = time.monotonic()

    def log(self, event, **data):
        with (self.folder/"events.jsonl").open("a",encoding="utf8") as stream:
            stream.write(json.dumps(dict(time=time.time(),event=event,**data),allow_nan=False)+"\n")

    def assessment(self, candidate, champion, seed):
        cfg = self.cfg
        ids = (candidate,champion)
        paths = [self.registry.path/"models"/key if self.meta["kind"]=="train" else locate_model(key) for key in ids]
        if cfg.arena_workers>1:
            from .evaluation_pool import pooled
            report = pooled(self,paths,ids,seed)
        else:
            first,second = [Evaluator(load_model(path),cfg.device) for path in paths]
            report = evaluate(cfg,first,second,ids,seed,self.check,self.progress)
        report.update(candidate_net=read(paths[0]/"meta.json")["net"],incumbent_net=read(paths[1]/"meta.json")["net"])
        return report

    def local_groups(self, state):
        cfg = self.cfg
        evaluator = Evaluator(self.registry.model(state["champion"]),cfg.device)
        for start in range(state["completed"],cfg.games,cfg.lanes):
            end = min(start+cfg.lanes,cfg.games)
            seeds = [seed_for(cfg,state["epoch"],i,1) for i in range(start,end)]
            yield sample_group(self.registry,cfg,evaluator,state["champion"],seeds,state["producer"],self.check)

    def train(self):
        cfg, reg = self.cfg, self.registry
        torch.manual_seed(cfg.seed)
        rng = np.random.default_rng(cfg.seed)
        model = PolicyValue(cfg.net).to(cfg.device)
        optimizer = torch.optim.SGD(model.parameters(),lr=cfg.lr,momentum=0.9)
        checkpoint = self.folder/"checkpoint.pt"
        parent = self.meta.get("source")
        if parent:
            with (run_dir(parent)/"checkpoint.pt").open("rb") as old, atomic(checkpoint) as new:
                shutil.copyfileobj(old,new)
            saved = torch.load(checkpoint,map_location="cpu",weights_only=True)
            if cfg.model_dump() != saved["config"]:
                raise ValueError("Resume configuration differs from checkpoint")
            model.load_state_dict(saved["model"])
            optimizer.load_state_dict(saved["optimizer"])
            rng.bit_generator.state = saved["numpy"]
            torch.set_rng_state(saved["torch"])
            if cfg.device=="cuda":
                torch.cuda.set_rng_state_all(saved["cuda"])
            state = saved["state"]
            del saved
        else:
            incumbent = reg.champion()
            if incumbent is None:
                incumbent = reg.freeze(model,0,self.folder.name,"random")
                if not reg.publish(incumbent,None):
                    incumbent = reg.champion()
            model.load_state_dict(reg.model(incumbent).state_dict())
            state = dict(epoch=0,step=0,ids=[],phase="start")
        target = state["epoch"]+self.meta["rounds"]

        def save():
            with atomic(checkpoint) as stream:
                torch.save(dict(format=1,config=cfg.model_dump(),model=model.state_dict(),
                                optimizer=optimizer.state_dict(),numpy=rng.bit_generator.state,
                                torch=torch.get_rng_state(),cuda=torch.cuda.get_rng_state_all()
                                if cfg.device=="cuda" else [],state=state),stream)
            self.status(step=state["step"],epoch=state["epoch"],checkpoint=True)

        save()
        try:
            while state["epoch"]<target:
                self.check()
                epoch = state["epoch"]
                if state["phase"]=="start":
                    state.update(phase="selfplay",producer=uuid.uuid4().hex,completed=0,new_positions=0,duplicates=0,truncated=0,
                                 new_train=0,updates=0,champion=reg.champion(),net_positions=0,
                                 net_batches=0,sampling_seconds=0.0)
                    save()
                if state["phase"]=="selfplay":
                    self.status(phase="selfplay",done=state["completed"],total=cfg.games)
                    known = set(state["ids"])
                    groups = coordinate(self,state) if cfg.sampler=="actors" else self.local_groups(state)
                    for group in groups:
                        self.check()
                        for entry in group["games"]:
                            if not entry["complete"]:
                                state["truncated"] += 1
                                continue
                            key = entry["id"]
                            meta = read(reg.path/"archive"/key/"game.json")
                            fresh = key not in known and meta["producer"] == state["producer"]
                            if key not in known:
                                state["ids"].append(key)
                                known.add(key)
                            if fresh:
                                state["new_positions"] += meta["positions"]
                                if meta["split"]=="train":
                                    state["new_train"] += meta["positions"]
                            else:
                                state["duplicates"] += 1
                        state["net_positions"] += group["net_positions"]
                        state["net_batches"] += group["net_batches"]
                        state["sampling_seconds"] += group["seconds"]
                        state["completed"] += len(group["games"])
                        self.progress(state["completed"],cfg.games)
                        save()
                    state["planned"] = min(cfg.steps,int(cfg.reuse_limit*state["new_train"]/cfg.batch))
                    state["phase"] = "learn"
                    self.log("sampling",**{k:state[k] for k in ("epoch","new_positions","new_train",
                             "truncated","duplicates","net_positions","net_batches","sampling_seconds","planned")})
                    save()
                if state["phase"]=="learn":
                    replay = Replay(reg,state["ids"],cfg.window,"train")
                    planned = state["planned"]
                    if not replay.size or not planned:
                        self.log("skip",epoch=epoch,reason="Too few new training positions for one update")
                        state.update(epoch=epoch+1,phase="start")
                        save()
                        continue
                    self.status(phase="learn",done=state["updates"],total=planned)
                    if cfg.learner_gpus>1 and state["updates"]<planned:
                        from .distributed import launch
                        model.cpu()
                        optimizer.state.clear()
                        torch.cuda.empty_cache()
                        launch(self.folder,cfg.learner_gpus)
                        saved = torch.load(checkpoint,map_location="cpu",weights_only=True)
                        model.to(cfg.device).load_state_dict(saved["model"])
                        optimizer = torch.optim.SGD(model.parameters(),lr=cfg.lr,momentum=0.9)
                        optimizer.load_state_dict(saved["optimizer"])
                        torch.set_rng_state(saved["torch"])
                        torch.cuda.set_rng_state_all(saved["cuda"])
                        state = saved["state"]
                        self.meta = read(self.folder/"status.json")
                        del saved
                        self.check()
                    while state["updates"]<planned:
                        self.check()
                        metrics = update(model,optimizer,replay.sample(rng,cfg.batch),cfg,state["step"])
                        state["step"] += 1
                        state["updates"] += 1
                        self.log("update",step=state["step"],epoch=epoch,sample_age_seconds=replay.mean_age_seconds,**metrics)
                        self.progress(state["updates"],planned)
                        if state["updates"]%32==0:
                            save()
                    validation = Replay(reg,state["ids"],cfg.window,"validation")
                    if validation.size:
                        model.eval()
                        with torch.inference_mode():
                            _,metrics = objective(model,validation.sample(np.random.default_rng(
                                seed_for(cfg,epoch,0,3)),cfg.batch,False),cfg.device,cfg.amp)
                        self.log("validation",epoch=epoch,loss=float(metrics["loss"]))
                    state["candidate"] = reg.freeze(model,state["step"],self.folder.name,"candidate")
                    state["phase"] = "arena"
                    save()
                if state["phase"]=="arena":
                    self.status(phase="arena",done=0,total=cfg.pairs*2)
                    if "pending_report" not in state:
                        report = self.assessment(state["candidate"],state["champion"],seed_for(cfg,epoch,0,2))
                        report.update(epoch=epoch,step=state["step"],environment=self.meta["environment"],
                                      reuse=state["updates"]*cfg.batch/max(1,state["new_train"]))
                        state["pending_report"] = report
                        save()
                    report = state["pending_report"]
                    self.check()
                    report["published"] = report["eligible"] and reg.publish(state["candidate"],state["champion"],state["producer"])
                    write(self.folder/f"report-{epoch:06d}.json",report)
                    write(reg.path/"models"/state["candidate"]/"gate.json",
                          dict(run=self.folder.name,epoch=epoch,published=report["published"],eligible=report["eligible"]))
                    self.log("arena",epoch=epoch,score=report["paired_score"],lower95=report["lower95"],
                             published=report["published"],reuse=report["reuse"])
                    state.update(epoch=epoch+1,phase="start")
                    del state["pending_report"]
                    save()
        except Stopped:
            save()
            raise

    def execute(self):
        device_setup(self.cfg)
        self.status(state="running",environment=environment(self.cfg),
                    deadline=time.time()+60*self.cfg.wall_minutes if self.cfg.wall_minutes else None)
        if self.meta["kind"]=="train":
            self.train()
        elif self.meta["kind"]=="league":
            pairings = list(combinations(self.meta["models"],2))
            summary = []
            for i,(first,second) in enumerate(pairings):
                self.check()
                self.status(phase="arena",done=0,total=self.cfg.pairs*2,comparison=i+1,comparisons=len(pairings))
                report = self.assessment(first,second,seed_for(self.cfg,i,0,4))
                count = report["complete_pairs"]
                bound = max(0,report["paired_score"]-math.sqrt(math.log(20*len(pairings))/(2*count))) if count else None
                report.update(published=False,environment=self.meta["environment"],kind="league",
                              family_lower95=bound if count==self.cfg.pairs else None)
                write(self.folder/f"report-{i:06d}.json",report)
                summary.append({k:report[k] for k in ("candidate","incumbent","wins","losses","complete_pairs","paired_score","family_lower95")})
                write(self.folder/"league.json",dict(models=self.meta["models"],planned=len(pairings),matches=summary))
        else:
            self.status(phase="arena",done=0,total=self.cfg.pairs*2)
            report = self.assessment(self.meta["candidate"],self.meta["incumbent"],self.cfg.seed)
            report.update(published=False,environment=self.meta["environment"])
            write(self.folder/"report-independent.json",report)
        self.status(state="completed",phase="finished")
