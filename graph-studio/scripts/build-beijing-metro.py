"""Rebuild the offline Beijing rail network from the reviewed operator snapshot.

Run: python scripts/build-beijing-metro.py
Source station flags also describe unavailable *transfers*, so do not treat every
false flag as a closed station. Update the snapshot and reviewed exceptions together.
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/examples/spatial-atlas/beijing-metro.json"
SOURCE = json.loads((ROOT / "scripts/beijing-metro-source.json").read_text(encoding="utf-8"))
COORDINATES = json.loads((ROOT / "scripts/beijing-metro-coordinates.json").read_text(encoding="utf-8"))
EXCLUDED = [
    {"line": "1号线八通线", "station": "八角游乐园", "status": "temporarily closed; trains pass without stopping",
     "since": "2025-06-02", "plannedReopening": "2027-05-03",
     "source": "https://bjsubway.com/news/qyxw/yyzd/2025-05-26/129660.html"},
    {"line": "14号线", "station": "陶然桥", "status": "not open"},
    {"line": "14号线", "station": "高家园", "status": "not open; Line 12 station is open"},
    {"line": "17号线", "station": "广渠门外", "status": "not open; Line 7 station is open",
     "source": "https://xcx-www.mtr.bj.cn/service/line/line-17.html"},
    {"line": "亦庄T1线", "station": "老观里", "status": "not open",
     "source": "https://www.beijing.gov.cn/renwen/rwzyd/qxdw/lsychmqdd/jkqT1x/202309/t20230927_3268022.html"},
]
OUTSIDE = {"木樨地", "大钟寺", "巴沟", "荣昌东街"}
OMIT = {(e["line"], e["station"]) for e in EXCLUDED}


def build():
    nodes, edges, lines = {}, [], []
    endpoint_pairs = set()
    stations = defaultdict(list)
    for line in SOURCE["lines"]:
        active = [s for s in line["stations"] if (line["name"], s["name"]) not in OMIT]
        keys = []
        for s in active:
            key = "station:" + s["name"]
            keys.append(key)
            stations[s["name"]].append(line["name"])
            if key not in nodes:
                coordinate = COORDINATES["stations"][s["name"]]
                nodes[key] = {
                    "title": s["name"], "type": line["name"], "stationId": s["name"],
                    "space": [coordinate["longitude"], coordinate["latitude"]],
                    "longitude": coordinate["longitude"], "latitude": coordinate["latitude"],
                    "coordinateReference": "WGS84 / EPSG:4326", "coordinateSource": coordinate["source"],
                    "coordinateMethod": coordinate["coordinateMethod"],
                    "status": "operating", "source": SOURCE["source"],
                    "spatialStyle": {"color": line["color"], "radius": 2.5, "label": True},
                }
        # The XML incorrectly marks Line 11 as a loop. Only Lines 2 and 10 close.
        ring = line["name"] in {"2号线", "10号线"}
        pairs = [(a, b, "both") for a, b in zip(keys, keys[1:])]
        if ring:
            pairs.append((keys[-1], keys[0], "both"))
        if line["name"] == "首都机场线":
            by_name = {nodes[k]["title"]: k for k in keys}
            pairs = [(by_name[a], by_name[b], direction) for a, b, direction in [
                ("北新桥", "东直门", "both"), ("东直门", "三元桥", "both"),
                ("三元桥", "3号航站楼", "forward"),
                ("3号航站楼", "2号航站楼", "forward"),
                ("2号航站楼", "三元桥", "forward"),
            ]]
        for i, (a, b, direction) in enumerate(pairs):
            # v3 allows one edge per ordered pair. Two services sharing a
            # bidirectional interval can use opposite storage orientations;
            # direction=both remains the passenger-service meaning for each.
            if (a, b) in endpoint_pairs and direction == "both":
                a, b = b, a
            assert (a, b) not in endpoint_pairs, (line["name"], a, b)
            endpoint_pairs.add((a, b))
            edges.append({"id": f"rail:{line['code']}:{i}", "source": a, "target": b,
                          "value": line["name"], "metadata": {
                              "kind": "rail", "line": line["name"], "direction": direction,
                              "spatialStyle": {"color": line["color"], "width": 2.5,
                                               "directed": direction == "forward"}}})
        lines.append({"name": line["name"], "color": line["color"], "stationCount": len(keys),
                      "ring": ring, "stationKeys": keys})
    for name, served in stations.items():
        node = nodes["station:" + name]
        node["lines"] = served
        node["type"] = " / ".join(served)
        node["transferMode"] = "out-of-station" if name in OUTSIDE else "in-station" if len(served) > 1 else "none"
        if len(served) > 1:
            node["spatialStyle"].update(color="#556273", radius=3.5)
        node["define"] = (f"{name} · {' / '.join(served)}。运营中。"
                          + ("需出站换乘。" if name in OUTSIDE else "")
                          + f"WGS84：经度 {node['longitude']}，纬度 {node['latitude']}。"
                          + "每站一个真实地理参考点；换乘线路共享此点，不做人为错位。"
                          + f"坐标来源：{node['coordinateSource']}")
    return {
        "format": "graph-studio", "version": 3, "title": "北京地铁全线网 · Beijing rail network",
        "metadata": {
            "space": {"dimensions": 2, "coordinateSystem": "cartesian", "axes": ["Longitude (WGS84)", "Latitude (WGS84)"],
                      "unit": "degrees", "typeField": "lines", "edgeTypeField": "line"},
            "asOf": SOURCE["retrieved"], "source": SOURCE["source"],
            "scope": "All 28 through-service routes on the current operator network map, including airport rail, S1 and both tram lines. Lines 1/Batong and 4/Daxing are each shown as one through service (30 administratively named lines).",
            "counts": {"serviceRoutes": len(lines), "stationLineMemberships": sum(len(v) for v in stations.values()), "stationNodes": len(nodes),
                       "distinctStationNames": len(stations), "interchangeNames": sum(len(v) > 1 for v in stations.values()),
                       "railSegments": sum(e["metadata"]["kind"] == "rail" for e in edges),
                       "transferPairs": sum(len(v) * (len(v) - 1) // 2 for v in stations.values())},
            "lines": lines, "excludedStops": EXCLUDED,
            "note": "One node per station name, positioned at its sourced WGS84 longitude and latitude. No schematic compression, rounding, jitter or interchange offsets. Type selects all stations and only edges of a line. Shared nodes describe interchanges; no artificial transfer segments. Links connect consecutive passenger stops, not surveyed track alignments. Most links are bidirectional; the Capital Airport terminal loop is directed. Offline service snapshot, not real-time operation.",
            "coordinateReference": "WGS84 / EPSG:4326. space is the unmodified [longitude, latitude] pair. Plate carree angular plot: degrees, not metric distances.",
            "coordinateAttribution": "© OpenStreetMap contributors, ODbL 1.0",
            "coordinateLicense": COORDINATES["license"],
            "coordinatePrecision": "Published mapped station/rail-stop points, not survey-certified platform coordinates. Zhufangbei uses the centroid of the mapped station footprint. Source precision is preserved; source accuracy is not independently certified.",
        }, "nodes": nodes, "edges": edges,
    }


if __name__ == "__main__":
    doc = build()
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(doc["metadata"]["counts"], ensure_ascii=False))
