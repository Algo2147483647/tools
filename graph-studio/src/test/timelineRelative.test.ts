import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { applyGraphCommand } from "../graph/commands";
import { parseNodeTimeline, parseTimelineTime } from "../graph/timeline";
import { formatRelativeTime, getTimelineClock, sanitizeTimelineClock } from "../graph/timelineClock";
import { parseTimelineRangeInput, timelineRangeDates } from "../graph/timelineRange";
import { sanitizeTimelineSettings } from "../graph/timelineSettings";
import { buildTimelineStage } from "../layout/timeline-layout";
import { projectTimelineStage } from "../layout/timeline-project";
import { timelineTimeToY } from "../layout/timeline-axis";
import { getTimelineAxisTicks } from "../layout/timeline-ticks";
import { timelineBarBox } from "../layout/timeline-orientation";
import { getNodeLocatePoint } from "../hooks/useGraphZoom";
import TimelineNode from "../rendering/TimelineNode";
import TimelineBackdrop from "../rendering/TimelineBackdrop";
import TimelineControls from "../components/TimelineControls";
import TimelineIntervalSettings from "../components/TimelineIntervalSettings";
import { TimelineIntervalTextSettings } from "../components/TimelineTextSettings";
import NodeTimeEditor from "../components/NodeTimeEditor";
import { buildHtmlPayload } from "../rendering/export-html";
import { defineSuite, defineTest } from "./harness";

const clock = sanitizeTimelineClock({
  mode: "relative",
  unit: "minute",
  origin: "领取",
  format: "elapsed",
  precision: 2,
});
function graph() {
  return normalizeDagInput({
    format: "graph-studio",
    version: 3,
    metadata: { timeline: { clock } },
    nodes: {
      pre: { title: "Prepare", time: { at: -2.5 } },
      a: { title: "Participation window", time: { start: 0, end: 30 }, status: "active" },
      b: { title: "Verify", time: { start: 5, end: 10.5 }, status: "blocked" },
      end: { title: "Reward", time: { at: 30 } },
    },
    edges: [
      { id: "pre-a", source: "pre", target: "a", metadata: { timeline: { kind: "sequence" } } },
      { id: "a-b", source: "a", target: "b", metadata: { timeline: { kind: "dependency", sourceTime: 5 } } },
      { id: "a-end", source: "a", target: "end", metadata: { timeline: { kind: "sequence", sourceAnchor: "end" } } },
    ],
  });
}
const stageFor = (orientation: "vertical" | "horizontal" = "horizontal") =>
  buildTimelineStage({
    dag: graph(),
    selection: { type: "full" },
    timelineSettings: {
      orientation,
      layout: "flow",
      intervalTitle: "inside",
      relativeTickStep: 0.5,
    },
  })!;
const renderNode = (node: ReturnType<typeof stageFor>["nodes"][number]) =>
  renderToStaticMarkup(
    createElement(
      "svg",
      {},
      createElement(TimelineNode, { node, isActive: false, onClick() {}, onContextMenu() {}, onFocusChange() {} }),
    ),
  );

export const timelineRelativeSuite = defineSuite("Relative and horizontal timeline", [
  defineTest("relative coordinates are numeric, finite, ordered and distinct from dates", () => {
    for (const value of [-2.5, 0, 0.125, 30]) {
      const time = parseNodeTimeline({ time: { at: value } }, undefined, clock);
      assert.equal(time.status, "dated");
      if (time.status === "dated") {
        assert.equal(time.start, value);
        assert.equal(time.precision, "relative");
      }
    }
    for (const time of [
      { start: 3, end: 2 },
      { at: Infinity },
      { at: NaN },
      { start: 0, end: null },
      { basis: "relative", at: "2000" },
      { at: 0, start: 1 },
    ])
      assert.equal(parseTimelineTime(time).status, "invalid");
    assert.equal(parseNodeTimeline({ time: { at: "2026" } }, undefined, clock).status, "invalid");
    assert.equal(parseNodeTimeline({ time: { at: 6 } }, undefined, sanitizeTimelineClock(null)).status, "invalid");
  }),
  defineTest("relative layout never constructs or reads the calendar clock", () => {
    const dag = graph();
    const original = globalThis.Date;
    globalThis.Date = new Proxy(original, {
      construct() {
        throw new Error("Relative layout constructed a date");
      },
      get(target, key) {
        if (key === "now")
          return () => {
            throw new Error("Relative layout read wall clock");
          };
        return Reflect.get(target, key);
      },
    });
    try {
      const stage = buildTimelineStage({
        dag,
        selection: { type: "full" },
        timelineSettings: { orientation: "horizontal" },
      })!;
      assert.equal(stage.timeline!.timeZone, null);
      assert.equal(stage.nodeMap.a.timeline!.start, 0);
      assert.ok(stage.timeline!.ticks.length);
    } finally {
      globalThis.Date = original;
    }
  }),
  defineTest("schematic, cyclic and duration units never rescale stored values", () => {
    for (const unit of ["unit", "cycle", "second", "minute", "hour", "day", "week"] as const) {
      const document = serializeDag(graph());
      const updated = normalizeDagInput({ ...document, metadata: { timeline: { clock: { ...clock, unit } } } });
      assert.deepEqual(serializeDag(updated).nodes.a.time, { start: 0, end: 30 });
      assert.equal(getTimelineClock(serializeDag(updated).metadata).unit, unit);
      const stage = buildTimelineStage({ dag: updated, selection: { type: "full" } })!;
      assert.equal(stage.timeline!.end, 30);
    }
    assert.equal(formatRelativeTime(0, clock), "领取");
    assert.equal(formatRelativeTime(30, clock), "领取后 30 分钟");
    assert.equal(formatRelativeTime(-0.25, clock), "领取前 0.25 分钟");
    assert.equal(formatRelativeTime(2, sanitizeTimelineClock({ mode: "relative" })), "T+2");
    assert.equal(formatRelativeTime(0, sanitizeTimelineClock({ mode: "relative" })), "T0");
  }),
  defineTest("horizontal bars and edge ports use exact time coordinates", () => {
    const stage = stageFor();
    const axis = stage.timeline!.axisMap!;
    const a = stage.nodeMap.a,
      b = stage.nodeMap.b;
    assert.equal(a.x, timelineTimeToY(axis, 0));
    assert.equal(b.x, timelineTimeToY(axis, 5));
    assert.ok(a.y !== b.y);
    const bar = timelineBarBox(a);
    assert.equal(bar.x + bar.width, timelineTimeToY(axis, 30));
    assert.equal(bar.height, 12);
    const edge = stage.edges.find((e) => e.id === "a-b")!;
    assert.equal(edge.points![0].x, timelineTimeToY(axis, 5));
    assert.equal(edge.points![0].y, a.y);
    assert.equal(edge.points!.at(-1)!.x, b.x);
    assert.equal(edge.timeline!.sourceTime, 5);
    assert.equal(a.timeline!.color, b.timeline!.color);
    assert.match(a.timeline!.color, /^hsla\(/);
    const point = getNodeLocatePoint(a);
    assert.deepEqual(point, { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 });
  }),
  defineTest("relative filtering is inclusive, clips geometry and retains numeric edge anchors", () => {
    assert.deepEqual(parseTimelineRangeInput("-2.5", "12.75", true), { ok: true, range: { start: -2.5, end: 12.75 } });
    assert.equal(parseTimelineRangeInput("date", "", true).ok, false);
    assert.equal(parseTimelineRangeInput("2", "-1", true).ok, false);
    assert.deepEqual(timelineRangeDates({ start: 0, end: 0.5 }, true), { from: "0", to: "0.5" });
    const stage = stageFor();
    const clipped = projectTimelineStage(stage, new Set(stage.nodes.map((n) => n.key)), { start: 2, end: 12 })!;
    assert.equal(clipped.nodes.length, 2);
    assert.equal(clipped.nodeMap.a.x, timelineTimeToY(stage.timeline!.axisMap!, 2));
    assert.equal(clipped.nodeMap.a.timeline!.start, 0);
    assert.equal(clipped.nodeMap.a.timeline!.clippedStart, true);
    assert.equal(clipped.edges[0].timeline!.sourceTime, 5);
    assert.equal(clipped.nodeMap.a.y, stage.nodeMap.a.y);
    assert.equal(clipped.nodeMap.b.y, stage.nodeMap.b.y);
  }),
  defineTest("both orientations show only the title inside bars with orientation-aware alignment", () => {
    for (const orientation of ["vertical", "horizontal"] as const) {
      const stage = stageFor(orientation);
      for (const align of ["start", "center", "end"] as const) {
        const node = { ...stage.nodeMap.a, timeline: { ...stage.nodeMap.a.timeline!, intervalAlign: align } };
        const html = renderNode(node);
        assert.match(html, /timeline-node__inside-title/);
        assert.doesNotMatch(html, /class="timeline-node__date"/);
        assert.doesNotMatch(html, /class="timeline-node__leader"/);
        assert.match(html, /clip-path="url\(#timeline-title-/);
        if (orientation === "horizontal")
          assert.ok(html.includes(`text-anchor="${align === "center" ? "middle" : align}"`));
      }
    }
  }),
  defineTest("relative ticks respect fractional intervals and avoid precision collisions", () => {
    const stage = stageFor();
    const map = stage.timeline!.axisMap!;
    const ticks = getTimelineAxisTicks(map, map.originY, map.originY + map.height, 4, undefined, clock, 0.25);
    assert.ok(ticks.some((t) => t.time < 0));
    assert.ok(ticks.some((t) => t.time === 0));
    assert.ok(ticks.every((t) => Math.abs(t.time * 4 - Math.round(t.time * 4)) < 1e-8));
    assert.equal(new Set(ticks.map((t) => t.label)).size, ticks.length);
    assert.deepEqual(getTimelineAxisTicks(map, map.originY, map.originY + map.height, 1, undefined, clock, 0), []);
  }),
  defineTest("metadata edits preserve node values and reject wrong-basis node edits", () => {
    const dag = graph();
    const changed = applyGraphCommand(dag, {
      type: "updateNodeFields",
      key: "pre",
      fields: { title: "Earlier", time: { at: -3.25 } },
    }).dag;
    assert.deepEqual(serializeDag(changed).nodes.pre.time, { at: -3.25 });
    assert.throws(
      () => applyGraphCommand(dag, { type: "updateNodeFields", key: "pre", fields: { time: { at: "2026" } } }),
      /basis|axis|calendar/,
    );
    const roundtrip = normalizeDagInput(JSON.parse(JSON.stringify(serializeDag(changed))));
    assert.deepEqual(getTimelineClock(roundtrip.metadata), clock);
  }),
  defineTest("horizontal calendar and relative modes work in tracks and flow with either axis", () => {
    for (const layout of ["tracks", "flow"] as const)
      for (const axis of ["linear", "adaptive"] as const) {
        const relativeStage = buildTimelineStage({
          dag: graph(),
          selection: { type: "full" },
          timelineSettings: { orientation: "horizontal", layout, axis },
        })!;
        assert.ok(
          relativeStage.nodeMap.pre.x < relativeStage.nodeMap.a.x &&
            relativeStage.nodeMap.a.x < relativeStage.nodeMap.b.x,
        );
        assert.ok(relativeStage.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
        const projected = projectTimelineStage(relativeStage, new Set(["a", "b"]))!;
        assert.equal(projected.nodeMap.a.timeline!.labelX, relativeStage.nodeMap.a.timeline!.labelX);
        assert.equal(projected.nodeMap.a.timeline!.labelY, relativeStage.nodeMap.a.timeline!.labelY);
        const calendar = normalizeDagInput({
          format: "graph-studio",
          version: 3,
          nodes: {
            a: { title: "Launch", time: { at: "2026-01-01" } },
            b: { title: "Build", time: { start: "2026-01-02", end: "2026-01-03" } },
          },
          edges: [{ id: "ab", source: "a", target: "b" }],
        });
        const stage = buildTimelineStage({
          dag: calendar,
          selection: { type: "full" },
          timelineSettings: { orientation: "horizontal", layout, axis },
        })!;
        assert.equal(stage.timeline!.timeZone, "UTC");
        assert.ok(stage.nodeMap.a.x < stage.nodeMap.b.x);
        assert.ok(stage.timeline!.ticks.length);
      }
  }),
  defineTest("horizontal pins move only across time while retaining numeric timestamps", () => {
    const original = stageFor();
    const pinned = buildTimelineStage({
      dag: graph(),
      selection: { type: "full" },
      timelineSettings: { orientation: "horizontal", layout: "flow", intervalTitle: "inside", pins: { a: 700 } },
    })!;
    assert.equal(pinned.nodeMap.a.y, 700);
    assert.equal(pinned.nodeMap.a.x, original.nodeMap.a.x);
    assert.equal(pinned.nodeMap.a.timeline!.start, 0);
  }),
  defineTest("bar width changes only the short dimension, including zero and values beyond the slider", () => {
    for (const orientation of ["horizontal", "vertical"] as const)
      for (const layout of ["tracks", "flow"] as const) {
        const build = (intervalWidth: number) =>
          buildTimelineStage({
            dag: graph(),
            selection: { type: "full" },
            timelineSettings: { orientation, layout, intervalTitle: "inside", intervalWidth },
          })!;
        const original = build(36);
        for (const width of [0, 64, 400.5]) {
          const stage = build(width),
            box = timelineBarBox(stage.nodeMap.a);
          assert.equal(orientation === "horizontal" ? box.height : box.width, width);
          assert.equal(stage.nodeMap.a.timeline!.startY, original.nodeMap.a.timeline!.startY);
          assert.equal(stage.nodeMap.a.timeline!.endY, original.nodeMap.a.timeline!.endY);
          assert.ok(orientation === "horizontal" ? box.y > stage.timeline!.axisX : box.x > stage.timeline!.axisX);
          assert.equal(sanitizeTimelineSettings({ intervalWidth: width }).intervalWidth, width);
        }
      }
  }),
  defineTest("protocol space fixes row indices across directions, layouts, clocks and spacing changes", () => {
    for (const relative of [true, false])
      for (const orientation of ["horizontal", "vertical"] as const)
        for (const layout of ["tracks", "flow"] as const)
          for (const axis of ["linear", "adaptive"] as const) {
            const time = relative ? { start: 0, end: 10 } : { start: "2026-01-01", end: "2026-01-11" };
            const dag = normalizeDagInput({
              format: "graph-studio",
              version: 3,
              metadata: { timeline: { clock: relative ? clock : { mode: "calendar" } } },
              nodes: {
                a: { title: "A", time, space: 3, track: "One" },
                overlap: { title: "Overlap", time, space: 3, track: "Two" },
                first: { title: "First", time, space: 1 },
                far: { title: "Far", time, space: 14 },
                undated: { title: "Undated", space: 7 },
                automatic: { title: "Automatic", time, track: "One" },
              },
              edges: [{ id: "edge", source: "a", target: "far" }],
            });
            const expected = { a: 3, overlap: 3, first: 1, far: 14, undated: 7 };
            const build = (spread: number) =>
              buildTimelineStage({
                dag,
                selection: { type: "full" },
                timelineSettings: {
                  orientation,
                  layout,
                  axis,
                  intervalTitle: "inside",
                  horizontalSpread: spread,
                  nodeGap: 90,
                  pins: { a: 999, first: 999, far: 999, undated: 999 },
                },
              })!;
            const original = build(1);
            for (const spread of [0, 1, 3]) {
              const stage = build(spread);
              const step = Math.max(12, (55.2 + 90) * spread);
              const rowCoordinate = (row: number) => 214 + (row - 1) * step;
              const cross = (key: string) =>
                orientation === "horizontal" ? stage.nodeMap[key].y : stage.nodeMap[key].x;
              for (const [key, row] of Object.entries(expected)) {
                assert.equal(cross(key), rowCoordinate(row));
                assert.equal(stage.nodeMap[key].timeline!.space, row);
              }
              assert.notEqual(cross("automatic"), rowCoordinate(3));
              assert.equal(stage.nodeMap.a.timeline!.startY, original.nodeMap.a.timeline!.startY);
              assert.equal(stage.nodeMap.a.timeline!.endY, original.nodeMap.a.timeline!.endY);
              assert.ok((orientation === "horizontal" ? stage.stageHeight : stage.stageWidth) > rowCoordinate(14));
              const edge = stage.edges[0];
              assert.equal(orientation === "horizontal" ? edge.points![0].y : edge.points![0].x, rowCoordinate(3));
              assert.equal(
                orientation === "horizontal" ? edge.points!.at(-1)!.y : edge.points!.at(-1)!.x,
                rowCoordinate(14),
              );
              const range = {
                start: relative ? 2 : Date.parse("2026-01-03"),
                end: relative ? 8 : Date.parse("2026-01-09"),
              };
              const filtered = projectTimelineStage(stage, new Set(["a", "far", "first"]), range)!;
              assert.equal(
                orientation === "horizontal" ? filtered.nodeMap.a.y : filtered.nodeMap.a.x,
                rowCoordinate(3),
              );
              assert.equal(
                orientation === "horizontal" ? filtered.nodeMap.first.y : filtered.nodeMap.first.x,
                rowCoordinate(1),
              );
            }
            assert.equal(normalizeDagInput(JSON.parse(JSON.stringify(serializeDag(dag)))).nodes.a.space, 3);
          }
  }),
  defineTest("space validates positive integer rows and persists edits without changing time", () => {
    for (const space of ["3", null, NaN, Infinity, {}, 0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(
        () => normalizeDagInput({ format: "graph-studio", version: 3, nodes: { a: { space } }, edges: [] }),
        /space.*positive safe integer/,
      );
    }
    const dag = applyGraphCommand(graph(), {
      type: "updateNodeFields",
      key: "a",
      fields: { ...serializeDag(graph()).nodes.a, space: 3 },
    }).dag;
    assert.deepEqual(dag.nodes.a.time, { start: 0, end: 30 });
    assert.equal(dag.nodes.a.space, 3);
    assert.throws(
      () => applyGraphCommand(dag, { type: "updateNodeFields", key: "a", fields: { space: "3" } }),
      /space.*positive safe integer/,
    );
  }),
  defineTest("menus, editors and exported details identify relative units without dates", () => {
    const controls = renderToStaticMarkup(
      createElement(TimelineControls, {
        clock,
        settings: sanitizeTimelineSettings({ orientation: "horizontal", intervalTitle: "inside" }),
        onChange() {},
        onReadapt() {},
      }),
    );
    assert.doesNotMatch(
      controls,
      /Timeline time basis|Relative tick interval|Relative time origin|Relative time unit|Relative display precision/,
    );
    assert.match(controls, /layout-engine-grid/);
    assert.doesNotMatch(controls, /Interval bars/);
    const intervals = renderToStaticMarkup(
      createElement(TimelineIntervalSettings, {
        settings: sanitizeTimelineSettings({ orientation: "horizontal", intervalTitle: "inside" }),
        onChange() {},
      }),
    );
    assert.match(intervals, /Thickness/);
    assert.doesNotMatch(intervals, /Interval color by|Interval status colors/);
    const intervalText = renderToStaticMarkup(
      createElement(TimelineIntervalTextSettings, {
        settings: sanitizeTimelineSettings({ orientation: "horizontal", intervalTitle: "inside" }),
        onChange() {},
      }),
    );
    assert.match(intervalText, />Left</);
    const editor = renderToStaticMarkup(
      createElement(NodeTimeEditor, {
        clock,
        time: { start: -0.5, end: 2 },
        track: "",
        readOnly: false,
        onChange() {},
      }),
    );
    assert.match(editor, /value="-0.5"/);
    assert.doesNotMatch(editor, /1969|Ongoing event|Event status/);
    const stage = stageFor();
    const backdrop = renderToStaticMarkup(createElement(TimelineBackdrop, { stage }));
    assert.match(backdrop, /分钟/);
    assert.doesNotMatch(backdrop, /UTC/);
    const payload = buildHtmlPayload(stage, graph());
    assert.match(payload.nodes.find((n) => n.key === "a")!.fields.find((f) => f.name === "time")!.text, /分钟/);
  }),
]);
