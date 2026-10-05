import numpy as np
from app.models import DispatchResult
from .base import DispatchAlgorithm, oldest_first


def select_greedy(costs, eta, distance, vehicles, orders):
    """Stable global minimum-pair selection, not per-order nearest matching."""
    used_rows, used_columns, matches = set(), set(), []
    columns = len(vehicles)
    for flat in np.argsort(costs, axis=None, kind="stable"):
        row, col = divmod(int(flat), columns)
        if row in used_rows or col in used_columns:
            continue
        matches.append(DispatchResult(vehicles[col], orders[row], float(distance[row, col]), float(eta[row, col])))
        used_rows.add(row)
        used_columns.add(col)
        if len(matches) == min(len(vehicles), len(orders)):
            break
    return matches


class GlobalGreedy(DispatchAlgorithm):
    id = "greedy"
    name = label = "Global Greedy"
    description = "Repeatedly select the smallest road pickup ETA across the complete driver–order matrix."

    def dispatch(self, vehicles, orders, simulation_state):
        if not vehicles or not orders:
            return []
        orders = oldest_first(orders)
        eta, distance = simulation_state.matrices(vehicles, orders)
        return select_greedy(eta, eta, distance, vehicles, orders)
