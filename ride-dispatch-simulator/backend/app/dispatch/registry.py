"""Registration is the only integration point for additional dispatch plugins."""
from .base import DispatchAlgorithm


class DispatchRegistry:
    def __init__(self):
        self._algorithms: dict[str, DispatchAlgorithm] = {}

    def register(self, algorithm: DispatchAlgorithm) -> DispatchAlgorithm:
        if not algorithm.id or algorithm.id in self._algorithms:
            raise ValueError(f"Duplicate or empty algorithm ID: {algorithm.id!r}")
        self._algorithms[algorithm.id] = algorithm
        return algorithm

    def get(self, algorithm_id: str) -> DispatchAlgorithm:
        try:
            return self._algorithms[algorithm_id]
        except KeyError as error:
            raise ValueError(f"Unknown dispatch algorithm: {algorithm_id}") from error

    def list_algorithms(self) -> list[dict]:
        return [algorithm.metadata() for algorithm in self._algorithms.values()]


registry = DispatchRegistry()


def _register_builtins():
    from .nearest_driver import NearestDriver
    from .fifo import FIFO
    from .greedy import GlobalGreedy
    from .hungarian import Hungarian
    from .batch import BatchDispatch
    from .score_based import ScoreBased
    for algorithm in (NearestDriver(), FIFO(), GlobalGreedy(), Hungarian(), BatchDispatch(), ScoreBased()):
        registry.register(algorithm)


_register_builtins()

# This common import path runs in both the API and every spawned benchmark worker.
from .plugins import register_plugins

register_plugins(registry)
