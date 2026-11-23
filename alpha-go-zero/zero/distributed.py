"""Synchronous, single-node CUDA DDP for the learner phase of an existing run."""
from pathlib import Path
import uuid

import numpy as np
import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch.nn.parallel import DistributedDataParallel

from .config import Config
from .learner import update
from .network import PolicyValue
from .selfplay import Replay
from .storage import atomic


def launch(folder, world):
    if not dist.is_nccl_available() or torch.cuda.device_count()<world:
        raise RuntimeError("Multi-GPU learner requires Linux / NCCL and enough visible CUDA devices")
    rendezvous = folder/("ddp-"+uuid.uuid4().hex)
    try:
        mp.spawn(rank_main,args=(world,str(folder),rendezvous.resolve().as_uri()),nprocs=world,join=True)
    finally:
        rendezvous.unlink(missing_ok=True)


def rank_main(rank,world,folder,uri):
    from .pipeline import Run, seed_for
    folder = Path(folder)
    torch.cuda.set_device(rank)
    dist.init_process_group("nccl",init_method=uri,world_size=world,rank=rank)
    try:
        checkpoint = folder/"checkpoint.pt"
        saved = torch.load(checkpoint,map_location="cpu",weights_only=True)
        cfg = Config(**saved["config"])
        state = saved["state"]
        run = Run(folder,cfg)
        device = torch.device("cuda",rank)
        model = PolicyValue(cfg.net)
        model.load_state_dict(saved["model"])
        model = torch.nn.SyncBatchNorm.convert_sync_batchnorm(model).to(device)
        ddp = DistributedDataParallel(model,device_ids=[rank])
        optimizer = torch.optim.SGD(model.parameters(),lr=cfg.lr,momentum=0.9)
        optimizer.load_state_dict(saved.pop("optimizer"))
        saved.pop("model")
        torch.set_rng_state(saved["torch"])
        torch.cuda.set_rng_state(saved["cuda"][rank],device)
        window = Replay(run.registry,state["ids"],cfg.window,"train")
        local_batch = cfg.batch//world
        flag = torch.zeros(1,dtype=torch.int32,device=device)
        gen = torch.Generator(device="cpu")

        def save():
            cuda_states = [None]*world
            dist.all_gather_object(cuda_states,torch.cuda.get_rng_state(device).cpu().tolist())
            if rank==0:
                with atomic(checkpoint) as stream:
                    torch.save({**saved,"state":state,"model":model.state_dict(),
                                "optimizer":optimizer.state_dict(),"torch":torch.get_rng_state(),
                                "cuda":[torch.tensor(b,dtype=torch.uint8) for b in cuda_states]+saved["cuda"][world:]},stream)
                run.status(step=state["step"],done=state["updates"],total=state["planned"],checkpoint=True)
            dist.barrier()

        while state["updates"]<state["planned"]:
            if rank==0:
                flag.fill_(int(run.stopping()))
            dist.broadcast(flag,src=0)
            if flag.item():
                break
            # Draw one reproducible global minibatch, partition its slots evenly,
            # and use independent augmentation streams for each rank.
            step = state["step"]
            gen.manual_seed(seed_for(cfg,state["epoch"],step,11))
            indices = torch.randint(window.size,(cfg.batch,),generator=gen).numpy()
            rng = np.random.default_rng(seed_for(cfg,step,rank,12))
            local = indices[rank*local_batch:(rank+1)*local_batch]
            metrics = update(ddp,optimizer,window.sample(rng,local_batch,indices=local),cfg,step)
            metrics["sample_age_seconds"] = window.mean_age_seconds
            names = list(metrics)
            reduced = torch.tensor([metrics[k] for k in names],device=device)
            dist.all_reduce(reduced)
            state["updates"] += 1
            state["step"] += 1
            if rank==0:
                run.log("update",step=state["step"],epoch=state["epoch"],**dict(zip(names,(reduced/world).tolist())))
                run.progress(state["updates"],state["planned"])
            if state["updates"]%32==0:
                save()
        save()
    finally:
        dist.destroy_process_group()
