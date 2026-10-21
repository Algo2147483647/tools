"""Rebuild Spatial Atlas from public source files. Python standard library only.

Run from graph-studio: python scripts/build-spatial-examples.py
Downloads are cached in .spatial-data; the shipped workspace works entirely offline.
"""
import runpy
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

runpy.run_path(str(ROOT / "scripts/build-world-cities.py"), run_name="__main__")

runpy.run_path(str(ROOT / "scripts/build-beijing-metro.py"), run_name="__main__")

save("zero-dimensional.json", graph("0D · Coincident points", 0, "cartesian", {str(i): {"title": f"Point {i}", "space": [], "type": "Origin"} for i in range(6)}))
save("one-dimensional.json", graph("1D · A measured line", 1, "cartesian", {str(i): {"title": f"x = {i}", "space": [i], "type": "Negative" if i < 0 else "Non-negative"} for i in [-5, -2, 0, 1, 4, 8]}))
save("polar.json", graph("2D · Polar orbit", 2, "polar", {str(i): {"title": f"{i*30} degrees", "space": [1, i*30], "type": "Orbit"} for i in range(12)}, [{"id": str(i), "source": str(i), "target": str((i+1)%12)} for i in range(12)]))
save("cylindrical.json", graph("3D · Cylindrical helix", 3, "cylindrical", {str(i): {"title": f"Helix {i}", "space": [1, i*30, i/12], "type": f"Turn {i//12+1}"} for i in range(48)}, [{"id": str(i), "source": str(i), "target": str(i+1)} for i in range(47)]))
nodes = {str(i): {"title": format(i, "04b"), "space": [1 if i & (1 << bit) else -1 for bit in range(4)], "type": "W = +1" if i & 8 else "W = -1"} for i in range(16)}
edges = [{"id": f"{i}:{bit}", "source": str(i), "target": str(i ^ (1 << bit))} for i in range(16) for bit in range(4) if not i & (1 << bit)]
save("four-dimensional.json", graph("4D · Tesseract", 4, "cartesian", nodes, edges))
save("five-dimensional.json", graph("5D · Basis vectors", 5, "cartesian", {str(i): {"title": f"e{i+1}", "space": [int(i == j) for j in range(5)], "type": f"Axis {i+1}"} for i in range(5)}))
(OUT / "CELESTIAL-LICENSE.txt").write_text(read("license.txt", CELESTIAL + "LICENSE"), encoding="utf-8")
save("graph-studio.workspace.json", {"format": "graph-studio-workspace", "version": 1, "name": "Spatial Atlas", "graphs": ["all-sky.json", "world-cities.json", "beijing-metro.json", "zero-dimensional.json", "one-dimensional.json", "polar.json", "cylindrical.json", "four-dimensional.json", "five-dimensional.json"], "defaultGraph": "all-sky.json", "metadata": {"assets": ["README.md", "SOURCES.md", "CELESTIAL-LICENSE.txt"]}})
