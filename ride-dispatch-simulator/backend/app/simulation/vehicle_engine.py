"""Physical motion and supply creation, independent of dispatch policies and HTTP."""
import math

from app.demand import zone_demand_weight
from app.models import Vehicle


class VehicleEngine:
    def __init__(self, router, demand, random_stream, metrics):
        self.router, self.demand = router, demand
        self.random, self.metrics = random_stream, metrics
        # Seeded clusters are stable for a scenario, independently of order RNG.
        zones = self.router.network["zones"]
        self.cluster_zones = self.random.sample(zones, min(3, len(zones)))

    def create(self, vehicle_id: int, config: dict, traffic_factor: float) -> Vehicle:
        distribution = config["supplyDistribution"]
        if distribution == "demand_weighted":
            zones = self.router.network["zones"]
            zone = self.random.choices(zones, weights=[zone_demand_weight(z, config["startHour"]) for z in zones])[0]
            node_id = self.random.choice(self.demand.nodes_by_zone.get(zone["id"], self.demand.all_nodes))
        elif distribution == "random_cluster":
            zone = self.random.choice(self.cluster_zones)
            node_id = self.random.choice(self.demand.nodes_by_zone.get(zone["id"], self.demand.all_nodes))
        else:
            node_id = self.random.choice(self.demand.all_nodes)
        node = self.router.nodes[node_id]
        link = self.random.choice(self.router.adjacency[node_id])
        destination = self.router.nodes[link.node]
        progress = self.random.random() * 0.95
        return Vehicle(vehicle_id, node_id,
                       node["x"] + (destination["x"] - node["x"]) * progress,
                       node["y"] + (destination["y"] - node["y"]) * progress,
                       edgeId=link.edge["id"], speed=link.edge["speedLimit"] * traffic_factor,
                       targetNode=link.node, route=[node_id, link.node], edgeProgress=progress,
                       heading=math.atan2(destination["y"] - node["y"], destination["x"] - node["x"]))

    def _account_time(self, vehicle: Vehicle, seconds: float):
        vehicle.onlineTime += seconds
        self.metrics.totals.online_seconds += seconds
        if vehicle.status == "Serving":
            vehicle.servingTime += seconds
            self.metrics.totals.occupied_seconds += seconds
        if vehicle.status in ("Idle", "Repositioning"):
            vehicle.idleTime += seconds

    def cruise(self, vehicle: Vehicle):
        previous = vehicle.route[vehicle.routeIndex - 1] if vehicle.routeIndex > 0 else None
        neighbors = self.router.adjacency[vehicle.nodeId]
        choices = [link for link in neighbors if link.node != previous] or neighbors
        link = self.random.choice(choices)
        vehicle.route = [vehicle.nodeId, link.node]
        vehicle.routeIndex = 0
        vehicle.edgeProgress = 0.0
        vehicle.targetNode = link.node

    def move(self, vehicle: Vehicle, seconds: float, start_time: float, traffic_factor: float, arrive):
        remaining = seconds
        while remaining > 1e-9 and vehicle.status != "Offline":
            if vehicle.routeIndex + 1 >= len(vehicle.route):
                arrive(vehicle, start_time + seconds - remaining)
                if vehicle.status == "Offline":
                    return
                if vehicle.status == "Idle" and vehicle.routeIndex + 1 >= len(vehicle.route):
                    self.cruise(vehicle)
                if vehicle.routeIndex + 1 >= len(vehicle.route):
                    vehicle.speed = 0.0
                    self._account_time(vehicle, remaining)
                    break
            next_id = vehicle.route[vehicle.routeIndex + 1]
            origin, destination = self.router.nodes[vehicle.nodeId], self.router.nodes[next_id]
            edge = self.router.edge_between(vehicle.nodeId, next_id)
            if edge is None:
                raise RuntimeError("Vehicle route contains a non-road segment.")
            vehicle.edgeId = edge["id"]
            vehicle.speed = edge["distance"] / edge["travelTime"] * 3600 * traffic_factor
            seconds_to_end = edge["travelTime"] * (1.0 - vehicle.edgeProgress) / traffic_factor
            consumed = min(remaining, seconds_to_end)
            travelled = vehicle.speed * consumed / 3600
            self._account_time(vehicle, consumed)
            vehicle.distanceDriven += travelled
            vehicle.edgeProgress = min(1.0, vehicle.edgeProgress + travelled / edge["distance"])
            vehicle.x = origin["x"] + (destination["x"] - origin["x"]) * vehicle.edgeProgress
            vehicle.y = origin["y"] + (destination["y"] - origin["y"]) * vehicle.edgeProgress
            vehicle.heading = math.atan2(destination["y"] - origin["y"], destination["x"] - origin["x"])
            remaining -= consumed
            if vehicle.edgeProgress >= 1 - 1e-9:
                vehicle.nodeId = next_id
                vehicle.routeIndex += 1
                vehicle.edgeProgress = 0.0
                vehicle.edgeId = None
                vehicle.x, vehicle.y = destination["x"], destination["y"]
                if vehicle.routeIndex >= len(vehicle.route) - 1:
                    arrive(vehicle, start_time + seconds - remaining)
            else:
                break
