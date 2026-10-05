"""Transport-independent domain records. Distances are km; durations are seconds.

The camelCase field names are the stable public wire contract, not frontend state.
Every mutation happens inside the backend simulation engine.
"""
from dataclasses import dataclass, field, fields
from typing import Any


@dataclass(slots=True)
class Vehicle:
    id: int
    nodeId: int
    x: float
    y: float
    edgeId: int | None = None
    status: str = "Idle"
    speed: float = 0.0
    orderId: int | None = None
    revenue: float = 0.0
    completed: int = 0
    idleTime: float = 0.0
    onlineTime: float = 0.0
    servingTime: float = 0.0
    distanceDriven: float = 0.0
    targetNode: int | None = None
    route: list[int] = field(default_factory=list)
    routeIndex: int = 0
    edgeProgress: float = 0.0
    heading: float = 0.0


@dataclass(slots=True)
class Order:
    id: int
    createTime: float
    pickupNode: int
    destinationNode: int
    pickupZone: str
    destinationZone: str
    estimatedDistance: float
    estimatedDuration: float
    fare: float
    waitTime: float = 0.0
    assignedVehicle: int | None = None
    status: str = "Waiting"
    assignedTime: float | None = None
    pickupTime: float | None = None
    completedTime: float | None = None
    pickupDistance: float = 0.0
    pickupETA: float = 0.0


@dataclass(frozen=True, slots=True)
class Route:
    distance: float
    duration: float
    path: list[int]


@dataclass(frozen=True, slots=True)
class DispatchResult:
    vehicle: Vehicle
    order: Order
    distance: float
    eta: float


def record_dict(record: Any) -> dict:
    """Shallow record serialization with owned copies of mutable path arrays."""
    return {item.name: list(value) if isinstance(value := getattr(record, item.name), list) else value
            for item in fields(record)}
