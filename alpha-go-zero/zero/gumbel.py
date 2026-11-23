"""Experimental Gumbel sequential halving at the root with PUCT below it."""
import numpy as np
from .mcts import Node, simulate


def improved(root):
    visited = root.visits>0
    q = root.total/np.maximum(1,root.visits)
    weight = root.prior[visited]
    avg = float(np.average(q[visited],weights=weight)) if weight.sum()>0 else root.value
    total = root.visits.sum()
    mixed = (root.value+total*avg)/(1+total)
    complete = np.where(visited,q,mixed)
    normalized = (complete-complete.min())/max(np.ptp(complete),1e-8)
    return np.log(np.maximum(root.prior,1e-300))+(50+root.visits.max())*normalized


def search_root(board,rng,cfg,check):
    root = Node()
    logits,value = yield board
    root.expand(board,logits,value)
    gumbels = rng.gumbel(size=len(root.prior))
    ranking = np.log(np.maximum(root.prior,1e-300))+gumbels
    k = min(16,len(ranking),max(1,(cfg.sims+2)//2))
    choices = np.argsort(-ranking)[:k]
    left = cfg.sims
    while len(choices)>1:
        stages = int(np.floor(np.log2(len(choices))))
        repeats = max(1,left//(len(choices)*stages))
        for _ in range(repeats):
            for j in choices:
                check()
                yield from simulate(board,root,rng,cfg,root.prior,forced=j)
                left -= 1
        ranks = (improved(root)+gumbels)[choices]
        choices = choices[np.argsort(-ranks)[:len(choices)//2]]
    winner = int(choices[0])
    for _ in range(left):
        check()
        yield from simulate(board,root,rng,cfg,root.prior,forced=winner)
    scores = improved(root)
    p = np.exp(scores-scores.max())
    target = np.zeros(len(board.grid)+1,np.float32)
    target[root.actions] = p/p.sum()
    counts = np.zeros(len(target),np.int32)
    counts[root.actions] = root.visits
    return int(root.actions[winner]),counts,float(root.total.sum()/cfg.sims),target
