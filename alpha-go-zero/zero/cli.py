import argparse
import json
from pathlib import Path
import time


def main():
    parser = argparse.ArgumentParser(prog="weiqi-zero",description="弈零 · 围棋自我对弈研究台")
    sub = parser.add_subparsers(dest="cmd",required=True)
    config = sub.add_parser("config",help="导出完整实验预设 JSON")
    config.add_argument("--preset",default="quick9")
    config.add_argument("--out",type=Path)
    serve = sub.add_parser("serve",help="启动本地工作台与 API")
    serve.add_argument("--port",type=int,default=8765)
    train = sub.add_parser("train",help="生成自我对弈数据、更新网络并评估冻结候选")
    train.add_argument("--resume",help="从现有任务的检查点新建任务")
    train.add_argument("--rounds",type=int,default=1)
    arena = sub.add_parser("arena",help="独立成对评估")
    arena.add_argument("candidate")
    arena.add_argument("incumbent")
    league = sub.add_parser("league",help="对多个冻结历史版本进行独立循环赛")
    league.add_argument("models",nargs="+")
    for cmd in (train,arena,league):
        cmd.add_argument("--preset",default="quick9")
        cmd.add_argument("--config",type=Path,help="完整 JSON 配置")
        cmd.add_argument("--device",choices=["cpu","cuda","mps"])
        cmd.add_argument("--experiment")
        for arg in ("seed","sims","pairs","games","lanes","steps","batch"):
            cmd.add_argument("--"+arg,type=int)
        cmd.add_argument("--detach",action="store_true")
    sub.add_parser("models",help="列出本地冻结模型")
    sub.add_parser("runs",help="列出本地任务")
    sub.add_parser("stop",help="请求有序停止").add_argument("id")
    actor = sub.add_parser("actor",help="为指定训练任务领取自弈租约")
    actor.add_argument("id")
    actor.add_argument("--device",choices=["cpu","cuda","mps"],default="cpu")
    snapshot = sub.add_parser("snapshot",help="将一次任务和所属实验的归档写入 S3")
    snapshot.add_argument("--run",required=True)
    restore = sub.add_parser("restore",help="从对象清单恢复到新的数据目录")
    restore.add_argument("--dest",required=True,type=Path)
    restore.add_argument("--manifest",required=True)
    for cmd in (snapshot,restore):
        cmd.add_argument("--bucket",required=True)
        cmd.add_argument("--prefix",default="weiqi-zero")
    rollback = sub.add_parser("rollback",help="将冠军指针回滚到已发布过的同实验版本")
    rollback.add_argument("--model",required=True)
    rollback.add_argument("--expected",required=True)
    rollback.add_argument("--experiment",required=True)
    gtp = sub.add_parser("gtp",help="以 GTP v2 协议连接围棋客户端")
    gtp.add_argument("--model",required=True)
    gtp.add_argument("--sims",type=int,default=128)
    gtp.add_argument("--seconds",type=float)
    gtp.add_argument("--device",default="cpu",choices=["cpu","cuda","mps"])
    compare = sub.add_parser("benchmark",help="与冻结的本地 KataGo 做定时成对评估")
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
                raise ValueError("目标从未作为此实验的冠军发布")
            reg.model(args.model)
            if not reg.publish(args.model,args.expected):
                raise ValueError("冠军摘要已变化，请重新查看仓库")
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
            parser.error("续训沿用检查点的配置，仅指定新增轮数")
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
                print("已请求停止",key)
                return
            if result["state"] in ("failed","interrupted"):
                parser.exit(1,result.get("error","工作进程意外退出")+"\n")
    print(json.dumps(result,ensure_ascii=False,indent=2))
