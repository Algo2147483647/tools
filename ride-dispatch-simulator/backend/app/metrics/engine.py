"""Measured lifecycle aggregates survive pruning of terminal order records."""
from collections import Counter, deque
from dataclasses import dataclass


@dataclass(slots=True)
class Aggregates:
    created: int = 0
    completed: int = 0
    cancelled: int = 0
    revenue: float = 0.0
    pickup_count: int = 0
    assignment_count: int = 0
    pickup_wait_sum: float = 0.0
    pickup_distance_sum: float = 0.0
    pickup_eta_sum: float = 0.0
    occupied_seconds: float = 0.0
    online_seconds: float = 0.0


class MetricsEngine:
    def __init__(self):
        self.totals = Aggregates()
        self.created_times: deque[float] = deque()

    def calculate(self, vehicles, orders, time: float) -> dict:
        counts = Counter(vehicle.status for vehicle in vehicles)
        active_count = len(vehicles) - counts["Offline"]
        waiting = [order for order in orders if order.status == "Waiting"]
        unpicked = [order for order in orders if order.status in ("Waiting", "Assigned", "PickingUp")]
        while self.created_times and self.created_times[0] <= time - 60:
            self.created_times.popleft()
        mean = sum(v.revenue for v in vehicles) / max(1, len(vehicles))
        variance = sum((v.revenue - mean) ** 2 for v in vehicles) / max(1, len(vehicles))
        supply, demand = counts["Idle"] + counts["Repositioning"], len(unpicked)
        ratio = supply / max(1, demand)
        totals = self.totals
        return {
            "activeDrivers": active_count, "waitingOrders": len(waiting),
            "ordersPerMin": len(self.created_times),
            "avgPickupETA": totals.pickup_eta_sum / max(1, totals.assignment_count),
            "avgWait": totals.pickup_wait_sum / totals.pickup_count if totals.pickup_count else
                       sum(order.waitTime for order in unpicked) / max(1, len(unpicked)),
            "avgPickupDistance": totals.pickup_distance_sum / max(1, totals.assignment_count),
            "completionRate": totals.completed / max(1, totals.created) * 100,
            "utilization": totals.occupied_seconds / max(1, totals.online_seconds) * 100,
            "cancellationRate": totals.cancelled / max(1, totals.created) * 100,
            "revenue": round(totals.revenue, 2), "supply": supply, "demand": demand,
            "ratio": ratio, "market": "Surplus" if ratio > 1.2 else "Shortage" if ratio < 0.8 else "Balanced",
            "completed": totals.completed, "cancelled": totals.cancelled, "created": totals.created,
            "incomeVariance": variance, "idle": counts["Idle"], "pickup": counts["Pickup"],
            "serving": counts["Serving"], "repositioning": counts["Repositioning"],
        }
