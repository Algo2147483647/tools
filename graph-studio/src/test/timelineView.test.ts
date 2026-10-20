import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeDagInput } from "../graph/normalize";
import { sanitizeTimelineSettings } from "../graph/timelineSettings";
import { buildTimelineStage } from "../layout/timeline-layout";
import { projectTimelineStage } from "../layout/timeline-project";
import { getTimelineAxisTicks } from "../layout/timeline-ticks";
import { timelineTimeToY } from "../layout/timeline-axis";
import { parseTimelineDate } from "../graph/timeline";
import TimelineBackdrop from "../rendering/TimelineBackdrop";
import { getInitialGraphPagePreferences, parseGraphPagePreferences } from "../state/preferences";
import { defineSuite, defineTest } from "./harness";

const document = () =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    metadata: { timeline: {} },
    nodes: {
      a: { title: "甲", type: "政治", time: { at: "1000" } },
      b: { title: "乙", type: "经济", time: { at: "1500" } },
      c: { title: "丙", type: "政治", time: { at: "1501" } },
    },
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
    ],
  });

export const timelineViewSuite = defineSuite("Timeline view integration", [
  defineTest("clipped overlapping periods move only their labels without colliding", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `period-${i}`,
          { title: `Period ${i}`, time: { start: String(1800 + i * 10), end: "2000" } },
        ]),
      ),
      edges: [],
    });
    const base = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: { layout: "flow", axis: "adaptive" },
    })!;
    const before = JSON.stringify(base);
    const range = { start: parseTimelineDate("1900")!.timestamp, end: parseTimelineDate("1920")!.timestamp };
    const filtered = projectTimelineStage(base, new Set(Object.keys(dag.nodes)), range)!;
    assert.equal(JSON.stringify(base), before);
    assert.strictEqual(filtered.timeline!.axisMap, base.timeline!.axisMap);
    for (const [i, a] of filtered.nodes.entries()) {
      assert.equal(a.x, base.nodeMap[a.key].x);
      assert.equal(a.y, timelineTimeToY(base.timeline!.axisMap!, range.start));
      for (const b of filtered.nodes.slice(i + 1)) {
        const at = a.timeline!,
          bt = b.timeline!;
        assert.equal(
          at.labelX - 6 < bt.labelX + b.width + 6 &&
            at.labelX + a.width + 6 > bt.labelX - 6 &&
            at.labelY - 16 < bt.labelY + 24 &&
            at.labelY + 24 > bt.labelY - 16,
          false,
          `${a.key}/${b.key}`,
        );
      }
    }
  }),
  defineTest("interior time anchors join a period at the actual event date in both axis modes", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        period: { title: "Period", time: { start: "1800", end: "2000" } },
        event: { title: "Event", time: { at: "1905" } },
      },
      edges: [
        {
          id: "join",
          source: "period",
          target: "event",
          metadata: { timeline: { kind: "rendezvous", sourceTime: "1905" } },
        },
      ],
    });
    for (const axis of ["linear", "adaptive"] as const) {
      const stage = buildTimelineStage({
        dag,
        selection: { type: "full" },
        timelineSettings: { layout: "flow", axis },
      })!;
      const y = timelineTimeToY(stage.timeline!.axisMap!, parseTimelineDate("1905")!.timestamp);
      assert.equal(stage.edges[0].points![0].y, y);
      assert.equal(stage.nodeMap.event.y, y);
      assert.equal(stage.nodeMap.period.timeline!.ports![0].y, y);
      assert.equal(stage.warnings.length, 0);
    }
    dag.edges[0].metadata = { timeline: { sourceTime: "1700" } };
    const invalid = buildTimelineStage({ dag, selection: { type: "full" } })!;
    assert.match(invalid.warnings.join(" "), /time anchor outside/);
    assert.equal(invalid.edges[0].points![0].y, invalid.nodeMap.period.y);
  }),
  defineTest("time range clipping preserves the shared clock and original period data", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        period: { time: { start: "1800", end: "2000" } },
        event: { time: { at: "1905" } },
        hidden: { time: { at: "1850" } },
      },
      edges: [{ id: "join", source: "period", target: "event", metadata: { timeline: { sourceTime: "1905" } } }],
    });
    const base = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: { layout: "flow", axis: "adaptive" },
    })!;
    const before = JSON.stringify(base);
    const range = { start: parseTimelineDate("1900")!.timestamp, end: parseTimelineDate("1910")!.timestamp };
    const filtered = projectTimelineStage(base, new Set(Object.keys(dag.nodes)), range)!;
    assert.equal(JSON.stringify(base), before);
    assert.strictEqual(filtered.timeline!.axisMap, base.timeline!.axisMap);
    assert.deepEqual(filtered.nodes.map((node) => node.key).sort(), ["event", "period"]);
    assert.equal(filtered.nodeMap.event.x, base.nodeMap.event.x);
    assert.equal(filtered.nodeMap.event.y, base.nodeMap.event.y);
    assert.equal(filtered.nodeMap.period.timeline!.start, base.nodeMap.period.timeline!.start);
    assert.equal(filtered.nodeMap.period.timeline!.clippedStart, true);
    assert.equal(filtered.nodeMap.period.timeline!.clippedEnd, true);
    assert.equal(filtered.edges[0].points![0].y, base.nodeMap.event.y);
  }),
  defineTest("category projection preserves positions and time map and never invents links", () => {
    const base = buildTimelineStage({
      dag: document(),
      selection: { type: "full" },
      timelineSettings: { layout: "flow", axis: "adaptive" },
    })!;
    const filtered = projectTimelineStage(base, new Set(["a", "c"]))!;
    assert.strictEqual(filtered.timeline!.axisMap, base.timeline!.axisMap);
    assert.strictEqual(filtered.nodeMap.a, base.nodeMap.a);
    assert.strictEqual(filtered.nodeMap.c, base.nodeMap.c);
    assert.equal(filtered.edges.length, 0);
    assert.deepEqual([...filtered.connectedKeysByNode.get("a")!], ["a"]);
    assert.equal(filtered.stageHeight, base.stageHeight);
    assert.equal(projectTimelineStage(base, new Set()), null);
  }),
  defineTest("exports keep a minimal English ruler without category tracks or explanations", () => {
    const stage = buildTimelineStage({
      dag: document(),
      selection: { type: "full" },
      timelineSettings: { layout: "flow", axis: "adaptive" },
    })!;
    const html = renderToStaticMarkup(createElement(TimelineBackdrop, { stage }));
    assert.match(html, /TIME · UTC/);
    assert.doesNotMatch(html, /非线性|长度不代表|关系流/);
    assert.doesNotMatch(html, /timeline-cluster/);
    assert.doesNotMatch(html, /class="timeline-track-guide"/);
    assert.deepEqual(
      stage.timeline!.ticks,
      getTimelineAxisTicks(
        stage.timeline!.axisMap!,
        stage.timeline!.originY,
        stage.timeline!.originY + stage.timeline!.axisMap!.height,
        1,
      ),
    );
  }),
  defineTest("custom calendar interval reaches static SVG ticks without converting event dates", () => {
    const dag = document();
    const before = JSON.stringify(dag);
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timelineSettings: { axis: "linear", tickUnit: "year", tickStep: 37 },
    })!;
    assert.ok(stage.timeline!.ticks.length > 0);
    assert.ok(stage.timeline!.ticks.every((tick) => new Date(tick.time).getUTCFullYear() % 37 === 0));
    assert.equal(JSON.stringify(dag), before);
  }),
  defineTest("timeline preferences round trip and reject invalid option values", () => {
    const prefs = getInitialGraphPagePreferences();
    prefs.timelineSettings = sanitizeTimelineSettings({
      layout: "flow",
      axis: "adaptive",
      tickStep: 17,
      tickUnit: "year",
      compactness: 0.8,
      horizontalSpread: 2.4,
    });
    assert.deepEqual(parseGraphPagePreferences(JSON.stringify(prefs))!.timelineSettings, prefs.timelineSettings);
    const invalid = sanitizeTimelineSettings({
      layout: "bad",
      axis: "bad",
      tickStep: NaN,
      compactness: -10,
      horizontalSpread: -2,
      pins: { a: Infinity, b: 200 },
    });
    assert.equal(invalid.layout, "tracks");
    assert.equal(invalid.axis, "linear");
    assert.equal(invalid.compactness, -10);
    assert.equal(invalid.horizontalSpread, -2);
    assert.equal(sanitizeTimelineSettings({ horizontalSpread: Infinity }).horizontalSpread, 1);
    assert.equal(sanitizeTimelineSettings(null).horizontalSpread, 1);
    assert.deepEqual(invalid.pins, { b: 200 });
  }),
]);
