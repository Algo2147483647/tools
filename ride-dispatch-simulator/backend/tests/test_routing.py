import math

import pytest

from app.models import Vehicle
from app.routing.network import enrich_network, load_network
from app.routing.router import RoutingEngine


def two_route_city():
    # Direct route is shorter (1km) but slower (360s); arterial detour is 2km/120s.
    return enrich_network({
        "nodes": [{"id": 0, "x": 0, "y": 0, "zoneId": "cbd"},
                  {"id": 1, "x": 125, "y": 0, "zoneId": "cbd"},
                  {"id": 2, "x": 62.5, "y": 110, "zoneId": "cbd"}],
        "edges": [{"id": 0, "from": 0, "to": 1, "length": 125, "level": "local", "distance": 1, "speedLimit": 10},
                  {"id": 1, "from": 0, "to": 2, "length": 125, "level": "arterial", "distance": 1, "speedLimit": 60},
                  {"id": 2, "from": 2, "to": 1, "length": 125, "level": "arterial", "distance": 1, "speedLimit": 60}],
        "zones": [{"id": "cbd", "name": "Center", "kind": "cbd", "weight": 1, "x": 0, "y": 0}],
    })


def test_fastest_route_and_shortest_distance_are_distinct_and_consistent():
    router = RoutingEngine(two_route_city())
    fastest = router.calculate_route(0, 1)
    shortest = router.calculate_route(0, 1, objective="distance")
    assert (fastest.path, fastest.distance, fastest.duration) == ([0, 2, 1], 2, 120)
    assert (shortest.path, shortest.distance, shortest.duration) == ([0, 1], 1, 360)
    congested = router.calculate_route(0, 1, traffic_factor=0.5)
    assert congested.duration == 240
    assert congested.path == fastest.path


def test_redirect_preserves_current_road_coordinates_and_fractional_progress():
    router = RoutingEngine(two_route_city())
    vehicle = Vehicle(1, 0, 31.25, 0, edgeId=0, route=[0, 1], edgeProgress=0.25)
    distance, eta = router.vehicle_cost(vehicle, 0)
    assert distance == 2.75
    assert eta == 390
    router.set_target(vehicle, 0)
    assert vehicle.route == [0, 1, 2, 0]
    assert (vehicle.x, vehicle.y, vehicle.edgeId, vehicle.edgeProgress) == (31.25, 0, 0, 0.25)


def test_city_is_connected_enriched_and_every_route_segment_is_an_edge():
    network = load_network()
    router = RoutingEngine(network)
    assert len(network["zones"]) == 10
    assert len(network["nodes"]) > 200
    assert len({edge["roadType"] for edge in network["edges"]}) == 3
    for node in network["nodes"]:
        assert math.isfinite(node["lat"]) and math.isfinite(node["lng"])
        route = router.calculate_route(network["nodes"][0]["id"], node["id"])
        assert math.isfinite(route.duration)
        assert route.distance == pytest.approx(sum(router.edge_between(a, b)["distance"] for a, b in zip(route.path, route.path[1:])))
        assert route.duration == pytest.approx(sum(router.edge_between(a, b)["travelTime"] for a, b in zip(route.path, route.path[1:])))


def test_disconnected_roads_fail_fast():
    network = two_route_city()
    network["edges"] = network["edges"][:1]
    with pytest.raises(ValueError, match="isolated"):
        RoutingEngine(network)
