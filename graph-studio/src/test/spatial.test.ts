import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGraphCommand } from "../graph/commands";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { defaultSpaceView, getSpaceMetadata, spaceToCartesian, type SpaceMetadata } from "../graph/space";
import { getGraphTypeOptions, projectGraphByType } from "../graph/typeFilter";
import { buildSpatialStage } from "../layout/spatial/layout";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import GraphStage from "../rendering/GraphStage";
import { graphReducer } from "../state/graphReducer";
import { initialGraphAppState } from "../state/initialState";
import { parseGraphPagePreferences } from "../state/preferences";
import { createChartStyles } from "../state/chartStyles";
import { defineSuite, defineTest } from "./harness";

function graph(
  dimensions: number,
  coordinateSystem = "cartesian",
  nodes: Record<string, unknown> = { a: { space: Array(dimensions).fill(0) } },
) {
  return normalizeDagInput({
    format: "graph-studio",
    version: 3,
    metadata: { space: { dimensions, coordinateSystem } },
    nodes,
    edges: [],
  });
}
function close(actual: number[], expected: number[]) {
  assert.equal(actual.length, expected.length);
  actual.forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-8, `${actual} != ${expected}`));
}
function finite(stage: ReturnType<typeof buildSpatialStage>) {
  assert.ok(Number.isFinite(stage.stageWidth) && Number.isFinite(stage.stageHeight));
  for (const node of stage.nodes) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
  for (const item of [...stage.edges, ...stage.spatial!.guides]) assert.doesNotMatch(item.path, /NaN|Infinity/);
}
export const spatialSuite = defineSuite("Spatial coordinate charts", [
  defineTest("display units spread coordinates without resizing glyphs or rewriting source data", async () => {
    const dag = normalizeDagInput(
      JSON.parse(
        await readFile(new URL("../../public/examples/spatial-atlas/beijing-metro.json", import.meta.url), "utf8"),
      ),
    );
    const snapshot = serializeDag(dag);
    const normal = buildSpatialStage({ dag });
    const expanded = buildSpatialStage({
      dag,
      spaceView: { ...defaultSpaceView(getSpaceMetadata(dag)), unitScale: 4 },
    });
    for (const node of normal.nodes) {
      const after = expanded.nodeMap[node.key];
      close([after.x, after.y], [node.x * 4, node.y * 4]);
      assert.equal(after.spatial!.radius, node.spatial!.radius);
      assert.deepEqual(after.spatial!.coordinates, node.spatial!.coordinates);
      assert.equal(after.spatial!.labelSide, node.spatial!.labelSide);
    }
    assert.deepEqual(
      expanded.edges.map((e) => e.spatial),
      normal.edges.map((e) => e.spatial),
    );
    assert.ok(
      expanded.nodes.filter((n) => n.spatial!.showLabel).length >
        normal.nodes.filter((n) => n.spatial!.showLabel).length,
    );
    close([expanded.spatial!.pixelsPerUnit], [normal.spatial!.pixelsPerUnit * 4]);
    const [a, b] = normal.nodes;
    const expectedDistance =
      Math.hypot(
        a.spatial!.coordinates[0] - b.spatial!.coordinates[0],
        a.spatial!.coordinates[1] - b.spatial!.coordinates[1],
      ) * normal.spatial!.pixelsPerUnit;
    close([Math.hypot(a.x - b.x, a.y - b.y)], [expectedDistance]);
    const filtered = buildSpatialStage({
      dag: projectGraphByType(dag, getGraphTypeOptions(dag)[0], "spatial"),
      colorSourceDag: dag,
      spaceView: expanded.spatial!.view,
    });
    for (const node of filtered.nodes)
      close([node.x, node.y], [expanded.nodeMap[node.key].x, expanded.nodeMap[node.key].y]);
    assert.deepEqual(serializeDag(dag), snapshot);
  }),
  defineTest("metadata selects the fifth chart and preferences preserve independent styles", () => {
    const dag = graph(3);
    const state = graphReducer(initialGraphAppState, {
      type: "graphLoaded",
      dag,
      selection: { type: "node", key: "a" },
      fileName: "space.json",
      documentId: "spatial",
      status: "Loaded",
    });
    assert.equal(state.chartType, "spatial");
    assert.deepEqual(state.selection, { type: "full" });
    assert.ok(createChartStyles().spatial);
    assert.equal(parseGraphPagePreferences('{"chartType":"spatial"}')!.chartType, "spatial");
    assert.deepEqual(serializeDag(dag).nodes.a.space, [0, 0, 0]);
  }),
  defineTest("validation rejects wrong dimensions, unsupported systems and invalid coordinates", () => {
    for (const dimension of [-1, 1.5, Infinity, "3", null])
      assert.throws(() => graph(dimension as number), /dimensions|array length/i);
    assert.throws(() => graph(3, "unknown"), /coordinateSystem/);
    assert.throws(() => graph(1, "polar"), /at least 2/);
    assert.throws(() => graph(2, "spherical"), /at least 3/);
    for (const space of [[1, 2], [0, 1, Infinity], [0, "2", 3], 2, null])
      assert.throws(() => graph(3, "cartesian", { a: { space } }), /space/);
    assert.throws(() => graph(3, "spherical", { a: { space: [1, 0, 91] } }), /latitude/);
    assert.throws(() => graph(2, "polar", { a: { space: [-1, 0] } }), /radius/);
    assert.throws(
      () => normalizeDagInput({ format: "graph-studio", version: 3, nodes: { a: { space: [] } }, edges: [] }),
      /metadata.space/,
    );
    const legacy = normalizeDagInput({ format: "graph-studio", version: 3, nodes: { a: { space: 3 } }, edges: [] });
    assert.equal(legacy.nodes.a.space, 3);
  }),
  defineTest("coordinate conversion respects angle units, prefixes, altitude and extra dimensions", () => {
    const metadata = (coordinateSystem: SpaceMetadata["coordinateSystem"], dimensions = 4): SpaceMetadata => ({
      coordinateSystem,
      dimensions,
    });
    close(spaceToCartesian([2, 90, 7, 9], metadata("polar")), [0, 2, 7, 9]);
    close(spaceToCartesian([2, 90, 7, 9], metadata("cylindrical")), [0, 2, 7, 9]);
    close(spaceToCartesian([2, 90, 0, 9], metadata("spherical")), [0, 2, 0, 9]);
    close(spaceToCartesian([2, 0, Math.PI / 2], { ...metadata("spherical", 3), angleUnit: "radians" }), [0, 0, 2]);
    close(spaceToCartesian([0, 90], metadata("geographic", 2)), [0, 0, 6371]);
    close(spaceToCartesian([0, 0, 10, 4], { ...metadata("geographic"), radius: 100 }), [110, 0, 0, 4]);
  }),
  defineTest("globe views keep east right, north up and the central meridian in front without mirroring", () => {
    for (const system of ["spherical", "geographic"] as const) {
      const coordinates = (lon: number, lat: number) => (system === "spherical" ? [1, lon, lat] : [lon, lat]);
      const dag = graph(system === "spherical" ? 3 : 2, system, {
        center: { space: coordinates(0, 0) },
        east: { space: coordinates(45, 0) },
        west: { space: coordinates(-45, 0) },
        north: { space: coordinates(0, 45) },
        south: { space: coordinates(0, -45) },
        farEast: { space: coordinates(90, 0) },
        back: { space: coordinates(180, 0) },
      });
      const view = defaultSpaceView(getSpaceMetadata(dag));
      for (const projection of ["orthographic", "perspective", "map"] as const) {
        const stage = buildSpatialStage({ dag, spaceView: { ...view, projection } });
        const { center, east, west, north, south, back } = stage.nodeMap;
        close([center.x, center.y], [stage.stageWidth / 2, stage.stageHeight / 2]);
        assert.ok(east.x > center.x && west.x < center.x, `${system}/${projection}: east must be right of west`);
        assert.ok(north.y < center.y && south.y > center.y, `${system}/${projection}: north must be above south`);
        if (projection !== "map") {
          assert.ok(center.spatial!.depth > back.spatial!.depth);
          const hidden = buildSpatialStage({ dag, spaceView: { ...view, projection, hideBackPoints: true } });
          assert.ok(hidden.nodeMap.center);
          assert.equal(hidden.nodeMap.back, undefined);
        }
      }
      const eastFacing = buildSpatialStage({ dag, spaceView: { ...view, yaw: -90, hideBackPoints: true } });
      close(
        [eastFacing.nodeMap.farEast.x, eastFacing.nodeMap.farEast.y],
        [eastFacing.stageWidth / 2, eastFacing.stageHeight / 2],
      );
      assert.ok(eastFacing.nodeMap.farEast.spatial!.depth > 0.99);
      assert.ok(eastFacing.nodeMap.east.x < eastFacing.nodeMap.farEast.x);
    }
  }),
  defineTest("0D through 32D stay finite and higher axes visibly change the projection", () => {
    for (const dimensions of [0, 1, 2, 3, 4, 5, 32]) finite(buildSpatialStage({ dag: graph(dimensions) }));
    for (const size of [1e-300, 1e300]) {
      const scaled = buildSpatialStage({
        dag: graph(3, "cartesian", { a: { space: [-size, 0, 0] }, b: { space: [size, size, size] } }),
      });
      finite(scaled);
      assert.ok(Math.abs(scaled.nodeMap.a.x - scaled.nodeMap.b.x) > 100);
    }
    const dag = graph(5, "cartesian", { a: { space: [0, 0, 0, -1, 0] }, b: { space: [0, 0, 0, 1, 0] } });
    const first = buildSpatialStage({ dag });
    assert.equal(first.nodeMap.a.x, first.nodeMap.b.x);
    const projected = buildSpatialStage({
      dag,
      spaceView: { ...defaultSpaceView(getSpaceMetadata(dag)), axes: [3, 1, 2] },
    });
    assert.notEqual(projected.nodeMap.a.x, projected.nodeMap.b.x);
    assert.deepEqual(dag.nodes.a.space, [0, 0, 0, -1, 0]);
  }),
  defineTest("Cartesian positions preserve aspect ratio and disconnected nodes", () => {
    const dag = graph(2, "cartesian", {
      a: { space: [0, 0] },
      b: { space: [1, 0] },
      c: { space: [0, 2] },
      d: { space: [0, 0] },
    });
    const stage = buildSpatialStage({ dag });
    assert.equal(stage.nodes.length, 4);
    assert.ok(Math.abs((stage.nodeMap.a.y - stage.nodeMap.c.y) / (stage.nodeMap.b.x - stage.nodeMap.a.x) - 2) < 1e-10);
    assert.equal(stage.nodeMap.a.x, stage.nodeMap.d.x);
  }),
  defineTest("Type filtering preserves colors, positions and original edge semantics", () => {
    const dag = normalizeDagInput({
      ...serializeDag(
        graph(3, "cartesian", {
          a: { type: "Keep", space: [0, 0, 0] },
          b: { type: "Hide", space: [50, 30, 5] },
          c: { type: "Keep", space: [10, 0, 0] },
        }),
      ),
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
      ],
    });
    const before = buildSpatialStage({ dag });
    const filtered = projectGraphByType(dag, "Keep", "spatial");
    assert.equal(filtered.edges.length, 0);
    const after = buildSpatialStage({ dag: filtered, colorSourceDag: dag });
    assert.equal(before.nodeMap.c.x, after.nodeMap.c.x);
    assert.equal(before.nodeMap.a.spatial!.color, after.nodeMap.a.spatial!.color);
  }),
  defineTest("map seam edges split and never draw a false cross-map chord", () => {
    const dag = normalizeDagInput({
      ...serializeDag(graph(2, "geographic", { a: { space: [179, 5] }, b: { space: [-179, 10] } })),
      edges: [{ id: "ab", source: "a", target: "b" }],
    });
    const stage = buildSpatialStage({
      dag,
      spaceView: { ...defaultSpaceView(getSpaceMetadata(dag)), projection: "map" },
    });
    assert.equal((stage.edges[0].path.match(/M/g) ?? []).length, 2);
    finite(stage);
    for (const projection of ["orthographic", "perspective"] as const)
      finite(
        buildSpatialStage({
          dag,
          spaceView: { ...defaultSpaceView(getSpaceMetadata(dag)), projection, yaw: 70, pitch: 30 },
        }),
      );
  }),
  defineTest("hiding sphere backs follows rotation, removes incident edges and preserves source data and scale", () => {
    const dag = normalizeDagInput({
      ...serializeDag(
        graph(3, "spherical", {
          front: { space: [1, 0, 0], type: "Keep" },
          back: { space: [1, 180, 0], type: "Keep" },
          frontNorth: { space: [1, 0, 45], type: "Keep" },
          limb: { space: [1, 90, 0], type: "Other" },
          missing: {},
        }),
      ),
      edges: [
        { id: "visible", source: "front", target: "frontNorth" },
        { id: "hidden", source: "front", target: "back" },
      ],
    });
    const original = serializeDag(dag);
    const all = buildSpatialStage({ dag });
    const view = { ...defaultSpaceView(getSpaceMetadata(dag)), hideBackPoints: true };
    const front = buildSpatialStage({ dag, spaceView: view });
    assert.equal(all.nodes.length, 5);
    assert.deepEqual(front.nodes.map((n) => n.key).sort(), ["front", "frontNorth", "limb", "missing"]);
    assert.deepEqual(
      front.edges.map((e) => e.id),
      ["visible"],
    );
    assert.equal(front.nodeMap.front.x, all.nodeMap.front.x);
    assert.equal(front.nodeMap.front.y, all.nodeMap.front.y);
    assert.equal(front.nodeMap.front.spatial!.color, all.nodeMap.front.spatial!.color);
    assert.equal(front.stageWidth, all.stageWidth);
    assert.equal(front.stageHeight, all.stageHeight);
    assert.deepEqual([...front.connectedKeysByNode.get("front")!], ["frontNorth"]);
    const reversed = buildSpatialStage({ dag, spaceView: { ...view, yaw: 180 } });
    assert.ok(reversed.nodeMap.back);
    assert.equal(reversed.nodeMap.front, undefined);
    assert.equal(reversed.nodeMap.frontNorth, undefined);
    const filtered = buildSpatialStage({
      dag: projectGraphByType(dag, "Keep", "spatial"),
      colorSourceDag: dag,
      spaceView: view,
    });
    assert.deepEqual(filtered.nodes.map((n) => n.key).sort(), ["front", "frontNorth"]);
    assert.equal(filtered.nodeMap.front.x, front.nodeMap.front.x);
    assert.deepEqual(serializeDag(dag), original);
    const map = buildSpatialStage({ dag, spaceView: { ...view, projection: "map" } });
    assert.equal(map.nodes.length, all.nodes.length);
    assert.equal(map.edges.length, all.edges.length);
    finite(front);
    finite(reversed);
  }),
  defineTest("sphere hiding respects perspective tangency and keeps the origin and near points", () => {
    const dag = graph(3, "spherical", {
      front: { space: [1, 0, 0] },
      nearLimb: { space: [1, 80, 0] },
      tangent: { space: [1, (Math.acos(1 / 3) * 180) / Math.PI, 0] },
      inner: { space: [0.1, 0, 0] },
      origin: { space: [0, 0, 0] },
      back: { space: [1, 180, 0] },
    });
    const view = { ...defaultSpaceView(getSpaceMetadata(dag)), hideBackPoints: true };
    assert.ok(buildSpatialStage({ dag, spaceView: view }).nodeMap.nearLimb);
    const perspective = buildSpatialStage({ dag, spaceView: { ...view, projection: "perspective" } });
    assert.deepEqual(perspective.nodes.map((n) => n.key).sort(), ["front", "inner", "origin", "tangent"]);
    finite(perspective);
  }),
  defineTest("geographic back points respond to tilt while other coordinate systems remain unchanged", () => {
    const dag = graph(2, "geographic", { north: { space: [0, 90] }, south: { space: [0, -90] } });
    const view = { ...defaultSpaceView(getSpaceMetadata(dag)), hideBackPoints: true };
    assert.deepEqual(
      buildSpatialStage({ dag, spaceView: { ...view, pitch: 90 } }).nodes.map((n) => n.key),
      ["north"],
    );
    assert.deepEqual(
      buildSpatialStage({ dag, spaceView: { ...view, pitch: -90 } }).nodes.map((n) => n.key),
      ["south"],
    );
    const cartesian = graph(3, "cartesian", { a: { space: [0, 0, -1] }, b: { space: [0, 0, 1] } });
    assert.equal(
      buildSpatialStage({
        dag: cartesian,
        spaceView: { ...defaultSpaceView(getSpaceMetadata(cartesian)), hideBackPoints: true },
      }).nodes.length,
      2,
    );
  }),
  defineTest("missing positions stay inspectable and coordinate edits validate before committing", () => {
    const dag = graph(2, "cartesian", { a: {}, b: { space: [2, 3] } });
    const stage = buildSpatialStage({ dag });
    assert.equal(stage.nodes.length, 2);
    assert.match(stage.warnings.join(" "), /unpositioned/);
    finite(stage);
    const edited = applyGraphCommand(dag, { type: "updateNodeFields", key: "a", fields: { space: [8, 9] } }).dag;
    assert.deepEqual(edited.nodes.a.space, [8, 9]);
    assert.equal(dag.nodes.a.space, undefined);
    assert.throws(
      () => applyGraphCommand(edited, { type: "updateNodeFields", key: "a", fields: { space: [1] } }),
      /exactly 2/,
    );
    assert.deepEqual(applyGraphCommand(edited, { type: "addNode", key: "c" }).dag.nodes.c.space, [0, 0]);
  }),
  defineTest("SVG output has accessible coordinate nodes and custom guides", () => {
    const stage = buildSpatialStage({ dag: graph(2) });
    const noop = () => {};
    const html = renderToStaticMarkup(
      createElement(GraphStage, {
        stage,
        appearance: DEFAULT_GRAPH_APPEARANCE,
        svgRef: createRef<SVGSVGElement>(),
        focusedKey: null,
        hideNodeBorders: false,
        onNodeClick: noop,
        onNodeDoubleClick: noop,
        onNodeContextMenu: noop,
        onBackgroundContextMenu: noop,
        onFocusChange: noop,
      }),
    );
    assert.match(html, /data-layout="spatial"/);
    assert.match(html, /spatial-guides/);
    assert.match(html, /role="button"/);
    assert.match(html, /\[0, 0\]/);
  }),
  defineTest("Spatial Atlas contains complete sky coverage and sourced city and metro networks", async () => {
    const read = async (name: string) =>
      normalizeDagInput(JSON.parse(await readFile(`public/examples/spatial-atlas/${name}.json`, "utf8")));
    const sky = await read("all-sky");
    assert.equal(Object.keys(sky.nodes).length, 5047);
    assert.equal(new Set(Object.values(sky.nodes).map((n) => n.type)).size, 88);
    const declinations = Object.values(sky.nodes).map((n) => (n.space as number[])[2]);
    assert.ok(Math.min(...declinations) < -85 && Math.max(...declinations) > 85);
    for (const name of ["all-sky", "world-cities", "beijing-metro", "shanghai-metro"]) {
      const dag = await read(name);
      finite(buildSpatialStage({ dag }));
      assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
    }
    const cities = await read("world-cities");
    assert.equal(Object.keys(cities.nodes).length, 8097);
    assert.equal(getSpaceMetadata(cities)!.coordinateSystem, "spherical");
    assert.ok(
      Object.values(cities.nodes).every(
        (n) => (n.space as number[]).length === 3 && (n.space as number[])[0] === 6371 && n.name_native,
      ),
    );
    const city = (name: string) => Object.values(cities.nodes).find((n) => n.name_en === name)!;
    assert.equal(city("Beijing").title, "北京");
    assert.equal(city("Moscow").title, "Москва");
    assert.equal(city("Athens").title, "Αθήνα");
    assert.equal(city("Bengaluru").title, "ಬೆಂಗಳೂರು");
    assert.match(city("Tokyo").title as string, /東京/);
    assert.ok(cities.edges.every((e) => e.metadata?.isTransportRoute === false));
    const metro = await read("beijing-metro");
    assert.equal(Object.keys(metro.nodes).length, 423);
    assert.ok(Object.values(metro.nodes).every((n) => n.coordinateReference === "WGS84 / EPSG:4326"));
  }),
  defineTest("Shanghai keeps sourced coordinates, all services, real branches and distinct station sites", async () => {
    const raw = JSON.parse(await readFile("public/examples/spatial-atlas/shanghai-metro.json", "utf8"));
    const snapshot = JSON.parse(await readFile("scripts/shanghai-metro-source.json", "utf8"));
    const dag = normalizeDagInput(raw);
    assert.equal(Object.keys(dag.nodes).length, 418);
    assert.equal(dag.edges.length, 512);
    assert.equal(getGraphTypeOptions(dag).length, 21);
    const key = (name: string) => `station:${name}`;
    for (const node of Object.values(dag.nodes)) {
      const point = snapshot.stations[node.stationId as string];
      assert.deepEqual(node.space, [point.longitude, point.latitude]);
      assert.equal(node.coordinateSource, point.source);
      assert.equal(node.coordinateSourceVersion, point.osmVersion);
      assert.equal(node.coordinateReference, "WGS84 / EPSG:4326");
      assert.match(node.coordinateSource as string, /^https:\/\/www.openstreetmap.org\/node\/\d+$/);
    }
    for (const line of raw.metadata.lines) {
      const selected = projectGraphByType(dag, line.name, "spatial");
      assert.equal(Object.keys(selected.nodes).length, line.stationCount);
      assert.deepEqual(new Set(selected.edges.map((edge) => edge.id)), new Set(line.edgeIds));
      const adjacency = new Map<string, Set<string>>(line.stationKeys.map((id: string) => [id, new Set<string>()]));
      for (const edge of selected.edges) {
        assert.equal(edge.metadata?.line, line.name);
        adjacency.get(edge.source)!.add(edge.target);
        adjacency.get(edge.target)!.add(edge.source);
      }
      const visited = new Set<string>();
      const visit = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        adjacency.get(id)!.forEach(visit);
      };
      visit(line.stationKeys[0]);
      assert.equal(visited.size, line.stationCount, `disconnected ${line.name}`);
      const junction = { "5号线": "东川路", "10号线": "龙溪路", "11号线": "嘉定新城" }[line.name as string];
      if (junction) {
        assert.equal(adjacency.get(key(junction))!.size, 3);
        assert.equal([...adjacency.values()].filter((neighbors) => neighbors.size === 1).length, 3);
      } else if (line.name === "4号线") {
        assert.equal(selected.edges.length, 26);
        assert.ok([...adjacency.values()].every((neighbors) => neighbors.size === 2));
      } else {
        assert.equal(selected.edges.length, line.stationCount - 1);
      }
    }
    for (const name of ["康文路", "蟠祥路·国家会计学院", "西岑", "康恒路", "花桥", "奉贤新城", "滴水湖", "三林南"])
      assert.ok(dag.nodes[key(name)], `missing operating stop ${name}`);
    for (const name of ["江杨南路", "浦东3号航站楼", "上海东站"]) assert.equal(dag.nodes[key(name)], undefined);
    for (const sites of raw.metadata.separateStationSites) {
      const [a, b] = sites.stationKeys.map((id: string) => dag.nodes[id]);
      assert.notDeepEqual(a.space, b.space);
      assert.equal((a.lines as string[]).length, 1);
      assert.equal((b.lines as string[]).length, 1);
    }
    const stage = buildSpatialStage({ dag });
    const expanded = buildSpatialStage({
      dag,
      spaceView: { ...defaultSpaceView(getSpaceMetadata(dag)), unitScale: 4 },
    });
    for (const name of ["花桥", "西岑", "滴水湖", "奉贤新城"]) {
      const before = stage.nodeMap[key(name)],
        after = expanded.nodeMap[key(name)];
      close([after.x, after.y], [before.x * 4, before.y * 4]);
      assert.equal(after.spatial!.radius, before.spatial!.radius);
    }
    const manifest = JSON.parse(await readFile("public/examples/spatial-atlas/graph-studio.workspace.json", "utf8"));
    assert.deepEqual(manifest.graphs, [
      "all-sky.json",
      "world-cities.json",
      "beijing-metro.json",
      "shanghai-metro.json",
    ]);
  }),
  defineTest("world cities retain every global source capital, including small regional seats", async () => {
    const dag = normalizeDagInput(
      JSON.parse(await readFile("public/examples/spatial-atlas/world-cities.json", "utf8")),
    );
    const snapshot = JSON.parse(await readFile("scripts/world-cities-source.json", "utf8"));
    const nodes = Object.values(dag.nodes);
    const ids = new Set(nodes.map((n) => n.geonamesId));
    assert.equal(snapshot.capitalIds.length, 3708);
    for (const id of snapshot.capitalIds) assert.ok(ids.has(id), `omitted global capital ${id}`);
    const capitals = nodes.filter((n) => n.featureCode === "PPLA" || n.featureCode === "PPLC");
    for (const [country, count] of Object.entries({ US: 51, JP: 47, DE: 16, BR: 27, AU: 8, CA: 14, CN: 31, CH: 26 }))
      assert.equal(capitals.filter((n) => n.countryCode === country).length, count, country);
    const usStates = capitals.filter((n) => n.countryCode === "US" && n.featureCode === "PPLA");
    assert.equal(new Set(usStates.map((n) => n.admin1Code)).size, 50);
    const japan = capitals.filter((n) => n.countryCode === "JP");
    assert.equal(new Set(japan.map((n) => n.admin1Code)).size, 47);
    for (const name of ["Montpelier", "Iqaluit", "Schwerin", "Kavaratti"])
      assert.ok(
        capitals.some((n) => n.name_en === name && Number(n.population) < 100000),
        name,
      );
    assert.equal(new Set(nodes.map((n) => n.countryCode)).size, 245);
    for (const [name, title] of [
      ["Munich", "München"],
      ["Chennai", "சென்னை"],
      ["Thiruvananthapuram", "തിരുവനന്തപുരം"],
    ])
      assert.equal(nodes.find((n) => n.name_en === name)?.title, title);
  }),
  defineTest("city economic size and intensity stay comparable after geographic filtering", async () => {
    const dag = normalizeDagInput(
      JSON.parse(await readFile("public/examples/spatial-atlas/world-cities.json", "utf8")),
    );
    const stage = buildSpatialStage({ dag });
    const nodes = Object.values(dag.nodes);
    const measured = nodes
      .filter((n) => (n.economy as { gdpPpp2020: number | null }).gdpPpp2020 !== null)
      .sort(
        (a, b) => (a.economy as { gdpPpp2020: number }).gdpPpp2020 - (b.economy as { gdpPpp2020: number }).gdpPpp2020,
      );
    assert.equal(measured.length, 5870);
    let radius = 0,
      opacity = 0;
    for (const n of measured) {
      const point = stage.nodeMap[n.key].spatial!;
      assert.ok(point.radius >= radius && point.opacity! >= opacity);
      assert.ok(!point.hollow);
      radius = point.radius;
      opacity = point.opacity!;
      assert.equal((n.economy as { year: number }).year, 2020);
    }
    const missing = nodes.filter((n) => (n.economy as { gdpPpp2020: number | null }).gdpPpp2020 === null);
    assert.equal(missing.length, 2227);
    for (const n of missing) {
      assert.equal(stage.nodeMap[n.key].spatial!.hollow, true);
      assert.equal(stage.nodeMap[n.key].spatial!.radius, 2.1);
    }
    const raw = serializeDag(dag);
    const filtered = normalizeDagInput({
      ...raw,
      nodes: Object.fromEntries(Object.entries(raw.nodes).filter(([, n]) => n.type === "Asia")),
    });
    const regional = buildSpatialStage({ dag: filtered, colorSourceDag: dag });
    for (const n of regional.nodes) {
      const before = stage.nodeMap[n.key].spatial!;
      assert.equal(n.spatial!.radius, before.radius);
      assert.equal(n.spatial!.opacity, before.opacity);
      assert.equal(n.spatial!.color, before.color);
    }
    assert.deepEqual(
      stage.spatial!.legend!.items.map((item) => item.label),
      ["100M", "10B", "1T+", "Unavailable"],
    );
    assert.equal(stage.spatial!.legend!.items[3].hollow, true);
    const asiaView = buildSpatialStage({
      dag,
      spaceView: { ...defaultSpaceView(getSpaceMetadata(dag)), yaw: -110, hideBackPoints: true },
    });
    const beijing = nodes.find((n) => n.name_en === "Beijing")!;
    assert.equal(asiaView.nodeMap[beijing.key].spatial!.showLabel, true);
  }),
  defineTest("Beijing metro covers every service route, current openings, closures and transfer links", async () => {
    const dag = normalizeDagInput(
      JSON.parse(await readFile("public/examples/spatial-atlas/beijing-metro.json", "utf8")),
    );
    const expected: Record<string, number> = {
      "1号线八通线": 35,
      "2号线": 18,
      "3号线": 10,
      "4号线大兴线": 35,
      "5号线": 23,
      "6号线": 36,
      "7号线": 30,
      "8号线": 35,
      "9号线": 13,
      "10号线": 45,
      "11号线": 4,
      "12号线": 20,
      "13号线": 17,
      "14号线": 33,
      "15号线": 20,
      "16号线": 30,
      "17号线": 20,
      "18号线": 11,
      "19号线": 10,
      S1线: 8,
      西郊线: 6,
      房山线: 16,
      昌平线: 20,
      亦庄线: 14,
      燕房线: 9,
      首都机场线: 5,
      大兴机场线: 3,
      亦庄T1线: 14,
    };
    assert.equal(dag.metadata?.asOf, "2026-10-22");
    assert.equal(new Set(Object.values(dag.nodes).map((n) => n.stationId)).size, 423);
    assert.deepEqual(new Set(getGraphTypeOptions(dag)), new Set(Object.keys(expected)));
    for (const [line, count] of Object.entries(expected)) {
      const filtered = projectGraphByType(dag, line, "spatial");
      assert.equal(Object.keys(filtered.nodes).length, count, line);
      assert.ok(filtered.edges.every((e) => e.metadata?.kind === "rail" && e.metadata.line === line));
      const ring = line === "2号线" || line === "10号线" || line === "首都机场线";
      assert.equal(filtered.edges.length, ring ? count : count - 1, line);
      // Every line must stay connected after filtering, including its interchange stops.
      const seen = new Set<string>();
      const stack = [Object.keys(filtered.nodes)[0]];
      while (stack.length) {
        const key = stack.pop()!;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const e of filtered.edges) {
          if (e.source === key) stack.push(e.target);
          if (e.target === key) stack.push(e.source);
        }
      }
      assert.equal(seen.size, count, line);
    }
    const station = (line: string, name: string) =>
      Object.values(dag.nodes).find((n) => Array.isArray(n.lines) && n.lines.includes(line) && n.title === name);
    for (const [line, name] of [
      ["6号线", "通运门"],
      ["6号线", "潞阳"],
      ["17号线", "望京西"],
      ["17号线", "永安里"],
      ["18号线", "天通苑东"],
      ["1号线八通线", "木樨地"],
      ["12号线", "大钟寺"],
      ["13号线", "大钟寺"],
    ])
      assert.ok(station(line, name), `${line} ${name}`);
    for (const [line, name] of [
      ["1号线八通线", "八角游乐园"],
      ["14号线", "陶然桥"],
      ["14号线", "高家园"],
      ["17号线", "广渠门外"],
      ["亦庄T1线", "老观里"],
    ])
      assert.equal(station(line, name), undefined);
    assert.ok(station("7号线", "广渠门外"));
    assert.ok(station("12号线", "高家园"));
    const airport = dag.edges.filter((e) => e.metadata?.direction === "forward");
    assert.deepEqual(
      airport.map((e) => [dag.nodes[e.source].title, dag.nodes[e.target].title]),
      [
        ["三元桥", "3号航站楼"],
        ["3号航站楼", "2号航站楼"],
        ["2号航站楼", "三元桥"],
      ],
    );
    const stations = Object.values(dag.nodes);
    const interchanges = stations.filter((n) => (n.lines as string[]).length > 1);
    assert.equal(interchanges.length, 106);
    assert.deepEqual(
      new Set(stations.filter((n) => n.transferMode === "out-of-station").map((n) => n.title)),
      new Set(["木樨地", "大钟寺", "巴沟", "荣昌东街"]),
    );
    const coordinates = JSON.parse(await readFile("scripts/beijing-metro-coordinates.json", "utf8"));
    for (const node of stations) {
      const point = coordinates.stations[node.title as string];
      assert.deepEqual(
        node.space,
        [point.longitude, point.latitude],
        `${node.title}: source coordinates must not be moved`,
      );
      assert.equal(node.coordinateSource, point.source);
    }
    assert.equal(new Set(stations.map((n) => n.stationId)).size, stations.length);
    const stage = buildSpatialStage({ dag });
    assert.equal(stage.edges.length, 515);
    assert.ok(stage.edges.every((e) => e.spatial && /^#[0-9A-F]{6}$/i.test(e.spatial.color)));
    assert.equal(stage.edges.filter((e) => e.spatial?.directed).length, 3);
    assert.equal(
      stage.edges.filter((e) => e.spatial?.dashed).length,
      3,
      "Both overlapping service colors stay visible",
    );
    assert.equal(stage.nodeMap[station("1号线八通线", "古城")!.key].spatial!.color, "#C23A30");
    const bounds = stage.spatial!.fitBounds!;
    assert.ok(bounds.width < stage.stageWidth * 0.8 && bounds.height < stage.stageHeight * 0.8);
    for (const node of stage.nodes) {
      assert.ok(node.x >= bounds.x && node.x <= bounds.x + bounds.width);
      assert.ok(node.y >= bounds.y && node.y <= bounds.y + bounds.height);
    }
    // Parallel services sharing two consecutive interchange stations must not leak
    // into the selected line (Line 13/Changping and Line 1/Line 7).
    for (const line of ["13号线", "昌平线", "1号线八通线", "7号线"]) {
      const filtered = projectGraphByType(dag, line, "spatial");
      assert.ok(filtered.edges.every((e) => e.metadata?.line === line));
      assert.ok(buildSpatialStage({ dag: filtered, colorSourceDag: dag }).edges.every((e) => !e.spatial?.dashed));
    }
    finite(stage);
  }),
]);
