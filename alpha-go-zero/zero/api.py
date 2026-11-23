import json
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import jobs, play
from .config import Config, PRESETS, preset
from .storage import all_models, read, run_dir

app = FastAPI(title="弈零研究台")


@app.exception_handler(ValueError)
def bad_request(_,exc):
    return JSONResponse({"detail":str(exc)},status_code=400)


@app.exception_handler(FileNotFoundError)
def missing(_,exc):
    return JSONResponse({"detail":"找不到对应的本地产物"},status_code=404)


class NewGame(BaseModel):
    size: Literal[9,19] = 9
    human: Literal[1,-1] = 1
    model: str | None = None
    sims: int = Field(8,ge=1,le=4096)
    seed: int = Field(7,ge=0,le=2**31-1)


class Move(BaseModel):
    action: int


class Job(BaseModel):
    config: Config = Config()
    rounds: int = Field(1,ge=1,le=10000)
    source: str | None = None
    candidate: str | None = None
    incumbent: str | None = None


@app.get("/api/overview")
def overview():
    return dict(models=all_models(),runs=jobs.list_runs(),presets={k:preset(k).model_dump() for k in PRESETS})


@app.post("/api/games")
def create(spec: NewGame):
    return play.create(spec.size,spec.human,spec.model,spec.sims,spec.seed)


@app.get("/api/games/{key}")
def position(key:str,ply:int|None=None):
    return play.access(key,"view",ply)


@app.post("/api/games/{key}/move")
def move(key:str,body:Move):
    return play.access(key,"move",body.action)


@app.post("/api/games/{key}/undo")
def undo(key:str):
    return play.access(key,"undo")


@app.post("/api/games/{key}/analyse")
def analysis(key:str):
    return play.access(key,"analyse")


@app.get("/api/games/{key}/sgf")
def record(key:str):
    return PlainTextResponse(play.access(key,"sgf"),media_type="application/x-go-sgf",
                              headers={"Content-Disposition":"attachment; filename=game.sgf"})


@app.post("/api/jobs",status_code=201)
def submit(job:Job):
    return jobs.submit(job.config,job.rounds,job.source,job.candidate,job.incumbent)


@app.post("/api/jobs/{key}/stop")
def stop(key:str):
    return jobs.stop(key)


@app.get("/api/jobs/{key}")
def detail(key:str):
    folder = run_dir(key)
    meta = read(folder/"status.json")
    events = []
    path = folder/"events.jsonl"
    if path.exists():
        from collections import deque
        with path.open(encoding="utf8") as stream:
            for line in deque(stream,maxlen=200):
                if line.endswith("\n"):
                    events.append(json.loads(line))
    return dict(**meta,events=events,stop_requested=(folder/"stop").exists(),
                reports=[p.stem for p in sorted(folder.glob("report-*.json"))])


@app.get("/api/jobs/{key}/reports/{name}")
def report(key:str,name:str):
    import re
    if not re.fullmatch(r"report-(?:[0-9]+|independent)",name):
        raise HTTPException(404)
    return read(run_dir(key)/(name+".json"))


dist = Path(__file__).resolve().parents[1]/"frontend"/"dist"
if dist.is_dir():
    app.mount("/",StaticFiles(directory=dist,html=True),name="workbench")
