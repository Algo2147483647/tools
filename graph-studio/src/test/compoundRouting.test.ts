import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { projectCompoundGraph } from "../graph/compound/projection";
import { routeCompoundEdges } from "../layout/compound/routing/router";
import { measureLayout, validateLayoutGeometry, segmentCrossesBox } from "../layout/compound/layout-quality";
import { routingHotspots } from "../ai/layout/compoundDiagnostics";
import { layoutFixture } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";

export const compoundRoutingSuite = defineSuite("Compound routing clearance", [
  defineTest("fan-out uses separate ports without moving nodes or depending on input order", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { source: {}, a: {}, b: {}, c: {}, d: {} },
      edges: ["a", "b", "c", "d"].map((target) => ({ id: target, source: "source", target })),
    });
    const projection = projectCompoundGraph(dag, { collapsedGroupIds: [], focusGroupId: null });
    const boxes = new Map([
      ["source", { x: 80, y: 220, width: 160, height: 100 }],
      ...["a", "b", "c", "d"].map((id, i) => [id, { x: 600, y: 60 + i * 130, width: 160, height: 100 }] as const),
    ]);
    const before = structuredClone(boxes);
    const bounds = { x: 0, y: 0, width: 850, height: 600 };
    const routes = routeCompoundEdges(projection, boxes, bounds, false).routes;
    const ports = [...routes.values()].map((route) => JSON.stringify(route.points[0]));
    assert.equal(new Set(ports).size, 4, "each outgoing relationship has a distinct attachment");
    for (const route of routes.values())
      for (let i = 1; i < route.points.length; i++)
        for (const box of boxes.values()) assert.ok(!segmentCrossesBox(route.points[i - 1], route.points[i], box));
    assert.deepEqual(boxes, before);
    assert.deepEqual(
      routeCompoundEdges({ ...projection, edges: [...projection.edges].reverse() }, boxes, bounds, false).routes,
      routes,
    );
  }),
  defineTest("Commerce routing separates shared runs and avoids unrelated groups with fixed rectangles", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    const problem = (await layoutFixture(dag)).compoundLayout!;
    const metrics = measureLayout(problem, problem.baseline);
    const hotspots = routingHotspots(problem);
    assert.ok(validateLayoutGeometry(problem, problem.baseline).valid);
    assert.ok(metrics.crossings <= 35, `crossings: ${metrics.crossings}`);
    assert.ok(metrics.sharedLength <= 80, `shared length: ${metrics.sharedLength}`);
    assert.equal(hotspots.crowdedPorts.length, 0);
    assert.equal(hotspots.containerPassages.length, 0);
    assert.equal(hotspots.detours.length, 0);
    const fixed = new Map(Object.entries(problem.baseline.routes));
    const rerouted = routeCompoundEdges(
      problem.projection,
      new Map(Object.entries(problem.baseline.boxes)),
      { x: 0, y: 0, width: problem.baseline.width, height: problem.baseline.height },
      false,
      { fixedRoutes: fixed },
    );
    assert.deepEqual(rerouted.routes, fixed, "out-of-scope paths keep their geometry");
  }),
]);
