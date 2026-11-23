"""Independent evaluator processes partition complete opening pairs."""
from concurrent.futures import ProcessPoolExecutor, wait, FIRST_COMPLETED
import multiprocessing as mp
import os
from pathlib import Path
import time
import uuid

import numpy as np
import torch

from .arena import play_pair, schedule, report
from .config import Config
from .network import Evaluator
from .storage import load_model, read, write


def worker(rank,settings,paths,items,folder,stop):
    cfg = Config(**settings)
    device = cfg.device
    if device=="cuda":
        index = rank%torch.cuda.device_count()
        torch.cuda.set_device(index)
        device = f"cuda:{index}"
    if device=="cpu":
        torch.set_num_threads(max(1,min(4,(os.cpu_count() or 1)//cfg.arena_workers)))
    cancel = Path(folder)/"cancel"
    def check():
        if cancel.exists() or Path(stop).exists():
            from .pipeline import Stopped
            raise Stopped()
    check()
    players = [Evaluator(load_model(path),device) for path in paths]
    for item in items:
        check()
        games = list(play_pair(cfg,*players,item,check))
        write(Path(folder)/f"pair-{item[0]:06d}.json",dict(games=games,device=device,rank=rank))
    return [p.positions for p in players]


def pooled(run,paths,ids,seed):
    cfg = run.cfg
    folder = run.folder/"evaluation"/uuid.uuid4().hex
    folder.mkdir(parents=True)
    started = time.monotonic()
    items = schedule(seed,cfg.pairs)
    workers = min(cfg.arena_workers,len(items))
    context = mp.get_context("spawn")
    with ProcessPoolExecutor(max_workers=workers,mp_context=context) as pool:
        futures = [pool.submit(worker,i,cfg.model_dump(),paths,items[i::workers],folder,run.folder/"stop")
                   for i in range(workers)]
        try:
            pending = set(futures)
            while pending:
                run.check()
                finished,pending = wait(pending,timeout=0.7,return_when=FIRST_COMPLETED)
                for f in finished:
                    f.result()
                run.progress(2*sum(1 for _ in folder.glob("pair-*.json")),2*cfg.pairs)
            positions = np.sum([f.result() for f in futures],axis=0).tolist()
        finally:
            (folder/"cancel").touch()
    games = [game for path in sorted(folder.glob("pair-*.json")) for game in read(path)["games"]]
    return report(cfg,ids,seed,started,games,positions)
