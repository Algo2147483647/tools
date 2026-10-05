"""Common extension bootstrap for the API and spawned benchmark workers.

Import and register extra policies inside this function. Do not register them
only in a FastAPI startup hook: a fresh benchmark process imports this module
independently of the API process. See docs/architecture.md for a working example.
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .registry import DispatchRegistry


def register_plugins(registry: "DispatchRegistry") -> None:
    # Example:
    # from .idle_priority import IdlePriority
    # registry.register(IdlePriority())
    pass
