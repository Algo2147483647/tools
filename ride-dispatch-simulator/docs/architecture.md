# Simulation architecture and extension guide

The FastAPI service owns the city state. React renders authoritative snapshots,
captures controls, and interpolates received road positions for display. The browser
does not generate demand, advance the simulation clock, route drivers, choose
assignments, or calculate operational KPIs. A session continues running with no
browser or WebSocket subscriber connected.

```text
React / Canvas
    REST commands + WebSocket state stream
FastAPI session runtime (100 ms wall-clock scheduler)
    SimulationEngine.step(simulation_seconds)
    ├── DemandGenerator: seeded spatial demand and arrival clock
    ├── OrderEngine: request collection, waiting and retention
    ├── VehicleEngine: road movement and time accounting
    ├── DispatchRegistry: pure assignment policy plugins
    ├── RoutingEngine: Dijkstra trees and routes
    └── MetricsEngine: cumulative observed outcome aggregates
```

## Units, topology and state

Distances are kilometres, vehicle speeds are kilometres/hour, and durations are
simulation seconds. Fares use USD. Rate metrics such as utilization and completion
are percentages in `[0, 100]`. `state.time` is elapsed time; the city clock is
`(config.startHour * 3600 + state.time) % 86400`.

New Harbor is an offline synthetic city stored in `backend/app/data/new_harbor.json`.
It has 328 road intersections and ten demand zones, plus buildings, parks and river
geometry for display. One map coordinate unit represents eight metres. Latitude
and longitude values are approximate georeferences for this synthetic geometry;
they do not describe measured roads in a real city.

The loader enriches each edge with `distance`, `speedLimit`, `travelTime`,
`roadType`, `fromNode` and `toNode`. The first implementation uses connected,
undirected roads without turn restrictions. It models road-class speeds and
peak-hour slowdown, but does not yet model traffic signals, car following,
intersection queues, collisions or lane capacity.

`Vehicle`, `Order`, `Route` and `DispatchResult` are backend dataclasses in
`backend/app/models/domain.py`. Their camelCase fields preserve the API contract.
`nodeId` is a driver's current segment origin; `routeIndex` and `edgeProgress`
identify its progress along an actual graph edge. `idleTime` is the current idle
streak, including repositioning; `onlineTime`, `servingTime`, `distanceDriven`,
`revenue` and `completed` are cumulative for that driver.

## Clocks and integration

The runtime uses a monotonic wall clock and schedules work every 100 ms. Elapsed
wall time is converted to simulation time using:

```text
simulation seconds = real elapsed seconds × secondsPerRealSecond × simulationSpeed
```

The default base scale is ten simulation seconds per real second. The controls
offer 1×, 2×, 5× and 10× multipliers. A base scale of sixty makes one real second
represent one simulation minute at 1×. Changing speed affects the backend clock,
not a JavaScript timer.

`step` integrates at most one simulation second per substep, splitting at dispatch,
metric, history, repositioning and traffic-period boundaries. A vehicle can finish
several road segments in one substep; the remaining movement time carries into the
next segment. Pickup and completion timestamps use the fractional road-arrival
time. Initial instant matching runs at elapsed time zero. Batch clocks are anchored
to their configured interval and do not accumulate drift from fractional wall ticks.

Peak traffic uses 78% of road speed during 07:00–09:00 and 17:00–20:00, and 96%
otherwise. ETA is a forecast using the current traffic factor; an intervening
peak-period change can alter the eventual arrival time.

Commands and ticks are serialized by one lock per session. CPU integration runs
outside the API event loop. The WebSocket channel retains the latest state for a
slow consumer rather than building an unbounded frame queue.

## Demand and supply

Initial conditions are 200 drivers, 30 requests and ten zones. At 08:00, default
demand averages twenty new requests per simulation minute. Arrival times follow
a nonhomogeneous Poisson process: exponential hazard is integrated through the
time-of-day boundaries. The demand multiplier scales the rate. Zone weights and
the time pattern determine pickup probabilities and destination weights determine
the OD pattern. Residential origins dominate morning demand, CBD origins increase
in the evening, nightlife increases at night, and airport demand persists all day.

Demand has its own seeded random stream. Routing, dispatch, repositioning and
driver movement never consume that stream. Therefore different policies receive
identical request times, origins, destinations and fares for the same benchmark
configuration. Driver initialization and subsequent idle movement have a separate
seeded stream.

Uniform supply samples road nodes. Demand-weighted supply samples zones by their
current demand weight and then samples a node. Random-cluster supply chooses three
seeded zones and places drivers within them. Changing distribution applies to newly
added drivers and the next reset; existing vehicles retain their physical position.
Changing a seed affects the next reset. Changing supply immediately adds or retires
drivers; busy drivers marked for retirement finish their accepted trip, or become
offline when its pickup is cancelled. They are excluded from new assignments.

The `/time` command starts a fresh seeded scenario at the chosen hour while retaining
the running/paused setting. A direct `startHour` configuration patch changes the
clock base for the current scenario and reschedules future demand; it does not
rewrite elapsed request lifecycles. Use reset or `/time` for a clean experiment.

## Routing and order lifecycle

`RoutingEngine.calculate_route(origin, destination, traffic_factor=1.0,
objective="eta")` returns `Route(distance, duration, path)`. Dijkstra trees are
cached by origin and objective. `eta` minimizes road travel time; `distance`
minimizes road kilometres. Both the returned duration and distance describe the
same returned path. Cache entries are published only after all their associated
duration data is available to concurrent sessions.

A driver already on a segment completes that segment before taking a new route.
Changing its target, cancelling a request or disabling repositioning preserves its
coordinates and fractional edge progress. No matching algorithm uses a Euclidean
teleport as a pickup route. A future OSRM, Valhalla or GraphHopper adapter should
preserve the route contract and replace the current routing/movement integration
at the backend boundary.

The normal order lifecycle is `Waiting → Assigned → PickingUp → Serving → Completed`.
A request waiting over 600 simulation seconds before pickup is cancelled, including
an assigned request whose driver has not arrived. Cancellation releases its driver
without moving the vehicle. Revenue is recognized once, on trip completion.

## Policies and KPI definitions

| ID | Selection rule | Driving route objective |
| --- | --- | --- |
| `nearest` | Oldest request first; closest available driver by road distance | Shortest distance |
| `fifo` | Oldest request first; driver with the longest idle streak | Fastest ETA |
| `greedy` | Repeatedly choose the cheapest pair across the full matrix | Fastest ETA |
| `hungarian` | Exact rectangular minimum-total-ETA assignment using SciPy | Fastest ETA |
| `batch` | Accumulate requests, then solve the same exact assignment | Fastest ETA |
| `score` | Greedy selection over normalized ETA, wait, idle, balance and income features | Fastest ETA |

Available means `Idle` or `Repositioning`, excluding retiring drivers. All policies
receive the same eligibility rules. The score configuration key `distance` is kept
for API compatibility but weights pickup ETA. Waiting and idle features have negative
cost contributions, prioritizing people and drivers who have waited longer.

Before applying any plugin output, the engine validates the entire batch: returned
records must be the exact eligible backend objects, each driver and request may
appear once, and reported costs must be finite and nonnegative. A rejected batch
does not partially assign earlier matches. Pickup metrics are recalculated from the
chosen physical route by the engine; a plugin does not get to manufacture its KPI.

| Metric | Definition |
| --- | --- |
| Average pickup ETA/distance | Mean predicted road ETA/distance across assignments, including assignments later cancelled |
| Average passenger wait | Mean creation-to-pickup time among picked-up riders; before the first pickup, current mean wait of unpicked riders |
| Completion / cancellation rate | Respective cumulative count divided by all requests created |
| Driver utilization | Cumulative occupied seconds divided by cumulative online seconds |
| Orders/min | Count created during the trailing sixty simulation seconds |
| Revenue | Sum of completed-trip fares |
| Income variance | Population variance of cumulative driver revenue across the scenario's fleet, including retired drivers |
| Supply / demand | Available drivers / requests not yet picked up, including assigned requests |
| Market state | Ratio below 0.8: Shortage; above 1.2: Surplus; otherwise Balanced |

Unfinished trips remain in the denominator at the benchmark horizon. Mean passenger
wait is a picked-up-rider cohort, so it must be read together with cancellation and
completion rates; a policy that cancels many requests can still show a small mean
wait for the riders it served. An empty demand denominator uses one to keep the
stream finite.

The engine keeps up to 500 terminal orders, 80 feed events, 180 candidate lines and
720 metric samples at five-second intervals. Active orders are retained. Cumulative
metrics survive terminal-record pruning. Persistence checkpoints additionally store
RNG state, ID counters, clocks and aggregate counters. Restoring a checkpoint
resumes the same scenario; restarting the service restores sessions paused.

## Reproducible benchmarks

`run_benchmark({"config": {...}, "duration": 1800}, on_result=None)` constructs
a fresh engine for every registered policy. Each receives the same initial fleet,
request stream, city, traffic schedule and run duration. No warm-up interval is
discarded. Driver trajectories naturally diverge after assignments differ.
Benchmarks do not mutate the live session and do not depend on its current clock.

The API runs a benchmark in a separate spawned process so matching experiments do
not occupy the API event loop. Results stream per completed policy over WebSocket.
Cancellation terminates that worker. Do not compare runs with different seeds,
horizons or configurations as though they were the same scenario. A single seeded
run is an experiment, not a statistically robust ranking; use several seeds for
research conclusions.

## Add a plugin that also works in benchmark workers

Create `backend/app/dispatch/idle_priority.py`:

```python
from app.models import DispatchResult
from .base import DispatchAlgorithm, oldest_first


class IdlePriority(DispatchAlgorithm):
    id = "idle-priority"
    name = "Idle Priority"
    label = "Idle Priority Dispatch"
    description = "Among drivers idle at least one minute, choose the lowest road ETA."

    def dispatch(self, vehicles, orders, simulation_state):
        remaining = list(vehicles)
        results = []
        for order in oldest_first(orders):
            if not remaining:
                break
            preferred = [driver for driver in remaining if driver.idleTime >= 60]
            pool = preferred or remaining
            costs = {
                driver.id: simulation_state.router.vehicle_cost(
                    driver, order.pickupNode, simulation_state.traffic_factor
                )
                for driver in pool
            }
            driver = min(pool, key=lambda item: (costs[item.id][1], item.id))
            distance, eta = costs[driver.id]
            results.append(DispatchResult(driver, order, distance, eta))
            remaining.remove(driver)
        return results
```

Edit the shared bootstrap in `backend/app/dispatch/plugins.py`:

```python
def register_plugins(registry):
    from .idle_priority import IdlePriority
    registry.register(IdlePriority())
```

Restart the backend. `GET /api/algorithms` now returns the new policy, the frontend
picker displays its metadata, and benchmark workers import and compare it. This
bootstrap is loaded by `dispatch.registry` in every Python process. Registering
only inside FastAPI startup would leave spawned benchmark processes unaware of
the plugin and must be avoided.

Policy methods must be pure: do not mutate vehicles, orders, configuration or the
road graph. Return original eligible objects, not copies. Keep plugin instances
stateless because one registry instance serves multiple sessions; scenario state
belongs to `SimulationEngine`. Override `interval(config)` and `initial_delay(config)`
to opt into batching; the engine does not switch on algorithm IDs. No frontend
dispatch implementation or engine `if/else` branch is needed.

## Validation and performance scope

Backend tests verify road geometry, rectangular assignment optimality against
brute force, complete lifecycles, cancellation, supply retirement, authoritative
metrics, fractional clock boundaries, checkpoint replay, demand-stream fairness,
plugin isolation and fresh-process plugin loading. A stress scenario advances
1,000 drivers with over 100 active requests.

These are measured backend correctness and workload checks. They do not establish
a universal 60 FPS browser guarantee. Rendering and stream throughput depend on
hardware, viewport, active layers, connection bandwidth, simulation speed and
concurrent session count; profile those separately for a deployment target.
