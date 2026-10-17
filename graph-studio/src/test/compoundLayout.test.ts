import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GraphStage from "../rendering/GraphStage";
import ELK from "elkjs/lib/elk.bundled.js";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { projectCompoundGraph } from "../graph/compoundProjection";
import type { CompoundView, GraphDocument, NormalizedDag } from "../graph/types";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getStageAppearance } from "../layout/appearance";
import { buildCompoundStage } from "../layout/compound-layout";
import type { StageData } from "../layout/types";
import { shortenCompoundRoutes } from "../layout/compound-orthogonal-router";
import { defineSuite, defineTest } from "./harness";

export function nestedChainFixture(): NormalizedDag {
  const nodes: GraphDocument["nodes"] = {};
  const edges: GraphDocument["edges"] = [];
  const groups: NonNullable<GraphDocument["hierarchy"]>["groups"] = {};
  const parentById: Record<string, string> = {};
  for (let system = 0; system < 3; system++) {
    groups[`system-${system}`] = { title: `System ${system}` };
    for (let step = 0; step < 5; step++) {
      const id = `s${system}-${step}`;
      nodes[id] = { title: `Step ${step}` };
      parentById[id] = `system-${system}`;
      if (step) edges.push({ id: `flow-${id}`, source: `s${system}-${step - 1}`, target: id });
    }
    if (system) edges.push({ id: `call-${system}`, source: `s${system - 1}-4`, target: `s${system}-0` });
  }
  return normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes,
    edges,
    hierarchy: { id: "systems", groups, parentById },
  });
}

export async function layoutFixture(
  dag: NormalizedDag,
  view: CompoundView = { collapsedGroupIds: [], focusGroupId: null },
  showEdgeLabels = false,
  showNodeDetail = true,
  appearance = getStageAppearance(DEFAULT_GRAPH_APPEARANCE),
) {
  return buildCompoundStage(
    {
      dag,
      view,
      showEdgeLabels,
      appearance,
      showNodeDetail,
      alignNodeWidthsToMax: false,
    },
    new ELK(),
  );
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const epsilon = 0.02;
function assertSideMidpoint(point: { x: number; y: number }, box: Rect) {
  const midpoints = [
    { x: box.x + box.width / 2, y: box.y },
    { x: box.x + box.width / 2, y: box.y + box.height },
    { x: box.x, y: box.y + box.height / 2 },
    { x: box.x + box.width, y: box.y + box.height / 2 },
  ];
  assert.ok(
    midpoints.some((mid) => Math.hypot(point.x - mid.x, point.y - mid.y) < epsilon),
    "endpoint must be a side midpoint",
  );
}

function crossesInterior(a: { x: number; y: number }, b: { x: number; y: number }, rect: Rect) {
  if (Math.abs(a.x - b.x) < epsilon)
    return (
      a.x > rect.x + epsilon &&
      a.x < rect.x + rect.width - epsilon &&
      Math.max(a.y, b.y) > rect.y + epsilon &&
      Math.min(a.y, b.y) < rect.y + rect.height - epsilon
    );
  assert.ok(Math.abs(a.y - b.y) < epsilon, "routes must be orthogonal");
  return (
    a.y > rect.y + epsilon &&
    a.y < rect.y + rect.height - epsilon &&
    Math.max(a.x, b.x) > rect.x + epsilon &&
    Math.min(a.x, b.x) < rect.x + rect.width - epsilon
  );
}

export function assertCompoundGeometry(dag: NormalizedDag, stage: StageData, view: CompoundView) {
  const projection = projectCompoundGraph(dag, view);
  const boxes = new Map<string, Rect>([
    ...stage.nodes.map(
      (node) =>
        [
          node.key,
          { x: node.x - node.width / 2, y: node.y - node.height / 2, width: node.width, height: node.height },
        ] as const,
    ),
    ...(stage.groups ?? []).map((group) => [group.id, group] as const),
  ]);
  const within = (inner: Rect, outer: Rect, header = 0) => {
    assert.ok(
      inner.x >= outer.x - epsilon && inner.y >= outer.y + header - epsilon,
      "child starts inside parent content",
    );
    assert.ok(
      inner.x + inner.width <= outer.x + outer.width + epsilon &&
        inner.y + inner.height <= outer.y + outer.height + epsilon,
      "child ends inside parent",
    );
  };
  const siblings = new Map<string | null, Rect[]>();
  for (const item of projection.items) {
    const box = boxes.get(item.id)!;
    assert.ok(
      Object.values(box)
        .filter((value) => typeof value === "number")
        .every(Number.isFinite),
    );
    within(box, { x: 0, y: 0, width: stage.stageWidth, height: stage.stageHeight });
    if (item.parentId) within(box, boxes.get(item.parentId)!, 50);
    for (const sibling of siblings.get(item.parentId) ?? [])
      assert.ok(
        box.x + box.width <= sibling.x + epsilon ||
          sibling.x + sibling.width <= box.x + epsilon ||
          box.y + box.height <= sibling.y + epsilon ||
          sibling.y + sibling.height <= box.y + epsilon,
        "siblings do not overlap",
      );
    siblings.set(item.parentId, [...(siblings.get(item.parentId) ?? []), box]);
  }
  const onBorder = (p: { x: number; y: number }, box: Rect) => {
    assertSideMidpoint(p, box);
    const horizontal =
      p.x >= box.x - epsilon &&
      p.x <= box.x + box.width + epsilon &&
      Math.min(Math.abs(p.y - box.y), Math.abs(p.y - box.y - box.height)) < epsilon;
    const vertical =
      p.y >= box.y - epsilon &&
      p.y <= box.y + box.height + epsilon &&
      Math.min(Math.abs(p.x - box.x), Math.abs(p.x - box.x - box.width)) < epsilon;
    return horizontal || vertical;
  };
  assert.equal(stage.edges.length, projection.edges.length);
  for (const edge of stage.edges) {
    const points = edge.points!;
    assert.ok(points.length >= 2);
    assert.equal((edge.path.match(/M/g) ?? []).length, 1, "one continuous SVG path per relationship");
    assert.ok(onBorder(points[0], boxes.get(edge.source)!), `${edge.source}: route starts on source boundary`);
    assert.ok(
      onBorder(points[points.length - 1], boxes.get(edge.target)!),
      `${edge.target}: route ends on target boundary`,
    );
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      assert.ok([a.x, a.y, b.x, b.y].every(Number.isFinite));
      within({ ...a, width: 0, height: 0 }, { x: 0, y: 0, width: stage.stageWidth, height: stage.stageHeight });
      for (const node of stage.nodes)
        assert.ok(
          !crossesInterior(a, b, boxes.get(node.key)!),
          `${edge.source} → ${edge.target} crosses node ${node.key}`,
        );
    }
  }
}

export const compoundLayoutSuite = defineSuite("Independent nested layouts and boundary routing", [
  defineTest("zero configured gaps produce finite nested geometry", async () => {
    const dag = nestedChainFixture();
    const appearance = { ...getStageAppearance(DEFAULT_GRAPH_APPEARANCE), columnGap: 0, rowGap: 0, edgeLaneGap: 0 };
    const stage = await layoutFixture(dag, undefined, false, false, appearance);
    assert.ok(stage.nodes.length > 0);
    for (const node of stage.nodes)
      for (const value of [node.x, node.y, node.width, node.height]) assert.ok(Number.isFinite(value));
    for (const edge of stage.edges)
      for (const point of edge.points ?? []) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }),
  defineTest("routing ignores expanded containers and headers but avoids their children and collapsed cards", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, b: {}, child: {} },
      edges: [{ id: "ab", source: "a", target: "b" }],
      hierarchy: { id: "scene", groups: { g: { title: "Expanded group" } }, parentById: { child: "g" } },
    });
    const boxes = new Map<string, Rect>([
      ["a", { x: 100, y: 100, width: 100, height: 80 }],
      ["b", { x: 600, y: 100, width: 100, height: 80 }],
      ["g", { x: 280, y: 100, width: 200, height: 300 }],
      ["child", { x: 330, y: 260, width: 100, height: 80 }],
    ]);
    const route = (collapsed: boolean) => {
      const projection = projectCompoundGraph(dag, { collapsedGroupIds: collapsed ? ["g"] : [], focusGroupId: null });
      const edge = projection.edges[0];
      return shortenCompoundRoutes(
        projection,
        boxes,
        new Map([
          [
            edge.id,
            {
              points: [
                { x: 150, y: 180 },
                { x: 150, y: 450 },
                { x: 650, y: 450 },
                { x: 650, y: 180 },
              ],
              labelPosition: { x: 400, y: 450 },
            },
          ],
        ]),
        { x: 0, y: 0, width: 1000, height: 600 },
        false,
      ).get(edge.id)!.points;
    };
    const direct = [
      { x: 200, y: 140 },
      { x: 600, y: 140 },
    ];
    assert.deepEqual(route(false), direct, "a route can cross an unrelated expanded group's header");
    const group = boxes.get("g")!;
    boxes.delete("g");
    dag.hierarchy!.parentById.a = "g";
    dag.hierarchy!.parentById.b = "g";
    assert.deepEqual(route(false), direct, "even a common parent box is irrelevant to routing");
    delete dag.hierarchy!.parentById.a;
    delete dag.hierarchy!.parentById.b;
    boxes.set("g", group);
    boxes.set("child", { x: 330, y: 100, width: 100, height: 80 });
    for (const collapsed of [false, true]) {
      const points = route(collapsed);
      const obstacle = boxes.get(collapsed ? "g" : "child")!;
      assert.notDeepEqual(points, direct);
      for (let i = 1; i < points.length; i++) assert.ok(!crossesInterior(points[i - 1], points[i], obstacle));
    }
  }),
  defineTest("free routing uses each of the four sides and removes an unnecessary return loop", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, b: {} },
      edges: [{ id: "ab", source: "a", target: "b" }],
    });
    const projection = projectCompoundGraph(dag, { collapsedGroupIds: [], focusGroupId: null });
    const edge = projection.edges[0];
    for (let turn = 0; turn < 4; turn++) {
      const rotate = (original: { x: number; y: number }) => {
        let point = original;
        for (let i = 0; i < turn; i++) point = { x: 1000 - point.y, y: point.x };
        return point;
      };
      const rect = (x: number): Rect => {
        const a = rotate({ x, y: 100 }),
          b = rotate({ x: x + 100, y: 180 });
        return {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
        };
      };
      const original = {
        points: [
          { x: 150, y: 180 },
          { x: 150, y: 500 },
          { x: 550, y: 500 },
          { x: 550, y: 180 },
        ].map(rotate),
        labelPosition: { x: 0, y: 0 },
      };
      const routed = shortenCompoundRoutes(
        projection,
        new Map([
          ["a", rect(100)],
          ["b", rect(500)],
        ]),
        new Map([[edge.id, original]]),
        { x: 0, y: 0, width: 1000, height: 1000 },
        false,
      ).get(edge.id)!;
      assert.deepEqual(routed.points, [rotate({ x: 200, y: 140 }), rotate({ x: 500, y: 140 })]);
    }
  }),
  defineTest("adaptive candidates compact long nested chains without propagating internal ranks", async () => {
    const dag = nestedChainFixture();
    const before = JSON.stringify(dag);
    const stage = await layoutFixture(dag);
    for (let system = 0; system < 3; system++) {
      for (let step = 1; step < 5; step++) {
        const previous = stage.nodeMap[`s${system}-${step - 1}`],
          current = stage.nodeMap[`s${system}-${step}`];
        assert.ok(previous.y + previous.height / 2 < current.y - current.height / 2);
        assert.ok(Math.abs(previous.x - current.x) < 1);
      }
      if (system) {
        const previous = stage.groups!.find((g) => g.id === `system-${system - 1}`)!;
        const current = stage.groups!.find((g) => g.id === `system-${system}`)!;
        assert.ok(previous.x + previous.width < current.x);
      }
    }
    assert.ok(stage.stageWidth / stage.stageHeight < 2.5, "local chains must not extend the global rank count");
    assertCompoundGeometry(dag, stage, { collapsedGroupIds: [], focusGroupId: null });
    assert.equal(JSON.stringify(dag), before);
    const again = await layoutFixture(dag);
    assert.deepEqual(again, stage, "repeat layouts are deterministic");
  }),
  defineTest("fixed midpoints route offset boxes and separate reverse directions without sliding", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, b: {} },
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "ba", source: "b", target: "a" },
      ],
    });
    const projection = projectCompoundGraph(dag, { collapsedGroupIds: [], focusGroupId: null });
    for (const gap of [32, 280])
      for (let turn = 0; turn < 4; turn++) {
        const rotate = (original: { x: number; y: number }) => {
          let point = original;
          for (let i = 0; i < turn; i++) point = { x: 1000 - point.y, y: point.x };
          return point;
        };
        const rect = (x: number, y: number): Rect => {
          const a = rotate({ x, y }),
            b = rotate({ x: x + 120, y: y + 120 });
          return {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(a.x - b.x),
            height: Math.abs(a.y - b.y),
          };
        };
        const original = [
          { x: 220, y: 170 },
          { x: 220 + gap, y: 170 },
        ].map(rotate);
        const boxes = new Map([
          ["a", rect(100, 100)],
          ["b", rect(220 + gap, 120)],
        ]);
        const routes = new Map(
          projection.edges.map((edge) => [
            edge.id,
            {
              points: edge.source === "a" ? original : [...original].reverse(),
              labelPosition: { x: 0, y: 0 },
            },
          ]),
        );
        const routed = shortenCompoundRoutes(
          projection,
          boxes,
          routes,
          { x: 0, y: 0, width: 1000, height: 1000 },
          false,
        );
        const forward = routed.get(projection.edges[0].id)!.points;
        const reverse = routed.get(projection.edges[1].id)!.points;
        assert.ok(forward.length <= 4, "offset centers need at most two bends");
        assertSideMidpoint(forward[0], boxes.get("a")!);
        assertSideMidpoint(forward[forward.length - 1], boxes.get("b")!);
        assertSideMidpoint(reverse[0], boxes.get("b")!);
        assertSideMidpoint(reverse[reverse.length - 1], boxes.get("a")!);
        assert.ok(reverse.length <= 4, "reverse edges use separate midpoint sides or lanes");
        assert.ok(
          Math.hypot(forward[0].x - reverse[reverse.length - 1].x, forward[0].y - reverse[reverse.length - 1].y) >=
            16 - epsilon,
        );
        assert.ok(
          Math.hypot(forward[forward.length - 1].x - reverse[0].x, forward[forward.length - 1].y - reverse[0].y) >=
            16 - epsilon,
        );
        assert.deepEqual(
          shortenCompoundRoutes(
            { ...projection, edges: [...projection.edges].reverse() },
            boxes,
            routes,
            { x: 0, y: 0, width: 1000, height: 1000 },
            false,
          ),
          routed,
          "edge input order must not change the lanes",
        );
      }
  }),
  defineTest("expanded experience uses one bend and group statistics can hide without changing geometry", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    const view = {
      collapsedGroupIds: Object.keys(dag.hierarchy!.groups).filter((id) => id !== "experience"),
      focusGroupId: null,
    };
    for (const showDetail of [false, true]) {
      const stage = await layoutFixture(dag, view, false, showDetail);
      assertCompoundGeometry(dag, stage, view);
      const points = stage.edges.find((edge) => edge.source === "web" && edge.target === "gateway")!.points!;
      assert.equal(points.length, 3, "the screenshot route needs just one bend");
      assert.equal(points[0].x, stage.nodeMap.web.x);
      assert.equal(points[0].y, stage.nodeMap.web.y + stage.nodeMap.web.height / 2);
      assert.equal(points[2].x, stage.nodeMap.gateway.x + stage.nodeMap.gateway.width / 2);
      assert.equal(points[2].y, stage.nodeMap.gateway.y);
      const before = JSON.stringify(stage);
      const noop = () => {};
      for (const showGroupStats of [true, false]) {
        const html = renderToStaticMarkup(
          createElement(GraphStage, {
            stage,
            focusedKey: null,
            hideNodeBorders: false,
            appearance: {
              ...DEFAULT_GRAPH_APPEARANCE,
              display: { ...DEFAULT_GRAPH_APPEARANCE.display, showGroupStats },
            },
            svgRef: { current: null },
            onNodeClick: noop,
            onNodeDoubleClick: noop,
            onNodeContextMenu: noop,
            onBackgroundContextMenu: noop,
            onFocusChange: noop,
          }),
        );
        assert.equal(html.includes('class="dag-group-count"'), showGroupStats);
        const visibleDetails = stage.nodes.filter(
          (node) => node.detailLines.length && (node.kind !== "group" || showGroupStats),
        ).length;
        assert.equal((html.match(/class="dag-node__detail dag-node__content"/g) ?? []).length, visibleDetails);
      }
      assert.equal(JSON.stringify(stage), before, "visibility does not move nodes or routes");
    }
  }),
  defineTest("collapsed commerce routes use fixed midpoints and keep labels clear of other lines", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    const view = { collapsedGroupIds: Object.keys(dag.hierarchy!.groups), focusGroupId: null };
    const stage = await layoutFixture(dag, view, true);
    assertCompoundGeometry(dag, stage, view);
    for (const edge of stage.edges) {
      const width = Math.max(edge.label.length * 7 + 10, 18);
      const label = {
        x: edge.labelPosition.x - width / 2 - 2,
        y: edge.labelPosition.y - 12,
        width: width + 4,
        height: 20,
      };
      for (const other of stage.edges.filter((candidate) => candidate.id !== edge.id))
        for (let i = 1; i < other.points!.length; i++)
          assert.ok(
            !crossesInterior(other.points![i - 1], other.points![i], label),
            "labels must not cover another route",
          );
    }
  }),
  defineTest(
    "acyclic leaf graphs may contract to cyclic container graphs without reversing actual arrows",
    async () => {
      const dag = normalizeDagInput({
        format: "graph-studio",
        version: 3,
        nodes: { a1: {}, a2: {}, b1: {}, b2: {}, isolated: {}, outside: {} },
        edges: [
          { id: "ab", source: "a1", target: "b1" },
          { id: "ba", source: "b1", target: "a2" },
          { id: "bb", source: "b1", target: "b2" },
          { id: "ax", source: "a2", target: "outside" },
        ],
        hierarchy: {
          id: "H",
          groups: { A: { title: "A" }, B: { title: "B" }, deep: { title: "Deep" } },
          parentById: { a1: "deep", deep: "A", a2: "A", isolated: "A", b1: "B", b2: "B" },
        },
      });
      for (const view of [
        { collapsedGroupIds: [], focusGroupId: null },
        { collapsedGroupIds: ["deep"], focusGroupId: null },
        { collapsedGroupIds: ["A", "B"], focusGroupId: null },
        { collapsedGroupIds: [], focusGroupId: "A" },
      ])
        assertCompoundGeometry(dag, await layoutFixture(dag, view), view);
    },
  ),
  defineTest("local direction adapts to chain and fan-out topology at the same depth", async () => {
    const nodes: GraphDocument["nodes"] = {};
    const edges: GraphDocument["edges"] = [];
    const parentById: Record<string, string> = {};
    for (const kind of ["chain", "fan"] as const) {
      for (let i = 0; i < 6; i++) {
        const id = `${kind}-${i}`;
        nodes[id] = { title: `Node ${i}` };
        parentById[id] = kind;
        if (i) edges.push({ id: `e-${id}`, source: `${kind}-${kind === "chain" ? i - 1 : 0}`, target: id });
      }
    }
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes,
      edges,
      hierarchy: {
        id: "H",
        groups: { chain: { title: "Chain" }, fan: { title: "Fan-out" } },
        parentById,
      },
    });
    const stage = await layoutFixture(dag);
    const chainStart = stage.nodeMap["chain-0"],
      chainNext = stage.nodeMap["chain-1"];
    const fanStart = stage.nodeMap["fan-0"],
      fanNext = stage.nodeMap["fan-1"];
    assert.ok(chainNext.y - chainStart.y > chainStart.height, "long chain chooses vertical flow");
    assert.ok(fanNext.x - fanStart.x > fanStart.width, "fan-out chooses horizontal flow at the same depth");
    assertCompoundGeometry(dag, stage, { collapsedGroupIds: [], focusGroupId: null });
  }),
  defineTest("hidden labels consume no geometry and visible labels reserve space once", async () => {
    const dag = nestedChainFixture();
    const labelled = normalizeDagInput({
      ...serializeDag(dag),
      edges: dag.edges.map((edge) => ({ ...edge, value: "补充设计：分单相关特征".repeat(8) })),
    });
    const hidden = await layoutFixture(labelled);
    const plain = await layoutFixture(dag);
    assert.deepEqual(hidden.nodes, plain.nodes);
    assert.deepEqual(hidden.groups, plain.groups);
    assert.equal(hidden.stageWidth, plain.stageWidth);
    assert.equal(hidden.stageHeight, plain.stageHeight);
    const shown = await layoutFixture(labelled, undefined, true);
    assert.ok(shown.stageWidth * shown.stageHeight > hidden.stageWidth * hidden.stageHeight);
    assertCompoundGeometry(labelled, shown, { collapsedGroupIds: [], focusGroupId: null });
    for (const edge of shown.edges)
      assert.ok(Number.isFinite(edge.labelPosition.x) && Number.isFinite(edge.labelPosition.y));
  }),
  defineTest("commerce expansion, folding and drill-down retain obstacle-free continuous routes", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    for (const view of [
      { collapsedGroupIds: [], focusGroupId: null },
      { collapsedGroupIds: Object.keys(dag.hierarchy!.groups), focusGroupId: null },
      ...Object.keys(dag.hierarchy!.groups)
        .slice(0, 4)
        .map((focusGroupId) => ({ collapsedGroupIds: [], focusGroupId })),
    ]) {
      const stage = await layoutFixture(dag, view);
      assertCompoundGeometry(dag, stage, view);
      if (!view.focusGroupId && !view.collapsedGroupIds.length) {
        for (const [source, target] of [
          ["capture", "bank"],
          ["carrier", "tracking"],
        ]) {
          const points = stage.edges.find((edge) => edge.source === source && edge.target === target)!.points!;
          const length = points
            .slice(1)
            .reduce((sum, point, i) => sum + Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y), 0);
          const direct =
            Math.abs(points[0].x - points[points.length - 1].x) + Math.abs(points[0].y - points[points.length - 1].y);
          assert.ok(
            Math.abs(length - direct) < 0.01,
            `${source} → ${target} must not loop back through a remote boundary port`,
          );
        }
      }
    }
  }),
  defineTest("empty projections and unconnected nodes have finite packed layouts", async () => {
    for (const count of [0, 12]) {
      const dag = normalizeDagInput({
        format: "graph-studio",
        version: 3,
        nodes: Object.fromEntries(Array.from({ length: count }, (_, i) => [`n${i}`, {}])),
        edges: [],
      });
      const stage = await layoutFixture(dag);
      assert.ok(Number.isFinite(stage.stageWidth) && Number.isFinite(stage.stageHeight));
      assert.equal(stage.nodes.length, count);
      assertCompoundGeometry(dag, stage, { collapsedGroupIds: [], focusGroupId: null });
      if (count) assert.ok(stage.stageWidth / stage.stageHeight < 3);
    }
  }),
]);
