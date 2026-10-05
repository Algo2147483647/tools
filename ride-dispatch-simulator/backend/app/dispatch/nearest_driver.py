from app.models import DispatchResult
from .base import DispatchAlgorithm, oldest_first


class NearestDriver(DispatchAlgorithm):
    id = "nearest"
    name = label = "Nearest Driver"
    description = "Assign each request to the closest available driver by shortest road distance."
    route_objective = "distance"

    def dispatch(self, vehicles, orders, simulation_state):
        available = list(vehicles)
        matches = []
        for order in oldest_first(orders):
            if not available:
                break
            costs = [simulation_state.router.vehicle_cost(vehicle, order.pickupNode,
                     simulation_state.traffic_factor, objective="distance") for vehicle in available]
            index = min(range(len(available)), key=lambda i: (costs[i][0], available[i].id))
            distance, eta = costs[index]
            matches.append(DispatchResult(available.pop(index), order, distance, eta))
        return matches
