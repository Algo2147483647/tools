"""Rebuild Shanghai's offline rail graph from the reviewed source snapshot.

Run: python scripts/build-shanghai-metro.py
Refresh sources separately with fetch-shanghai-metro.py and review before publishing.
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = json.loads((ROOT / "scripts/shanghai-metro-source.json").read_text(encoding="utf-8"))
OUT = ROOT / "public/examples/spatial-atlas/shanghai-metro.json"


def build():
    nodes, edges, lines = {}, [], []
    memberships = defaultdict(list)
    ordered_pairs = set()
    for index, line in enumerate(SOURCE["lines"]):
        station_keys = list(dict.fromkeys("station:" + name for path in line["paths"] for name in path["stations"]))
        pairs = set()
        line_edges = []
        for path in line["paths"]:
            stops = path["stations"]
            intervals = list(zip(stops, stops[1:]))
            if line["ring"]:
                intervals.append((stops[-1], stops[0]))
            for start, end in intervals:
                pair = tuple(sorted([start, end]))
                if pair in pairs:
                    continue  # Branch services share a trunk; keep it once per line.
                pairs.add(pair)
                a, b = "station:" + start, "station:" + end
                if (a, b) in ordered_pairs:
                    a, b = b, a
                assert (a, b) not in ordered_pairs, (line["name"], start, end)
                ordered_pairs.add((a, b))
                edge_id = f"rail:{index + 1}:{len(pairs)}"
                line_edges.append(edge_id)
                edges.append({"id": edge_id, "source": a, "target": b, "value": line["name"],
                              "metadata": {"kind": "rail", "line": line["name"], "direction": "both",
                                           "spatialStyle": {"color": line["color"], "width": 2.5}}})
        for key in station_keys:
            name = key.removeprefix("station:")
            memberships[name].append(line["name"])
            if key in nodes:
                continue
            point = SOURCE["stations"][name]
            nodes[key] = {
                "title": name, "englishName": point["englishName"], "stationId": name,
                "space": [point["longitude"], point["latitude"]],
                "longitude": point["longitude"], "latitude": point["latitude"],
                "coordinateReference": "WGS84 / EPSG:4326", "coordinateSource": point["source"],
                "coordinateMethod": point["coordinateMethod"],
                "coordinateSourceVersion": point["osmVersion"], "coordinateSourceTimestamp": point["osmTimestamp"],
                "status": "operating", "source": SOURCE["operatorSource"],
                "spatialStyle": {"color": line["color"], "radius": 2.5, "label": True},
            }
        lines.append({"name": line["name"], "color": line["color"], "stationCount": len(station_keys),
                      "stationKeys": station_keys, "ring": line["ring"], "edgeIds": line_edges,
                      "paths": [{"name": p["name"], "stationKeys": ["station:" + name for name in p["stations"]]} for p in line["paths"]]})
    for name, served in memberships.items():
        node = nodes["station:" + name]
        node["lines"] = served
        node["type"] = " / ".join(served)
        if len(served) > 1:
            node["spatialStyle"].update(color="#556273", radius=3.5)
        node["define"] = (f"{name} · {' / '.join(served)}。运营中。"
                          + f"WGS84：经度 {node['longitude']}，纬度 {node['latitude']}。"
                          + "每站一个原始地理参考点；换乘站共用点位，不做人为错位或远郊压缩。"
                          + f"坐标来源：{node['coordinateSource']}")
    separate_sites = [
        {"name": "国家会展中心", "stationKeys": ["station:国家会展中心(2号线)", "station:国家会展中心(17号线)"],
         "note": "Separate physical sites; transfer requires leaving the station. Not merged into an invented midpoint."},
        {"name": "浦东南路", "stationKeys": ["station:浦东南路(2号线)", "station:浦东南路(14号线)"],
         "note": "Separate physical sites with a shared name for the future Line 19 interchange; no current in-station link implied."},
    ]
    for group in separate_sites:
        for key in group["stationKeys"]:
            nodes[key]["separateStationSites"] = group["stationKeys"]
            nodes[key]["define"] += group["note"]
    return {
        "format": "graph-studio", "version": 3, "title": "上海地铁全线网 · Shanghai rail network",
        "metadata": {
            "space": {"dimensions": 2, "coordinateSystem": "cartesian", "axes": ["Longitude (WGS84)", "Latitude (WGS84)"],
                      "unit": "degrees", "typeField": "lines", "edgeTypeField": "line"},
            "asOf": SOURCE["retrieved"], "source": SOURCE["operatorSource"], "topologySource": SOURCE["topologySource"],
            "scope": "Shanghai Metro Lines 1–18, Pujiang Line, Maglev and the operating Airport Link Line. Includes the Line 11 branch into Kunshan. Excludes national rail, Jinshan Railway, Songjiang trams, airside people movers and unopened services.",
            "counts": {"lines": len(lines), "servicePaths": sum(len(l["paths"]) for l in lines), "stationNodes": len(nodes),
                       "stationLineMemberships": sum(len(v) for v in memberships.values()),
                       "interchangeNodes": sum(len(v) > 1 for v in memberships.values()), "railSegments": len(edges)},
            "lines": lines, "separateStationSites": separate_sites,
            "excludedStops": [{"line": "18号线", "station": "江杨南路", "status": "not open"},
                              {"line": "市域机场线", "station": "浦东3号航站楼", "status": "under construction"},
                              {"line": "市域机场线", "station": "上海东站", "status": "under construction"}],
            "coordinateReference": "WGS84 / EPSG:4326. space is the unmodified source [longitude, latitude] pair. Plate carree angular plot: degrees, not ground distances.",
            "coordinateAttribution": "© OpenStreetMap contributors, ODbL 1.0", "coordinateLicense": SOURCE["coordinateLicense"],
            "coordinatePrecision": "Mapped station or rail-stop points representing each station complex. Original precision is preserved, without averaging or schematic displacement; not independently survey-certified or separate platform positions.",
            "note": "Offline service snapshot, not real-time operations. All operator-listed passenger stops are checked against the line roster. Branch trunks are deduplicated per line; Line 4 closes its ring. Shared 3/4 segments keep both line colors and filter separately. Segments connect passenger stops, not surveyed track geometry. Same-named separated sites retain distinct coordinates. Fare gates, transfer walks and durations are not modeled.",
        }, "nodes": nodes, "edges": edges,
    }


if __name__ == "__main__":
    doc = build()
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(doc["metadata"]["counts"], ensure_ascii=False))
