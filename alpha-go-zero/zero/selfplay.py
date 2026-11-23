import hashlib
import os
import shutil
import tempfile
import time
import uuid
from collections import OrderedDict
from pathlib import Path

import numpy as np
from filelock import FileLock

from .game import Board, RULES, sgf, symmetry
from .mcts import Node, search, select
from .gumbel import search_root
from .storage import canonical, digest, read, write, ident


def quarantine(folder):
    destination = folder.parent.parent/"quarantine"
    destination.mkdir(exist_ok=True)
    os.rename(folder,destination/(folder.name+"-"+uuid.uuid4().hex))


def game(cfg, seed, check):
    board, root = Board.empty(cfg.net.size), Node()
    rng = np.random.default_rng(seed)
    rows = []
    for ply in range(cfg.cap):
        if cfg.selfplay_search=="gumbel_root":
            action,counts,value,target = yield from search_root(board,rng,cfg,check)
        else:
            counts, value = yield from search(board,root,rng,cfg,noise=True,check=check)
            hot = 20 if board.size == 9 else 30
            action = select(counts,rng,1.0 if ply < hot else 0.1)
            target = (counts/counts.sum()).astype(np.float32)
            root = root.advance(action)
        rows.append((board.features(),board.legal(),board.turn,action,counts,value,target))
        board = board.play(action)
        if board.done:
            break
    return rows, board


def replay(cfg, rows, final):
    board = Board.empty(cfg.net.size)
    inherited = 0
    for x, mask, turn, action, visits, value, target in rows:
        if turn != board.turn or not np.array_equal(board.features(),x) or not np.array_equal(board.legal(),mask):
            raise ValueError("Replay features or legal mask mismatch")
        if (visits.dtype.kind not in "iu" or visits.shape != mask.shape or (visits < 0).any()
                or visits[mask == 0].any() or not mask[action] or not visits[action]
                or not -1.000001 <= value <= 1.000001):
            raise ValueError("Invalid search record")
        if (target.shape!=mask.shape or not np.isfinite(target).all() or (target<0).any()
                or target[mask==0].any() or not np.isclose(target.sum(),1)):
            raise ValueError("Invalid policy target")
        if cfg.selfplay_search=="puct" and not np.allclose(target,visits/visits.sum()):
            raise ValueError("PUCT policy target disagrees with visit counts")
        # A child's first visit expands it. All later entries traverse one child edge.
        if visits.sum() != cfg.sims + inherited:
            raise ValueError("Search budget disagrees with inherited visits")
        inherited = max(0,int(visits[action])-1) if cfg.selfplay_search=="puct" else 0
        board = board.play(action)
    if board != final:
        raise ValueError("Final replay state mismatch")
    return board


def archive(registry, cfg, model, seed, result, producer):
    rows, final = result
    replay(cfg,rows,final)
    x, legal, turns, moves, visits, q, targets = map(np.asarray,zip(*rows))
    protocol = dict(version=1,rules=RULES,model=model,seed=seed,board=final.size,search=cfg.selfplay_search,
                    sims=cfg.sims,c_puct=cfg.c_puct,max_moves=cfg.cap)
    h = hashlib.sha256(canonical(protocol))
    h.update(moves.astype("<i4").tobytes())
    h.update(visits.astype("<i4").tobytes())
    h.update(targets.astype("<f4").tobytes())
    key = h.hexdigest()
    base = registry.path/("archive" if final.done else "unfinished")
    folder = base/key
    base.mkdir(parents=True,exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=".partial-",dir=base))
    try:
        margin = final.margin() if final.done else None
        arrays = dict(x=x,legal=legal,target=targets,turn=turns.astype(np.int8),action=moves.astype(np.int32),
                      visits=visits.astype(np.int32),q=q.astype(np.float32),budget=np.full(len(x),cfg.sims,np.int32))
        if final.done:
            arrays.update(z=(turns*np.sign(margin)).astype(np.int8),margin=np.float32(margin),
                          owner=final.ownership())
        np.savez_compressed(tmp/"positions.npz",**arrays)
        (tmp/"game.sgf").write_text(sgf(final.size,moves,margin),encoding="utf8")
        meta = dict(**protocol,id=key,producer=producer,positions=len(rows),complete=final.done,margin=margin,
                    split="validation" if int(key[:8],16)%10 == 0 else "train",created=time.time(),
                    sha256=digest(tmp/"positions.npz"),sgf_sha256=digest(tmp/"game.sgf"))
        write(tmp/"game.json",meta)
        with FileLock(str(registry.path/"archive.lock")):
            if folder.exists():
                old = read(folder/"game.json")
                if (digest(folder/"positions.npz") != old["sha256"]
                        or digest(folder/"game.sgf") != old["sgf_sha256"]):
                    quarantine(folder)
                    raise ValueError(f"Existing archive failed verification and was quarantined {key}")
                return old, False
            os.rename(tmp,folder)
        return meta, True
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)


class Replay:
    def __init__(self, registry, ids, limit, split):
        self.base = registry.path/"archive"
        self.entries, self.ends, self.cache = [], [], OrderedDict()
        self.verified = set()
        total = 0
        for key in reversed(ids):
            meta = read(self.base/ident(key,64)/"game.json")
            if meta["split"] != split:
                continue
            size = min(meta["positions"],limit-total)
            self.entries.append((meta,meta["positions"]-size))
            total += size
            self.ends.append(total)
            if total >= limit:
                break
        self.size = total

    def sample(self, rng, count, augment=True, indices=None):
        positions = rng.integers(self.size,size=count) if indices is None else indices
        sources = np.searchsorted(self.ends,positions,side="right")
        transforms = rng.integers(8,size=count) if augment else np.zeros(count,int)
        batch = [None]*count
        now,age = time.time(),0
        for slot in np.argsort(sources,kind="stable"):
            pos,i = positions[slot],sources[slot]
            meta, skip = self.entries[i]
            age += max(0,now-meta["created"])
            j = int(skip+pos-(self.ends[i-1] if i else 0))
            key = meta["id"]
            if key not in self.cache:
                path = self.base/key/"positions.npz"
                if key not in self.verified and digest(path) != meta["sha256"]:
                    with FileLock(str(self.base.parent/"archive.lock")):
                        if path.exists() and digest(path)!=meta["sha256"]:
                            quarantine(path.parent)
                    raise ValueError(f"Sample checksum mismatch. Check quarantine for {key}")
                self.verified.add(key)
                with np.load(path,allow_pickle=False) as data:
                    self.cache[key] = {name:data[name] for name in ("x","target","legal","z","owner","margin","turn")}
                if len(self.cache)>8:
                    self.cache.popitem(last=False)
            self.cache.move_to_end(key)
            d = self.cache[key]
            code = transforms[slot]
            x = symmetry(d["x"][j],code)
            n = x.shape[-1]
            def policy(row):
                return np.append(symmetry(row[:-1].reshape(n,n),code).ravel(),row[-1])
            target = policy(d["target"][j])
            turn = d["turn"][j]
            batch[slot] = (x,target,policy(d["legal"][j]),d["z"][j],
                           symmetry(d["owner"]*turn,code),float(d["margin"])*turn/n)
        self.mean_age_seconds = age/count
        return tuple(np.stack(col) for col in zip(*batch))
