"""One outstanding leaf per tree. Independent games share each inference batch."""
from time import monotonic
import numpy as np


class Node:
    __slots__ = ("actions","prior","visits","total","children","value")

    def __init__(self):
        self.prior = None
        self.children = {}

    def expand(self, board, logits, value):
        self.value = float(value)
        self.actions = np.flatnonzero(board.legal())
        x = logits[self.actions].astype(np.float64)
        p = np.exp(x-x.max())
        self.prior = p/p.sum()
        self.visits = np.zeros(len(p), np.int32)
        self.total = np.zeros(len(p), np.float64)

    def advance(self, action):
        return self.children.get(int(action)) or Node()


def argmax_tied(values, rng):
    return int(rng.choice(np.flatnonzero(values == values.max())))


def simulate(board, root, rng, cfg, root_prior, forced=None):
    node, state, path = root, board, []
    while node.prior is not None and not state.done:
        if node is root and forced is not None:
            j = forced
        else:
            q = node.total / np.maximum(1,node.visits)
            p = root_prior if node is root else node.prior
            score = q + cfg.c_puct*p*np.sqrt(1+node.visits.sum())/(1+node.visits)
            j = argmax_tied(score, rng)
        a = int(node.actions[j])
        path.append((node,j))
        state = state.play(a)
        if a not in node.children:
            node.children[a] = Node()
        node = node.children[a]
    if state.done:
        value = np.sign(state.margin())*state.turn
    else:
        logits, value = yield state
        node.expand(state, logits, value)
    for parent, j in reversed(path):
        value = -value
        parent.visits[j] += 1
        parent.total[j] += value


def search(board, root, rng, cfg, noise=False, deadline=None, check=lambda: None):
    if board.done:
        raise ValueError("Cannot search a finished game")
    if root.prior is None:
        logits, value = yield board
        root.expand(board, logits, value)
    prior = root.prior
    if noise:
        alpha = 0.12 if board.size == 9 else 0.03
        prior = 0.75*prior + 0.25*rng.dirichlet(np.full(len(prior),alpha))
    for i in range(cfg.sims):
        check()
        if i and deadline is not None and monotonic() >= deadline:
            break
        yield from simulate(board,root,rng,cfg,prior)
    counts = np.zeros(len(board.grid)+1,np.int32)
    counts[root.actions] = root.visits
    return counts, float(root.total.sum()/root.visits.sum())


def select(counts, rng, temperature):
    if temperature == 0:
        return argmax_tied(counts, rng)
    actions = np.flatnonzero(counts)
    x = np.log(counts[actions])/temperature
    p = np.exp(x-x.max())
    return int(rng.choice(actions,p=p/p.sum()))


def batch(generators, evaluate):
    """Generators yield boards; each completed result retains its input index."""
    outputs = [None]*len(generators)
    pending = dict(enumerate(generators))
    replies = {}
    while pending:
        requests = {}
        for i, gen in list(pending.items()):
            try:
                requests[i] = gen.send(replies.pop(i, None))
            except StopIteration as done:
                outputs[i] = done.value
                del pending[i]
        if requests:
            replies = dict(zip(requests, evaluate(list(requests.values())), strict=True))
    return outputs


def analyse(board, evaluator, rng, cfg, root=None, deadline=None):
    root = root if root is not None else Node()
    return batch([search(board,root,rng,cfg,deadline=deadline)],evaluator)[0]
