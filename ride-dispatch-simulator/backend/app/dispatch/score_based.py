from collections import Counter

import numpy as np

from .base import DispatchAlgorithm, oldest_first
from .greedy import select_greedy


class ScoreBased(DispatchAlgorithm):
    id = "score"
    name = "Score Based"
    label = "Multi-objective Scoring"
    description = "Balance pickup ETA, passenger waiting, driver idle time, local supply pressure and income fairness."

    def dispatch(self, vehicles, orders, simulation_state):
        if not vehicles or not orders:
            return []
        orders = oldest_first(orders)
        eta, distance = simulation_state.matrices(vehicles, orders)
        weights = simulation_state.config["weights"]
        supply = Counter(simulation_state.router.nodes[v.nodeId]["zoneId"] for v in vehicles)
        demand = Counter(order.pickupZone for order in orders)
        max_income = max(1.0, *(driver.revenue for driver in vehicles))
        # Features are normalized; negative wait/idle terms reward longer waiting.
        # The historic wire key "distance" now weights pickup ETA (explicit in UI).
        costs = weights["distance"] * np.minimum(eta / 600.0, 3.0)
        costs -= weights["wait"] * np.minimum(np.array([o.waitTime for o in orders])[:, None] / 600.0, 2.0)
        costs -= weights["idle"] * np.minimum(np.array([v.idleTime for v in vehicles])[None, :] / 600.0, 2.0)
        costs += weights["fairness"] * np.array([v.revenue / max_income for v in vehicles])[None, :]
        for col, driver in enumerate(vehicles):
            source = simulation_state.router.nodes[driver.nodeId]["zoneId"]
            source_pressure = demand[source] / max(1, supply[source])
            for row, order in enumerate(orders):
                target_pressure = demand[order.pickupZone] / max(1, supply[order.pickupZone])
                costs[row, col] += weights["balance"] * ((0 if source == order.pickupZone else source_pressure)
                                                       - min(target_pressure, 5.0)) / 5.0
        return select_greedy(costs, eta, distance, vehicles, orders)
