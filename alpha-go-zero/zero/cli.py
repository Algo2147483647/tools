import argparse
import json
from pathlib import Path
import time


def main():
    parser = argparse.ArgumentParser(prog="weiqi-zero",description="WeiQi Zero · Go Self-Play Workbench")
    sub = parser.add_subparsers(dest="cmd",required=True)
    config = sub.add_parser("config",help="Export the full experiment preset as JSON")
    config.add_argument("--preset",default="quick9")
    config.add_argument("--out",type=Path)
    serve = sub.add_parser("serve",help="Start the local workbench and API")
    serve.add_argument("--port",type=int,default=8765)
    train = sub.add_parser("train",help="Generate self-play data, update the network and evaluate the frozen candidate")
    train.add_argument("--resume",help="Start a new run from an existing checkpoint")
    train.add_argument("--rounds",type=int,default=1)
    arena = sub.add_parser("arena",help="Independent paired evaluation")
    arena.add_argument("candidate")
    arena.add_argument("incumbent")
    league = sub.add_parser("league",help="Run a round robin between frozen models")
    league.add_argument("models",nargs="+")
    for cmd in (train,arena,league):
        cmd.add_argument("--preset",default="quick9")
        cmd.add_argument("--config",type=Path,help="Full JSON configuration")
        cmd.add_argument("--device",choices=["cpu","cuda","mps"])
        cmd.add_argument("--experiment")
        for arg in ("seed","sims","pairs","games","lanes","steps","batch"):
            cmd.add_argument("--"+arg,type=int)
        cmd.add_argument("--detach",action="store_true")
    sub.add_parser("models",help="List frozen models")
    sub.add_parser("runs",help="List local jobs")
    sub.add_parser("stop",help="Request a graceful stop").add_argument("id")
    actor = sub.add_parser("actor",help="Claim self-play leases for a training job")
    actor.add_argument("id")
    actor.add_argument("--device",choices=["cpu","cuda","mps"],default="cpu")
    snapshot = sub.add_parser("snapshot",help="Snapshot the run and experiment archive to S3")
    snapshot.add_argument("--run",required=True)
    restore = sub.add_parser("restore",help="Restore a manifest into a new data directory")
    restore.add_argument("--dest",required=True,type=Path)
    restore.add_argument("--manifest",required=True)
    for cmd in (snapshot,restore):
        cmd.add_argument("--bucket",required=True)
        cmd.add_argument("--prefix",default="weiqi-zero")
    rollback = sub.add_parser("rollback",help="Roll back to a previously published champion")
    rollback.add_argument("--model",required=True)
    rollback.add_argument("--expected",required=True)
    rollback.add_argument("--experiment",required=True)
    gtp = sub.add_parser("gtp",help="Use GTP v2 to connect a Go client")
    gtp.add_argument("--model",required=True)
    gtp.add_argument("--sims",type=int,default=128)
    gtp.add_argument("--seconds",type=float)
    gtp.add_argument("--device",default="cpu",choices=["cpu","cuda","mps"])
    compare = sub.add_parser("benchmark",help="Run a timed paired benchmark against a frozen local KataGo engine")
    compare.add_argument("--model",required=True)
    compare.add_argument("--katago",required=True,type=Path)
    compare.add_argument("--weights",required=True,type=Path)
    compare.add_argument("--gtp-config",required=True,type=Path)
    compare.add_argument("--seconds",type=int,required=True)
    compare.add_argument("--pairs",type=int,required=True)
    compare.add_argument("--device",choices=["cpu","cuda","mps"],required=True)
    compare.add_argument("--seed",type=int,default=73)
    args = parser.parse_args()
    if args.cmd=="config":
        from .config import preset
        serialized = preset(args.preset).model_dump_json(indent=2)
        if args.out:
            with args.out.open("x",encoding="utf8") as stream:
                stream.write(serialized+"\n")
        else:
            print(serialized)
        return
    if args.cmd=="serve":
        import uvicorn
        uvicorn.run("zero.api:app",host="127.0.0.1",port=args.port)
        return
    if args.cmd in ("gtp","benchmark"):
        from .gtp import engine, benchmark
        return engine(args) if args.cmd=="gtp" else benchmark(args)
    if args.cmd=="actor":
        from .actors import work
        return work(args.id,args.device)
    if args.cmd in ("snapshot","restore"):
        from . import objects
        return objects.snapshot(args) if args.cmd=="snapshot" else objects.restore(args)
    from . import jobs
    from .config import Config, preset
    from .storage import all_models, read, run_dir
    if args.cmd=="rollback":
        from .storage import Registry, locate_model
        with jobs.compute_lock():
            meta = read(locate_model(args.model)/"meta.json")
            reg = Registry(Config(net=meta["net"],experiment=args.experiment))
            history = read(reg.path/"champion.json")["history"]
            if not any(entry["id"]==args.model for entry in history):
                raise ValueError("This model was never champion of this experiment")
            reg.model(args.model)
            if not reg.publish(args.model,args.expected):
                raise ValueError("Champion changed. Refresh the model registry.")
            result = {"champion":args.model,"previous":args.expected}
    elif args.cmd=="models":
        result = all_models()
    elif args.cmd=="runs":
        result = jobs.list_runs()
    elif args.cmd=="stop":
        result = jobs.stop(args.id)
    else:
        if getattr(args,"resume",None) and (args.config or any(getattr(args,k) is not None
                for k in ("device","experiment","seed","sims","pairs","games","lanes","steps","batch"))):
            parser.error("Resume uses the checkpoint configuration. Specify only the additional rounds.")
        data = read(args.config) if args.config else preset(args.preset).model_dump()
        data.update({k:getattr(args,k) for k in ("device","experiment","seed","sims","pairs","games",
                    "lanes","steps","batch") if getattr(args,k) is not None})
        result = jobs.submit(Config(**data),getattr(args,"rounds",1),getattr(args,"resume",None),
                             getattr(args,"candidate",None),getattr(args,"incumbent",None),getattr(args,"models",None))
        if not args.detach:
            key = result["id"]
            print(key,flush=True)
            last = None
            try:
                while result["state"] in jobs.ACTIVE:
                    signature = tuple(result.get(k) for k in ("state","phase","done","total","step"))
                    if signature!=last:
                        print(*signature,flush=True)
                        last = signature
                    time.sleep(1)
                    rows = jobs.list_runs()
                    result = next(r for r in rows if r["id"]==key)
            except KeyboardInterrupt:
                jobs.stop(key)
                print("Stop requested",key)
                return
            if result["state"] in ("failed","interrupted"):
                parser.exit(1,result.get("error","Worker exited unexpectedly")+"\n")
    print(json.dumps(result,ensure_ascii=False,indent=2))
