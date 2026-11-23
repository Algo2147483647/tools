import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from contextlib import contextmanager
import time
import uuid

from filelock import FileLock
import torch

from .config import Network
from .network import PolicyValue


def home():
    root = Path(os.environ.get("WEIQI_ZERO_DATA", Path(__file__).resolve().parents[1]/"data"))
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()


def digest(path):
    with path.open("rb") as stream:
        h = hashlib.sha256()
        for block in iter(lambda: stream.read(1024*1024),b""):
            h.update(block)
    return h.hexdigest()


@contextmanager
def atomic(path):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp = NamedTemporaryFile(dir=path.parent, prefix=".partial-", delete=False)
    try:
        with tmp:
            yield tmp
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp.name,path)
    finally:
        Path(tmp.name).unlink(missing_ok=True)


def write(path, data):
    with atomic(path) as stream:
        stream.write(canonical(data))


def read(path):
    return json.loads(path.read_bytes())


def ident(key, length):
    if len(key) != length or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("Invalid identifier")
    return key


def run_dir(run_id):
    return home()/"runs"/ident(run_id,32)


def entries(folder, filename):
    return sorted((read(p) for p in folder.glob("*/"+filename)),key=lambda x:x["created"],reverse=True)


class Registry:
    def __init__(self, cfg):
        signature = hashlib.sha256(canonical(cfg.net.model_dump())).hexdigest()[:16]
        self.path = home()/"experiments"/f"{cfg.experiment}-{signature}"
        self.path.mkdir(parents=True,exist_ok=True)
        self.cfg = cfg
        self.lock = FileLock(str(self.path/"registry.lock"))

    def freeze(self, net, step, run_id, origin):
        weights = self.path/("freeze-"+uuid.uuid4().hex+".pt")
        try:
            with atomic(weights) as stream:
                torch.save({"net":self.cfg.net.model_dump(),"state":net.state_dict()},stream)
            key = digest(weights)
            folder = self.path/"models"/key
            with self.lock:
                folder.mkdir(parents=True,exist_ok=True)
                if not (folder/"meta.json").exists():
                    os.replace(weights,folder/"weights.pt")
                    write(folder/"meta.json",dict(id=key,net=self.cfg.net.model_dump(),step=step,
                          run=run_id,origin=origin,created=time.time(),experiment=self.cfg.experiment,
                          registry=self.path.name))
            return key
        finally:
            weights.unlink(missing_ok=True)

    def champion(self):
        file = self.path/"champion.json"
        return read(file)["id"] if file.exists() else None

    def publish(self, candidate, expected, operation=None):
        with self.lock:
            path = self.path/"champion.json"
            old = read(path) if path.exists() else {}
            history = old.get("history",[])
            if operation and any(e.get("operation")==operation and e["id"]==candidate for e in history):
                return True
            if self.champion() != expected:
                return False
            if not (self.path/"models"/ident(candidate,64)/"meta.json").is_file():
                raise ValueError("Candidate model not found")
            entry = dict(id=candidate,previous=expected,time=time.time(),operation=operation)
            write(path,{**entry,"history":[*history,entry]})
            return True

    def model(self,key):
        return load_model(self.path/"models"/ident(key,64))


def load_model(folder):
    key = ident(folder.name,64)
    path = folder/"weights.pt"
    if digest(path) != key:
        raise ValueError("Frozen weight checksum mismatch")
    payload = torch.load(path,map_location="cpu",weights_only=True)
    model = PolicyValue(Network(**payload["net"]))
    model.load_state_dict(payload["state"])
    return model


def all_models():
    rows = []
    for registry in (home()/"experiments").glob("*"):
        champ_file = registry/"champion.json"
        champ = read(champ_file)["id"] if champ_file.exists() else None
        for item in registry.glob("models/*/meta.json"):
            meta = read(item)
            gate = item.with_name("gate.json")
            rows.append({**meta,"champion":meta["id"] == champ,"gate":read(gate) if gate.exists() else None})
    return sorted(rows,key=lambda row:row["created"],reverse=True)


def locate_model(key, registry=None):
    key = ident(key,64)
    for row in all_models():
        if row["id"] == key and (registry is None or row["registry"] == registry):
            return home()/"experiments"/row["registry"]/"models"/key
    raise ValueError("Model not found")
