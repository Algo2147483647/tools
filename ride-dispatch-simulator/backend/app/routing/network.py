"""Load and validate the synthetic New Harbor road graph, without browser code."""
from copy import deepcopy
from functools import lru_cache
import json
import math
from pathlib import Path

KM_PER_UNIT = 0.008
ROAD_SPEEDS = {"arterial": 48.0, "secondary": 34.0, "local": 24.0}


def enrich_network(network: dict) -> dict:
    network = deepcopy(network)
    if not network.get("nodes") or not network.get("zones"):
        raise ValueError("A city requires road nodes and demand zones.")
    ids = {node["id"] for node in network["nodes"]}
    if len(ids) != len(network["nodes"]):
        raise ValueError("Road node IDs must be unique.")
    for node in network["nodes"]:
        # Georeferencing for future real-map adapters; rendered city remains local XY.
        node.setdefault("lat", 40.72 - node["y"] * KM_PER_UNIT / 111.32)
        node.setdefault("lng", -74.0 + node["x"] * KM_PER_UNIT / (111.32 * math.cos(math.radians(40.72))))
    for edge in network["edges"]:
        if edge["from"] not in ids or edge["to"] not in ids:
            raise ValueError("A road references an unknown node.")
        edge.setdefault("distance", edge["length"] * KM_PER_UNIT)
        edge.setdefault("speedLimit", ROAD_SPEEDS[edge["level"]])
        edge.setdefault("travelTime", edge["distance"] / edge["speedLimit"] * 3600)
        edge.setdefault("roadType", edge["level"])
        edge.setdefault("fromNode", edge["from"])
        edge.setdefault("toNode", edge["to"])
        if edge["distance"] <= 0 or edge["speedLimit"] <= 0 or edge["travelTime"] <= 0:
            raise ValueError("Road distance, speed and travel time must be positive.")
    for zone in network["zones"]:
        zone.setdefault("demandWeight", zone["weight"])
        zone.setdefault("baseOrderRate", 20.0)
        zone.setdefault("timePattern", zone["kind"])
        zone.setdefault("destinationWeights", {other["id"]: other["weight"] for other in network["zones"]})
    return network


@lru_cache(maxsize=1)
def load_network() -> dict:
    path = Path(__file__).resolve().parents[1] / "data" / "new_harbor.json"
    return enrich_network(json.loads(path.read_text(encoding="utf-8-sig")))
