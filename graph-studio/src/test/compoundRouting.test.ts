import { crossingCost, parallelRouteCost, sharedEndpoints } from "../layout/compound/routing/cost";
import { diagnoseRoutes } from "../layout/compound/routing/diagnostics";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { projectCompoundGraph } from "../graph/compound/projection";
import { normalizeDagInput } from "../graph/normalize";
import { routingHotspots } from "../layout/compound/diagnostics";
import {
  measureLayout,
  scoreLayoutMetrics,
  segmentCrossesBox,
  validateLayoutGeometry,
} from "../layout/compound/layout-quality";
import { routeCompoundEdges } from "../layout/compound/routing/router";
import { layoutFixture } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";
import { groupTitleObstacles, layoutGroupTitle, measureGroupTitle } from "../layout/shared/group-title";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupHeader } from "../components/canvas/GraphGroup";

export const compoundRoutingSuite = defineSuite("Compound routing clearance", [
  defineTest(
    "automatic routing crosses blank north boundary and controls while avoiding each rendered title line",
    () => {
      const dag = normalizeDagInput({
        format: "graph-studio",
        version: 3,
        nodes: { g: { title: "Long first line\nShort" }, child: {}, outside: {} },
        edges: [{ id: "e", source: "outside", target: "child" }],
        hierarchy_edges: [{ id: "h", source: "g", target: "child" }],
      });
      const projection = projectCompoundGraph(dag, { collapsedGroupIds: [], focusGroupId: null });
      const group = projection.items.find((i) => i.id === "g")!;
      group.titleMetrics = measureGroupTitle(group.title);
      const bounds = { x: 0, y: 0, width: 700, height: 600 };
      const boxes = new Map([
        ["g", { x: 100, y: 150, width: 440, height: 350 }],
        ["outside", { x: 450, y: 30, width: 80, height: 60 }],
        ["child", { x: 450, y: 260, width: 80, height: 60 }],
      ]);
      const run = () => routeCompoundEdges(projection, boxes, bounds, false).routes.get(projection.edges[0].id)!.points;
      assert.deepEqual(
        run(),
        [
          { x: 490, y: 90 },
          { x: 490, y: 260 },
        ],
        "the straight route may cross the header controls without a gateway",
      );
      boxes.set("outside", { ...boxes.get("outside")!, x: 100 });
      boxes.set("child", { ...boxes.get("child")!, x: 100 });
      const points = run();
      const obstacles = groupTitleObstacles(group, boxes.get("g")!);
      assert.equal(obstacles.length, 2);
      assert.ok(obstacles[1].width < obstacles[0].width);
      for (let i = 1; i < points.length; i++)
        for (const box of obstacles) assert.ok(!segmentCrossesBox(points[i - 1], points[i], box));
      assert.notDeepEqual(points, [
        { x: 140, y: 90 },
        { x: 140, y: 260 },
      ]);
      const markup = renderToStaticMarkup(
        createElement(GroupHeader, { group: { ...group, ...boxes.get("g")!, colorFamilyIndex: 0 }, showStats: false }),
      );
      for (const line of layoutGroupTitle(group.title, 440, group.titleMetrics)) {
        assert.ok(markup.includes(`x="${100 + line.x}" y="${150 + line.baseline}"`));
        assert.ok(markup.includes(line.text));
      }
    },
  ),
  defineTest("common endpoints and short exits are free, remote overlaps and unrelated crossings are scored", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const b = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 100 },
    ];
    const shared = sharedEndpoints({ source: "hub", target: "a" }, a, { source: "hub", target: "b" }, b);
    assert.equal(parallelRouteCost(a[0], a[1], b, shared), 0);
    assert.equal(crossingCost(a[0], a[1], b, shared), 0);
    assert.ok(parallelRouteCost(a[0], a[1], a, shared) > 0, "long shared runs remain costly");
    assert.ok(
      crossingCost(
        a[0],
        a[1],
        [
          { x: 50, y: -20 },
          { x: 50, y: 20 },
        ],
        shared,
      ) > 0,
    );
    assert.ok(crossingCost(a[0], a[1], b) > 0, "unrelated endpoint touches still count");
    assert.deepEqual(sharedEndpoints({ source: "one", target: "a" }, a, { source: "two", target: "b" }, b), []);
  }),
  defineTest("fan-out reuses midpoint ports without moving nodes or depending on input order", () => {
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
    assert.ok(new Set(ports).size < 4, "outgoing relationships may share an attachment");
    assert.ok(!diagnoseRoutes(projection, boxes, routes).some((i) => i.kind === "port-congestion"));
    for (const route of routes.values())
      for (let i = 1; i < route.points.length; i++)
        for (const box of boxes.values()) assert.ok(!segmentCrossesBox(route.points[i - 1], route.points[i], box));
    assert.deepEqual(boxes, before);
    const centered = routeCompoundEdges(projection, boxes, bounds, false, { portMode: "midpoints" }).routes;
    for (const edge of projection.edges) {
      const route = centered.get(edge.id)!;
      for (const [id, point] of [
        [edge.source, route.points[0]],
        [edge.target, route.points.at(-1)!],
      ] as const) {
        const box = boxes.get(id)!;
        const midpoints = [
          [box.x, box.y + box.height / 2],
          [box.x + box.width, box.y + box.height / 2],
          [box.x + box.width / 2, box.y],
          [box.x + box.width / 2, box.y + box.height],
        ];
        assert.ok(midpoints.some(([x, y]) => point.x === x && point.y === y));
      }
    }
    assert.deepEqual(centered, routes, "midpoints are the default");
    assert.deepEqual(
      routeCompoundEdges({ ...projection, edges: [...projection.edges].reverse() }, boxes, bounds, false).routes,
      routes,
    );
  }),
  defineTest(
    "Commerce routing balances the combined score and avoids unrelated groups with fixed rectangles",
    async () => {
      const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
      const problem = (await layoutFixture(dag)).compoundLayout!;
      const metrics = measureLayout(problem, problem.baseline);
      const hotspots = routingHotspots(problem);
      assert.ok(validateLayoutGeometry(problem, problem.baseline).valid);
      // Reusable midpoints may trade some crossings/overlap for shorter routes. Bound the
      // combined objective rather than reinstating either metric as a hard constraint.
      assert.ok(scoreLayoutMetrics(metrics) < 38000, `routing score: ${scoreLayoutMetrics(metrics)}`);
      assert.ok(metrics.length < 26000, `route length: ${metrics.length}`);
      assert.equal(hotspots.crowdedPorts.length, 0);
      assert.equal(hotspots.containerPassages.length, 0);
      const fixed = new Map(Object.entries(problem.baseline.routes));
      const rerouted = routeCompoundEdges(
        problem.projection,
        new Map(Object.entries(problem.baseline.boxes)),
        { x: 0, y: 0, width: problem.baseline.width, height: problem.baseline.height },
        false,
        { fixedRoutes: fixed },
      );
      assert.deepEqual(rerouted.routes, fixed, "out-of-scope paths keep their geometry");
    },
  ),
]);
