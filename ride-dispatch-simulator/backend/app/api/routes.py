import csv
import io
import json

from fastapi import APIRouter, Body, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from app.dispatch.registry import registry
from app.schemas.commands import ConfigPatch, CreateBenchmark, CreateSimulation, SeekTime

router = APIRouter()


def simulation(request: Request, identifier: str):
    try:
        return request.app.state.sessions.get(identifier)
    except KeyError:
        raise HTTPException(404, "Simulation not found")


def benchmark(request: Request, identifier: str):
    try:
        return request.app.state.benchmarks.get(identifier)
    except KeyError:
        raise HTTPException(404, "Benchmark not found")


@router.get("/health")
async def health(request: Request):
    return {"status": "ok", "service": "vector-backend", "version": "2.0.0",
            "sessions": len(request.app.state.sessions.sessions),
            "tickIntervalMs": request.app.state.settings.tick_interval * 1000}


@router.get("/api/algorithms")
async def algorithms():
    return registry.list_algorithms()


@router.get("/api/simulations")
async def list_simulations(request: Request):
    return [{"simulationId": session.id, "createdAt": session.created_at,
             "running": session.state["running"], "time": session.state["time"],
             "config": session.state["config"], "sequence": session.sequence}
            for session in request.app.state.sessions.sessions.values()]


@router.post("/api/simulations", status_code=201)
async def create_simulation(request: Request, payload: CreateSimulation = Body(default_factory=CreateSimulation)):
    session = await request.app.state.sessions.create(payload.config.model_dump(exclude_unset=True))
    return session.envelope(network=True)


@router.get("/api/simulations/{identifier}")
async def get_simulation(identifier: str, request: Request):
    session = simulation(request, identifier)
    async with session.lock:
        return session.envelope(network=True)


@router.post("/api/simulations/{identifier}/start")
async def start_simulation(identifier: str, request: Request):
    return await simulation(request, identifier).command("start")


@router.post("/api/simulations/{identifier}/pause")
async def pause_simulation(identifier: str, request: Request):
    return await simulation(request, identifier).command("pause")


@router.post("/api/simulations/{identifier}/reset")
async def reset_simulation(identifier: str, request: Request, payload: CreateSimulation = Body(default_factory=CreateSimulation)):
    return await simulation(request, identifier).command("reset", payload.config.model_dump(exclude_unset=True))


@router.patch("/api/simulations/{identifier}/config")
async def configure_simulation(identifier: str, request: Request, payload: ConfigPatch):
    return await simulation(request, identifier).command("config", payload.model_dump(exclude_unset=True))


@router.post("/api/simulations/{identifier}/time")
async def seek_time(identifier: str, request: Request, payload: SeekTime):
    return await simulation(request, identifier).command("time", payload.hour)


@router.get("/api/simulations/{identifier}/metrics")
async def historical_metrics(identifier: str, request: Request):
    session = simulation(request, identifier)
    async with session.lock:
        return session.state.get("history", [])


@router.get("/api/simulations/{identifier}/snapshot")
async def export_snapshot(identifier: str, request: Request):
    session = simulation(request, identifier)
    async with session.lock:
        return JSONResponse(session.envelope(network=True), headers={
            "Content-Disposition": f'attachment; filename="simulation-{session.id}.json"',
        })


@router.delete("/api/simulations/{identifier}", status_code=204)
async def delete_simulation(identifier: str, request: Request):
    simulation(request, identifier)
    try:
        await request.app.state.sessions.delete(identifier)
    except KeyError:
        raise HTTPException(404, "Simulation not found")
    return Response(status_code=204)


@router.post("/api/benchmarks", status_code=202)
async def create_benchmark(request: Request, payload: CreateBenchmark):
    job = await request.app.state.benchmarks.create(payload.config.model_dump(exclude_unset=True), payload.duration)
    return {"benchmarkId": job.id, "status": job.record["status"]}


@router.get("/api/benchmarks/{identifier}")
async def get_benchmark(identifier: str, request: Request):
    return benchmark(request, identifier).snapshot()


@router.delete("/api/benchmarks/{identifier}")
async def cancel_benchmark(identifier: str, request: Request):
    return await benchmark(request, identifier).cancel()


@router.get("/api/benchmarks/{identifier}/csv")
async def benchmark_csv(identifier: str, request: Request):
    job = benchmark(request, identifier)
    record = job.snapshot()
    if not record["results"]:
        raise HTTPException(409, "Benchmark has no finished algorithm results yet")
    metric_names = ["avgPickupETA", "avgWait", "avgPickupDistance", "completionRate",
                    "utilization", "incomeVariance", "cancellationRate", "revenue",
                    "completed", "cancelled", "created"]
    output = io.StringIO(newline="")
    config_names = ["supply", "demand", "startHour", "batchInterval", "supplyDistribution", "reposition", "weights"]
    writer = csv.DictWriter(output, fieldnames=["algorithm", "name", "seed", "duration"] + config_names + metric_names)
    writer.writeheader()
    for result in record["results"]:
        writer.writerow({**{key: result.get(key, "") for key in ["algorithm", "name", "seed", "duration"]},
                         **{key: (json.dumps(record["config"].get(key, {}), sort_keys=True)
                                  if key == "weights" else record["config"].get(key, "")) for key in config_names},
                         **{key: result["metrics"].get(key, "") for key in metric_names}})
    return Response(output.getvalue(), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="benchmark-{job.id}.csv"',
    })
