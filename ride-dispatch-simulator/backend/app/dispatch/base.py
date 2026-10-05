"""Small plugin interface: policies choose matches; the engine owns lifecycles."""
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.models import DispatchResult, Order, Vehicle
from app.routing.router import RoutingEngine


@dataclass(slots=True)
class DispatchContext:
    router: RoutingEngine
    config: dict
    time: float
    traffic_factor: float = 1.0

    def matrices(self, vehicles, orders):
        return self.router.cost_matrices(vehicles, orders, self.traffic_factor)


class DispatchAlgorithm(ABC):
    id: str
    name: str
    label: str
    description: str
    route_objective = "eta"

    def interval(self, config: dict) -> float:
        return 1.0

    def initial_delay(self, config: dict) -> float:
        return 0.0

    def metadata(self) -> dict:
        return {key: getattr(self, key) for key in ("id", "name", "label", "description")}

    @abstractmethod
    def dispatch(self, vehicles: list[Vehicle], orders: list[Order],
                 simulation_state: DispatchContext) -> list[DispatchResult]:
        """Return disjoint driver/order matches without mutating the inputs."""


def oldest_first(orders: list[Order]) -> list[Order]:
    return sorted(orders, key=lambda order: (order.createTime, order.id))
