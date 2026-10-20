import assert from "node:assert/strict";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { normalizeDagInput } from "../graph/normalize";
import {
  getTimelineRelation,
  parseNodeTimeline,
  parseTimelineDate,
  parseTimelineTime,
  validateTimelineTime,
} from "../graph/timeline";
import type { GraphSelection } from "../graph/types";
import { buildTimelineStage, routeTimelineEdge } from "../layout/timeline-layout";
import { defineSuite, defineTest } from "./harness";

const now = Date.parse("2026-10-14T00:00:00Z");
const document = () => ({
  format: "graph-studio",
  version: 3,
  nodes: {
    launch: { title: "Launch", time: { at: "1969-07-16T13:32:00Z" }, track: "Apollo" },
    cruise: {
      title: "Outbound cruise",
      time: { start: "1969-07-16T13:32:00Z", end: "1969-07-19T17:21:00Z" },
      track: "Apollo",
    },
    split: { title: "Separation", time: { at: "1969-07-20T17:44:00Z" }, track: "Apollo" },
    moon: {
      title: "Moon surface stay",
      time: { start: "1969-07-20T20:17:00Z", end: "1969-07-21T17:54:00Z" },
      track: "Eagle",
    },
    orbit: {
      title: "Lunar orbit",
      time: { start: "1969-07-20T17:44:00Z", end: "1969-07-21T21:35:00Z" },
      track: "Columbia",
    },
    dock: { title: "Docking", time: { at: "1969-07-21T21:35:00Z" }, track: "Apollo" },
    future: { title: "Undated plan", track: "Apollo" },
  },
  edges: [
    { id: "launch-cruise", source: "launch", target: "cruise" },
    { id: "cruise-split", source: "cruise", target: "split", metadata: { timeline: { kind: "dependency" } } },
    { id: "split-moon", source: "split", target: "moon" },
    { id: "split-orbit", source: "split", target: "orbit" },
    {
      id: "moon-dock",
      source: "moon",
      target: "dock",
      metadata: { timeline: { kind: "rendezvous", sourceAnchor: "end" } },
    },
    {
      id: "orbit-dock",
      source: "orbit",
      target: "dock",
      metadata: { timeline: { kind: "rendezvous", sourceAnchor: "end" } },
    },
    { id: "dock-launch", source: "dock", target: "launch", metadata: { timeline: { kind: "reference" } } },
  ],
});
const stageFor = (doc: unknown, selection: GraphSelection = { type: "full" }) =>
  buildTimelineStage({ dag: normalizeDagInput(doc), selection, now })!;

export const timelineSuite = defineSuite("Timeline time semantics and layout", [
  defineTest("horizontal spread changes both arrangements without moving any time coordinate", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        a: { title: "First simultaneous event", track: "A", time: { at: "2000" } },
        b: { title: "Second simultaneous event", track: "A", time: { at: "2000" } },
        c: { title: "Third simultaneous event", track: "B", time: { at: "2000" } },
        d: { title: "Later event", track: "A", time: { at: "2001" } },
      },
      edges: [{ id: "ad", source: "a", target: "d" }],
    });
    for (const layout of ["tracks", "flow"] as const)
      for (const axis of ["linear", "adaptive"] as const) {
        const build = (horizontalSpread: number) =>
          buildTimelineStage({
            dag,
            selection: { type: "full" },
            timelineSettings: { layout, axis, horizontalSpread },
          })!;
        const narrow = build(0.5),
          wide = build(3);
        const span = (stage: typeof narrow) =>
          Math.max(...stage.nodes.map((n) => n.x)) - Math.min(...stage.nodes.map((n) => n.x));
        assert.ok(span(wide) > span(narrow));
        assert.deepEqual(
          narrow.nodes.map((n) => [n.key, n.y]),
          wide.nodes.map((n) => [n.key, n.y]),
        );
        assert.deepEqual(
          narrow.nodes.map((n) => [n.key, n.width, n.height]),
          wide.nodes.map((n) => [n.key, n.width, n.height]),
        );
        for (const stage of [narrow, wide]) {
          assert.equal(stage.nodeMap.a.y, stage.nodeMap.b.y);
          assert.equal(stage.nodeMap.a.y, stage.nodeMap.c.y);
          const boxes = stage.nodes.map((n) => ({ x: n.timeline!.labelX, y: n.timeline!.labelY, w: n.width }));
          for (const [i, a] of boxes.entries())
            for (const b of boxes.slice(i + 1))
              assert.ok(Math.abs(a.y - b.y) >= 40 || a.x + a.w + 12 <= b.x || b.x + b.w + 12 <= a.x);
        }
      }
  }),
  defineTest("routing ignores label geometry and uses orthogonal segments", () => {
    const dag = normalizeDagInput(document());
    for (const layout of ["flow", "tracks"] as const) {
      const stage = buildTimelineStage({ dag, selection: { type: "full" }, timelineSettings: { layout }, now })!;
      const route = () =>
        dag.edges.map((edge, index) =>
          routeTimelineEdge(edge, index, stage.nodeMap, stage.timeline!.tracks, stage.timeline!.axisMap),
        );
      const before = route();
      for (const node of stage.nodes) {
        node.timeline!.labelX -= 500;
        node.timeline!.labelY += 500;
        node.width += 1000;
      }
      assert.deepEqual(route(), before);
      for (const edge of before) {
        const points = edge.points!;
        assert.ok(points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y));
      }
    }
  }),
  defineTest("calendar dates and explicit offsets parse without local-time ambiguity", () => {
    assert.deepEqual(parseTimelineDate("2000-02-29"), {
      timestamp: Date.parse("2000-02-29T00:00:00Z"),
      precision: "date",
    });
    assert.equal(
      parseTimelineDate("1969-07-20T16:17:00-04:00")!.timestamp,
      parseTimelineDate("1969-07-20T20:17:00Z")!.timestamp,
    );
    assert.equal(new Date(parseTimelineDate("0099-01-01")!.timestamp).getUTCFullYear(), 99);
    assert.equal(parseTimelineTime({ at: "2026-01-01T13:00Z" }).label, "2026-01-01 13:00 UTC");
    assert.equal(parseTimelineTime({ at: "2026-01-01T13:00:00Z" }).label, "2026-01-01 13:00:00 UTC");
    for (const value of [
      "1900-02-29",
      "2025-02-30",
      "2025-13-01",
      "2025-04-31",
      "2025-01-01T24:00:00Z",
      "2025-01-01T10:61:00Z",
      "2025-01-01T10:00:60Z",
      "2025-01-01T10:00:00+25:00",
      "2025-01-01T10:00:00",
      "2025-1-1",
      "June 1, 2025",
      123,
    ])
      assert.equal(parseTimelineDate(value), null, String(value));
  }),
  defineTest("missing, malformed, zero-length and ongoing intervals remain distinct", () => {
    assert.equal(parseNodeTimeline({}).status, "missing");
    for (const value of [
      null,
      "2025-01-01",
      {},
      { at: "2025-01-01", end: "2025-01-02" },
      { start: "2025-01-01" },
      { start: "2025-01-02", end: "2025-01-01" },
      { start: "2027-01-01", end: null },
    ])
      assert.equal(parseTimelineTime(value, now).status, "invalid");
    assert.equal(validateTimelineTime(undefined), null);
    assert.match(validateTimelineTime({ at: "invalid" })!, /valid/);
    assert.deepEqual(parseTimelineTime({ start: "2026-01-01", end: null }, now), {
      status: "dated",
      kind: "range",
      start: Date.parse("2026-01-01T00:00:00Z"),
      end: now,
      ongoing: true,
      precision: "date",
      label: "2026-01-01 → ongoing",
    });
    assert.equal(parseTimelineTime({ start: "2025-01-01", end: "2025-01-01" }).status, "dated");
  }),
  defineTest("equal timestamps and interval endpoints share an exact linear axis", () => {
    const stage = stageFor(document());
    assert.equal(stage.layoutMode, "timeline");
    assert.equal(stage.nodes.length, 7);
    assert.equal(stage.nodeMap.launch.y, stage.nodeMap.cruise.y);
    assert.notEqual(stage.nodeMap.launch.x, stage.nodeMap.cruise.x);
    assert.equal(stage.nodeMap.split.timeline!.startY, stage.nodeMap.orbit.timeline!.startY);
    assert.equal(stage.nodeMap.orbit.timeline!.endY, stage.nodeMap.dock.timeline!.startY);
    const cruise = stage.nodeMap.cruise.timeline!;
    assert.ok(
      Math.abs((cruise.endY - cruise.startY) / (cruise.end! - cruise.start!) - stage.timeline!.pixelsPerUnit) < 1e-12,
    );
    assert.equal(stage.nodeMap.future.timeline!.status, "missing");
    assert.ok(stage.nodeMap.future.y > stage.nodeMap.dock.y);
    assert.match(stage.warnings.join(" "), /no time/);
    assert.ok(stage.timeline!.ticks.every((tick) => Number.isFinite(tick.y)));
  }),
  defineTest("cycles keep real direction and metadata anchors without synthetic edges", () => {
    const stage = stageFor(document());
    assert.equal(stage.edges.length, document().edges.length);
    const backward = stage.edges.find((edge) => edge.id === "dock-launch")!;
    assert.equal(backward.timeline!.backward, true);
    assert.equal(backward.source, "dock");
    assert.equal(backward.target, "launch");
    const dependency = stage.edges.find((edge) => edge.id === "cruise-split")!;
    assert.equal(dependency.timeline!.sourceAnchor, "end");
    assert.equal(dependency.points![0].y, stage.nodeMap.cruise.timeline!.endY);
    const rendezvous = stage.edges.find((edge) => edge.id === "orbit-dock")!;
    assert.equal(rendezvous.points![0].y, rendezvous.points![rendezvous.points!.length - 1].y);
    stage.edges.forEach((edge) => assert.doesNotMatch(edge.path, /NaN|Infinity/));
    assert.deepEqual(
      getTimelineRelation({ timeline: { kind: "dependency", sourceAnchor: "start", targetAnchor: "end" } }),
      { kind: "dependency", sourceAnchor: "start", targetAnchor: "end" },
    );
    assert.deepEqual(getTimelineRelation(), { kind: "reference", sourceAnchor: "start", targetAnchor: "start" });
  }),
  defineTest("declared branches preserve continuity and merge back into the main channel", () => {
    const nodes = Object.fromEntries(
      ["a", "b", "c", "d", "e", "f"].map((key, index) => [key, { time: { at: `2020-0${index + 1}-01` } }]),
    );
    const edges = [
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["c", "e"],
      ["d", "f"],
      ["e", "f"],
    ].map(([source, target]) => ({
      id: source + target,
      source,
      target,
      metadata: { timeline: { kind: "sequence" } },
    }));
    const stage = stageFor({ format: "graph-studio", version: 3, nodes, edges });
    assert.equal(stage.nodeMap.a.x, stage.nodeMap.b.x);
    assert.equal(stage.nodeMap.b.x, stage.nodeMap.d.x);
    assert.equal(stage.nodeMap.c.x, stage.nodeMap.e.x);
    assert.notEqual(stage.nodeMap.b.x, stage.nodeMap.c.x);
    assert.equal(stage.nodeMap.f.x, stage.nodeMap.a.x);
  }),
  defineTest("same-time and subpixel connections do not turn back into spurious loops", () => {
    const stage = stageFor({
      format: "graph-studio",
      version: 3,
      nodes: {
        launch: { time: { at: "1959-01-02" } },
        phase: { time: { start: "1959-01-02", end: "1959-01-04" } },
        arrival: { time: { at: "1959-01-04" } },
        horizon: { time: { at: "2025-01-01" } },
      },
      edges: [
        { id: "same-time", source: "phase", target: "launch" },
        { id: "short-forward", source: "phase", target: "arrival" },
        { id: "short-backward", source: "arrival", target: "phase" },
        { id: "skip-phase", source: "launch", target: "arrival" },
      ],
    });
    assert.ok(stage.nodeMap.arrival.y - stage.nodeMap.launch.y < 1);
    for (const edge of stage.edges.filter((edge) => edge.id !== "skip-phase")) {
      const points = edge.points!;
      assert.ok(points.slice(1).every((point, i) => point.x === points[i].x || point.y === points[i].y));
      if (edge.id === "same-time") assert.equal(points.length, 2, "same-time markers connect horizontally");
    }
    assert.equal(stage.edges.find((edge) => edge.id === "short-backward")!.timeline!.backward, true);
    const bridge = stage.edges.find((edge) => edge.id === "skip-phase")!;
    const left = Math.min(stage.nodeMap.launch.x, stage.nodeMap.arrival.x);
    const right = Math.max(stage.nodeMap.launch.x, stage.nodeMap.arrival.x);
    assert.ok(bridge.points!.length > 2, "the skipped phase marker needs a local bridge");
    assert.ok(
      bridge.points!.every((point) => point.x >= left && point.x <= right),
      "no distant U-turn",
    );
    assert.ok(bridge.points!.every((point) => Math.abs(point.y - stage.nodeMap.launch.y) < 24));
  }),
  defineTest("long forward and backward edges bypass skipped markers without reversing time", () => {
    const stage = stageFor({
      format: "graph-studio",
      version: 3,
      nodes: {
        a: { time: { at: "2020-01-01" } },
        b: { time: { start: "2020-02-01", end: "2020-03-01" } },
        c: { time: { at: "2020-04-01" } },
      },
      edges: [
        { id: "ac", source: "a", target: "c" },
        { id: "ca", source: "c", target: "a" },
      ],
    });
    assert.equal(stage.nodeMap.a.x, stage.nodeMap.b.x);
    assert.equal(stage.nodeMap.a.x, stage.nodeMap.c.x);
    for (const edge of stage.edges) {
      const points = edge.points!;
      const direction = edge.timeline!.backward ? -1 : 1;
      assert.ok(
        points.some((point) => point.x < stage.nodeMap.b.x - 8),
        "bypass the duration bar",
      );
      assert.ok(points.slice(1).every((point, index) => (point.y - points[index].y) * direction >= 0));
    }
  }),
  defineTest("duration endpoint connections stay horizontal when their timestamps coincide", () => {
    const stage = stageFor({
      format: "graph-studio",
      version: 3,
      nodes: {
        phase: { time: { start: "1959-01-02", end: "1959-01-04" } },
        arrival: { time: { at: "1959-01-04" } },
        horizon: { time: { at: "2025-01-01" } },
      },
      edges: [{ id: "at-end", source: "phase", target: "arrival", metadata: { timeline: { sourceAnchor: "end" } } }],
    });
    const edge = stage.edges[0];
    assert.equal(edge.points!.length, 2);
    assert.equal(edge.points![0].y, stage.nodeMap.phase.timeline!.endY);
    assert.equal(edge.points![0].y, edge.points![1].y);
    assert.notEqual(edge.points![0].x, edge.points![1].x);
    assert.doesNotMatch(edge.path, /NaN|Infinity/);
  }),
  defineTest("input order does not change lanes, colors, routes or label positions", () => {
    const input = document();
    const first = stageFor(input);
    const second = stageFor({
      ...input,
      nodes: Object.fromEntries(Object.entries(input.nodes).reverse()),
      edges: input.edges.slice().reverse(),
    });
    assert.deepEqual(first.nodes, second.nodes);
    assert.deepEqual(first.edges, second.edges);
    assert.deepEqual(first.timeline, second.timeline);
    for (const track of first.timeline!.tracks) {
      const labels = first.nodes
        .filter((node) => node.timeline!.track === track.id)
        .map((node) => ({ x: node.timeline!.labelX, y: node.timeline!.labelY, width: node.width, timeY: node.y }));
      for (const [index, a] of labels.entries()) {
        for (const b of labels.slice(index + 1))
          assert.ok(Math.abs(a.y - b.y) >= 40 || a.x + a.width + 12 <= b.x || b.x + b.width + 12 <= a.x);
      }
    }
  }),
  defineTest("track order starts with earliest dated history, with stable ties and undated tracks last", () => {
    const input = {
      format: "graph-studio",
      version: 3,
      nodes: {
        moon: { track: "Apollo", time: { at: "1969-07-16" } },
        early: { track: "Early space", time: { at: "1957-10-04" } },
        unknown: { track: "A plans" },
        station: { track: "Z stations", time: { at: "1971-04-19" } },
        tie: { track: "B stations", time: { at: "1971-04-19" } },
        invalid: { track: "B invalid", time: { at: "broken" } },
      },
      edges: [],
    };
    const stage = stageFor(input);
    assert.deepEqual(
      stage.timeline!.tracks.map((track) => track.id),
      ["Early space", "Apollo", "B stations", "Z stations", "A plans", "B invalid"],
    );
    const reversed = stageFor({ ...input, nodes: Object.fromEntries(Object.entries(input.nodes).reverse()) });
    assert.deepEqual(stage.timeline!.tracks, reversed.timeline!.tracks);
    const apolloOnly = stageFor(input, { type: "node", key: "moon" });
    assert.equal(stage.nodeMap.moon.timeline!.color, apolloOnly.nodeMap.moon.timeline!.color);
  }),
  defineTest("full, forest and focused selections include disconnected cycles correctly", () => {
    const input = document();
    const doc = {
      ...input,
      nodes: { ...input.nodes, x: { time: { at: "1970-01-01" } }, y: { time: { at: "1971-01-01" } } },
      edges: [...input.edges, { id: "xy", source: "x", target: "y" }, { id: "yx", source: "y", target: "x" }],
    };
    assert.equal(stageFor(doc).nodes.length, 9);
    const focused = stageFor(doc, { type: "node", key: "x" });
    assert.deepEqual(
      focused.nodes.map((node) => node.key),
      ["x", "y"],
    );
    assert.equal(focused.edges.length, 2);
    const forest = stageFor(doc, { type: "forest", keys: ["x", "future"], label: "Selected events" });
    assert.equal(forest.nodes.length, 3);
    assert.equal(forest.edges.length, 2);
    assert.ok(forest.nodes.every((node) => !node.key.startsWith("__selection")));
  }),
  defineTest("invalid-only, single-event and zero-length ranges have finite visible geometry", () => {
    for (const time of [
      undefined,
      { at: "broken" },
      { at: "2020-01-01" },
      { start: "2020-01-01", end: "2020-01-01" },
    ]) {
      const stage = stageFor({
        format: "graph-studio",
        version: 3,
        nodes: { a: time === undefined ? {} : { time } },
        edges: [],
      });
      assert.ok(stage.nodes.length === 1 && stage.stageWidth > 0 && stage.stageHeight > 0);
      assert.ok(
        [
          stage.nodeMap.a.x,
          stage.nodeMap.a.y,
          stage.nodeMap.a.width,
          stage.nodeMap.a.height,
          stage.timeline!.pixelsPerUnit,
        ].every(Number.isFinite),
      );
      if (time?.at === "broken") assert.match(stage.warnings[0], /valid/);
    }
  }),
  defineTest("simultaneous programs keep exact anchors while labels share width and adapt vertically", () => {
    const nodes = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `program-${index}`,
        { title: `Program ${index}`, time: { start: "1960-01-01", end: "2020-01-01" }, track: "Programs" },
      ]),
    );
    const stage = stageFor({ format: "graph-studio", version: 3, nodes, edges: [] });
    assert.equal(new Set(stage.nodes.map((node) => node.x)).size, 100);
    assert.equal(new Set(stage.nodes.map((node) => node.timeline!.labelX)).size, 1);
    const labels = stage.nodes.slice().sort((a, b) => a.timeline!.labelY - b.timeline!.labelY);
    for (let i = 1; i < labels.length; i++)
      assert.ok(labels[i].timeline!.labelY >= labels[i - 1].timeline!.labelY + 40);
    const channels = stage.nodes.map((node) => node.x).sort((a, b) => a - b);
    assert.ok(Math.abs(channels[1] - channels[0] - 79.2) < 1e-8, "100% uses the former 180% channel spacing");
    assert.ok(stage.stageWidth < 6000 * 1.8, "duration channels do not each reserve a text column");
    assert.ok(stage.stageHeight < 11_000);
    assert.equal(new Set(stage.nodes.map((node) => node.y)).size, 1);
  }),
  defineTest("snapshot date controls ongoing events and sizing respects appearance", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      metadata: { timeline: { asOf: "2025-01-01" } },
      nodes: { a: { time: { start: "2020-01-01", end: null } } },
      edges: [],
    });
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      appearance: { ...DEFAULT_GRAPH_APPEARANCE, layout: { ...DEFAULT_GRAPH_APPEARANCE.layout, maxNodeWidth: 400 } },
    })!;
    assert.equal(stage.nodeMap.a.timeline!.end, Date.parse("2025-01-01T00:00:00Z"));
    assert.ok(stage.nodeMap.a.width > 0 && stage.nodeMap.a.width <= 400);
    assert.equal(stage.timeline!.timeZone, "UTC");
  }),
  defineTest("time windows include boundary events and intersecting intervals without fabricating edges", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        before: { time: { at: "2019-12-31" } },
        left: { time: { at: "2020-01-01" } },
        inside: { time: { at: "2020-01-05" } },
        right: { time: { at: "2020-01-10" } },
        after: { time: { at: "2020-01-11" } },
        spanning: { time: { start: "2018-01-01", end: "2022-01-01" } },
        entering: { time: { start: "2019-01-01", end: "2020-01-01" } },
        leaving: { time: { start: "2020-01-10", end: "2021-01-01" } },
        old: { time: { start: "2010-01-01", end: "2011-01-01" } },
        undated: {},
        invalid: { time: { at: "broken" } },
      },
      edges: [
        { id: "before-left", source: "before", target: "left" },
        { id: "left-inside", source: "left", target: "inside" },
        { id: "inside-right", source: "inside", target: "right" },
        { id: "right-after", source: "right", target: "after" },
        { id: "entering-spanning", source: "entering", target: "spanning" },
      ],
    });
    const rangeStart = Date.parse("2020-01-01T00:00:00Z"),
      rangeEnd = Date.parse("2020-01-10T00:00:00Z");
    const stage = buildTimelineStage({
      dag,
      selection: { type: "full" },
      timeRange: { start: rangeStart, end: rangeEnd },
    })!;
    assert.deepEqual(stage.nodes.map((node) => node.key).sort(), [
      "entering",
      "inside",
      "leaving",
      "left",
      "right",
      "spanning",
    ]);
    assert.deepEqual(
      stage.edges.map((edge) => edge.id),
      ["entering-spanning", "inside-right", "left-inside"],
    );
    assert.equal(stage.timeline!.start, rangeStart);
    assert.equal(stage.timeline!.end, rangeEnd);
    assert.equal(stage.timeline!.filtered, true);
    assert.equal(stage.timeline!.undatedY, null);
    const span = stage.nodeMap.spanning.timeline!;
    assert.equal(span.start, Date.parse("2018-01-01T00:00:00Z"));
    assert.equal(span.end, Date.parse("2022-01-01T00:00:00Z"));
    assert.equal(span.clippedStart, true);
    assert.equal(span.clippedEnd, true);
    assert.equal(span.startY, stage.nodeMap.left.y);
    assert.equal(span.endY, stage.nodeMap.right.y);
    assert.equal(span.startY, stage.timeline!.originY);
    assert.equal(stage.nodeMap.entering.timeline!.startY, stage.nodeMap.entering.timeline!.endY);
    assert.equal(stage.nodeMap.leaving.timeline!.startY, stage.nodeMap.leaving.timeline!.endY);
    assert.equal(stage.nodeMap.left.timeline!.clippedStart, undefined);
    assert.equal(stage.edges.find((edge) => edge.id === "entering-spanning")!.timeline!.backward, true);
    assert.deepEqual(stage.warnings, []);
    // Resolve descendant selection before clipping away its root; no unrelated events appear.
    const focused = buildTimelineStage({
      dag,
      selection: { type: "node", key: "before" },
      timeRange: { start: rangeStart, end: rangeEnd },
    })!;
    assert.deepEqual(
      focused.nodes.map((node) => node.key),
      ["left", "inside", "right"],
    );
    assert.equal(focused.edges.length, 2);
  }),
  defineTest("one-sided windows preserve explicit limits and clip ongoing events", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { time: { start: "2020-01-01", end: null } }, b: { time: { at: "2019-01-01" } }, undated: {} },
      edges: [],
    });
    const bound = Date.parse("2024-01-01T00:00:00Z");
    const from = buildTimelineStage({ dag, selection: { type: "full" }, now, timeRange: { start: bound } })!;
    assert.equal(from.nodes.length, 1);
    assert.equal(from.timeline!.start, bound);
    assert.equal(from.timeline!.end, now);
    assert.equal(from.nodeMap.a.timeline!.clippedStart, true);
    assert.equal(from.nodeMap.a.timeline!.clippedEnd, undefined);
    const through = buildTimelineStage({ dag, selection: { type: "full" }, now, timeRange: { end: bound } })!;
    assert.equal(through.nodes.length, 2);
    assert.equal(through.timeline!.start, Date.parse("2019-01-01T00:00:00Z"));
    assert.equal(through.timeline!.end, bound);
    assert.equal(through.nodeMap.a.timeline!.clippedEnd, true);
    assert.equal(through.nodeMap.a.timeline!.ongoing, true);
    assert.equal(through.nodeMap.a.timeline!.end, now);
  }),
  defineTest("empty, invalid and point time windows never produce invalid geometry", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        a: { time: { at: "2020-01-01" } },
        b: { time: { start: "2019-01-01", end: "2021-01-01" } },
        undated: {},
      },
      edges: [],
    });
    for (const timeRange of [
      { start: NaN },
      { end: Infinity },
      { start: -Infinity },
      { start: 2, end: 1 },
      { start: 1e20 },
      { end: Date.parse("2010-01-01T00:00:00Z") },
    ])
      assert.equal(buildTimelineStage({ dag, selection: { type: "full" }, timeRange }), null);
    const bound = Date.parse("2020-01-01T00:00:00Z");
    const stage = buildTimelineStage({ dag, selection: { type: "full" }, timeRange: { start: bound, end: bound } })!;
    assert.equal(stage.nodes.length, 2);
    assert.equal(stage.timeline!.start, bound);
    assert.equal(stage.timeline!.end, bound);
    assert.equal(stage.timeline!.ticks.length, 1);
    assert.ok(Number.isFinite(stage.timeline!.pixelsPerUnit));
    assert.ok(
      stage.nodes.every((node) => [node.x, node.y, node.timeline!.startY, node.timeline!.endY].every(Number.isFinite)),
    );
    assert.equal(stage.nodeMap.a.y, stage.nodeMap.b.y);
    const unfiltered = buildTimelineStage({ dag, selection: { type: "full" }, timeRange: {} })!;
    assert.equal(unfiltered.nodes.length, 3);
    assert.equal(unfiltered.timeline!.filtered, undefined);
  }),
]);
