"""Authoritative standalone simulation. No HTTP, browser or wall-clock dependency.

`step` receives simulation seconds from the runtime. It integrates at most one
simulation second at a time; road-end events use exact fractional travel times.
The API schedules these advances every 100ms of real time, at any chosen speed.
"""
from collections import Counter, deque
from copy import deepcopy
from dataclasses import fields
from functools import lru_cache
import math
import random

from app.demand import DemandGenerator, zone_demand_weight
from app.dispatch import DispatchContext, registry
from app.metrics import Aggregates, MetricsEngine
from app.models import Order, Vehicle
from app.models.domain import record_dict
from app.routing import RoutingEngine, load_network
from app.routing.network import enrich_network
from .order_engine import OrderEngine, UNPICKED
from .vehicle_engine import VehicleEngine

DEFAULT_CONFIG = {
    "seed": 71429, "supply": 200, "demand": 1.0, "algorithm": "nearest", "batchInterval": 5,
    "weights": {"distance": 0.45, "wait": 0.25, "idle": 0.12, "balance": 0.10, "fairness": 0.08},
    "startHour": 8.0, "reposition": True, "simulationSpeed": 1,
    "secondsPerRealSecond": 10.0, "supplyDistribution": "uniform",
}


@lru_cache(maxsize=1)
def default_router():
    # Shared read-only network/trees; each simulation owns every mutable entity.
    return RoutingEngine(load_network())


def normalized_config(previous: dict, partial: dict | None) -> dict:
    partial = partial or {}
    result = {**deepcopy(previous), **deepcopy(partial)}
    result["weights"] = {**previous["weights"], **partial.get("weights", {})}
    registry.get(result["algorithm"])
    bounds = {"supply": (50, 1000), "demand": (0.5, 5.0), "batchInterval": (1, 30),
              "startHour": (0, 24), "secondsPerRealSecond": (0.1, 60)}
    for name, (minimum, maximum) in bounds.items():
        value = result[name]
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{name} must be finite.")
        if not minimum <= value <= maximum:
            raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    if result["startHour"] >= 24:
        raise ValueError("startHour must be less than 24.")
    if result["supplyDistribution"] not in ("uniform", "demand_weighted", "random_cluster"):
        raise ValueError("Unknown supply distribution.")
    if result["simulationSpeed"] not in (1, 2, 5, 10):
        raise ValueError("Simulation speed must be 1, 2, 5 or 10.")
    for key, value in result["weights"].items():
        if key not in DEFAULT_CONFIG["weights"] or not math.isfinite(value) or not 0 <= value <= 10:
            raise ValueError("Score weights must be known finite values between 0 and 10.")
    result["seed"] = int(result["seed"]) & 0xFFFFFFFF
    result["supply"] = int(result["supply"])
    return result


class SimulationEngine:
    def __init__(self, config: dict | None = None, network: dict | None = None):
        self.router = default_router() if network is None else RoutingEngine(enrich_network(network))
        self.network = self.router.network
        self.config = deepcopy(DEFAULT_CONFIG)
        self.reset(config)

    @property
    def orders(self) -> list[Order]:
        return list(self.order_engine.by_id.values())

    def reset(self, partial_dict: dict | None = None):
        self.config = normalized_config(self.config, partial_dict)
        self.time, self.running = 0.0, False
        self.algorithm = registry.get(self.config["algorithm"])
        self.metrics_engine = MetricsEngine()
        self.order_engine = OrderEngine()
        self.demand_generator = DemandGenerator(self.network, self.router, self.config["seed"])
        self.vehicle_random = random.Random(self.config["seed"] ^ 0xC8013EA4)
        self.vehicle_engine = VehicleEngine(self.router, self.demand_generator, self.vehicle_random, self.metrics_engine)
        self.vehicles = [self.vehicle_engine.create(vehicle_id, self.config, self.traffic_factor())
                         for vehicle_id in range(1, self.config["supply"] + 1)]
        self.vehicles_by_id = {vehicle.id: vehicle for vehicle in self.vehicles}
        self.retired: set[int] = set()
        self.events, self.candidates, self.history = [], [], []
        self.next_event_id = 1
        self.next_dispatch = self.algorithm.initial_delay(self.config)
        self.next_metric, self.next_history, self.next_reposition = 1.0, 5.0, 30.0
        for _ in range(30):
            self._create_order(0.0)
        self.next_arrival = self.demand_generator.next_arrival(0.0, self.config)
        self._event("system", "City initialized · 30 requests ready")
        self._update_metrics()
        self.history.append({**self.metrics, "time": 0.0})

    def set_running(self, running: bool):
        self.running = bool(running)
        if not self.running:
            self._update_metrics()

    def seek_hour(self, hour: float):
        running = self.running
        self.reset({"startHour": hour})
        self.running = running

    def set_config(self, partial_dict: dict):
        previous = self.config
        self.config = normalized_config(previous, partial_dict)
        if previous["demand"] != self.config["demand"] or previous["startHour"] != self.config["startHour"]:
            self.next_arrival = self.demand_generator.next_arrival(self.time, self.config)
        if previous["algorithm"] != self.config["algorithm"] or previous["batchInterval"] != self.config["batchInterval"]:
            self.algorithm = registry.get(self.config["algorithm"])
            self.next_dispatch = self.time + self.algorithm.initial_delay(self.config)
            self._event("system", f"Dispatch engine changed · {self.algorithm.label}")
        if previous["supply"] != self.config["supply"]:
            self._adjust_supply(self.config["supply"])
        if previous["reposition"] and not self.config["reposition"]:
            for vehicle in self.vehicles:
                if vehicle.status == "Repositioning":
                    self._release_vehicle(vehicle)
        self._update_metrics()

    def step(self, seconds: float):
        if not self.running or not math.isfinite(seconds) or seconds <= 0:
            return
        remaining = seconds
        while remaining > 1e-9:
            # Dispatch at t=0, and after an immediate policy switch, before moving
            # vehicles. Split integration at scheduled boundaries so a 5-second
            # batch does not drift to 5.4, 10.8, ... under fractional wall ticks.
            self._dispatch_if_due()
            absolute = self.config["startHour"] * 3600 + self.time
            day = math.floor(absolute / 86400) * 86400
            traffic_boundary = next(day + hour * 3600 for hour in (7, 9, 17, 20, 24)
                                    if day + hour * 3600 > absolute + 1e-7)
            boundaries = [self.next_dispatch, self.next_metric, self.next_history,
                          self.next_reposition, self.time + traffic_boundary - absolute]
            gaps = [boundary - self.time for boundary in boundaries if boundary > self.time + 1e-9]
            dt = min(1.0, remaining, *gaps)
            self._tick(dt)
            remaining -= dt

    def _dispatch_if_due(self):
        if self.time + 1e-9 >= self.next_dispatch:
            interval = self.algorithm.interval(self.config)
            if not math.isfinite(interval) or interval <= 0:
                raise RuntimeError("Dispatch plugin cadence must be finite and positive.")
            self._dispatch_orders()
            periods = max(1, math.floor((self.time - self.next_dispatch) / interval) + 1)
            self.next_dispatch += periods * interval

    def _tick(self, dt: float):
        start_time = self.time
        self.time += dt
        # Physical state first: entities created at the end of the integration
        # interval must not receive a whole interval of movement retroactively.
        factor = self.traffic_factor(start_time)
        for vehicle in self.vehicles:
            if vehicle.status == "Offline":
                continue
            if vehicle.status == "Pickup":
                order = self.order_engine.by_id.get(vehicle.orderId)
                if order and order.status == "Assigned":
                    order.status = "PickingUp"
            self.vehicle_engine.move(vehicle, dt, start_time, factor, self._arrive)
        while self.next_arrival <= self.time + 1e-9:
            self._create_order(self.next_arrival)
            self.next_arrival = self.demand_generator.next_arrival(self.next_arrival, self.config)
        self.order_engine.update_waits(self.time, self._cancel_order)
        self._dispatch_if_due()
        if self.time + 1e-9 >= self.next_reposition:
            if self.config["reposition"]:
                self._reposition_vehicles()
            self.next_reposition += 30.0
        if self.time + 1e-9 >= self.next_metric:
            self._update_metrics()
            self.candidates = [candidate for candidate in self.candidates if candidate["expiresAt"] > self.time][-180:]
            self.order_engine.prune()
            self.next_metric += 1.0
        if self.time + 1e-9 >= self.next_history:
            self.history.append({**self.metrics, "time": self.time})
            self.history = self.history[-720:]
            self.next_history += 5.0

    def traffic_factor(self, time: float | None = None) -> float:
        hour = (self.config["startHour"] + (self.time if time is None else time) / 3600) % 24
        return 0.78 if 7 <= hour < 9 or 17 <= hour < 20 else 0.96

    def _create_order(self, time: float):
        order = self.demand_generator.create_order(self.order_engine.next_id, time, self.config, self.traffic_factor(time))
        self.order_engine.add(order)
        self.metrics_engine.totals.created += 1
        self.metrics_engine.created_times.append(time)
        zone = next(zone for zone in self.network["zones"] if zone["id"] == order.pickupZone)
        self._event("created", f"Order #{order.id:04d} · {zone['name']}", time)

    def _dispatch_orders(self):
        available = [vehicle for vehicle in self.vehicles if vehicle.status in ("Idle", "Repositioning")
                     and vehicle.id not in self.retired]
        waiting = [order for order in self.orders if order.status == "Waiting"]
        if not available or not waiting:
            return
        context = DispatchContext(self.router, self.config, self.time, self.traffic_factor())
        matches = list(self.algorithm.dispatch(available, waiting, context))
        eligible_drivers = {vehicle.id: vehicle for vehicle in available}
        eligible_orders = {order.id: order for order in waiting}
        used_drivers, used_orders = set(), set()
        # Validate the entire result before committing any lifecycle transition.
        # Matching IDs alone is insufficient: a plugin could return cloned records
        # and cause a ghost vehicle to serve an authoritative passenger order.
        for match in matches:
            vehicle, order = match.vehicle, match.order
            if (eligible_drivers.get(vehicle.id) is not vehicle
                    or eligible_orders.get(order.id) is not order
                    or vehicle.id in used_drivers or order.id in used_orders
                    or order.status != "Waiting" or vehicle.status not in ("Idle", "Repositioning")
                    or not math.isfinite(match.distance) or match.distance < 0
                    or not math.isfinite(match.eta) or match.eta < 0):
                raise RuntimeError("Dispatch plugin returned conflicting, foreign or ineligible matches.")
            used_drivers.add(vehicle.id)
            used_orders.add(order.id)
        for order in waiting[:5]:
            candidates = sorted(available, key=lambda vehicle: self.router.vehicle_cost(vehicle, order.pickupNode)[1])[:3]
            for vehicle in candidates:
                self.candidates.append({"vehicleId": vehicle.id, "orderId": order.id,
                                        "selected": False, "expiresAt": self.time + 15})
        for match in matches:
            vehicle, order = match.vehicle, match.order
            # Measurement belongs to the engine, even for third-party policies.
            distance, eta = self.router.vehicle_cost(vehicle, order.pickupNode, self.traffic_factor(),
                                                     objective=self.algorithm.route_objective)
            order.status, order.assignedVehicle, order.assignedTime = "Assigned", vehicle.id, self.time
            order.pickupDistance, order.pickupETA = distance, eta
            vehicle.orderId, vehicle.status, vehicle.idleTime = order.id, "Pickup", 0.0
            self.router.set_target(vehicle, order.pickupNode, objective=self.algorithm.route_objective)
            totals = self.metrics_engine.totals
            totals.assignment_count += 1
            totals.pickup_distance_sum += distance
            totals.pickup_eta_sum += eta
            self.candidates.append({"vehicleId": vehicle.id, "orderId": order.id,
                                    "selected": True, "expiresAt": self.time + 18})
            self._event("assigned", f"Driver #{vehicle.id:03d} → Order #{order.id:04d}")
            if len(vehicle.route) <= 1:
                self._arrive(vehicle, self.time)
        self.candidates = self.candidates[-180:]

    def _arrive(self, vehicle: Vehicle, time: float):
        if vehicle.routeIndex + 1 < len(vehicle.route):
            return
        order = self.order_engine.by_id.get(vehicle.orderId)
        totals = self.metrics_engine.totals
        if vehicle.status == "Pickup" and order:
            if time - order.createTime > self.order_engine.max_wait:
                order.waitTime = time - order.createTime
                self._cancel_order(order)
                return
            order.status, order.pickupTime, order.waitTime = "Serving", time, time - order.createTime
            vehicle.status = "Serving"
            totals.pickup_count += 1
            totals.pickup_wait_sum += order.waitTime
            self.router.set_target(vehicle, order.destinationNode)
            self._event("pickup", f"Pickup complete · Order #{order.id:04d}", time)
        elif vehicle.status == "Serving" and order:
            order.status, order.completedTime = "Completed", time
            vehicle.revenue = round(vehicle.revenue + order.fare, 2)
            vehicle.completed += 1
            totals.completed += 1
            totals.revenue += order.fare
            self._event("completed", f"Trip #{order.id:04d} completed · ${order.fare:.2f}", time)
            self._release_vehicle(vehicle)
        elif vehicle.status == "Repositioning":
            self._release_vehicle(vehicle)

    def _release_vehicle(self, vehicle: Vehicle):
        keep_idle = vehicle.status == "Repositioning" and vehicle.id not in self.retired
        vehicle.orderId = None
        if not keep_idle:
            vehicle.idleTime = 0.0
        vehicle.status = "Offline" if vehicle.id in self.retired else "Idle"
        if vehicle.edgeId is not None and vehicle.routeIndex + 1 < len(vehicle.route):
            next_node = vehicle.route[vehicle.routeIndex + 1]
            vehicle.route = [vehicle.nodeId, next_node]
            vehicle.routeIndex = 0
            vehicle.targetNode = next_node
        else:
            vehicle.route, vehicle.routeIndex = [vehicle.nodeId], 0
            vehicle.targetNode, vehicle.edgeId, vehicle.edgeProgress = None, None, 0.0
        if vehicle.status == "Offline":
            vehicle.speed = 0.0

    def _cancel_order(self, order: Order):
        if order.status not in UNPICKED:
            return
        order.status = "Cancelled"
        self.metrics_engine.totals.cancelled += 1
        if order.assignedVehicle is not None:
            vehicle = self.vehicles_by_id.get(order.assignedVehicle)
            if vehicle and vehicle.orderId == order.id:
                self._release_vehicle(vehicle)
        self._event("cancelled", f"Order #{order.id:04d} cancelled · wait limit reached")

    def _adjust_supply(self, target: int):
        self.retired = {vehicle.id for vehicle in self.vehicles if vehicle.id > target}
        for vehicle in self.vehicles:
            if vehicle.id > target and vehicle.status in ("Idle", "Repositioning"):
                self._release_vehicle(vehicle)
            elif vehicle.id <= target and vehicle.status == "Offline":
                vehicle.status, vehicle.idleTime = "Idle", 0.0
        while len(self.vehicles) < target:
            creation_config = {**self.config, "startHour": self.config["startHour"] + self.time / 3600}
            vehicle = self.vehicle_engine.create(len(self.vehicles) + 1, creation_config, self.traffic_factor())
            self.vehicles.append(vehicle)
            self.vehicles_by_id[vehicle.id] = vehicle
        self._event("system", f"Fleet target {target} · busy drivers finish their trips before going offline")

    def _reposition_vehicles(self):
        idle = [v for v in self.vehicles if v.status == "Idle" and v.idleTime >= 30 and v.id not in self.retired]
        supply = Counter(self.router.nodes[v.nodeId]["zoneId"] for v in self.vehicles if v.status in ("Idle", "Repositioning"))
        demand = Counter(order.pickupZone for order in self.orders if order.status == "Waiting")
        hour = self.config["startHour"] + self.time / 3600
        for vehicle in idle[:max(1, round(len(self.vehicles) * 0.035))]:
            source = self.router.nodes[vehicle.nodeId]["zoneId"]
            choices = [zone for zone in self.network["zones"] if zone["id"] != source and
                       self.demand_generator.nodes_by_zone.get(zone["id"])]
            if not choices:
                continue
            zone = max(choices, key=lambda z: (zone_demand_weight(z, hour) + demand[z["id"]] * 2) / (1 + supply[z["id"]]))
            target = self.vehicle_random.choice(self.demand_generator.nodes_by_zone[zone["id"]])
            vehicle.status = "Repositioning"
            self.router.set_target(vehicle, target)
            supply[zone["id"]] += 1
            supply[source] -= 1

    def _update_metrics(self):
        self.metrics = self.metrics_engine.calculate(self.vehicles, self.orders, self.time)

    def _event(self, kind: str, message: str, time: float | None = None):
        self.events.insert(0, {"id": self.next_event_id, "time": self.time if time is None else time,
                               "kind": kind, "message": message})
        self.next_event_id += 1
        del self.events[80:]

    def _remaining_eta(self, vehicle: Vehicle) -> float:
        seconds = 0.0
        for index in range(vehicle.routeIndex, len(vehicle.route) - 1):
            edge = self.router.edge_between(vehicle.route[index], vehicle.route[index + 1])
            fraction = 1 - vehicle.edgeProgress if index == vehicle.routeIndex else 1.0
            seconds += edge["travelTime"] * fraction
        return seconds / self.traffic_factor()

    def zone_stats(self) -> list[dict]:
        open_orders = Counter(order.pickupZone for order in self.orders if order.status in UNPICKED)
        idle = Counter(self.router.nodes[v.nodeId]["zoneId"] for v in self.vehicles if v.status == "Idle")
        available = Counter(self.router.nodes[v.nodeId]["zoneId"] for v in self.vehicles if v.status in ("Idle", "Repositioning"))
        hour = self.config["startHour"] + self.time / 3600
        return [{"id": zone["id"], "demandWeight": zone_demand_weight(zone, hour),
                 "openOrders": open_orders[zone["id"]], "idleDrivers": idle[zone["id"]],
                 "availableDrivers": available[zone["id"]]} for zone in self.network["zones"]]

    def snapshot(self, include_history: bool = True) -> dict:
        vehicles = [{**record_dict(v), "utilization": v.servingTime / max(1, v.onlineTime) * 100} for v in self.vehicles]
        orders = []
        for order in self.orders:
            vehicle = self.vehicles_by_id.get(order.assignedVehicle)
            eta = self._remaining_eta(vehicle) if vehicle and vehicle.status == "Pickup" and vehicle.orderId == order.id else 0.0
            orders.append({**record_dict(order), "remainingPickupETA": eta})
        result = {"time": self.time, "running": self.running, "config": deepcopy(self.config),
                  "vehicles": vehicles, "orders": orders, "events": [dict(e) for e in self.events],
                  "candidates": [dict(c) for c in self.candidates], "metrics": dict(self.metrics),
                  "zoneStats": self.zone_stats()}
        if include_history:
            result["history"] = [dict(item) for item in self.history]
        return result

    def export_checkpoint(self) -> dict:
        """JSON-safe full state including random streams and cumulative counters."""
        return {"version": 1, "state": self.snapshot(), "internal": {
            "demandRandom": self.demand_generator.random.getstate(),
            "vehicleRandom": self.vehicle_random.getstate(),
            "clusterZones": [zone["id"] for zone in self.vehicle_engine.cluster_zones],
            "nextOrderId": self.order_engine.next_id, "nextEventId": self.next_event_id,
            "nextArrival": self.next_arrival, "nextDispatch": self.next_dispatch,
            "nextMetric": self.next_metric, "nextHistory": self.next_history,
            "nextReposition": self.next_reposition, "retired": sorted(self.retired),
            "createdTimes": list(self.metrics_engine.created_times),
            "totals": record_dict(self.metrics_engine.totals),
        }}

    def restore_snapshot(self, checkpoint: dict):
        if checkpoint.get("version") != 1 or "internal" not in checkpoint:
            raise ValueError("A versioned backend checkpoint is required for exact resume.")
        state, internal = checkpoint["state"], checkpoint["internal"]
        self.reset(state["config"])
        self.time, self.running = state["time"], state["running"]
        vehicle_fields, order_fields = {f.name for f in fields(Vehicle)}, {f.name for f in fields(Order)}
        self.vehicles = [Vehicle(**{k: deepcopy(v) for k, v in value.items() if k in vehicle_fields}) for value in state["vehicles"]]
        self.vehicles_by_id = {vehicle.id: vehicle for vehicle in self.vehicles}
        self.order_engine.by_id = {value["id"]: Order(**{k: v for k, v in value.items() if k in order_fields}) for value in state["orders"]}
        self.order_engine.next_id, self.next_event_id = internal["nextOrderId"], internal["nextEventId"]
        self.next_arrival, self.next_dispatch = internal["nextArrival"], internal["nextDispatch"]
        self.next_metric, self.next_history = internal["nextMetric"], internal["nextHistory"]
        self.next_reposition, self.retired = internal["nextReposition"], set(internal["retired"])
        self.events, self.candidates, self.history = deepcopy(state["events"]), deepcopy(state["candidates"]), deepcopy(state["history"])
        self.metrics_engine.totals = Aggregates(**internal["totals"])
        self.metrics_engine.created_times = deque(internal["createdTimes"])
        tuple_tree = lambda value: tuple(tuple_tree(item) for item in value) if isinstance(value, (list, tuple)) else value
        self.demand_generator.random.setstate(tuple_tree(internal["demandRandom"]))
        self.vehicle_random.setstate(tuple_tree(internal["vehicleRandom"]))
        self.vehicle_engine.cluster_zones = [zone for zone in self.network["zones"] if zone["id"] in internal["clusterZones"]]
        # Preserve cluster order: random.choice indexes this sequence on future supply changes.
        zones = {zone["id"]: zone for zone in self.network["zones"]}
        self.vehicle_engine.cluster_zones = [zones[key] for key in internal["clusterZones"]]
        self.metrics = dict(state["metrics"])
