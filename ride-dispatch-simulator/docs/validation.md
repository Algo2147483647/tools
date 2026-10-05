# Validation record

Verified on Windows on 2026-10-05 using the project's Python 3.12 environment and Node.js runtime.

| Check | Result |
| --- | --- |
| Backend domain and API suite | 62 tests passed |
| Frontend transport and interpolation suite | 10 tests passed |
| TypeScript and Vite production build | Passed |
| Frontend formatting check | Passed |
| Windows `launch.cmd -BuildOnly` | Passed in Windows PowerShell 5.1 |
| Windows `launch.cmd -NoBrowser` | Started FastAPI and Vite successfully |
| Direct backend REST / WebSocket smoke test | Passed |
| REST / WebSocket smoke test through Vite proxy | Passed against the final running backend |

The backend suite covers physical road movement, complete order lifecycles,
cancellation and accounting, rectangular Hungarian optimality, deterministic
demand replay, exact checkpoints, session isolation, strict command validation,
WebSocket recovery, bounded subscriber queues, real benchmark worker cancellation
and custom policy loading in fresh Python processes. The workload test advances
1,000 drivers with more than 100 simultaneous active requests.

The live smoke test starts a 500-driver simulation before opening any WebSocket.
It observes autonomous clock progression, then receives growing order counts and
authoritative state over a real socket. It checks pause, reset, independent sessions,
invalid algorithm rejection and an actual six-policy benchmark with identical
created-order counts. Temporary test sessions are removed afterwards. Local reports
are written to `.runtime/smoke-report.json` and `.runtime/proxy-smoke-report.json`.

The frontend tests cover stale-frame rejection, checkpoint sequence rollback,
backend error frames, bounded reconnect backoff, socket disposal and road-junction
interpolation. Unknown transitions snap to server positions; interpolation never
extrapolates or plans its own route. A source-boundary check rejects browser
simulation engines, Web Workers and interval-based polling.

Browser visual regression for this migration was not completed: the available
browser automation tool rejected the localhost navigation under its URL security
policy. No 60 FPS browser measurement is claimed. The existing screenshots in this
directory predate the backend migration. Docker and the macOS/Linux helper were
provided but were not executed in this Windows environment.

The backend suite emitted one upstream Starlette/AnyIO deprecation warning; no
tests failed. Test and launch commands are in the project README.
