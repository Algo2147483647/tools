"""Independent authoritative sessions; the application owns their clocks."""

import asyncio
from datetime import datetime, timezone
import logging
import time
from uuid import uuid4

from app.core.settings import Settings
from app.core.storage import CheckpointStore
from app.simulation.engine import SimulationEngine
from app.websocket.channel import LatestFrameChannel

log = logging.getLogger(__name__)


class CapacityError(Exception):
    pass


class SimulationSession:
    def __init__(self, identifier: str, engine: SimulationEngine, settings: Settings,
                 store: CheckpointStore, sequence=0, created_at=None):
        self.id = identifier
        self.engine = engine
        self.settings = settings
        self.store = store
        self.sequence = sequence
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()
        self.lock = asyncio.Lock()
        self.channel = LatestFrameChannel()
        self.state = engine.snapshot(include_history=True)
        self.error: str | None = None
        self.task: asyncio.Task | None = None
        self.closing = False
        self._last_wall = time.monotonic()
        self._last_saved = self._last_wall
        self._last_history = self._last_wall

    def start_clock(self):
        self.task = asyncio.create_task(self._tick_loop(), name=f"simulation-{self.id}")

    def envelope(self, network=False) -> dict:
        payload = {"simulationId": self.id, "state": self.state, "sequence": self.sequence}
        if network:
            payload["network"] = self.engine.network
        if self.error:
            payload["error"] = self.error
        return payload

    def _publish(self, include_history=True):
        state = self.state
        if not include_history:
            state = {key: value for key, value in state.items() if key != "history"}
        self.channel.publish({"type": "state", "simulationId": self.id,
                              "sequence": self.sequence, "state": state})

    async def _checkpoint_locked(self):
        def capture_and_save():
            exporter = getattr(self.engine, "export_checkpoint", None)
            checkpoint = exporter() if exporter else self.engine.snapshot(include_history=True)
            self.store.save("simulations", self.id, {
                "version": 1, "simulationId": self.id, "sequence": self.sequence,
                "createdAt": self.created_at, "config": self.engine.config,
                "checkpoint": checkpoint,
            })
        await asyncio.to_thread(capture_and_save)
        self._last_saved = time.monotonic()

    async def persist(self):
        async with self.lock:
            await self._checkpoint_locked()

    async def _tick_loop(self):
        while not self.closing:
            tick_start = time.monotonic()
            try:
                async with self.lock:
                    if self.closing:
                        break
                    now = time.monotonic()
                    elapsed = now - self._last_wall
                    self._last_wall = now
                    if self.engine.running:
                        scale = self.engine.config.get("secondsPerRealSecond", 10)
                        speed = self.engine.config.get("simulationSpeed", 1)

                        def advance():
                            self.engine.step(elapsed * scale * speed)
                            return self.engine.snapshot(include_history=True)

                        self.state = await asyncio.to_thread(advance)
                        self.sequence += 1
                        history_due = now - self._last_history >= 1.0
                        self._publish(include_history=history_due)
                        if history_due:
                            self._last_history = now
                    if now - self._last_saved >= self.settings.persistence_interval:
                        await self._checkpoint_locked()
            except Exception as exc:
                log.exception("Simulation %s stopped after an engine error", self.id)
                async with self.lock:
                    await asyncio.to_thread(self.engine.set_running, False)
                    self.state = await asyncio.to_thread(self.engine.snapshot, True)
                    self.error = str(exc)
                    self.sequence += 1
                    self.channel.publish({"type": "error", "simulationId": self.id,
                                          "message": "Simulation stopped after an engine error",
                                          "sequence": self.sequence, "state": self.state})
            # Speed changes scale simulated elapsed time, never this scheduler interval.
            await asyncio.sleep(max(0.001, self.settings.tick_interval - (time.monotonic() - tick_start)))

    async def command(self, operation: str, value=None) -> dict:
        async with self.lock:
            if self.closing:
                raise KeyError(self.id)
            command_wall = time.monotonic()
            elapsed = command_wall - self._last_wall
            previous_scale = self.engine.config.get("secondsPerRealSecond", 10)
            previous_speed = self.engine.config.get("simulationSpeed", 1)

            def mutate():
                # Account for the interval between scheduler ticks under the old
                # configuration. Reset/seek deliberately replace the clock instead.
                if self.engine.running and operation not in {"reset", "time"}:
                    self.engine.step(elapsed * previous_scale * previous_speed)
                if operation == "start":
                    self.engine.set_running(True)
                elif operation == "pause":
                    self.engine.set_running(False)
                elif operation == "reset":
                    self.engine.reset(value or None)
                elif operation == "config":
                    self.engine.set_config(value)
                elif operation == "time":
                    self.engine.seek_hour(value)
                else:
                    raise ValueError(f"Unsupported command: {operation}")
                return self.engine.snapshot(include_history=True)

            self.state = await asyncio.to_thread(mutate)
            self.error = None
            self._last_wall = time.monotonic() if operation in {"reset", "time"} else command_wall
            self.sequence += 1
            await self._checkpoint_locked()
            self._publish()
            return self.envelope()

    async def close(self, persist=True):
        self.closing = True
        # Let an in-flight to_thread step finish; cancelling it cannot stop its thread.
        if self.task:
            await self.task
        async with self.lock:
            await asyncio.to_thread(self.engine.set_running, False)
            self.state = await asyncio.to_thread(self.engine.snapshot, True)
            self.sequence += 1
            if persist:
                await self._checkpoint_locked()
            self.channel.close()


class SessionManager:
    def __init__(self, settings: Settings, store: CheckpointStore):
        self.settings = settings
        self.store = store
        self.sessions: dict[str, SimulationSession] = {}
        self.creation_lock = asyncio.Lock()

    async def restore(self):
        records = await asyncio.to_thread(self.store.load_all, "simulations")
        for record in records[:self.settings.max_sessions]:
            try:
                def load():
                    engine = SimulationEngine(record.get("config"))
                    engine.restore_snapshot(record["checkpoint"])
                    engine.set_running(False)
                    return engine
                engine = await asyncio.to_thread(load)
                session = SimulationSession(record["simulationId"], engine, self.settings, self.store,
                                            record.get("sequence", 0) + 1, record.get("createdAt"))
                self.sessions[session.id] = session
                session.start_clock()
            except Exception:
                log.exception("Could not restore simulation %s", record.get("simulationId"))

    async def create(self, config: dict) -> SimulationSession:
        async with self.creation_lock:
            if len(self.sessions) >= self.settings.max_sessions:
                raise CapacityError(f"At most {self.settings.max_sessions} simulation sessions may be active; delete an old session first")
            engine = await asyncio.to_thread(SimulationEngine, config)
            session = SimulationSession(str(uuid4()), engine, self.settings, self.store)
            await session.persist()
            self.sessions[session.id] = session
            session.start_clock()
            return session

    def get(self, identifier: str) -> SimulationSession:
        return self.sessions[identifier]

    async def delete(self, identifier: str):
        async with self.creation_lock:
            session = self.sessions.pop(identifier)
            await session.close(persist=False)
            await asyncio.to_thread(self.store.delete, "simulations", identifier)

    async def close(self):
        await asyncio.gather(*(session.close() for session in self.sessions.values()))
