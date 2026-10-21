"""Rebuild Spatial Atlas from public source files. Python standard library only.

Run from graph-studio: python scripts/build-spatial-examples.py
Downloads are cached in .spatial-data; the shipped workspace works entirely offline.
"""
import csv
import json
import math
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".spatial-data"
OUT = ROOT / "public/examples/spatial-atlas"
CACHE.mkdir(exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
CELESTIAL = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/"
EARTH = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
ROADS = "https://raw.githubusercontent.com/zhanzxy5/VSR-dataset/master/Road%20network%20data/"


def read(name, url):
    path = CACHE / name
    if not path.exists():
        path.write_bytes(urllib.request.urlopen(url, timeout=40).read())
    return path.read_text(encoding="utf-8")


def data(name, url):
    return json.loads(read(name + ".json", url))


def save(name, doc):
    (OUT / name).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(name, len(doc.get("nodes", {})), "nodes", len(doc.get("edges", [])), "edges")


def graph(title, dimensions, system, nodes, edges=None, **metadata):
    return {"format": "graph-studio", "version": 3, "title": title,
            "metadata": {"space": {"dimensions": dimensions, "coordinateSystem": system, "angleUnit": "degrees"}, **metadata},
            "nodes": nodes, "edges": edges or []}


# Ray casting with longitude unwrapping and explicit polar closure.
def in_region(lon, lat, ring):
    points = []
    for x, y in ring:
        if points:
            while x - points[-1][0] > 180:
                x -= 360
            while x - points[-1][0] < -180:
                x += 360
        points.append((x, y))
    if abs(points[-1][0] - points[0][0]) > 180:
        pole = 90 if sum(p[1] for p in points) > 0 else -90
        points.extend([(points[-1][0], pole), (points[0][0], pole)])
    for x in [lon - 360, lon, lon + 360]:
        inside = False
        for i, (ax, ay) in enumerate(points):
            bx, by = points[i - 1]
            if (ay > lat) != (by > lat) and x < (bx - ax) * (lat - ay) / (by - ay) + ax:
                inside = not inside
        if inside:
            return True
    return False


stars = data("stars", CELESTIAL + "data/stars.6.json")["features"]
names = data("starnames", CELESTIAL + "data/starnames.json")
regions = data("constellations", CELESTIAL + "data/constellations.json")["features"]
bounds = data("bounds", CELESTIAL + "data/constellations.bounds.json")["features"]
lines = data("lines", CELESTIAL + "data/constellations.lines.json")["features"]
region_names = {f["id"]: ("Serpens" if f["id"] == "Ser" else f["properties"]["name"]) for f in regions}
star_nodes = {}
coordinate_keys = {}
unassigned = 0
for star in stars:
    sid = str(star["id"])
    lon, lat = star["geometry"]["coordinates"]
    info = names.get(sid, {})
    region = info.get("c")
    if region not in region_names:
        region = next((f["id"] for f in bounds if in_region(lon, lat, f["geometry"]["coordinates"][0])), None)
    if region is None:
        unassigned += 1
    key = "hip:" + sid
    star_nodes[key] = {"title": info.get("name") or f"HIP {sid}", "type": region_names.get(region, "Unassigned sky"),
                       "space": [1, lon, lat], "magnitude": star["properties"]["mag"],
                       "define": f"J2000 sky direction. Unit sphere; radius is not stellar distance. HIP {sid}.",
                       "source": f"https://github.com/ofrohn/d3-celestial/blob/master/data/stars.6.json"}
    coordinate_keys[(round(lon, 4), round(lat, 4))] = key
edges = []
pairs = set()
for feature in lines:
    for line in feature["geometry"]["coordinates"]:
        keys = []
        for lon, lat in line:
            point = (round(lon, 4), round(lat, 4))
            if point not in coordinate_keys:
                key = f"line-star:{len(coordinate_keys)}"
                coordinate_keys[point] = key
                star_nodes[key] = {"title": region_names[feature["id"]] + " line vertex", "type": region_names[feature["id"]], "space": [1, lon, lat], "define": "Constellation line endpoint from d3-celestial. Not assigned a catalog magnitude."}
            keys.append(coordinate_keys[point])
        for a, b in zip(keys, keys[1:]):
            if a != b and tuple(sorted((a, b))) not in pairs:
                pairs.add(tuple(sorted((a, b))))
                edges.append({"id": f"constellation:{len(edges)}", "source": a, "target": b, "value": region_names[feature["id"]], "metadata": {"kind": "constellation line"}})
sky = graph("全天星图 · All-sky constellations", 3, "spherical", star_nodes, edges,
            epoch="J2000", magnitudeLimit=6, source="https://github.com/ofrohn/d3-celestial", note="Full-sky coverage of the bundled magnitude-limited star catalog; constellation lines are visual associations, not physical links.")
sky["metadata"]["space"].update(axes=["Radius", "Right ascension (degrees)", "Declination"], unit="unit sphere")
save("all-sky.json", sky)
print("Unassigned catalog stars:", unassigned)

countries = data("countries", EARTH + "ne_110m_admin_0_countries.geojson")["features"]
continents = {}
for feature in countries:
    p = feature["properties"]
    for field in ["ADM0_A3", "SOV_A3", "ISO_A3"]:
        continents[p[field]] = p["CONTINENT"]
cities = data("cities", EARTH + "ne_110m_populated_places.geojson")["features"]
city_nodes = {}
native_config = json.loads((ROOT / "scripts/spatial-city-names.json").read_text(encoding="utf-8"))
for index, feature in enumerate(cities):
    p = feature["properties"]
    lon, lat = feature["geometry"]["coordinates"]
    continent = continents.get(p["ADM0_A3"]) or continents.get(p["SOV_A3"])
    # Small states absent from Natural Earth's 110m country layer.
    if not continent:
        zone = (p.get("TIMEZONE") or "").split("/")[0]
        continent = {"Pacific": "Oceania", "Indian": "Africa", "America": "North America", "Atlantic": "Africa"}.get(zone, zone or "Other")
    key = "city:" + str(index)
    language = native_config["countryLanguages"][p["ADM0_A3"]]
    field = "NAME_ZHT" if language == "zh-Hant" else "NAME_" + language.upper()
    native = native_config["cityOverrides"].get(p["NAME"]) or {language: p.get(field) or p["NAME"]}
    title = next(iter(native.values()))
    city_nodes[key] = {"title": title, "name_native": native, "name_en": p["NAME"], "name_source": "https://www.wikidata.org/wiki/" + p["WIKIDATAID"] if p["NAME"] in native_config["cityOverrides"] else "Natural Earth NAME fields", "type": continent,
                       "space": [6371, round(lon, 6), round(lat, 6)], "country": p["ADM0NAME"],
                       "define": f"{p['NAME']}, {p['ADM0NAME']}. Natural Earth reference location on a sphere of radius 6371 km."}
# A deterministic nearest-neighbor graph demonstrates geometry without claiming airline services.
city_edges = []
pairs = set()
def haversine(a, b):
    x1, y1 = map(math.radians, a[1:])
    x2, y2 = map(math.radians, b[1:])
    return 2 * 6371 * math.asin(min(1, math.sqrt(math.sin((y2-y1)/2)**2 + math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2)))
for key, node in city_nodes.items():
    peers = [(haversine(node["space"], n["space"]), k) for k, n in city_nodes.items() if k != key and n["type"] == node["type"]]
    for distance, other in sorted(peers)[:2]:
        pair = tuple(sorted((key, other)))
        if pair in pairs:
            continue
        pairs.add(pair)
        city_edges.append({"id": f"near:{len(city_edges)}", "source": key, "target": other, "value": "nearby reference city", "metadata": {"distanceKm": round(distance), "kind": "illustrative proximity", "isTransportRoute": False}})
earth = graph("地球重要城市 · World cities", 3, "spherical", city_nodes, city_edges,
              source="https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-populated-places/",
              note="243 reference cities. Type = source continent (country-level grouping). Edges connect two nearby cities in each region, not actual travel routes.")
earth["metadata"]["space"].update(axes=["Radius", "Longitude", "Latitude"], unit="km")
save("world-cities.json", earth)

road_nodes_raw = list(csv.DictReader(read("beijing-node.csv", ROADS + "Beijing_simplified_node.csv").splitlines()))
road_edges_raw = list(csv.DictReader(read("beijing-edge.csv", ROADS + "Beijing_simplified_edge.csv").splitlines()))
arterials = ["huan", "chang an", "jian guo", "fu xing", "zhong guan cun", "dong zhi men", "xi zhi men", "xue yuan", "jing kai", "jing cheng", "jing zang", "de sheng men", "fu shi"]
chosen = [e for e in road_edges_raw if any(name in e["PATHPY"].lower() for name in arterials)]
needed = {e[field] for e in chosen for field in ["From Node", "To Node"]}
road_nodes = {}
lon0, lat0 = 116.397, 39.908
for n in road_nodes_raw:
    if n["Node ID"] not in needed:
        continue
    lon, lat = float(n["X"]), float(n["Y"])
    region = ("North" if lat >= lat0 else "South") + ("east" if lon >= lon0 else "west")
    road_nodes["junction:" + n["Node ID"]] = {"title": "J" + n["Node ID"], "type": region, "space": [round(6371 * math.radians(lon-lon0) * math.cos(math.radians(lat0)), 6), round(6371 * math.radians(lat-lat0), 6)], "sourceXY": [lon, lat], "define": "Published junction from the Beijing simplified road network. Type is a geometric city sector, not an administrative district."}
road_edges = {}
for e in chosen:
    a, b = "junction:" + e["From Node"], "junction:" + e["To Node"]
    if a == b:
        continue
    pair = (a, b)
    if pair not in road_edges:
        road_edges[pair] = {"id": "road:" + e["Link ID"], "source": a, "target": b, "value": e["PATHPY"], "metadata": {"sourceLinkIds": [], "sourceLength": float(e["LENGTH"]), "sourceDirection": e["DIRECTION"], "sourceOneway": e["ONEWAY"]}}
    road_edges[pair]["metadata"]["sourceLinkIds"].append(e["Link ID"])
roads = graph("北京市主干路网 · Beijing arterial roads", 2, "cartesian", road_nodes, list(road_edges.values()),
              source="https://github.com/zhanzxy5/VSR-dataset", sourcePaper="https://doi.org/10.1103/PhysRevE.96.052301",
              scope="Named ring roads and selected radial arterials from the published simplified Beijing network. Historic reference, not a complete or current routing map.",
              sourceCoordinateReference="Source CSV publishes X/Y without a datum declaration. Original values retained as sourceXY; the local display applies an approximate equirectangular conversion, not a datum transformation.",
              origin=[lon0, lat0], selectionKeywords=arterials)
roads["metadata"]["space"].update(axes=["East", "North"], unit="km")
save("beijing-roads.json", roads)

save("zero-dimensional.json", graph("0D · Coincident points", 0, "cartesian", {str(i): {"title": f"Point {i}", "space": [], "type": "Origin"} for i in range(6)}))
save("one-dimensional.json", graph("1D · A measured line", 1, "cartesian", {str(i): {"title": f"x = {i}", "space": [i], "type": "Negative" if i < 0 else "Non-negative"} for i in [-5, -2, 0, 1, 4, 8]}))
save("polar.json", graph("2D · Polar orbit", 2, "polar", {str(i): {"title": f"{i*30} degrees", "space": [1, i*30], "type": "Orbit"} for i in range(12)}, [{"id": str(i), "source": str(i), "target": str((i+1)%12)} for i in range(12)]))
save("cylindrical.json", graph("3D · Cylindrical helix", 3, "cylindrical", {str(i): {"title": f"Helix {i}", "space": [1, i*30, i/12], "type": f"Turn {i//12+1}"} for i in range(48)}, [{"id": str(i), "source": str(i), "target": str(i+1)} for i in range(47)]))
nodes = {str(i): {"title": format(i, "04b"), "space": [1 if i & (1 << bit) else -1 for bit in range(4)], "type": "W = +1" if i & 8 else "W = -1"} for i in range(16)}
edges = [{"id": f"{i}:{bit}", "source": str(i), "target": str(i ^ (1 << bit))} for i in range(16) for bit in range(4) if not i & (1 << bit)]
save("four-dimensional.json", graph("4D · Tesseract", 4, "cartesian", nodes, edges))
save("five-dimensional.json", graph("5D · Basis vectors", 5, "cartesian", {str(i): {"title": f"e{i+1}", "space": [int(i == j) for j in range(5)], "type": f"Axis {i+1}"} for i in range(5)}))
(OUT / "CELESTIAL-LICENSE.txt").write_text(read("license.txt", CELESTIAL + "LICENSE"), encoding="utf-8")
save("graph-studio.workspace.json", {"format": "graph-studio-workspace", "version": 1, "name": "Spatial Atlas", "graphs": ["all-sky.json", "world-cities.json", "beijing-roads.json", "zero-dimensional.json", "one-dimensional.json", "polar.json", "cylindrical.json", "four-dimensional.json", "five-dimensional.json"], "defaultGraph": "all-sky.json", "metadata": {"assets": ["README.md", "SOURCES.md", "CELESTIAL-LICENSE.txt"]}})
