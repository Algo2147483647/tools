import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
) {
  return buildCompoundStage(
    {
      dag,
      view,
      showEdgeLabels,
      appearance: getStageAppearance(DEFAULT_GRAPH_APPEARANCE),
      showNodeDetail: true,
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
  const items = new Map(projection.items.map((item) => [item.id, item]));
  const ancestors = (id: string) => {
    const result = new Set<string>();
    let parent = items.get(id)?.parentId;
    while (parent) {
      result.add(parent);
      parent = items.get(parent)?.parentId;
    }
    return result;
  };
  const onBorder = (p: { x: number; y: number }, box: Rect) => {
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
    const allowed = new Set([...ancestors(edge.source), ...ancestors(edge.target)]);
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
      for (const group of stage.groups ?? []) {
        assert.ok(!crossesInterior(a, b, { ...group, height: 50 }), `route crosses header ${group.id}`);
        if (!allowed.has(group.id))
          assert.ok(!crossesInterior(a, b, group), `route crosses unrelated container ${group.id}`);
      }
    }
  }
}

export const compoundLayoutSuite = defineSuite("Independent nested layouts and boundary routing", [
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
