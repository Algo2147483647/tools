import { getGroupNodes } from "../graph/compound/hierarchy";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GraphStage from "../components/canvas/GraphStage";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { projectCompoundGraph } from "../graph/compound/projection";
import type { CompoundView, GraphDocument, NormalizedDag } from "../graph/types";
import { DEFAULT_GRAPH_APPEARANCE } from "../schema/appearance/defaults";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { layoutCompoundHierarchy } from "../layout/compound/hierarchy-layout";
import { arrangeTopology } from "../layout/compound/topology-layout";
import { compactFlow } from "../layout/compound/rectangle-packing";
import { createPlacementScore } from "../layout/compound/placement-score";
import { refineLocalPlacement } from "../layout/compound/local-refinement";
import { getStageAppearance } from "../layout/shared/appearance";
import { buildCompoundStage } from "../layout/compound/layout";
import type { StageData } from "../layout/shared/types";
import { routeCompoundEdges } from "../layout/compound/routing/router";
import { defineSuite, defineTest } from "./harness";
import { startLayoutWorker } from "../app/layout/workerJob";
import { validateLayoutGeometry } from "../layout/compound/layout-quality";

export function nestedChainFixture(): NormalizedDag {
  const nodes: GraphDocument["nodes"] = {};
  const edges: GraphDocument["edges"] = [];
  const groups: GraphDocument["nodes"] = {};
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
    nodes: { ...nodes, ...groups },
    edges,
    hierarchy_edges: Object.entries(parentById).map(([target, source]) => ({
      id: `hierarchy:${target}`,
      source,
      target,
    })),
  });
}

export async function layoutFixture(
  dag: NormalizedDag,
  view: CompoundView = { collapsedGroupIds: [], focusGroupId: null },
  showEdgeLabels = false,
  showNodeDetail = false,
  appearance = getStageAppearance(getDefaultChartStyle("compound").appearance, "compound"),
) {
  return buildCompoundStage({
    dag,
    view,
    showEdgeLabels,
    appearance,
    showNodeDetail,
    alignNodeWidthsToMax: true,
  });
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const epsilon = 0.02;
function assertSidePort(point: { x: number; y: number }, box: Rect) {
  assert.ok(
    ((Math.abs(point.x - box.x) < epsilon || Math.abs(point.x - box.x - box.width) < epsilon) &&
      point.y > box.y &&
      point.y < box.y + box.height) ||
      ((Math.abs(point.y - box.y) < epsilon || Math.abs(point.y - box.y - box.height) < epsilon) &&
        point.x > box.x &&
        point.x < box.x + box.width),
    "endpoint must be on a card side, clear of corners",
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
    assertSidePort(p, box);
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

export const compoundLayoutSuite = defineSuite("Independent topological layouts and fixed-position routing", [
  defineTest("local search completes all candidates beyond 128 evaluations and remains at a stable optimum", () => {
    const boxes = new Map<string, Rect>();
    const edges: [string, string][] = [];
    for (let i = 0; i < 60; i++) {
      const a = `a${i}`,
        b = `b${i}`;
      boxes.set(a, { x: 0, y: i * 200, width: 10, height: 10 });
      boxes.set(b, { x: 500, y: i * 200, width: 10, height: 10 });
      edges.push([a, b]);
    }
    let evaluations = 0;
    const score = (positions: Map<string, Rect>) => {
      evaluations++;
      return edges.reduce(
        (sum, [a, b]) =>
          sum +
          Math.abs(positions.get(b)!.x - positions.get(a)!.x + 20) +
          Math.abs(positions.get(b)!.y - positions.get(a)!.y),
        0,
      );
    };
    const result = refineLocalPlacement({ boxes, width: 510, height: 12000 }, edges, 10, 10, score);
    assert.equal(score(result.boxes), 0, "even the last visited nodes improve");
    assert.ok(evaluations > 128);
    assert.deepEqual(refineLocalPlacement(result, [...edges].reverse(), 10, 10, score), result);
    assert.deepEqual(
      refineLocalPlacement(result, edges, 10, 10, () => 1),
      result,
      "equal scores preserve coordinates",
    );
  }),
  defineTest("workers have no deadline and terminate on completion, cancellation or failure", async () => {
    const originalTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (() => {
      throw new Error("Unexpected layout deadline");
    }) as unknown as typeof setTimeout;
    try {
      for (const outcome of ["complete", "cancel", "error"] as const) {
        let request: { jobId: string } | undefined;
        let terminated = 0;
        const worker = {
          onmessage: null as Worker["onmessage"],
          onerror: null as Worker["onerror"],
          onmessageerror: null as Worker["onmessageerror"],
          postMessage(value: { jobId: string }) {
            request = value;
          },
          terminate() {
            terminated++;
          },
        };
        const job = startLayoutWorker<null, { value: number }>({
          createWorker: () => worker as unknown as Worker,
          payload: null,
          failureMessage: "failed",
          invalidMessage: "invalid",
          cancelMessage: "cancelled",
        });
        assert.equal(terminated, 0);
        const deliver = (jobId: string) =>
          worker.onmessage!.call(
            worker as unknown as Worker,
            { data: { jobId, ok: true, result: { value: 1 } } } as MessageEvent,
          );
        deliver("stale-job");
        assert.equal(terminated, 0);
        if (outcome === "complete") {
          deliver(request!.jobId);
          assert.deepEqual(await job.result, { value: 1 });
        } else {
          if (outcome === "cancel") job.cancel();
          else worker.onerror!.call(worker as unknown as Worker, { message: "failed" } as ErrorEvent);
          await assert.rejects(job.result, outcome === "cancel" ? /cancelled/ : /failed/);
        }
        job.cancel();
        assert.equal(terminated, 1);
        assert.equal(worker.onmessage, null);
      }
    } finally {
      globalThis.setTimeout = originalTimeout;
    }
  }),
  defineTest("local search accepts all four sides beyond the seed bounds and then rebases", () => {
    const initial = {
      width: 600,
      height: 100,
      boxes: new Map([
        ["a", { x: 0, y: 0, width: 100, height: 100 }],
        ["b", { x: 500, y: 0, width: 100, height: 100 }],
      ]),
    };
    for (const [dx, dy] of [
      [-124, 0],
      [124, 0],
      [0, -124],
      [0, 124],
    ]) {
      const score = (boxes: typeof initial.boxes) => {
        const a = boxes.get("a")!,
          b = boxes.get("b")!;
        return Math.abs(b.x - a.x - dx) + Math.abs(b.y - a.y - dy);
      };
      const result = refineLocalPlacement(initial, [["a", "b"]], 24, 24, score);
      assert.equal(score(result.boxes), 0);
      assert.ok([...result.boxes.values()].every((b) => b.x >= 0 && b.y >= 0));
      if (dy) assert.ok(result.height > initial.height, "the original canvas is not a spatial bound");
      assert.equal(initial.boxes.get("b")!.x, 500, "input geometry stays unchanged");
    }
  }),
  defineTest("converging source moves into the free slot and both final routes are short straight lines", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        customer: { title: "Customer experience" },
        mobile: { title: "Mobile app" },
        web: { title: "Web storefront" },
        gateway: { title: "Storefront API" },
      },
      edges: [
        { id: "mobile-api", source: "mobile", target: "gateway" },
        { id: "web-api", source: "web", target: "gateway" },
      ],
      hierarchy_edges: ["mobile", "web", "gateway"].map((target) => ({
        id: `contains-${target}`,
        source: "customer",
        target,
      })),
    });
    const stage = await layoutFixture(dag);
    for (const edge of stage.edges) {
      const points = edge.points!;
      const length = points
        .slice(1)
        .reduce((sum, point, i) => sum + Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y), 0);
      assert.ok(length <= 24 + epsilon, "routing happens after placement and needs only the configured gap");
    }
    assertCompoundGeometry(dag, stage, { collapsedGroupIds: [], focusGroupId: null });
  }),
  defineTest("local refinement preserves non-overlap and frozen sizes in both seed orientations", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const edges: [string, string][] = [
      ["a", "c"],
      ["b", "e"],
      ["c", "d"],
      ["d", "e"],
      ["c", "f"],
      ["e", "f"],
    ];
    for (const down of [false, true])
      for (const gap of [0, 24])
        for (const large of [false, true]) {
          const sizes = new Map(
            ids.map((id, i) => [id, { width: large ? 100 + i * 50 : 200, height: 100 + (i % 2) * 40 }]),
          );
          const seed = compactFlow(ids, edges, sizes, gap, gap);
          const initial = down
            ? {
                boxes: new Map(
                  [...seed.boxes].map(([id, box]) => [
                    id,
                    { x: box.y, y: box.x, width: box.height, height: box.width },
                  ]),
                ),
                width: seed.height,
                height: seed.width,
              }
            : seed;
          const snapshot = structuredClone(initial);
          const result = refineLocalPlacement(initial, edges, gap, gap);
          assert.deepEqual(initial, snapshot, "refinement must not mutate a completed input");
          const score = createPlacementScore(edges);
          assert.ok(score(result.boxes) <= score(initial.boxes), "actual routes and compactness improve together");
          for (const [id, box] of result.boxes) {
            const original = initial.boxes.get(id)!;
            assert.equal(box.width, original.width);
            assert.equal(box.height, original.height);
            assert.ok(box.x >= 0 && box.y >= 0);
            for (const [other, occupied] of result.boxes)
              if (other !== id)
                assert.ok(
                  box.x + box.width <= occupied.x ||
                    occupied.x + occupied.width <= box.x ||
                    box.y + box.height <= occupied.y ||
                    occupied.y + occupied.height <= box.y,
                );
          }
        }
  }),
  defineTest(
    "external neighbors, parent edges and sibling expansion cannot change a completed child's local geometry",
    () => {
      const dag = nestedChainFixture();
      const theme = getDefaultChartStyle("compound").appearance;
      const place = (doc: NormalizedDag, collapsedGroupIds: string[] = []) => {
        const projection = projectCompoundGraph(doc, { collapsedGroupIds, focusGroupId: null });
        return layoutCompoundHierarchy(
          projection,
          new Map(projection.items.map((item) => [item.id, { width: 200, height: 100 }])),
          theme,
        );
      };
      const original = place(dag);
      const changed = serializeDag(dag);
      changed.nodes.external = {};
      changed.edges.push(
        { id: "external-in", source: "external", target: "s1-3" },
        { id: "parent-child", source: "system-1", target: "s1-4" },
      );
      const local = (result: ReturnType<typeof place>) => {
        const parent = result.boxes.get("system-1")!;
        return {
          width: parent.width,
          height: parent.height,
          children: Array.from({ length: 5 }, (_, i) => {
            const box = result.boxes.get(`s1-${i}`)!;
            return { ...box, x: box.x - parent.x, y: box.y - parent.y };
          }),
        };
      };
      assert.deepEqual(local(place(normalizeDagInput(changed))), local(original));
      assert.deepEqual(local(place(dag, ["system-0"])), local(original));
    },
  ),
  defineTest("placement is deterministic for parallel branches and cycles", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const edges: [string, string][] = [
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["c", "e"],
      ["d", "f"],
      ["e", "f"],
    ];
    const sizes = new Map(ids.map((id) => [id, { width: 200, height: 100 }]));
    const result = arrangeTopology(ids, edges, sizes, 24, 24);
    assert.deepEqual(arrangeTopology([...ids].reverse(), [...edges].reverse(), sizes, 24, 24), result);
    const cyclic = arrangeTopology(ids, [...edges, ["d", "b"]], sizes, 24, 24);
    assert.ok(Number.isFinite(cyclic.width) && Number.isFinite(cyclic.height));
    assert.deepEqual(
      arrangeTopology([...ids].reverse(), [...edges, ["d", "b"]].reverse() as [string, string][], sizes, 24, 24),
      cyclic,
    );
  }),
  defineTest(
    "short dependent branches occupy space beside a wide sibling instead of inheriting its column width",
    () => {
      const ids = ["source", "wide", "b", "c", "d", "join"];
      const sizes = new Map(ids.map((id) => [id, { width: id === "wide" ? 600 : 100, height: 100 }]));
      const edges: [string, string][] = [
        ["source", "wide"],
        ["source", "b"],
        ["b", "c"],
        ["c", "d"],
        ["wide", "join"],
        ["d", "join"],
      ];
      const result = arrangeTopology(ids, edges, sizes, 24, 24);
      assert.ok(result.width * result.height <= 848 * 224, "the short branch must fit alongside the 600px rectangle");
      const wide = result.boxes.get("wide")!,
        c = result.boxes.get("c")!;
      assert.ok(c.x < wide.x + wide.width, "only actual predecessors constrain a downstream position");
      for (const id of ids)
        assert.deepEqual({ width: result.boxes.get(id)!.width, height: result.boxes.get(id)!.height }, sizes.get(id));
    },
  ),
  defineTest("unequal disconnected rectangles fill a contour without sharing the largest row height", () => {
    const ids = ["large", "a", "b", "c"];
    const sizes = new Map(
      ids.map((id) => [id, id === "large" ? { width: 600, height: 600 } : { width: 200, height: 100 }]),
    );
    const result = arrangeTopology(ids, [], sizes, 24, 24);
    assert.ok(
      result.width * result.height <= 648 * 724,
      "three small rectangles should share the free strip beside the large one",
    );
    const boxes = [...result.boxes.values()];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        assert.ok(
          a.x + a.width + 24 <= b.x ||
            b.x + b.width + 24 <= a.x ||
            a.y + a.height + 24 <= b.y ||
            b.y + b.height + 24 <= a.y,
        );
      }
    assert.deepEqual(arrangeTopology([...ids].reverse(), [], sizes, 24, 24), result);
  }),
  defineTest("zero configured gaps produce finite nested geometry", async () => {
    const dag = nestedChainFixture();
    const defaults = getStageAppearance(getDefaultChartStyle("compound").appearance, "compound");
    const appearance = {
      ...defaults,
      nodes: { ...defaults.nodes, spacing: { ...defaults.nodes.spacing, column: 0, row: 0 } },
    };
    const stage = await layoutFixture(dag, undefined, false, false, appearance);
    assert.ok(stage.nodes.length > 0);
    for (const node of stage.nodes)
      for (const value of [node.x, node.y, node.width, node.height]) assert.ok(Number.isFinite(value));
    for (const edge of stage.edges)
      for (const point of edge.points ?? []) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }),
  defineTest("routing avoids unrelated expanded containers and headers, allowing common parent interiors", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { ...{ a: {}, b: {}, child: {} }, ...{ g: { title: "Expanded group" } } },
      edges: [{ id: "ab", source: "a", target: "b" }],
      hierarchy_edges: Object.entries({ child: "g" }).map(([target, source]) => ({
        id: `hierarchy:${target}`,
        source,
        target,
      })),
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
      return routeCompoundEdges(projection, boxes, { x: 0, y: 0, width: 1000, height: 600 }, false).routes.get(edge.id)!
        .points;
    };
    const direct = [
      { x: 200, y: 140 },
      { x: 600, y: 140 },
    ];
    const detour = route(false);
    assert.notDeepEqual(detour, direct);
    for (let i = 1; i < detour.length; i++) assert.ok(!crossesInterior(detour[i - 1], detour[i], boxes.get("g")!));
    const group = boxes.get("g")!;
    boxes.set("g", { x: 40, y: 40, width: 740, height: 420 });
    dag.hierarchy_edges!.push({ id: "ga", source: "g", target: "a" });
    dag.hierarchy_edges!.push({ id: "gb", source: "g", target: "b" });
    assert.deepEqual(route(false), direct, "siblings can connect through their common parent's content area");
    dag.hierarchy_edges = dag.hierarchy_edges!.filter((edge) => edge.target !== "a");
    dag.hierarchy_edges = dag.hierarchy_edges!.filter((edge) => edge.target !== "b");
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

      const routed = routeCompoundEdges(
        projection,
        new Map([
          ["a", rect(100)],
          ["b", rect(500)],
        ]),
        { x: 0, y: 0, width: 1000, height: 1000 },
        false,
      ).routes.get(edge.id)!;
      assert.deepEqual(routed.points, [rotate({ x: 200, y: 140 }), rotate({ x: 500, y: 140 })]);
    }
  }),
  defineTest("automatic layouts preserve directed chains and deterministic geometry", async () => {
    const dag = nestedChainFixture();
    const before = JSON.stringify(dag);
    const stage = await layoutFixture(dag);
    for (let system = 0; system < 3; system++) {
      for (let step = 1; step < 5; step++) {
        const previous = stage.nodeMap[`s${system}-${step - 1}`],
          current = stage.nodeMap[`s${system}-${step}`];
        assert.ok(
          previous.y + previous.height / 2 < current.y - current.height / 2 ||
            previous.x + previous.width / 2 < current.x - current.width / 2,
        );
      }
      if (system) {
        const previous = stage.groups!.find((g) => g.id === `system-${system - 1}`)!;
        const current = stage.groups!.find((g) => g.id === `system-${system}`)!;
        assert.ok(previous.x + previous.width < current.x || previous.y + previous.height < current.y);
      }
    }
    assert.ok(stage.layoutQuality!.validation.valid);
    assertCompoundGeometry(dag, stage, { collapsedGroupIds: [], focusGroupId: null });
    assert.equal(JSON.stringify(dag), before);
    const again = await layoutFixture(dag);
    assert.deepEqual(again.nodes, stage.nodes, "repeat layouts are deterministic");
    assert.deepEqual(again.edges, stage.edges);
    assert.deepEqual(again.layoutQuality!.metrics, stage.layoutQuality!.metrics);
  }),
  defineTest("midpoint ports route both edge directions without moving boxes", () => {
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

        const boxes = new Map([
          ["a", rect(100, 100)],
          ["b", rect(220 + gap, 120)],
        ]);

        const routed = routeCompoundEdges(projection, boxes, { x: 0, y: 0, width: 1000, height: 1000 }, false).routes;
        const forward = routed.get(projection.edges[0].id)!.points;
        const reverse = routed.get(projection.edges[1].id)!.points;
        assert.ok(forward.length <= 4, "offset centers need at most two bends");
        assertSidePort(forward[0], boxes.get("a")!);
        assertSidePort(forward[forward.length - 1], boxes.get("b")!);
        assertSidePort(reverse[0], boxes.get("b")!);
        assertSidePort(reverse[reverse.length - 1], boxes.get("a")!);
        assert.ok(reverse.length <= 4, "reverse edges stay short with reusable midpoints");
        assert.deepEqual(
          routeCompoundEdges(
            { ...projection, edges: [...projection.edges].reverse() },
            boxes,
            { x: 0, y: 0, width: 1000, height: 1000 },
            false,
          ).routes,
          routed,
          "edge input order must not change the lanes",
        );
      }
  }),
  defineTest("expanded group statistics can hide without changing geometry", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    const view = {
      collapsedGroupIds: Object.keys(getGroupNodes(dag)).filter((id) => id !== "experience"),
      focusGroupId: null,
    };
    for (const showDetail of [false, true]) {
      const stage = await layoutFixture(dag, view, false, showDetail);
      assertCompoundGeometry(dag, stage, view);
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
  defineTest("collapsed commerce routes use side ports and keep labels clear of other lines", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    const view = { collapsedGroupIds: Object.keys(getGroupNodes(dag)), focusGroupId: null };
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
        nodes: {
          ...{ a1: {}, a2: {}, b1: {}, b2: {}, isolated: {}, outside: {} },
          ...{ A: { title: "A" }, B: { title: "B" }, deep: { title: "Deep" } },
        },
        edges: [
          { id: "ab", source: "a1", target: "b1" },
          { id: "ba", source: "b1", target: "a2" },
          { id: "bb", source: "b1", target: "b2" },
          { id: "ax", source: "a2", target: "outside" },
        ],
        hierarchy_edges: Object.entries({ a1: "deep", deep: "A", a2: "A", isolated: "A", b1: "B", b2: "B" }).map(
          ([target, source]) => ({ id: `hierarchy:${target}`, source, target }),
        ),
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
      nodes: { ...nodes, ...{ chain: { title: "Chain" }, fan: { title: "Fan-out" } } },
      edges,
      hierarchy_edges: Object.entries(parentById).map(([target, source]) => ({
        id: `hierarchy:${target}`,
        source,
        target,
      })),
    });
    const stage = await layoutFixture(dag);
    const fanStart = stage.nodeMap["fan-0"];
    const leaves = Array.from({ length: 5 }, (_, i) => stage.nodeMap[`fan-${i + 1}`]);
    assert.ok(
      leaves.some((leaf) => leaf.x < fanStart.x || leaf.y < fanStart.y),
      "fan-out can use space upstream of its source",
    );
    assertCompoundGeometry(dag, stage, { collapsedGroupIds: [], focusGroupId: null });
  }),
  defineTest("edge label visibility participates in automatic placement and avoids obstacles", async () => {
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
    assert.equal(shown.layoutQuality!.validation.valid, true);
    assertCompoundGeometry(labelled, shown, { collapsedGroupIds: [], focusGroupId: null });
    for (const edge of shown.edges)
      assert.ok(Number.isFinite(edge.labelPosition.x) && Number.isFinite(edge.labelPosition.y));
  }),
  defineTest("commerce expansion, folding and drill-down retain obstacle-free continuous routes", async () => {
    const dag = normalizeDagInput(JSON.parse(await readFile("public/examples/commerce/commerce.json", "utf8")));
    for (const view of [
      { collapsedGroupIds: [], focusGroupId: null },
      { collapsedGroupIds: Object.keys(getGroupNodes(dag)), focusGroupId: null },
      ...Object.keys(getGroupNodes(dag))
        .slice(0, 4)
        .map((focusGroupId) => ({ collapsedGroupIds: [], focusGroupId })),
    ]) {
      const stage = await layoutFixture(dag, view);
      assertCompoundGeometry(dag, stage, view);
      // Length trades against bends/crossings/area in the combined objective;
      // every view must still satisfy the hard geometry and title checks.
      const problem = stage.compoundLayout!;
      const validation = validateLayoutGeometry(problem, problem.baseline);
      assert.ok(validation.valid, validation.errors.join("\n"));
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
