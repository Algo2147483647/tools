from app.models import DispatchResult
from .base import DispatchAlgorithm, oldest_first


class FIFO(DispatchAlgorithm):
    id = "fifo"
    name = "FIFO"
    label = "First In, First Out"
    description = "Serve the oldest requests first, prioritizing drivers with the longest idle streak."

    def dispatch(self, vehicles, orders, simulation_state):
        drivers = sorted(vehicles, key=lambda driver: (-driver.idleTime, driver.id))
        return [DispatchResult(driver, order, *simulation_state.router.vehicle_cost(
            driver, order.pickupNode, simulation_state.traffic_factor))
            for driver, order in zip(drivers, oldest_first(orders))]
