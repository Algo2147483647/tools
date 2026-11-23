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
                    row.update(state="interrupted",error="Previous worker exited",updated=time.time())
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
        raise ValueError("Rounds must be between 1 and 10000 inclusive")
    if bool(candidate)!=bool(incumbent) or (source and (candidate or models)):
        raise ValueError("Submit resume and evaluation separately. Evaluation requires both models.")
    with FileLock(str(home()/"admission.lock")):
        if not reconcile():
            raise ValueError("A compute job is active. Wait for it or stop it first.")
        if source:
            old = read(run_dir(source)/"status.json")
            if not (run_dir(source)/"checkpoint.pt").is_file():
                raise ValueError("No complete checkpoint is available for this job")
            cfg = Config(**old["config"])
        kind = "league" if models else "arena" if candidate else "train"
        if models and (len(set(models))!=len(models) or not 2<=len(models)<=64):
            raise ValueError("A league requires 2 to 64 distinct frozen models")
        if kind in ("arena","league"):
            from .storage import locate_model
            for key in (models or [candidate,incumbent]):
                if not key:
                    raise ValueError("Select two frozen models")
                net = read(locate_model(key)/"meta.json")["net"]
                if net["size"]!=cfg.net.size or net["rules"]!=cfg.net.rules:
                    raise ValueError("Model size and rules must match the evaluation protocol")
            if kind=="arena" and candidate == incumbent:
                raise ValueError("Select two different models")
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
                row.update(state="failed",error="Worker startup failed. See worker.log")
                write(folder/"status.json",row)
                raise ValueError(row["error"])
            time.sleep(0.04)
        return read(folder/"status.json")


def stop(key):
    folder = run_dir(key)
    if not (folder/"status.json").is_file():
        raise ValueError("Job not found")
    if read(folder/"status.json")["state"] in ACTIVE:
        (folder/"stop").touch()
    return {"requested":(folder/"stop").exists()}
