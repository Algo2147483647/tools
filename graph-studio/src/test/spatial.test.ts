import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGraphCommand } from "../graph/commands";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { defaultSpaceView, getSpaceMetadata, spaceToCartesian, type SpaceMetadata } from "../graph/space";
import { projectGraphByType } from "../graph/typeFilter";
import { buildSpatialStage } from "../layout/spatial-layout";
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
          front: { space: [1, 90, 0], type: "Keep" },
          back: { space: [1, -90, 0], type: "Keep" },
          frontNorth: { space: [1, 90, 45], type: "Keep" },
          limb: { space: [1, 180, 0], type: "Other" },
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
      front: { space: [1, 90, 0] },
      nearLimb: { space: [1, 10, 0] },
      tangent: { space: [1, (Math.asin(1 / 3) * 180) / Math.PI, 0] },
      inner: { space: [0.1, 90, 0] },
      origin: { space: [0, 0, 0] },
      back: { space: [1, -90, 0] },
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
  defineTest("Spatial Atlas contains complete sky coverage and sourced city and road samples", async () => {
    const read = async (name: string) =>
      normalizeDagInput(JSON.parse(await readFile(`public/examples/spatial-atlas/${name}.json`, "utf8")));
    const sky = await read("all-sky");
    assert.equal(Object.keys(sky.nodes).length, 5047);
    assert.equal(new Set(Object.values(sky.nodes).map((n) => n.type)).size, 88);
    const declinations = Object.values(sky.nodes).map((n) => (n.space as number[])[2]);
    assert.ok(Math.min(...declinations) < -85 && Math.max(...declinations) > 85);
    for (const name of [
      "all-sky",
      "world-cities",
      "beijing-roads",
      "zero-dimensional",
      "one-dimensional",
      "polar",
      "cylindrical",
      "four-dimensional",
      "five-dimensional",
    ]) {
      const dag = await read(name);
      finite(buildSpatialStage({ dag }));
      assert.deepEqual(normalizeDagInput(serializeDag(dag)), dag);
    }
    const cities = await read("world-cities");
    assert.equal(Object.keys(cities.nodes).length, 243);
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
    const roads = await read("beijing-roads");
    assert.ok(roads.edges.length > 4000);
    assert.ok(Object.values(roads.nodes).every((n) => Array.isArray(n.sourceXY)));
  }),
]);
