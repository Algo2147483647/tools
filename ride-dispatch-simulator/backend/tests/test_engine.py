from collections import Counter
import json
import math

import pytest

from app.demand import DemandGenerator, zone_demand_weight
from app.dispatch import registry
from app.simulation.benchmark import run_benchmark
from app.simulation.engine import SimulationEngine


def assert_on_road(engine, vehicle):
    if vehicle.edgeId is None:
        node = engine.router.nodes[vehicle.nodeId]
        assert (vehicle.x, vehicle.y) == pytest.approx((node["x"], node["y"]))
    else:
        assert vehicle.routeIndex + 1 < len(vehicle.route)
        origin = engine.router.nodes[vehicle.nodeId]
        target = engine.router.nodes[vehicle.route[vehicle.routeIndex + 1]]
        assert engine.router.edge_between(origin["id"], target["id"])["id"] == vehicle.edgeId
        assert vehicle.x == pytest.approx(origin["x"] + (target["x"] - origin["x"]) * vehicle.edgeProgress)
        assert vehicle.y == pytest.approx(origin["y"] + (target["y"] - origin["y"]) * vehicle.edgeProgress)


def test_default_scenario_pauses_resets_and_owns_detached_snapshots():
    engine = SimulationEngine()
    assert len(engine.vehicles) == 200
    assert len(engine.orders) == 30
    assert len(engine.network["zones"]) == 10
    assert engine.config["algorithm"] == "nearest"
    before = engine.snapshot()
    engine.step(100)
    assert engine.snapshot() == before
    snapshot = engine.snapshot()
    snapshot["vehicles"][0]["route"].clear()
    snapshot["config"]["weights"]["distance"] = 999
    assert engine.snapshot() == before
    engine.set_running(True)
    engine.step(20)
    assert engine.time == 20
    engine.reset()
    assert engine.snapshot() == before


def test_headless_full_lifecycle_metrics_match_observed_outcomes():
    engine = SimulationEngine({"algorithm": "hungarian"})
    engine.set_running(True)
    engine.step(1800)
    metrics = engine.snapshot()["metrics"]
    assert metrics["completed"] > 50
    assert metrics["created"] > 450
    assert metrics["revenue"] > 0
    assert metrics["revenue"] == pytest.approx(sum(vehicle.revenue for vehicle in engine.vehicles))
    assert metrics["completed"] == sum(vehicle.completed for vehicle in engine.vehicles)
    assert metrics["completionRate"] == pytest.approx(metrics["completed"] / metrics["created"] * 100)
    assert metrics["utilization"] == pytest.approx(sum(v.servingTime for v in engine.vehicles) / sum(v.onlineTime for v in engine.vehicles) * 100)
    for vehicle in engine.vehicles:
        assert_on_road(engine, vehicle)
    for order in engine.orders:
        if order.status == "Completed":
            assert order.createTime <= order.assignedTime <= order.pickupTime <= order.completedTime <= engine.time
            assert order.waitTime == pytest.approx(order.pickupTime - order.createTime)
        if order.status in ("Assigned", "PickingUp", "Serving"):
            assert engine.vehicles_by_id[order.assignedVehicle].orderId == order.id


def test_demand_is_identical_across_algorithms_and_supply_distributions():
    traces = []
    for algorithm in ["nearest", "hungarian", "fifo", "batch", "greedy", "score"]:
        engine = SimulationEngine({"algorithm": algorithm, "supply": 50,
                                   "supplyDistribution": "random_cluster" if algorithm == "batch" else "uniform"})
        engine.set_running(True)
        engine.step(500)
        traces.append([(o.id, o.createTime, o.pickupNode, o.destinationNode, o.fare) for o in engine.orders])
    assert all(trace == traces[0] for trace in traces)


def test_batch_cadence_and_live_policy_switch_are_real():
    engine = SimulationEngine({"algorithm": "batch", "batchInterval": 10})
    engine.set_running(True)
    engine.step(9)
    assert all(order.status == "Waiting" for order in engine.orders)
    engine.step(1)
    assert any(order.status == "Assigned" for order in engine.orders)
    assert any(driver.status == "Pickup" for driver in engine.vehicles)
    original_ids = {order.id for order in engine.orders if order.assignedVehicle}
    engine.set_config({"algorithm": "score", "weights": {"fairness": 2}})
    engine.step(10)
    assert engine.config["weights"]["fairness"] == 2
    assert engine.config["weights"]["distance"] == 0.45
    assert original_ids.issubset({order.id for order in engine.orders if order.assignedVehicle})


def test_checkpoint_json_roundtrip_resumes_exact_rng_clocks_and_counters():
    engine = SimulationEngine({"supplyDistribution": "random_cluster", "algorithm": "score"})
    engine.set_running(True)
    engine.step(321)
    checkpoint = json.loads(json.dumps(engine.export_checkpoint()))
    restored = SimulationEngine()
    restored.restore_snapshot(checkpoint)
    assert restored.snapshot() == engine.snapshot()
    for simulation in (engine, restored):
        simulation.set_config({"supply": 500})
        simulation.step(431)
    assert restored.snapshot() == engine.snapshot()


def test_supply_reduction_finishes_busy_trips_then_offlines_without_teleportation():
    engine = SimulationEngine({"supply": 200, "demand": 0.5})
    engine.set_running(True)
    engine.step(5)
    assigned = [vehicle for vehicle in engine.vehicles if vehicle.orderId and vehicle.id > 50]
    assert assigned
    positions = {vehicle.id: (vehicle.x, vehicle.y) for vehicle in engine.vehicles}
    engine.set_config({"supply": 50})
    assert all((vehicle.x, vehicle.y) == positions[vehicle.id] for vehicle in engine.vehicles)
    assert all(vehicle.status == "Pickup" for vehicle in assigned)
    engine.step(3600)
    assert all(vehicle.status == "Offline" for vehicle in engine.vehicles if vehicle.id > 50)
    assert engine.metrics["activeDrivers"] == 50


def test_shortage_cancels_orders_and_retention_preserves_cumulative_metrics():
    engine = SimulationEngine({"supply": 50, "demand": 5, "algorithm": "fifo"})
    engine.set_running(True)
    engine.step(1800)
    metrics = engine.metrics
    assert metrics["cancelled"] > 500
    assert metrics["cancellationRate"] > 0
    terminal = [order for order in engine.orders if order.status in ("Completed", "Cancelled")]
    assert len(terminal) <= 500
    live = sum(order.status not in ("Completed", "Cancelled") for order in engine.orders)
    assert metrics["created"] == metrics["completed"] + metrics["cancelled"] + live
    assert all(order.waitTime > 600 for order in terminal if order.status == "Cancelled")


def test_time_patterns_create_tidal_demand_and_supply_distributions_differ():
    engine = SimulationEngine()
    zones = engine.network["zones"]
    residential = next(z for z in zones if z["kind"] == "residential")
    cbd = next(z for z in zones if z["kind"] == "cbd")
    nightlife = next(z for z in zones if z["kind"] == "nightlife")
    assert zone_demand_weight(residential, 8) > zone_demand_weight(residential, 18)
    assert zone_demand_weight(cbd, 18) > zone_demand_weight(cbd, 8)
    assert zone_demand_weight(nightlife, 23) > zone_demand_weight(nightlife, 12)
    clusters = SimulationEngine({"supply": 1000, "supplyDistribution": "random_cluster"})
    assert len({clusters.router.nodes[v.nodeId]["zoneId"] for v in clusters.vehicles}) <= 3
    uniform = SimulationEngine({"supply": 1000, "supplyDistribution": "uniform"})
    assert len({uniform.router.nodes[v.nodeId]["zoneId"] for v in uniform.vehicles}) > 3
    weighted = SimulationEngine({"supply": 1000, "supplyDistribution": "demand_weighted"})
    assert [v.nodeId for v in weighted.vehicles] != [v.nodeId for v in uniform.vehicles]


def test_1000_driver_headless_stress_and_finite_stream_state():
    engine = SimulationEngine({"supply": 1000, "demand": 5, "algorithm": "hungarian"})
    engine.set_running(True)
    engine.step(600)
    assert engine.metrics["activeDrivers"] == 1000
    assert sum(order.status not in ("Completed", "Cancelled") for order in engine.orders) > 100
    snapshot = engine.snapshot()
    json.dumps(snapshot, allow_nan=False)
    assert len(snapshot["history"]) == 121
    assert len(snapshot["events"]) <= 80
    assert len(snapshot["candidates"]) <= 180
    assert len(snapshot["zoneStats"]) == 10
    for vehicle in engine.vehicles:
        assert_on_road(engine, vehicle)


def test_benchmark_replays_same_created_count_and_reports_every_registered_policy():
    progress = []
    results = run_benchmark({"config": {"supply": 50, "seed": 888}, "duration": 120},
                            lambda result, completed, total: progress.append((result["algorithm"], completed, total)))
    assert len(results) == len(registry.list_algorithms()) == 6
    assert len({result["metrics"]["created"] for result in results}) == 1
    assert len({result["metrics"]["avgPickupETA"] for result in results}) > 1
    assert progress[-1][1:] == (6, 6)


def test_fractional_steps_do_not_drift_batch_or_metric_boundaries():
    engine = SimulationEngine({"algorithm": "batch", "batchInterval": 5})
    engine.set_running(True)
    for _ in range(50):
        engine.step(0.3)
    assert engine.time == pytest.approx(15)
    assigned_times = [order.assignedTime for order in engine.orders if order.assignedTime is not None]
    assert assigned_times
    assert all(time / 5 == pytest.approx(round(time / 5)) for time in assigned_times)
    assert [metric["time"] for metric in engine.history] == pytest.approx([0, 5, 10, 15])
    instant = SimulationEngine()
    instant.set_running(True)
    instant.step(0.1)
    assert all(order.assignedTime == 0 for order in instant.orders)


def test_near_midnight_start_hour_and_time_pattern_reconfiguration():
    engine = SimulationEngine({"startHour": 23.9995})
    engine.set_running(True)
    engine.step(5)
    assert engine.time == 5
    assert all(math.isfinite(order.estimatedDuration) for order in engine.orders)
    previous_arrival = engine.next_arrival
    engine.set_config({"startHour": 8})
    assert engine.next_arrival > engine.time
    assert engine.next_arrival != previous_arrival
    with pytest.raises(ValueError, match="less than 24"):
        engine.set_config({"startHour": 24})
