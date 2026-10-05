from itertools import permutations
from dataclasses import replace
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace

import numpy as np
import pytest

from app.dispatch import DispatchAlgorithm, DispatchContext, registry
from app.dispatch.hungarian import optimal_assignment
from app.models import DispatchResult, Order, Vehicle
from app.simulation.engine import SimulationEngine


@pytest.mark.parametrize("shape", [(1, 4), (2, 3), (3, 2), (4, 4)])
def test_hungarian_equals_bruteforce_for_rectangular_matrices(shape):
    random = np.random.default_rng(314)
    for _ in range(8):
        matrix = random.integers(0, 200, size=shape).astype(float)
        rows, cols = shape
        if rows <= cols:
            optimum = min(sum(matrix[row, col] for row, col in enumerate(choice)) for choice in permutations(range(cols), rows))
        else:
            optimum = min(sum(matrix[row, col] for col, row in enumerate(choice)) for choice in permutations(range(rows), cols))
        pairs = optimal_assignment(matrix)
        assert sum(matrix[row, col] for row, col in pairs) == optimum
        assert len(pairs) == min(shape)
        assert len({row for row, _ in pairs}) == len(pairs)
        assert len({col for _, col in pairs}) == len(pairs)


def test_hungarian_optimizes_eta_instead_of_distance():
    vehicles = [Vehicle(1, 0, 0, 0), Vehicle(2, 0, 0, 0)]
    orders = [Order(1, 0, 0, 1, "a", "b", 1, 1, 1), Order(2, 0, 0, 1, "a", "b", 1, 1, 1)]
    context = SimpleNamespace(matrices=lambda *_: (np.array([[100, 5], [3, 90]]), np.array([[1, 10], [9, 1]])))
    matches = registry.get("hungarian").dispatch(vehicles, orders, context)
    assert [(m.order.id, m.vehicle.id) for m in matches] == [(1, 2), (2, 1)]
    assert sum(m.eta for m in matches) == 8


@pytest.mark.parametrize("algorithm", [item["id"] for item in registry.list_algorithms()])
def test_every_policy_is_pure_and_produces_disjoint_matches(algorithm):
    engine = SimulationEngine({"algorithm": algorithm, "supply": 50})
    before = engine.snapshot()
    matches = registry.get(algorithm).dispatch(engine.vehicles, engine.orders,
               DispatchContext(engine.router, engine.config, engine.time, engine.traffic_factor()))
    assert engine.snapshot() == before
    assert len(matches) == 30
    assert len({match.order.id for match in matches}) == 30
    assert len({match.vehicle.id for match in matches}) == 30
    assert all(match.eta >= 0 and match.distance >= 0 for match in matches)


def test_score_weights_change_selected_driver_and_rider_priorities():
    policy = registry.get("score")
    vehicles = [Vehicle(1, 0, 0, 0, revenue=100), Vehicle(2, 0, 0, 0, revenue=0)]
    order = Order(1, 0, 0, 1, "a", "b", 1, 1, 1)
    weights = {key: 0 for key in ("distance", "wait", "idle", "balance", "fairness")}
    router = SimpleNamespace(nodes={0: {"zoneId": "a"}})
    context = SimpleNamespace(router=router, config={"weights": {**weights, "distance": 1}},
                              matrices=lambda *_: (np.array([[10., 100.]]), np.array([[1., 2.]])))
    assert policy.dispatch(vehicles, [order], context)[0].vehicle.id == 1
    context.config = {"weights": {**weights, "fairness": 1}}
    assert policy.dispatch(vehicles, [order], context)[0].vehicle.id == 2
    orders = [order, Order(2, -500, 0, 1, "a", "b", 1, 1, 1, waitTime=500)]
    context.config = {"weights": {**weights, "wait": 1}}
    context.matrices = lambda *_: (np.array([[10.], [100.]]), np.array([[1.], [2.]]))
    assert policy.dispatch(vehicles[:1], orders, context)[0].order.id == 2


def test_custom_plugin_registers_and_runs_without_engine_changes():
    class HoldRequests(DispatchAlgorithm):
        id, name, label, description = "test-hold", "Hold", "Hold", "Test extension point"

        def dispatch(self, vehicles, orders, simulation_state):
            return []

    registry.register(HoldRequests())
    try:
        engine = SimulationEngine({"algorithm": "test-hold"})
        engine.set_running(True)
        engine.step(5)
        assert all(order.status == "Waiting" for order in engine.orders)
        assert any(item["id"] == "test-hold" for item in registry.list_algorithms())
    finally:
        registry._algorithms.pop("test-hold")


@pytest.mark.parametrize("invalid_kind", ["vehicle-clone", "order-clone", "duplicate", "nonfinite"])
def test_plugin_result_validation_is_atomic_and_rejects_ghost_entities(invalid_kind):
    engine = SimulationEngine()
    first = DispatchResult(engine.vehicles[0], engine.orders[0], 1.0, 10.0)
    second = DispatchResult(engine.vehicles[1], engine.orders[1], 1.0, 10.0)
    if invalid_kind == "vehicle-clone":
        second = replace(second, vehicle=replace(second.vehicle))
    elif invalid_kind == "order-clone":
        second = replace(second, order=replace(second.order))
    elif invalid_kind == "duplicate":
        second = replace(second, vehicle=first.vehicle)
    else:
        second = replace(second, eta=float("nan"))
    engine.algorithm = SimpleNamespace(dispatch=lambda *_: [first, second])
    before = engine.snapshot()
    with pytest.raises(RuntimeError, match="foreign or ineligible"):
        engine._dispatch_orders()
    assert engine.snapshot() == before


def test_plugin_bootstrap_is_loaded_in_a_fresh_benchmark_process(tmp_path):
    # Exercise a real cold import, as multiprocessing's spawn start method does.
    # A private package copy prevents modifications to the running application.
    application = Path(__file__).resolve().parents[1] / "app"
    shutil.copytree(application, tmp_path / "app", ignore=shutil.ignore_patterns("__pycache__"))
    plugin_dir = tmp_path / "app" / "dispatch"
    (plugin_dir / "example_plugin.py").write_text(
        'from .nearest_driver import NearestDriver\n'
        'class ExamplePlugin(NearestDriver):\n'
        '    id = "example-cold-import"\n'
        '    name = label = "Cold import example"\n', encoding="utf-8")
    (plugin_dir / "plugins.py").write_text(
        'def register_plugins(registry):\n'
        '    from .example_plugin import ExamplePlugin\n'
        '    registry.register(ExamplePlugin())\n', encoding="utf-8")
    script = ('from app.simulation.benchmark import run_benchmark; '
              'results = run_benchmark({"config": {"supply": 50}, "duration": 1}); '
              'assert "example-cold-import" in [r["algorithm"] for r in results]; '
              'assert len(results) == 7; print("plugin benchmark passed")')
    result = subprocess.run([sys.executable, "-c", script], cwd=tmp_path, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    assert "plugin benchmark passed" in result.stdout
