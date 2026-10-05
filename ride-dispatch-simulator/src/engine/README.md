# Simulation model

The browser reads a mutable `SimulationState` from `SimulationEngine`; the engine has no React or Canvas dependency. Render the map on `requestAnimationFrame` and sample UI metrics at a lower rate. Pause stops the model clock without clearing its state.

```ts
const engine = new SimulationEngine(createCity(), {
  supply: 200,
  demand: 1,
  algorithm: 'nearest',
  seed: 71429,
});
engine.setRunning(true);
engine.step(0.1);
engine.setConfig({ algorithm: 'hungarian' });
```

## Units and clock

- City coordinates and `RoadEdge.length` are world units. `KM_PER_UNIT = 0.008` converts world units to kilometres, once, in the router or vehicle movement.
- `Vehicle.speed` is kilometres per hour. Travelled distances and order distances are kilometres. Money is USD.
- `state.time`, event timestamps, all durations, ETA, wait, and history timestamps are elapsed simulation seconds. Absolute city time is `config.startHour * 3600 + state.time`, modulo one day.
- Completion, cancellation, and utilization KPIs use percentages, from 0 to 100.
- `seekHour(hour)` restarts the seeded scenario at a new start hour, preserving settings and the running/paused state. `reset()` restarts the current scenario and pauses it.
- `step(seconds)` accepts positive finite elapsed simulation time and internally limits movement steps to one second. The dashboard uses fixed 0.1-second steps. A benchmark uses the same one-second step for every policy.

## Roads and movement

`Router` caches a shortest-path tree per source node. Distances are measured on the connected, undirected street graph. A vehicle's routing cost includes the unfinished portion of its current edge. Assigning, cancelling, or rebalancing a driver preserves its coordinates and its progress on that edge; the driver completes it before taking the new route. Vehicles interpolate continuously between road intersections. Road classes have distinct speed limits, with slower movement during commute hours.

Each vehicle stores the last reached `nodeId`, the active `edgeId`, a path of node IDs, the path's current `routeIndex`, and fractional `edgeProgress`. `heading` is in radians. Idle drivers cruise through adjacent intersections. Optional proactive rebalancing redirects a small share of idle drivers toward zones with higher expected demand per available driver. These drivers remain eligible for orders.

## Demand and lifecycle

The generator creates 30 initial waiting orders and a Poisson arrival stream averaging `20 * demand` requests per simulated minute. Spatial weights change by city time: residential departures and CBD destinations in the morning, the reverse in the evening, and nightlife departures at night. The airport retains steady demand. `zoneDemandWeight(zone, hour)` exposes the same source weights for visualizations.

The demand RNG is separate from driver placement and movement. Assignment decisions cannot change future requests. Resetting the seed and configuration reproduces the scenario; algorithm comparisons use the same initial drivers, arrival times, origins, and destinations.

Orders progress through Waiting → Assigned → PickingUp → Serving → Completed. Requests that have not been picked up within ten simulated minutes cancel and release their driver. Drivers cycle through Idle/Repositioning → Pickup → Serving → Idle. Reducing supply immediately removes available excess drivers; occupied excess drivers complete their current trip before going Offline.

## Dispatch policies

All dispatch functions are pure: they return driver/order pairs without changing lifecycle state. Add new policies to `types.ts` and `dispatch.ts`; the engine owns route changes, reservation, metrics, and events.

- **Nearest Driver:** oldest waiting requests each choose their nearest available driver by actual road distance.
- **FIFO:** oldest waiting requests pair with longest-idle drivers, with stable ID tie-breaking.
- **Global Greedy:** sort all driver/request edges by pickup distance, repeatedly accepting nonconflicting pairs.
- **Hungarian:** exact rectangular minimum-cost assignment over the full current distance matrix. With excess requests, choose the lowest-cost subset rather than imposing FIFO priority.
- **Batch Matching:** accumulate requests for the configured interval, then run Hungarian matching. The first batch waits a full interval.
- **Score Based:** greedy matching over weighted, scaled road distance, passenger wait, driver idle time, zone supply/demand pressure, and driver income. Longer rider wait and driver idle time reduce cost; higher existing driver income increases cost.

Instant policies run at most once per simulated second. Switching to an instant policy makes it eligible at the next simulation step. Switching to batch begins a fresh batching interval. Candidate lines show a bounded explanatory sample; the solver still evaluates its complete input.

## Metrics and retention

Completed/created and cancelled/created include all requests since reset. A finite benchmark can end with trips still in progress, so these percentages need not sum to 100. Pickup distance and predicted ETA average all assignments. Passenger wait averages actual pickup waits; before the first pickup it reports current unpicked requests' average wait. Utilization is cumulative passenger-carrying driver-seconds divided by online driver-seconds. Income variance is population variance in USD squared across the scenario's driver records. Revenue is recognized only when a trip completes.

Supply is the number of available Idle/Repositioning drivers. Demand is the number of unpicked Waiting/Assigned/PickingUp passengers. S/D uses `supply / max(1, demand)` to remain finite. Orders/min counts arrivals in the trailing 60 simulated seconds, including the initial 30-order startup burst.

Metrics update once per simulated second; history retains the latest 180 five-second samples. The event feed retains 80 newest-first events, candidate visualization retains up to 180 entries, and completed/cancelled order details retain the latest 500 terminal records plus all active orders. Lifetime aggregate counters are independent of that retention.
