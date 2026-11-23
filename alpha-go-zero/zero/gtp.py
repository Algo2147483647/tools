"""GTP coordinate handling, a model engine, and a separate KataGo benchmark."""
import json
from queue import Queue, Empty
import subprocess
import sys
from threading import Thread
import time
import uuid

import numpy as np

from .arena import opening, statistics
from .config import Config
from .game import Board, KOMI, RULES, sgf
from .jobs import compute_lock
from .mcts import Node, analyse, select
from .network import Evaluator
from .pipeline import device_setup, environment
from .storage import digest, home, load_model, locate_model, write


COLS = "ABCDEFGHJKLMNOPQRSTUVWXYZ"


def vertex(n, a):
    return "pass" if a==n*n else f"{COLS[a%n]}{n-a//n}"


def point(n, v):
    if v.lower()=="pass":
        return n*n
    col, row = COLS.index(v[0].upper()),n-int(v[1:])
    if not (0<=col<n and 0<=row<n):
        raise ValueError("invalid vertex")
    return row*n+col


def colour(v):
    if v.lower() in ("b","black"):
        return 1
    if v.lower() in ("w","white"):
        return -1
    raise ValueError("invalid colour")


def engine(args):
    model = load_model(locate_model(args.model))
    cfg = Config(net=model.config,device=args.device,sims=args.sims)
    device_setup(cfg)
    evaluator = Evaluator(model,cfg.device)
    n = cfg.net.size
    rng = np.random.default_rng(cfg.seed)
    states,tree = [Board.empty(n)],Node()
    commands = ("protocol_version","name","version","list_commands","known_command","boardsize",
                "clear_board","komi","play","genmove","undo","final_score","quit")
    for line in sys.stdin:
        words = line.partition("#")[0].split()
        if not words:
            continue
        tag = words.pop(0) if words[0].isdigit() else ""
        try:
            cmd,*params = words
            board, result = states[-1],""
            if cmd=="quit":
                print("="+tag+"\n",flush=True)
                return
            elif cmd=="protocol_version":
                result = "2"
            elif cmd=="name":
                result = "WeiQi Zero"
            elif cmd=="version":
                result = args.model[:12]
            elif cmd=="list_commands":
                result = "\n".join(commands)
            elif cmd=="known_command":
                result = str(params[0] in commands).lower()
            elif cmd=="boardsize" or cmd=="clear_board":
                if cmd=="boardsize" and int(params[0])!=n:
                    raise ValueError("unacceptable size")
                states,tree = [Board.empty(n)],Node()
            elif cmd=="komi":
                if float(params[0])!=KOMI:
                    raise ValueError("model requires komi 7.5")
            elif cmd in ("play","genmove"):
                if colour(params[0])!=board.turn:
                    raise ValueError("out of turn")
                if cmd=="play":
                    a = point(n,params[1])
                else:
                    deadline = time.monotonic()+args.seconds if args.seconds else None
                    counts,_ = analyse(board,evaluator,rng,cfg,tree,deadline)
                    a = select(counts,rng,0)
                    result = vertex(n,a)
                states.append(board.play(a))
                tree = tree.advance(a)
            elif cmd=="undo" and len(states)>1:
                states.pop()
                tree = Node()
            elif cmd=="final_score" and board.done:
                m = board.margin()
                result = ("B+" if m>0 else "W+")+str(abs(m))
            else:
                raise ValueError("unknown command or unavailable in this position")
            print("="+tag+" "+result+"\n",flush=True)
        except (ValueError,IndexError) as exc:
            print("?"+tag+" "+str(exc)+"\n",flush=True)


class Client:
    def __init__(self,args,log):
        self.proc = subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,
                                     text=True,encoding="utf8",bufsize=1)
        self.lines = Queue()

        def read_stdout():
            try:
                for line in self.proc.stdout:
                    self.lines.put(line.rstrip("\r\n"))
            finally:
                self.lines.put(None)
        self.thread = Thread(target=read_stdout,daemon=True)
        self.thread.start()

    def command(self, text, timeout=60):
        self.proc.stdin.write(text+"\n")
        self.proc.stdin.flush()
        deadline = time.monotonic()+timeout
        response = []
        while True:
            try:
                line = self.lines.get(timeout=max(0,deadline-time.monotonic()))
            except Empty:
                raise TimeoutError("GTP 超时 "+text) from None
            if line is None:
                raise RuntimeError("外部引擎意外退出")
            if not line and response:
                break
            if line:
                response.append(line)
        body = "\n".join(response)
        if not body.startswith("="):
            raise ValueError("GTP 拒绝命令 "+text+" "+body)
        return body[1:].strip()

    def close(self):
        self.proc.stdin.close()
        if self.proc.poll() is None:
            self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        self.thread.join(timeout=2)
        self.proc.stdout.close()


def benchmark(args):
    if not (1<=args.seconds<=3600 and 1<=args.pairs<=5000):
        raise ValueError("用时或开局对数越界")
    with compute_lock():
        _benchmark(args)


def _benchmark(args):
    model = load_model(locate_model(args.model))
    cfg = Config(net=model.config,seed=args.seed,device=args.device,sims=32768,pairs=args.pairs)
    device_setup(cfg)
    own = Evaluator(model,cfg.device)
    folder = home()/"benchmarks"/uuid.uuid4().hex
    folder.mkdir(parents=True)
    report = dict(candidate=args.model,rules=RULES,seconds_per_move=args.seconds,hardware=environment(cfg),
                  seed=args.seed,published=False,model=digest(args.weights),katago=digest(args.katago),
                  gtp_config=digest(args.gtp_config),planned_pairs=args.pairs,games=[],state="running")
    command = [str(args.katago.resolve()),"gtp","-config",str(args.gtp_config.resolve()),
               "-model",str(args.weights.resolve()),"-override-config",
               f"allowResignation=false,ponderingEnabled=false,maxTime={args.seconds}"]
    report["command"] = command
    write(folder/"report.json",report)
    rng = np.random.default_rng(args.seed)
    n = cfg.net.size
    print(folder/"report.json",flush=True)
    try:
        for i in range(args.pairs):
            seed = int(rng.integers(2**62))
            first,opening_moves = opening(n,seed)
            for side in (1,-1):
                # A fresh engine for every game prevents evaluation cache leakage across colours.
                with (folder/"katago.log").open("ab") as log:
                    client = Client(command,log)
                    try:
                        report["katago_version"] = client.command("version",180)
                        client.command(f"boardsize {n}")
                        client.command("clear_board")
                        client.command("kata-set-rules tromp-taylor")
                        client.command("komi 7.5")
                        client.command(f"time_settings 0 {args.seconds} 1")
                        report["external_rules"] = json.loads(client.command("kata-get-rules"))
                        for j,a in enumerate(opening_moves):
                            client.command(f"play {'BW'[j%2]} {vertex(n,a)}")
                        state,moves,root = first,list(opening_moves),Node()
                        move_rng = np.random.default_rng(seed)
                        elapsed = []
                        base = own.positions
                        while not state.done and len(moves)<cfg.cap:
                            c = "B" if state.turn==1 else "W"
                            start = time.monotonic()
                            if state.turn==side:
                                counts,_ = analyse(state,own,move_rng,cfg,root,start+args.seconds)
                                a = select(counts,move_rng,0)
                            else:
                                v = client.command("genmove "+c,timeout=args.seconds+60)
                                a = point(n,v)
                            duration = time.monotonic()-start
                            elapsed.append(duration)
                            if state.turn==side:
                                client.command(f"play {c} {vertex(n,a)}")
                            root,state = root.advance(a),state.play(a)
                            moves.append(a)
                        margin = state.margin() if state.done else None
                        # Record deadline overruns and exclude the pair from timed inference.
                        over = any(t>args.seconds*1.1+0.1 for t in elapsed)
                        report["games"].append(dict(pair=i,opening_seed=seed,candidate_colour=side,
                              margin=None if over else margin,board_margin=margin,over_time=over,
                              move_seconds=elapsed,network_positions=own.positions-base,sgf=sgf(n,moves,margin)))
                        report.update(statistics(report["games"],args.pairs))
                        write(folder/"report.json",report)
                    finally:
                        client.close()
        report["state"] = "completed"
    except BaseException as exc:
        report.update(state="interrupted",error=str(exc))
        raise
    finally:
        write(folder/"report.json",report)
