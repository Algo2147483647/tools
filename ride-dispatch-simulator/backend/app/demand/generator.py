"""Independent seeded spatial demand with a piecewise nonhomogeneous Poisson clock."""
from collections import defaultdict
import math
import random

from app.models import Order


def zone_demand_weight(zone: dict, hour: float) -> float:
    hour %= 24
    morning, evening, night = 7 <= hour < 9, 17 <= hour < 20, hour >= 22 or hour < 2
    factors = {
        "residential": 2.8 if morning else 0.65 if evening else 0.4 if night else 0.85,
        "cbd": 0.7 if morning else 3.0 if evening else 0.3 if night else 1.6,
        "commercial": 0.8 if morning else 1.6 if evening else 0.5 if night else 1.5,
        "airport": 1.2 if night else 1.75,
        "station": 1.9 if morning or evening else 1.2,
        "nightlife": 4.5 if night else 1.3 if evening else 0.35,
        "suburb": 1.7 if morning else 0.45 if night else 0.7,
    }
    return zone.get("demandWeight", zone["weight"]) * factors.get(zone["kind"], 1.0)


class DemandGenerator:
    def __init__(self, network: dict, router, seed: int):
        self.network, self.router = network, router
        self.random = random.Random(seed ^ 0xA341316C)
        self.nodes_by_zone: dict[str, list[int]] = defaultdict(list)
        for node in network["nodes"]:
            self.nodes_by_zone[node["zoneId"]].append(node["id"])
        self.all_nodes = list(router.nodes)
        self.reference_weight = sum(zone_demand_weight(zone, 8) for zone in network["zones"])

    def rate_per_second(self, hour: float, multiplier: float) -> float:
        current = sum(zone_demand_weight(zone, hour) for zone in self.network["zones"])
        return (20.0 / 60.0) * multiplier * current / max(1e-9, self.reference_weight)

    def next_arrival(self, current_time: float, config: dict) -> float:
        # Integrate the exponential hazard through time-pattern boundaries, rather
        # than assuming the old demand rate continues after a peak-hour boundary.
        hazard = -math.log(max(1e-12, 1.0 - self.random.random()))
        absolute = config["startHour"] * 3600 + current_time
        for _ in range(100):
            day = math.floor(absolute / 86400) * 86400
            hour = absolute / 3600 % 24
            boundary = next(day + h * 3600 for h in (2, 7, 9, 17, 20, 22, 24)
                            if day + h * 3600 > absolute + 1e-7)
            rate = self.rate_per_second(hour, config["demand"])
            remaining_hazard = rate * (boundary - absolute)
            if hazard <= remaining_hazard:
                return absolute + hazard / rate - config["startHour"] * 3600
            hazard -= remaining_hazard
            absolute = float(boundary)
        raise RuntimeError("Demand clock failed to find an arrival.")

    def pick_zone(self, weights: list[float]) -> dict:
        return self.random.choices(self.network["zones"], weights=weights, k=1)[0]

    def pick_node(self, zone: dict) -> int:
        return self.random.choice(self.nodes_by_zone.get(zone["id"], self.all_nodes))

    def create_order(self, order_id: int, time: float, config: dict, traffic_factor: float) -> Order:
        hour = (config["startHour"] + time / 3600) % 24
        morning, evening, night = 7 <= hour < 9, 17 <= hour < 20, hour >= 22 or hour < 2
        zones = self.network["zones"]
        pickup_zone = self.pick_zone([zone_demand_weight(zone, hour) for zone in zones])
        weights = []
        for zone in zones:
            weight = pickup_zone.get("destinationWeights", {}).get(zone["id"], zone["weight"])
            if morning:
                weight *= 4.0 if zone["kind"] == "cbd" else 2.0 if zone["kind"] == "commercial" else 0.65
            if evening or night:
                weight *= 3.5 if zone["kind"] in ("residential", "suburb") else 0.7
            if zone["kind"] == "airport":
                weight *= 1.3
            if zone["id"] == pickup_zone["id"]:
                weight *= 0.12
            weights.append(weight)
        destination_zone = self.pick_zone(weights)
        pickup = self.pick_node(pickup_zone)
        destination = self.pick_node(destination_zone)
        if destination == pickup:
            destination = self.all_nodes[(self.all_nodes.index(destination) + 1) % len(self.all_nodes)]
        route = self.router.calculate_route(pickup, destination, traffic_factor)
        fare = round(3.4 + route.distance * 1.8 + route.duration / 60 * 0.22, 2)
        return Order(order_id, time, pickup, destination, pickup_zone["id"],
                     self.router.nodes[destination]["zoneId"], route.distance, route.duration, fare)
