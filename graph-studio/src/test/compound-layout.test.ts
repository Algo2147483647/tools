import assert from "node:assert/strict";
import ELK from "elkjs/lib/elk.bundled.js";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { projectCompoundGraph } from "../graph/compoundProjection";
import { normalizeDagInput } from "../graph/normalize";
import type { CompoundView, NormalizedDag } from "../graph/types";
import { getStageAppearance } from "../layout/appearance";
import { CompoundStageCache, compoundStageCacheKey } from "../layout/compound-cache";
import { GROUP_COLLAPSED_HEIGHT, GROUP_CONTENT_TOP, groupMinimumWidth } from "../layout/compound-geometry";
import { buildCompoundStage } from "../layout/compound-layout";
import { countGroupInternalEdges, getExternalDirections, orderCompoundItems } from "../layout/compound-order";
import type { StageData } from "../layout/types";
import { defineSuite, defineTest } from "./harness";

const input = (dag: NormalizedDag, view: CompoundView, previousStage?: StageData) => ({
  dag,
  view,
  appearance: getStageAppearance(DEFAULT_GRAPH_APPEARANCE),
  showNodeDetail: true,
  alignNodeWidthsToMax: false,
  previousStage,
});
const layout = (dag: NormalizedDag, view: CompoundView, previousStage?: StageData) =>
  buildCompoundStage(input(dag, view, previousStage), new ELK());
const view = (collapsedGroupIds: string[] = [], focusGroupId: string | null = null) => ({
  collapsedGroupIds,
  focusGroupId,
});
const siblingsFixture = () =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: { a1: {}, a2: {}, b1: {}, b2: {}, c1: {}, c2: {} },
    edges: [
      { id: "a", source: "a1", target: "a2" },
      { id: "b", source: "b1", target: "b2" },
      { id: "c", source: "c1", target: "c2" },
    ],
    hierarchy: {
      id: "H",
      groups: { ga: { title: "A" }, gb: { title: "B" }, gc: { title: "C" } },
      parentById: { a1: "ga", a2: "ga", b1: "gb", b2: "gb", c1: "gc", c2: "gc" },
    },
  });
const boundaryFixture = () =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: { a: {}, b: {}, isolated: {}, input1: {}, input2: {}, output: {}, mixed: {} },
    edges: [
      { id: "in-a", source: "input1", target: "a" },
      { id: "in-b", source: "input2", target: "b" },
      { id: "ab", source: "a", target: "b" },
      { id: "out", source: "b", target: "output" },
      { id: "mixed-in", source: "mixed", target: "a" },
      { id: "mixed-out", source: "b", target: "mixed" },
    ],
    hierarchy: {
      id: "H",
      groups: {
        focus: { title: "Focus" },
        inner: { title: "支付清算及多渠道异常重试处理服务 / Payment settlement and retry handling" },
        upstream: { title: "Upstream" },
      },
      parentById: { inner: "focus", a: "inner", b: "inner", isolated: "focus", input1: "upstream", input2: "upstream" },
    },
  });

function siblingOrder(stage: StageData): string[] {
  return [
    ...(stage.groups ?? []).filter((group) => group.depth === 0).map((group) => ({ id: group.id, y: group.y })),
    ...stage.nodes
      .filter((node) => node.kind === "group" && node.layer === 0)
      .map((node) => ({ id: node.key, y: node.y - node.height / 2 })),
  ]
    .sort((a, b) => a.y - b.y)
    .map((item) => item.id);
}

export const compoundLayoutSuite = defineSuite("Nested layout stability and external boundaries", [
  defineTest("folding one sibling preserves the last visible sibling order and routes", async () => {
    const dag = siblingsFixture();
    const expanded = await layout(dag, view());
    const collapsed = await layout(dag, view(["gb"]), expanded);
    const reopened = await layout(dag, view(), collapsed);
    assert.deepEqual(siblingOrder(collapsed), siblingOrder(expanded));
    assert.deepEqual(siblingOrder(reopened), siblingOrder(expanded));
    assert.ok(collapsed.nodeMap.gb.height >= GROUP_COLLAPSED_HEIGHT);
    assert.deepEqual(collapsed.edges.flatMap((edge) => edge.originalEdgeIds).sort(), ["a", "c"]);
    assert.ok(reopened.edges.every((edge) => edge.path.startsWith("M") && !/NaN|Infinity/.test(edge.path)));
  }),
  defineTest("prior positions guide sibling order only inside the same document and scope", async () => {
    const dag = siblingsFixture();
    const previous = await layout(dag, view());
    previous.groups = previous.groups!.map((group, index) => ({ ...group, y: (3 - index) * 100 }));
    const projection = projectCompoundGraph(dag, view(["gb"]));
    const ordered = orderCompoundItems(projection, dag, previous).filter((item) => item.parentId === null);
    assert.deepEqual(
      ordered.map((item) => item.id),
      siblingOrder(previous),
    );
    const otherScope = { ...previous, compound: { hierarchy: dag.hierarchy!, focusGroupId: "ga" } };
    assert.deepEqual(
      orderCompoundItems(projection, dag, otherScope)
        .filter((item) => item.parentId === null)
        .map((item) => item.id),
      ["ga", "gb", "gc"],
    );
  }),
  defineTest("focused external input and output summaries occupy outer boundaries and retain provenance", async () => {
    const dag = boundaryFixture();
    const before = JSON.stringify(dag);
    const projection = projectCompoundGraph(dag, view([], "focus"));
    assert.deepEqual([...getExternalDirections(projection)].sort(), [
      ["mixed", "both"],
      ["output", "outgoing"],
      ["upstream", "incoming"],
    ]);
    const stage = await layout(dag, view([], "focus"));
    const internal = stage.nodes.filter((node) => !node.external);
    const left = Math.min(...internal.map((node) => node.x - node.width / 2));
    const right = Math.max(...internal.map((node) => node.x + node.width / 2));
    assert.ok(stage.nodeMap.upstream.x + stage.nodeMap.upstream.width / 2 < left);
    assert.ok(stage.nodeMap.output.x - stage.nodeMap.output.width / 2 > right);
    assert.equal(stage.nodeMap.mixed.externalDirection, "both");
    assert.equal(stage.nodeMap.upstream.externalDirection, "incoming");
    assert.equal(stage.nodeMap.output.externalDirection, "outgoing");
    assert.deepEqual(
      stage.edges.flatMap((edge) => edge.originalEdgeIds).sort(),
      dag.edges.map((edge) => edge.id).sort(),
    );
    for (const edge of stage.edges) assert.ok(edge.path.startsWith("M") && !/NaN|Infinity/.test(edge.path));
    assert.equal(JSON.stringify(dag), before);
  }),
  defineTest(
    "long nested group headers reserve controls and member geometry with accurate internal counts",
    async () => {
      const dag = boundaryFixture();
      const stage = await layout(dag, view());
      const counts = countGroupInternalEdges(dag);
      assert.equal(counts.get("focus"), 1);
      assert.equal(counts.get("inner"), 1);
      assert.equal(counts.get("upstream"), 0);
      const inner = stage.groups!.find((group) => group.id === "inner")!;
      assert.ok(inner.width >= groupMinimumWidth(inner.title));
      assert.equal(inner.internalEdgeCount, 1);
      for (const id of ["a", "b"]) {
        const node = stage.nodeMap[id];
        assert.ok(node.x - node.width / 2 >= inner.x);
        assert.ok(node.x + node.width / 2 <= inner.x + inner.width);
        assert.ok(node.y - node.height / 2 >= inner.y + GROUP_CONTENT_TOP);
        assert.ok(node.y + node.height / 2 <= inner.y + inner.height);
      }
    },
  ),
  defineTest("revisited fold sets reuse exact cached geometry independent of array order", async () => {
    const dag = siblingsFixture();
    const cache = new CompoundStageCache();
    const first = input(dag, view(["ga", "gb"]));
    const same = input(dag, view(["gb", "ga", "ga"]));
    assert.equal(compoundStageCacheKey(first), compoundStageCacheKey(same));
    const stage = await layout(dag, first.view);
    cache.set(first, stage);
    assert.equal(cache.get(same), stage);
    assert.equal(cache.previous(input(dag, view())), stage);
    assert.equal(cache.previous(input(dag, view([], "ga"))), undefined);
    assert.equal(cache.get(input(siblingsFixture(), same.view)), undefined);
    assert.equal(cache.get({ ...same, showNodeDetail: false }), undefined);
    assert.equal(cache.get({ ...same, showEdgeLabels: false }), undefined);
  }),
  defineTest("hidden relationship labels consume no layout width and preserve edge details", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, b: {} },
      edges: [{ id: "ab", source: "a", target: "b", value: "Long relationship detail ".repeat(15) }],
    });
    const visible = await layout(dag, view());
    const hidden = await buildCompoundStage({ ...input(dag, view()), showEdgeLabels: false }, new ELK());
    assert.ok(hidden.stageWidth < visible.stageWidth);
    assert.equal(hidden.edges[0].label, visible.edges[0].label);
    assert.deepEqual(hidden.edges[0].originalEdgeIds, ["ab"]);
    assert.ok(hidden.edges[0].path.startsWith("M"));
  }),
]);
