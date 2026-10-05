# Frontend / backend implementation contract

The API owns all domain state. Existing English display field names remain camelCase on the wire. No browser engine or offline simulation fallback is permitted.

## Engine Python boundary

`app.simulation.engine.SimulationEngine(config: dict | None = None, network: dict | None = None)` exposes:

- `network: dict`, `config: dict`, `time: float`, `running: bool` (properties are fine).
- `step(seconds)`, `set_running(bool)`, `set_config(partial_dict)`, `reset(partial_dict=None)`, `seek_hour(hour)`.
- `snapshot(include_history=True) -> dict`: `time`, `running`, `config`, `vehicles`, `orders`, `metrics`, `history`, `events`, `candidates`, and `zoneStats`. Types are documented in `frontend/src/types.ts`.
- `zoneStats`: array `{id, demandWeight, openOrders, idleDrivers, availableDrivers}` computed by the backend for rendering only.
- `config` keeps seed, supply, demand, algorithm, batchInterval, weights, startHour, reposition; adds `simulationSpeed` (1,2,5,10), `secondsPerRealSecond` (default10), `supplyDistribution` (uniform,demand_weighted,random_cluster).
- `app.dispatch.registry.registry.list_algorithms() -> list[dict]` exposes id, name, label, description. Plugins register by ID; engine never switches on algorithm IDs. Batch cadence belongs to plugin metadata/method.
- `app.simulation.benchmark.run_benchmark(options: dict, on_result=None) -> list[dict]` returns `{algorithm,name,metrics,duration,seed}`; duration is simulation seconds. All plugins use identical seeded demand.

## REST (port 8000)

- `GET /health`
- `GET /api/algorithms` → array of algorithm metadata.
- `POST /api/simulations` body `{config?: partial}` → `{simulationId,network,state,sequence}`.
- `GET /api/simulations/{id}` → `{simulationId,network,state,sequence}`.
- `GET /api/simulations` → session summaries.
- `POST /api/simulations/{id}/start`, `/pause` → `{simulationId,state,sequence}`.
- `POST /api/simulations/{id}/reset` body `{config?: partial}` → `{simulationId,state,sequence}`.
- `PATCH /api/simulations/{id}/config` body partial config → `{simulationId,state,sequence}`.
- `POST /api/simulations/{id}/time` body `{hour}` → `{simulationId,state,sequence}`.
- `GET /api/simulations/{id}/metrics` → history array.
- `GET /api/simulations/{id}/snapshot` → downloadable authoritative state/config/network payload.
- `DELETE /api/simulations/{id}` →204.
- `POST /api/benchmarks` body `{config:partial,duration:seconds}` → `{benchmarkId,status}`.
- `GET /api/benchmarks/{id}` → `{benchmarkId,status,results,completed,total,error?,config,duration}`.
- `DELETE /api/benchmarks/{id}` cancels a queued/running job; completed records retained.
- `GET /api/benchmarks/{id}/csv` exports benchmark results.

## WebSocket

`/ws/simulation/{id}` sends `{type:'snapshot',simulationId,sequence,state}` immediately on connect, then `{type:'state',simulationId,sequence,state}` at the 100 ms scheduler cadence. Full state frames contain no static network geometry and may omit `history`; the frontend preserves prior history if missing. Frames include vehicle routes/progress for rendering interpolation, orders, metrics, candidates, events, zone statistics and authoritative clock/configuration. Sequence increases for every mutation/tick. A new connection's initial snapshot establishes the authoritative baseline, including when a recovered checkpoint has an earlier sequence; subsequent stale frames are ignored. A backend engine failure pauses the session and sends `{type:'error',simulationId,sequence,state,message}`.

`/ws/benchmarks/{id}` sends current job immediately and updates `{type:'benchmark',benchmarkId,status,results,completed,total,error?,config,duration}`. No high-frequency REST polling. Reconnect sockets with backoff; reconnect sends current full snapshot.

REST validation returns 422; missing sessions/jobs return 404. Application lifecycle owns simulation tasks regardless of socket subscribers. Commands and engine stepping are serialized per session. Benchmark CPU work runs outside the API event loop. The frontend never advances simulation time or executes routing/dispatch/metrics.
