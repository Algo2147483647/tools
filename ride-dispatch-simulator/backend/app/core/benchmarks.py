"""CPU-isolated benchmark jobs with progress, durable results, and real cancellation."""

import asyncio
from datetime import datetime, timezone
import logging
import multiprocessing as mp
import os
from queue import Empty
from uuid import uuid4

from app.core.sessions import CapacityError
from app.core.settings import Settings
from app.core.storage import CheckpointStore
from app.dispatch.registry import registry
from app.simulation.engine import DEFAULT_CONFIG, normalized_config
from app.websocket.channel import LatestFrameChannel

log = logging.getLogger(__name__)
TERMINAL = {"completed", "cancelled", "failed"}


def benchmark_worker(options: dict, output):
    """Top-level spawn target: no ASGI objects or live sessions enter the child."""
    try:
        from app.simulation.benchmark import run_benchmark

        def progress(result, completed, total):
            output.put({"kind": "result", "result": result, "completed": completed, "total": total})

        results = run_benchmark(options, on_result=progress)
        output.put({"kind": "completed", "results": results})
    except BaseException as exc:
        output.put({"kind": "failed", "error": f"{type(exc).__name__}: {exc}"})


class BenchmarkJob:
    def __init__(self, record: dict, store: CheckpointStore):
        self.record = record
        self.store = store
        self.channel = LatestFrameChannel()
        self.process = None
        self.output = None
        self.monitor_task: asyncio.Task | None = None
        self.lock = asyncio.Lock()

    @property
    def id(self):
        return self.record["benchmarkId"]

    def snapshot(self):
        return {**self.record, "results": list(self.record["results"])}

    def publish(self):
        self.channel.publish({"type": "benchmark", **self.snapshot()})

    async def persist(self):
        await asyncio.to_thread(self.store.save, "benchmarks", self.id, self.snapshot())

    def launch(self):
        # Keep native BLAS from oversubscribing the interactive simulation server.
        os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
        os.environ.setdefault("OMP_NUM_THREADS", "1")
        context = mp.get_context("spawn")
        self.output = context.Queue(maxsize=32)
        self.process = context.Process(
            target=benchmark_worker,
            args=({"config": self.record["config"], "duration": self.record["duration"]}, self.output),
            name=f"benchmark-{self.id}", daemon=True,
        )
        self.process.start()
        self.record["status"] = "running"
        self.monitor_task = asyncio.create_task(self._monitor(), name=f"benchmark-monitor-{self.id}")

    async def _monitor(self):
        dead_polls = 0
        try:
            while self.record["status"] not in TERMINAL:
                changed = False
                async with self.lock:
                    if self.record["status"] in TERMINAL:
                        break
                    while True:
                        try:
                            message = self.output.get_nowait()
                        except Empty:
                            break
                        changed = True
                        if message["kind"] == "result":
                            self.record["results"].append(message["result"])
                            self.record["completed"] = message["completed"]
                            self.record["total"] = message["total"]
                        elif message["kind"] == "completed":
                            self.record["results"] = message["results"]
                            self.record["completed"] = len(message["results"])
                            self.record["status"] = "completed"
                        elif message["kind"] == "failed":
                            self.record["status"] = "failed"
                            self.record["error"] = message["error"]
                    if not self.process.is_alive() and self.record["status"] not in TERMINAL:
                        dead_polls += 1
                        if dead_polls >= 5:
                            self.record.update(status="failed", error=f"Benchmark worker exited with code {self.process.exitcode}")
                            changed = True
                    if changed:
                        await self.persist()
                        self.publish()
                await asyncio.sleep(0.1)
        except Exception as exc:
            log.exception("Benchmark monitor failed")
            async with self.lock:
                self.record.update(status="failed", error=str(exc))
                await self.persist()
                self.publish()
        finally:
            if self.process:
                await asyncio.to_thread(self.process.join, 2)
                if self.process.is_alive():
                    self.process.terminate()
                    await asyncio.to_thread(self.process.join, 2)
            if self.output:
                self.output.cancel_join_thread()
                self.output.close()

    async def cancel(self):
        async with self.lock:
            if self.record["status"] in TERMINAL:
                return self.snapshot()
            # Termination stops real CPU work instead of merely hiding its result.
            if self.process and self.process.is_alive():
                self.process.terminate()
                await asyncio.to_thread(self.process.join, 3)
                if self.process.is_alive():
                    self.process.kill()
                    await asyncio.to_thread(self.process.join, 3)
            self.record["status"] = "cancelled"
            await self.persist()
            self.publish()
        if self.monitor_task:
            await self.monitor_task
        return self.snapshot()


class BenchmarkManager:
    def __init__(self, settings: Settings, store: CheckpointStore):
        self.settings = settings
        self.store = store
        self.jobs: dict[str, BenchmarkJob] = {}
        self.lock = asyncio.Lock()

    async def restore(self):
        records = await asyncio.to_thread(self.store.load_all, "benchmarks")
        for record in records[:self.settings.max_benchmark_records]:
            if record.get("status") not in TERMINAL:
                record.update(status="cancelled", error="Server restarted before this benchmark finished; rerun to replay the same seed")
            job = BenchmarkJob(record, self.store)
            self.jobs[job.id] = job
            await job.persist()
        for record in records[self.settings.max_benchmark_records:]:
            await asyncio.to_thread(self.store.delete, "benchmarks", record["benchmarkId"])

    async def create(self, config: dict, duration: float):
        async with self.lock:
            active = sum(job.record["status"] not in TERMINAL for job in self.jobs.values())
            if active >= self.settings.max_benchmark_jobs:
                raise CapacityError("Benchmark worker capacity reached; cancel or finish a running job first")
            while len(self.jobs) >= self.settings.max_benchmark_records:
                ended = [job for job in self.jobs.values() if job.record["status"] in TERMINAL]
                if not ended:
                    break
                oldest = min(ended, key=lambda job: job.record["createdAt"])
                self.jobs.pop(oldest.id)
                oldest.channel.close()
                await asyncio.to_thread(self.store.delete, "benchmarks", oldest.id)
            job = BenchmarkJob({
                "benchmarkId": str(uuid4()), "status": "queued", "results": [],
                "completed": 0, "total": len(registry.list_algorithms()),
                "config": normalized_config(DEFAULT_CONFIG, config), "duration": duration,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }, self.store)
            self.jobs[job.id] = job
            async with job.lock:
                job.launch()
                await job.persist()
            return job

    def get(self, identifier: str):
        return self.jobs[identifier]

    async def close(self):
        await asyncio.gather(*(job.cancel() for job in self.jobs.values()))
        # Already-completed monitors may still be joining their subprocess.
        await asyncio.gather(*(job.monitor_task for job in self.jobs.values() if job.monitor_task), return_exceptions=True)
        for job in self.jobs.values():
            job.channel.close()
