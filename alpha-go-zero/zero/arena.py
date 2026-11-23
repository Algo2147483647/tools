import math
import time
import numpy as np

from .game import Board, RULES, sgf
from .mcts import Node, search, batch, select


def opening(n,seed):
    rng = np.random.default_rng(seed)
    board = Board.empty(n)
    moves = []
    for _ in range(6):
        action = int(rng.choice(np.flatnonzero(board.legal()[:-1])))
        moves.append(action)
        board = board.play(action)
    return board, moves


def match(cfg, initial, opening_moves, black, white, seed, check):
    board, moves = initial, list(opening_moves)
    trees = [Node(),Node()]
    rng = np.random.default_rng(seed)
    while not board.done and len(moves) < cfg.cap:
        check()
        side = 0 if board.turn == 1 else 1
        counts,_ = batch([search(board,trees[side],rng,cfg,check=check)],(black,white)[side])[0]
        action = select(counts,rng,0)
        trees = [t.advance(action) for t in trees]
        board = board.play(action)
        moves.append(action)
    margin = board.margin() if board.done else None
    return {"margin":margin,"moves":len(moves),"sgf":sgf(board.size,moves,margin)}


def statistics(games, planned_pairs):
    pairs, wins, draws, losses = [], 0, 0, 0
    scores = {}
    for game in games:
        margin = game["margin"]
        if margin is None:
            continue
        difference = margin*game["candidate_colour"]
        wins += difference > 0
        losses += difference < 0
        draws += difference == 0
        scores.setdefault(game["pair"],{})[game["candidate_colour"]] = (int(difference>0)+0.5*int(difference==0))
    for sides in scores.values():
        if len(sides) == 2:
            pairs.append(sum(sides.values())/2)
    mean = sum(pairs)/len(pairs) if pairs else None
    lower = max(0,mean-math.sqrt(math.log(20)/(2*len(pairs)))) if pairs else None
    eligible = (len(pairs)==planned_pairs and len(pairs)>=20 and mean>=0.55 and lower>0.5)
    elo = 400*math.log10(mean/(1-mean)) if mean is not None and 0<mean<1 else None
    return dict(wins=wins,losses=losses,draws=draws,paired_score=mean,lower95=lower,elo=elo,
                complete_pairs=len(pairs),planned_pairs=planned_pairs,eligible=eligible,
                unfinished=sum(g["margin"] is None for g in games))


def schedule(seed,pairs):
    rng = np.random.default_rng(seed)
    return [(i,*map(int,rng.integers(2**62,size=2))) for i in range(pairs)]


def play_pair(cfg, candidate, incumbent, item, check):
    i,opening_seed,play_seed = item
    state,moves = opening(cfg.net.size,opening_seed)
    for colour in (1,-1):
        players = (candidate,incumbent) if colour == 1 else (incumbent,candidate)
        result = match(cfg,state,moves,*players,play_seed,check)
        yield dict(**result,candidate_colour=colour,pair=i,opening_seed=opening_seed,seed=play_seed)


def report(cfg,ids,seed,started,games,positions):
    return dict(candidate=ids[0],incumbent=ids[1],rules=RULES,seed=seed,config=cfg.model_dump(),
                seconds=time.monotonic()-started,network_positions=positions,
                games=games,**statistics(games,cfg.pairs))


def evaluate(cfg, candidate, incumbent, ids, seed, check, notify=lambda *_:None):
    started, games = time.monotonic(), []
    for item in schedule(seed,cfg.pairs):
        for result in play_pair(cfg,candidate,incumbent,item,check):
            games.append(result)
            notify(len(games),2*cfg.pairs)
    return report(cfg,ids,seed,started,games,[candidate.positions,incumbent.positions])
