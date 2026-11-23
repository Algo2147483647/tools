"""Shared-filesystem self-play leases. Every ticket belongs to one immutable model."""
import os
import platform
import socket
import time
import uuid

import torch
from filelock import FileLock

from .config import Config
from .mcts import batch
from .network import Evaluator
from .selfplay import archive
from .storage import Registry, read, run_dir, write


LEASE = 90


class LostLease(Exception):
    pass


def sample_group(reg,cfg,evaluator,champion,seeds,producer,check):
    from .selfplay import game
    start = time.monotonic()
    positions,batches = evaluator.positions,evaluator.batches
    results = batch([game(cfg,s,check) for s in seeds],evaluator)
    games = []
    for seed,result in zip(seeds,results):
        check()
        meta,_ = archive(reg,cfg,champion,seed,result,producer)
        games.append({"id":meta["id"],"complete":meta["complete"]})
    return dict(games=games,net_positions=evaluator.positions-positions,
                net_batches=evaluator.batches-batches,seconds=time.monotonic()-start)


def coordinate(run,state):
    from .pipeline import seed_for
    cfg = run.cfg
    root = run.folder/"leases"/str(state["epoch"])
    root.mkdir(parents=True,exist_ok=True)
    cursor = state["completed"]
    for start in range(cursor,cfg.games,cfg.lanes):
        folder = root/f"{start:09d}"
        folder.mkdir(exist_ok=True)
        spec = dict(model=state["champion"],producer=state["producer"],
                    seeds=[seed_for(cfg,state["epoch"],i,1) for i in range(start,min(cfg.games,start+cfg.lanes))])
        write(folder/"spec.json",spec)
    for start in range(cursor,cfg.games,cfg.lanes):
        folder = root/f"{start:09d}"
        idle = time.monotonic()
        while not (folder/"result.json").exists():
            run.check()
            lease = folder/"owner.json"
            if lease.exists() and read(lease)["expires"]>time.time():
                idle = time.monotonic()
            if time.monotonic()-idle>900:
                raise RuntimeError("15 分钟内没有采样节点持有目标租约。连接 actor 后从检查点续训。")
            time.sleep(0.35)
        yield read(folder/"result.json")


def claim(folder,worker):
    with FileLock(str(folder/"lease.lock")):
        if (folder/"result.json").exists():
            return None
        owner = folder/"owner.json"
        if owner.exists() and read(owner)["expires"]>time.time():
            return None
        ticket = dict(token=uuid.uuid4().hex,worker=worker,expires=time.time()+LEASE)
        write(owner,ticket)
        return ticket


def process(folder,ticket,root,reg,cfg,loaded,device):
    check_at = 0
    spec = read(folder/"spec.json")
    def guard(force=False):
        nonlocal check_at
        if not force and time.monotonic()<check_at:
            return
        if (root/"stop").exists() or read(root/"status.json")["state"]!="running":
            raise LostLease()
        with FileLock(str(folder/"lease.lock")):
            owner = read(folder/"owner.json")
            if owner["token"]!=ticket["token"] or owner["expires"]<=time.time():
                raise LostLease()
            write(folder/"owner.json",{**owner,"expires":time.time()+LEASE})
        check_at = time.monotonic()+LEASE/4

    guard(True)
    if spec["model"]!=loaded.get("id"):
        loaded.clear()
        loaded.update(id=spec["model"],evaluator=Evaluator(reg.model(spec["model"]),device))
    result = sample_group(reg,cfg,loaded["evaluator"],spec["model"],spec["seeds"],spec["producer"],guard)
    guard(True)
    with FileLock(str(folder/"lease.lock")):
        owner = read(folder/"owner.json")
        if ticket["token"]!=owner["token"] or owner["expires"]<=time.time():
            raise LostLease()
        write(folder/"result.json",dict(**result,worker=ticket["worker"],device=device,
              platform=platform.platform(),torch=str(torch.__version__)))


def work(key,device):
    from .pipeline import device_setup
    root = run_dir(key)
    cfg = Config(**read(root/"status.json")["config"])
    if cfg.sampler!="actors":
        raise ValueError("任务需要使用 actors 采样模式")
    actor_cfg = Config(**{**cfg.model_dump(),"device":device,"amp":False,"learner_gpus":1})
    device_setup(actor_cfg)
    reg = Registry(cfg)
    worker = f"{socket.gethostname()}-{os.getpid()}"
    loaded = {}
    while True:
        status = read(root/"status.json")
        if status["state"] not in ("running","starting") or (root/"stop").exists():
            return
        got = False
        if status["phase"]=="selfplay":
            for spec in sorted((root/"leases"/str(status["epoch"])).glob("*/spec.json")):
                folder = spec.parent
                if (folder/"result.json").exists():
                    continue
                ticket = claim(folder,worker)
                if ticket:
                    try:
                        process(folder,ticket,root,reg,cfg,loaded,device)
                    except LostLease:
                        pass
                    got = True
                    break
        else:
            loaded.clear()
        if not got:
            time.sleep(0.7)
