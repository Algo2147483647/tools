import os
import subprocess
import sys
import time
import uuid

from filelock import FileLock, Timeout
from .config import Config
from .storage import entries, home, read, run_dir, write


ACTIVE = ("starting","running","stopping")


def compute_lock():
    return FileLock(str(home()/"compute.lock"),timeout=0)


def reconcile():
    """Called under the admission lock. A dead owner releases the OS compute lock."""
    try:
        with compute_lock():
            for row in entries(home()/"runs","status.json"):
                if row["state"] in ACTIVE:
                    row.update(state="interrupted",error="上一个工作进程已退出",updated=time.time())
                    write(run_dir(row["id"])/"status.json",row)
            return True
    except Timeout:
        return False


def list_runs():
    with FileLock(str(home()/"admission.lock")):
        reconcile()
        return entries(home()/"runs","status.json")


def submit(cfg, rounds=1, source=None, candidate=None, incumbent=None, models=None):
    if not 1 <= rounds <= 10000:
        raise ValueError("轮数应在 1 到 10000 之间")
    if bool(candidate)!=bool(incumbent) or (source and (candidate or models)):
        raise ValueError("续训与独立比赛须分别提交，比赛须同时指定双方版本")
    with FileLock(str(home()/"admission.lock")):
        if not reconcile():
            raise ValueError("已有计算任务，请等待完成或先停止当前任务")
        if source:
            old = read(run_dir(source)/"status.json")
            if not (run_dir(source)/"checkpoint.pt").is_file():
                raise ValueError("该任务尚无完整检查点")
            cfg = Config(**old["config"])
        kind = "league" if models else "arena" if candidate else "train"
        if models and (len(set(models))!=len(models) or not 2<=len(models)<=64):
            raise ValueError("历史联赛需要 2 至 64 个不同的冻结模型")
        if kind in ("arena","league"):
            from .storage import locate_model
            for key in (models or [candidate,incumbent]):
                if not key:
                    raise ValueError("请选择两个冻结模型")
                net = read(locate_model(key)/"meta.json")["net"]
                if net["size"]!=cfg.net.size or net["rules"]!=cfg.net.rules:
                    raise ValueError("模型的棋盘尺寸和规则必须与评估协议一致")
            if kind=="arena" and candidate == incumbent:
                raise ValueError("请选择两个不同的模型")
        key = uuid.uuid4().hex
        folder = run_dir(key)
        folder.mkdir(parents=True)
        now = time.time()
        row = dict(id=key,kind=kind,state="starting",phase="startup",created=now,updated=now,
                   config=cfg.model_dump(),rounds=rounds,source=source,step=0,epoch=0,
                   candidate=candidate,incumbent=incumbent,models=models,done=0,total=0,checkpoint=False)
        write(folder/"status.json",row)
        flags = getattr(subprocess,"CREATE_NO_WINDOW",0)
        with (folder/"worker.log").open("ab") as log:
            child = subprocess.Popen([sys.executable,"-m","zero.worker",key],stdout=log,stderr=log,
                                     stdin=subprocess.DEVNULL,creationflags=flags,
                                     start_new_session=os.name!="nt")
        # Keep admission serialized until the child actually owns the compute lock.
        while not (folder/"ready").is_file():
            if child.poll() is not None:
                row.update(state="failed",error="工作进程启动失败，请查看 worker.log")
                write(folder/"status.json",row)
                raise ValueError(row["error"])
            time.sleep(0.04)
        return read(folder/"status.json")


def stop(key):
    folder = run_dir(key)
    if not (folder/"status.json").is_file():
        raise ValueError("找不到任务")
    if read(folder/"status.json")["state"] in ACTIVE:
        (folder/"stop").touch()
    return {"requested":(folder/"stop").exists()}
