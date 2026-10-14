import assert from "node:assert/strict";
import { normalizeDagInput } from "../graph/normalize";
import type { TimelineViewSettings } from "../graph/timelineSettings";
import { timelineTimeToY } from "../layout/timeline-axis";
import { buildTimelineStage } from "../layout/timeline-layout";
import type { StageNode } from "../layout/types";
import { defineSuite, defineTest } from "./harness";

const example = () => ({
  format: "graph-studio",
  version: 3,
  nodes: {
    origin: { title: "起点", type: "政治", track: "甲", time: { at: "1000-01-01" } },
    left: { title: "经济分支", type: "经济", track: "甲", time: { at: "1200-01-01" } },
    right: { title: "文化分支", type: "文化", track: "乙", time: { at: "1200-01-01" } },
    merge: { title: "共同汇合", type: "政治", track: "丙", time: { at: "1400-01-01" } },
    later: { title: "后续事件", type: "文化", track: "甲", time: { at: "1800-01-01" } },
  },
  edges: [
    ["origin", "left"],
    ["origin", "right"],
    ["left", "merge"],
    ["right", "merge"],
    ["merge", "later"],
  ].map(([source, target]) => ({
    id: `${source}-${target}`,
    source,
    target,
    metadata: { timeline: { kind: "sequence" } },
  })),
});
function stageFor(document: unknown, timelineSettings: Partial<TimelineViewSettings> = {}) {
  const stage = buildTimelineStage({
    dag: normalizeDagInput(document),
    selection: { type: "full" },
    timelineSettings: { layout: "flow", ...timelineSettings },
  });
  assert.ok(stage);
  return stage;
}
function label(node: StageNode) {
  return {
    left: node.timeline!.labelX - 6,
    right: node.timeline!.labelX + node.width + 6,
    top: node.timeline!.labelY - 16,
    bottom: node.timeline!.labelY + (node.detailLines.length ? 39 : 24),
  };
}
function marker(node: StageNode) {
  return { left: node.x - 8, right: node.x + 8, top: node.y - 8, bottom: node.timeline!.endY + 8 };
}
function overlaps(a: ReturnType<typeof label>, b: ReturnType<typeof label>) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export const timelineFlowSuite = defineSuite("Timeline relation flow", [
  defineTest("cross-category branches converge at one node and keep simultaneous anchors aligned", () => {
    const stage = stageFor(example());
    assert.equal(stage.timeline!.layout, "flow");
    assert.equal(stage.nodes.length, 5);
    assert.equal(stage.nodes.filter((node) => node.key === "merge").length, 1);
    assert.equal(stage.edges.filter((edge) => edge.target === "merge").length, 2);
    assert.equal(stage.nodeMap.left.y, stage.nodeMap.right.y);
    assert.notEqual(stage.nodeMap.left.x, stage.nodeMap.right.x);
    assert.equal(stage.nodeMap.left.timeline!.track, "经济");
    assert.deepEqual(stage.timeline!.tracks, []);
    assert.deepEqual(stage.lanes, []);
    stage.nodes.forEach((node) =>
      assert.equal(node.y, timelineTimeToY(stage.timeline!.axisMap!, node.timeline!.start!)),
    );
    stage.edges.forEach((edge) => {
      assert.equal(edge.points![0].x, stage.nodeMap[edge.source].x);
      assert.equal(edge.points![edge.points!.length - 1].x, stage.nodeMap[edge.target].x);
      assert.doesNotMatch(edge.path, /NaN|Infinity/);
    });
  }),
  defineTest("dense events avoid label, marker and duration collisions without changing dates", () => {
    const nodes = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `event-${String(index).padStart(2, "0")}`,
        {
          title: `事件 ${index}`,
          type: index % 2 ? "甲" : "乙",
          time:
            index < 5 ? { start: "2020-01-01", end: "2020-12-31" } : { at: index < 14 ? "2020-01-01" : "2020-02-01" },
        },
      ]),
    );
    const stage = stageFor({ format: "graph-studio", version: 3, nodes, edges: [] });
    for (const [index, first] of stage.nodes.entries()) {
      assert.equal(first.y, timelineTimeToY(stage.timeline!.axisMap!, first.timeline!.start!));
      for (const second of stage.nodes.slice(index + 1)) {
        assert.equal(overlaps(label(first), label(second)), false, `${first.key}/${second.key}: labels`);
        assert.equal(overlaps(marker(first), marker(second)), false, `${first.key}/${second.key}: markers`);
        assert.equal(overlaps(label(first), marker(second)), false, `${first.key}/${second.key}: label/bar`);
        assert.equal(overlaps(marker(first), label(second)), false, `${first.key}/${second.key}: bar/label`);
      }
    }
  }),
  defineTest("types and tracks never constrain relation flow positions", () => {
    const original = example();
    const stage = stageFor(original);
    const renamed = stageFor({
      ...original,
      nodes: Object.fromEntries(
        Object.entries(original.nodes).map(([key, node], index) => [
          key,
          { ...node, type: `Type ${index}`, track: `Track ${index}` },
        ]),
      ),
    });
    assert.deepEqual(
      stage.nodes.map((node) => [node.key, node.x, node.y]),
      renamed.nodes.map((node) => [node.key, node.x, node.y]),
    );
    assert.deepEqual(stage.timeline!.tracks, []);
  }),
  defineTest("input order does not change node positions, colors or routes", () => {
    const document = example();
    const first = stageFor(document, { axis: "adaptive" });
    const second = stageFor(
      {
        ...document,
        nodes: Object.fromEntries(Object.entries(document.nodes).reverse()),
        edges: document.edges.slice().reverse(),
      },
      { axis: "adaptive" },
    );
    assert.deepEqual(first.nodes, second.nodes);
    assert.deepEqual(first.edges, second.edges);
    assert.deepEqual(first.timeline, second.timeline);
  }),
  defineTest("horizontal pins retain exact time anchors and unpinned nodes avoid them", () => {
    const stage = stageFor(example(), { pins: { left: 600 } });
    assert.equal(stage.nodeMap.left.x, 600);
    assert.equal(stage.nodeMap.left.y, stage.nodeMap.right.y);
    assert.equal(overlaps(label(stage.nodeMap.left), label(stage.nodeMap.right)), false);
    assert.equal(overlaps(marker(stage.nodeMap.left), marker(stage.nodeMap.right)), false);
  }),
  defineTest("metadata can select the new layout while absent settings preserve existing tracks", () => {
    const document = example();
    const dag = normalizeDagInput({
      ...document,
      metadata: { timeline: { view: { layout: "flow", axis: "adaptive" } } },
    });
    const configured = buildTimelineStage({ dag, selection: { type: "full" } })!;
    assert.equal(configured.timeline!.layout, "flow");
    assert.equal(configured.timeline!.axisMap!.mode, "adaptive");
    const existing = buildTimelineStage({ dag: normalizeDagInput(document), selection: { type: "full" } })!;
    assert.equal(existing.timeline!.layout, "tracks");
    assert.equal(existing.timeline!.tracks.length, 3);
  }),
  defineTest("a retained map and full axis source preserve mapping through visibility changes", () => {
    const fullDag = normalizeDagInput(example());
    const full = buildTimelineStage({
      dag: fullDag,
      selection: { type: "full" },
      timelineSettings: { layout: "flow", axis: "adaptive" },
    })!;
    const subset = normalizeDagInput({
      ...example(),
      nodes: { left: example().nodes.left, merge: example().nodes.merge },
      edges: [],
    });
    const sourced = buildTimelineStage({
      dag: subset,
      axisSource: fullDag,
      selection: { type: "full" },
      timelineSettings: { layout: "flow", axis: "adaptive" },
    })!;
    assert.deepEqual(sourced.timeline!.axisMap, full.timeline!.axisMap);
    const retained = buildTimelineStage({
      dag: subset,
      timelineAxis: full.timeline!.axisMap,
      selection: { type: "full" },
      timelineSettings: { layout: "flow", axis: "adaptive" },
    })!;
    assert.equal(retained.nodeMap.left.y, full.nodeMap.left.y);
    assert.equal(retained.nodeMap.merge.y, full.nodeMap.merge.y);
  }),
  defineTest("undated and invalid-only flow views have finite geometry without an artificial time", () => {
    const stage = stageFor({
      format: "graph-studio",
      version: 3,
      nodes: { a: { type: "计划" }, b: { type: "记录", time: { at: "broken" } } },
      edges: [{ id: "ab", source: "a", target: "b" }],
    });
    assert.equal(stage.timeline!.start, null);
    assert.equal(stage.timeline!.axisMap, undefined);
    assert.equal(stage.nodes.length, 2);
    assert.ok(stage.nodes.every((node) => [node.x, node.y, node.timeline!.labelY].every(Number.isFinite)));
    assert.equal(stage.warnings.length, 2);
  }),
]);
