"""Content-addressed S3 snapshots, committed by a manifest after read-back verification."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile

from .config import Config
from .jobs import compute_lock
from .storage import Registry, canonical, digest, home, ident, read, run_dir, locate_model


class Objects:
    def __init__(self,bucket,prefix):
        try:
            import boto3
        except ImportError as exc:
            raise ValueError('请先安装对象存储依赖 pip install -e ".[s3]"') from exc
        self.client = boto3.client("s3")
        self.bucket = bucket
        self.prefix = prefix.strip("/")

    def key(self, suffix):
        return "/".join(filter(None,(self.prefix,suffix)))

    def read_verified(self, name, expected, output=None):
        h = hashlib.sha256()
        stream = self.client.get_object(Bucket=self.bucket,Key=self.key(name))["Body"]
        try:
            for block in stream.iter_chunks(1024*1024):
                h.update(block)
                if output:
                    output.write(block)
        finally:
            stream.close()
        if h.hexdigest()!=expected:
            raise ValueError("对象校验失败 "+name)

    def put_file(self,path,key):
        from botocore.exceptions import ClientError
        name = "objects/"+key
        try:
            self.client.head_object(Bucket=self.bucket,Key=self.key(name))
        except ClientError as exc:
            if exc.response["ResponseMetadata"]["HTTPStatusCode"]!=404:
                raise
            self.client.upload_file(str(path),self.bucket,self.key(name))
        self.read_verified(name,key)


def snapshot(args):
    store = Objects(args.bucket,args.prefix)
    folder = run_dir(args.run)
    with compute_lock():
        status = read(folder/"status.json")
        reg = Registry(Config(**status["config"]))
        files = [p for p in folder.iterdir() if p.is_file() and p.name not in ("ready","stop")]
        files.append(reg.path/"champion.json")
        for path in reg.path.glob("models/*/meta.json"):
            files.extend((path,path.with_name("weights.pt")))
            if path.with_name("gate.json").exists():
                files.append(path.with_name("gate.json"))
        for model in (status.get("models") or [status.get("candidate"),status.get("incumbent")]):
            if model:
                other = locate_model(model)
                files.extend([other/"meta.json",other/"weights.pt"])
        for category in ("archive","unfinished"):
            for path in (reg.path/category).glob("*/game.json"):
                if path.parent.name.startswith("."):
                    continue
                files.extend((path,path.with_name("positions.npz"),path.with_name("game.sgf")))
        manifest = {}
        for p in dict.fromkeys(files):
            if not p.exists():
                continue
            key = digest(p)
            if p.name=="weights.pt" and key!=p.parent.name:
                raise ValueError("冻结权重已损坏")
            if p.suffix in (".npz",".sgf"):
                meta = read(p.with_name("game.json"))
                if key!=meta["sha256" if p.suffix==".npz" else "sgf_sha256"]:
                    raise ValueError("归档损坏 "+p.parent.name)
            store.put_file(p,key)
            manifest[p.relative_to(home()).as_posix()] = key
        data = canonical({"format":1,"run":args.run,"files":manifest})
        key = hashlib.sha256(data).hexdigest()
        store.client.put_object(Bucket=store.bucket,Key=store.key("manifests/"+key),Body=data)
        store.read_verified("manifests/"+key,key)
        print(key)


def restore(args):
    from io import BytesIO
    store = Objects(args.bucket,args.prefix)
    key = ident(args.manifest,64)
    buf = BytesIO()
    store.read_verified("manifests/"+key,key,buf)
    manifest = json.loads(buf.getvalue())
    if manifest["format"]!=1:
        raise ValueError("不支持的清单版本")
    dest = args.dest.resolve()
    if dest.exists():
        raise ValueError("恢复目录须为新路径")
    dest.parent.mkdir(parents=True,exist_ok=True)
    tmp = Path(tempfile.mkdtemp(dir=dest.parent,prefix=".restore-"))
    try:
        for rel,key in manifest["files"].items():
            path = PurePosixPath(rel)
            if not path.parts or path.parts[0] not in ("experiments","runs") or "\\" in rel or ":" in rel:
                raise ValueError("无效的归档路径")
            target = (tmp/path).resolve()
            if not target.is_relative_to(tmp) or ".." in path.parts:
                raise ValueError("无效的归档路径")
            target.parent.mkdir(parents=True,exist_ok=True)
            with target.open("xb") as out:
                store.read_verified("objects/"+ident(key,64),key,out)
        os.rename(tmp,dest)
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)
    print(dest)
