import numpy as np
from scipy.optimize import linear_sum_assignment

from app.models import DispatchResult
from .base import DispatchAlgorithm, oldest_first


def optimal_assignment(costs) -> list[tuple[int, int]]:
    matrix = np.asarray(costs, dtype=np.float64)
    if matrix.size == 0:
        return []
    if matrix.ndim != 2 or not np.isfinite(matrix).all():
        raise ValueError("Assignment costs must be a finite rectangular matrix.")
    rows, columns = linear_sum_assignment(matrix)
    return list(zip(rows.tolist(), columns.tolist()))


class Hungarian(DispatchAlgorithm):
    id = "hungarian"
    name = "Hungarian"
    label = "Hungarian Optimization"
    description = "Solve the full rectangular assignment matrix for minimum total road pickup ETA."

    def dispatch(self, vehicles, orders, simulation_state):
        if not vehicles or not orders:
            return []
        orders = oldest_first(orders)
        eta, distance = simulation_state.matrices(vehicles, orders)
        return [DispatchResult(vehicles[col], orders[row], float(distance[row, col]), float(eta[row, col]))
                for row, col in optimal_assignment(eta)]
