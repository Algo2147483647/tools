from collections import OrderedDict
from threading import RLock
import uuid

import numpy as np
import torch

from .config import Config, Network
from .game import Board, sgf
from .mcts import Node, analyse, select
from .network import Evaluator, PolicyValue
from .storage import load_model, locate_model


class Session:
    def __init__(self, size, human, key, sims, seed):
        if key:
            model = load_model(locate_model(key))
            if model.config.size != size:
                raise ValueError("Model and board size differ")
        else:
            with torch.random.fork_rng(devices=[]):
                torch.manual_seed(seed)
                model = PolicyValue(Network(size=size))
        self.cfg = Config(net=model.config,sims=sims)
        self.rng = np.random.default_rng(seed)
        self.evaluator = Evaluator(model,"cpu")
        self.key, self.human = key,human
        self.states, self.actions = [Board.empty(size)],[]
        self.tree = Node()
        self.analysis = None
        if human == -1:
            self.ai()

    def push(self, action):
        self.states.append(self.states[-1].play(action))
        self.actions.append(action)
        self.tree = self.tree.advance(action)
        self.analysis = None

    def ai(self):
        board = self.states[-1]
        if not board.done and board.turn != self.human:
            visits,_ = analyse(board,self.evaluator,self.rng,self.cfg,self.tree)
            self.push(select(visits,self.rng,0))

    def move(self, action):
        if self.states[-1].turn != self.human:
            raise ValueError("The model moves next")
        length = len(self.actions)
        self.push(action)
        try:
            self.ai()
        except Exception:
            self.rewind(length)
            raise

    def rewind(self, length):
        del self.actions[length:]
        del self.states[length+1:]
        self.tree, self.analysis = Node(),None

    def undo(self):
        length = len(self.actions)-1
        while length>=0 and self.states[length].turn != self.human:
            length -= 1
        if length<0:
            raise ValueError("No human move to undo")
        self.rewind(length)

    def inspect(self):
        visits,value = analyse(self.states[-1],self.evaluator,self.rng,self.cfg,self.tree)
        self.analysis = {"visits":visits.tolist(),"value":value}

    def view(self, key, ply=None):
        i = len(self.actions) if ply is None else ply
        if not 0 <= i < len(self.states):
            raise ValueError("Move number out of range")
        board = self.states[i]
        return dict(id=key,size=board.size,grid=list(board.grid),turn=board.turn,done=board.done,
                    passes=board.passes,margin=board.margin() if board.done else None,
                    legal=board.legal().tolist(),last=self.actions[i-1] if i else None,ply=i,
                    moves=len(self.actions),human=self.human,model=self.key,
                    analysis=self.analysis if i==len(self.actions) else None)

    def record(self):
        board = self.states[-1]
        return sgf(board.size,self.actions,board.margin() if board.done else None)


sessions = OrderedDict()
lock = RLock()


def create(*args):
    with lock:
        key = uuid.uuid4().hex
        session = Session(*args)
        if len(sessions)>=8:
            sessions.popitem(last=False)
        sessions[key] = session
        return session.view(key)


def access(key, action=None, *args):
    with lock:
        if key not in sessions:
            raise ValueError("Game expired. Start a new game.")
        session = sessions[key]
        sessions.move_to_end(key)
        if action=="sgf":
            return session.record()
        if action=="view":
            return session.view(key,*args)
        if action=="move":
            session.move(*args)
        elif action=="undo":
            session.undo()
        elif action=="analyse":
            session.inspect()
        return session.view(key)
