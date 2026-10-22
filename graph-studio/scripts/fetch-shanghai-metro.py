"""Capture reviewed Shanghai services and unmodified OSM station coordinates.

Run from graph-studio: python scripts/fetch-shanghai-metro.py
Downloads are cached in .spatial-data. Delete only the Shanghai cache files to
refresh sources, then review service changes before rebuilding the bundled graph.
AMap supplies service topology, never the output coordinates (its CRS is GCJ-02).
"""
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".spatial-data"
CACHE.mkdir(exist_ok=True)
OPERATOR = "https://m.shmetro.com/core/shmetro/mdstationinfoback_new.ashx?act=getAllStations"
TOPOLOGY = "https://map.amap.com/service/subway?_175=1&srhdata=3100_drw_shanghai.json"
API = "https://api.openstreetmap.org/api/0.6/"
AS_OF = "2026-10-22"


def read(name, url):
    path = CACHE / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    return json.loads(path.read_text(encoding="utf-8"))


def canonical(name):
    # Keep same-named but physically separate station sites as separate points.
    return {"浦东南路(原东昌路)": "浦东南路(2号线)",
            "浦东南路": "浦东南路(14号线)"}.get(name, name)


def base_name(name):
    return re.sub(r"\(.*?\)", "", name).replace("・", "·").strip()


def capture():
    operator = read("shanghai-operator-stations.txt", OPERATOR)
    amap = read("shanghai-amap.json", TOPOLOGY)
    network = read("shanghai-osm-network.json", API + "relation/6799988.json")["elements"][0]
    ids = ",".join(str(m["ref"]) for m in network["members"])
    masters = read("shanghai-osm-masters.json", API + "relations.json?relations=" + ids)["elements"]
    ids = sorted({str(m["ref"]) for r in masters for m in r["members"] if m["type"] == "relation"})
    routes = read("shanghai-osm-routes.json", API + "relations.json?relations=" + ",".join(ids))["elements"]
    ids = sorted({m["ref"] for r in routes for m in r["members"] if m["type"] == "node"})
    points = {}
    for i in range(0, len(ids), 150):
        data = read(f"shanghai-osm-nodes-{i // 150}.json", API + "nodes.json?nodes=" + ",".join(map(str, ids[i:i + 150])))
        points.update((n["id"], n) for n in data["elements"])
    amap_stations = {s["n"]: s for line in amap["l"] for s in line["st"]}
    # These stations are absent from the metro route relations. Search small map
    # windows around the discovery location, then take named OSM points only.
    for name in ["金吉路", "三林南", "康桥东", "上海国际旅游度假区"]:
        lon, lat = map(float, amap_stations[name]["sl"].split(","))
        data = read(f"shanghai-map-{name}.json", API + f"map.json?bbox={lon-.010},{lat-.006},{lon+.004},{lat+.008}")
        points.update((n["id"], n) for n in data["elements"] if n["type"] == "node")
    candidates = defaultdict(list)
    for n in points.values():
        tags = n.get("tags", {})
        if (tags.get("railway") not in {"station", "stop"} and tags.get("public_transport") != "stop_position") or tags.get("construction") or tags.get("disused") == "yes":
            continue
        name = tags.get("name:zh", tags.get("name", "")).replace("・", "·")
        candidates[name].append(n)
    route_lines = defaultdict(set)
    for r in routes:
        for m in r["members"]:
            if m["type"] == "node":
                route_lines[m["ref"]].add(r.get("tags", {}).get("ref"))
    lines, stations = {}, {}
    for item in amap["l"]:
        name = item["ln"]
        line = lines.setdefault(name, {"name": name, "color": "#" + item["cl"], "paths": [], "ring": name == "4号线"})
        path = {"name": item["la"] or name, "stations": [canonical(s["n"]) for s in item["st"]]}
        line["paths"].append(path)
        for stop in item["st"]:
            key = canonical(stop["n"])
            if key in stations:
                continue
            matches = candidates[base_name(key)]
            if key in {"国家会展中心(2号线)", "国家会展中心(17号线)", "浦东南路(2号线)", "浦东南路(14号线)"}:
                matches = [n for n in matches if name.removesuffix("号线") in route_lines[n["id"]]]
            assert matches, f"No sourced WGS84 coordinate for {key}"
            # Prefer a mapped station point over one directional rail stop; use
            # stable OSM IDs for a deterministic representative of the complex.
            point = min(matches, key=lambda n: (n["tags"].get("railway") != "station", n["id"]))
            stations[key] = {
                "name": key, "englishName": stop.get("multilang", {}).get("n", {}).get("en", ""),
                "longitude": point["lon"], "latitude": point["lat"],
                "source": f"https://www.openstreetmap.org/node/{point['id']}",
                "osmId": point["id"], "osmVersion": point["version"], "osmTimestamp": point["timestamp"],
                "sourceName": point["tags"].get("name"),
                "coordinateMethod": "mapped station point" if point["tags"].get("railway") == "station" else "mapped rail-stop point representing the station complex",
            }
    # Every operator-listed stop must appear on its proper line. The four ring
    # direction menu entries are controls, not stations. Maglev uses another API.
    for name, line in lines.items():
        code = {"浦江线": "41", "市域机场线": "51"}.get(name, name.removesuffix("号线").zfill(2))
        if name == "磁浮线":
            continue
        official = {x["value"].strip() for x in operator if x["key"].startswith(code) and not re.match(r"[内外]圈", x["value"])}
        actual = {base_name(s) for p in line["paths"] for s in p["stations"]}
        assert actual == official, (name, actual - official, official - actual)
        line["operatorStationCodes"] = {x["key"]: x["value"].strip() for x in operator if x["key"].startswith(code) and not re.match(r"[内外]圈", x["value"])}
    snapshot = {"retrieved": AS_OF, "operatorSource": OPERATOR, "topologySource": TOPOLOGY,
                "coordinateReference": "WGS84 / EPSG:4326", "coordinateLicense": "https://www.openstreetmap.org/copyright",
                "lines": list(lines.values()), "stations": stations}
    path = ROOT / "scripts/shanghai-metro-source.json"
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Captured {len(lines)} lines, {len(stations)} station points")


if __name__ == "__main__":
    capture()
