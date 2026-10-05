"""Dijkstra routing with an immutable tree cache per origin and cost objective."""
import heapq
import math
from dataclasses import dataclass

import numpy as np

from app.models import Route, Vehicle


@dataclass(slots=True)
class Link:
    node: int
    edge: dict


class RoutingEngine:
    def __init__(self, network: dict):
        self.network = network
        self.nodes = {node["id"]: node for node in network["nodes"]}
        self.adjacency = {node: [] for node in self.nodes}
        self.edges: dict[tuple[int, int], dict] = {}
        self._trees: dict[tuple[int, str], tuple[dict, dict, dict]] = {}
        self._durations: dict[tuple[int, str], dict[int, float]] = {}
        for edge in network["edges"]:
            a, b = edge["from"], edge["to"]
            self.adjacency[a].append(Link(b, edge))
            self.adjacency[b].append(Link(a, edge))
            self.edges[a, b] = self.edges[b, a] = edge
        if any(not neighbors for neighbors in self.adjacency.values()):
            raise ValueError("Road graph contains an isolated intersection.")
        _, _, distances = self._tree(next(iter(self.nodes)), "eta")
        if any(not math.isfinite(value) for value in distances.values()):
            raise ValueError("Road graph must be connected.")

    def edge_between(self, origin: int, destination: int) -> dict | None:
        return self.edges.get((origin, destination))

    def _tree(self, source: int, objective: str = "eta") -> tuple[dict, dict, dict]:
        key = (source, objective)
        if key in self._trees:
            return self._trees[key]
        costs = dict.fromkeys(self.nodes, math.inf)
        distances = dict.fromkeys(self.nodes, math.inf)
        previous: dict[int, int] = {}
        durations = dict.fromkeys(self.nodes, math.inf)
        costs[source] = distances[source] = 0.0
        durations[source] = 0.0
        queue = [(0.0, source)]
        while queue:
            cost, node = heapq.heappop(queue)
            if cost > costs[node]:
                continue
            for link in self.adjacency[node]:
                edge_cost = link.edge["travelTime"] if objective == "eta" else link.edge["distance"]
                candidate = cost + edge_cost
                if candidate < costs[link.node] - 1e-12:
                    costs[link.node] = candidate
                    distances[link.node] = distances[node] + link.edge["distance"]
                    durations[link.node] = durations[node] + link.edge["travelTime"]
                    previous[link.node] = node
                    heapq.heappush(queue, (candidate, link.node))
        self._durations[key] = durations
        self._trees[key] = (costs, previous, distances)
        return self._trees[key]

    def calculate_route(self, origin: int, destination: int, traffic_factor: float = 1.0,
                        objective: str = "eta") -> Route:
        costs, previous, distances = self._tree(origin, objective)
        if not math.isfinite(costs[destination]):
            return Route(math.inf, math.inf, [])
        path = [destination]
        while path[-1] != origin:
            path.append(previous[path[-1]])
        path.reverse()
        duration = self._durations[origin, objective][destination] / traffic_factor
        return Route(distances[destination], duration, path)

    def vehicle_cost(self, vehicle: Vehicle, destination: int, traffic_factor: float = 1.0,
                     objective: str = "eta") -> tuple[float, float]:
        """Complete the current edge before turning; neither routing nor cost teleports."""
        source, extra_distance, extra_seconds = self._remaining_edge(vehicle)
        costs, _, distances = self._tree(source, objective)
        distance = extra_distance + distances[destination]
        if objective == "eta":
            return distance, (extra_seconds + costs[destination]) / traffic_factor
        duration = self._durations[source, objective][destination]
        return distance, (extra_seconds + duration) / traffic_factor

    def _remaining_edge(self, vehicle: Vehicle) -> tuple[int, float, float]:
        if vehicle.edgeId is not None and vehicle.routeIndex + 1 < len(vehicle.route):
            next_node = vehicle.route[vehicle.routeIndex + 1]
            edge = self.edges[vehicle.nodeId, next_node]
            fraction = 1.0 - vehicle.edgeProgress
            return next_node, edge["distance"] * fraction, edge["travelTime"] * fraction
        return vehicle.nodeId, 0.0, 0.0

    def cost_matrices(self, vehicles: list[Vehicle], orders: list, traffic_factor: float = 1.0):
        """Return order × driver ETA and distance matrices from cached road trees."""
        eta = np.empty((len(orders), len(vehicles)), dtype=np.float64)
        distance = np.empty_like(eta)
        for col, vehicle in enumerate(vehicles):
            source, extra_distance, extra_seconds = self._remaining_edge(vehicle)
            times, _, lengths = self._tree(source)
            eta[:, col] = [(times[order.pickupNode] + extra_seconds) / traffic_factor for order in orders]
            distance[:, col] = [lengths[order.pickupNode] + extra_distance for order in orders]
        return eta, distance

    def set_target(self, vehicle: Vehicle, target: int, objective: str = "eta") -> None:
        if vehicle.edgeId is not None and vehicle.routeIndex + 1 < len(vehicle.route):
            next_node = vehicle.route[vehicle.routeIndex + 1]
            vehicle.route = [vehicle.nodeId, *self.calculate_route(next_node, target, objective=objective).path]
            vehicle.routeIndex = 0
            # Coordinates, edge and fractional progress remain unchanged.
        else:
            vehicle.route = self.calculate_route(vehicle.nodeId, target, objective=objective).path
            vehicle.routeIndex = 0
            vehicle.edgeProgress = 0.0
            vehicle.edgeId = None
        vehicle.targetNode = target


Router = RoutingEngine
