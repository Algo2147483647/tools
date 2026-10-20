import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeDagInput } from "../graph/normalize";
import { buildTimelineStage } from "../layout/timeline-layout";
import TimelineNode from "../rendering/TimelineNode";
import GraphEdge from "../rendering/GraphEdge";
import GraphStage from "../rendering/GraphStage";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getVisibleTimeTicks } from "../rendering/TimelineBackdrop";
import { defineSuite, defineTest } from "./harness";
import { sanitizeTimelineSettings } from "../graph/timelineSettings";
import { timelineTypeColor } from "../graph/timelineColors";
import { projectTimelineStage } from "../layout/timeline-project";

export const timelineRenderingSuite = defineSuite("Timeline rendering", [
  defineTest("Type colors cross tracks, survive filtering and exports without changing geometry", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        a: { type: "Period", track: "First", time: { start: "2000", end: "2004" } },
        b: { type: "Period", track: "Second", time: { at: "2001" } },
        c: { type: "Other", track: "First", time: { at: "2002" } },
        d: { time: { at: "2003" } },
      },
      edges: [{ id: "ab", source: "a", target: "b" }],
    });
    const settings = sanitizeTimelineSettings(
      JSON.parse(
        JSON.stringify({
          colorBy: "type",
          typeColors: { Period: "#6c8ebf", Other: "rgba(10, 20, 30, 0.5)", invalid: "url(evil)" },
        }),
      ),
    );
    assert.equal(settings.typeColors.invalid, undefined);
    for (const orientation of ["horizontal", "vertical"] as const) {
      for (const layout of ["tracks", "flow"] as const) {
        const stage = buildTimelineStage({
          dag,
          selection: { type: "full" },
          timelineSettings: { ...settings, orientation, layout },
        })!;
        const trackStage = buildTimelineStage({
          dag,
          selection: { type: "full" },
          timelineSettings: { ...settings, orientation, layout, colorBy: "track" },
        })!;
        assert.equal(stage.nodeMap.a.timeline!.color, "#6c8ebf");
        assert.equal(stage.nodeMap.b.timeline!.color, "#6c8ebf");
        assert.equal(stage.nodeMap.c.timeline!.color, "rgba(10, 20, 30, 0.5)");
        assert.equal(stage.nodeMap.d.timeline!.color, "#64748b");
        assert.equal(stage.edges[0].timeline!.color, "#6c8ebf");
        for (const node of stage.nodes)
          assert.deepEqual([node.x, node.y], [trackStage.nodeMap[node.key].x, trackStage.nodeMap[node.key].y]);
        assert.equal(projectTimelineStage(stage, new Set(["b"]))!.nodeMap.b.timeline!.color, "#6c8ebf");
        const svg = renderToStaticMarkup(
          createElement(TimelineNode, {
            node: stage.nodeMap.a,
            isActive: false,
            onClick() {},
            onContextMenu() {},
            onFocusChange() {},
          }),
        );
        assert.match(svg, /--dag-timeline-color:#6c8ebf/);
      }
    }
    assert.equal(timelineTypeColor("Period", {}), timelineTypeColor("Period", { Other: "#000000" }));
    assert.match(timelineTypeColor("__proto__", {}), /^#[\da-f]{6}$/);
    assert.equal(sanitizeTimelineSettings({ colorBy: "invalid", typeColors: [] }).colorBy, "track");
  }),
  defineTest("interval appearance survives sanitizing and stays separate from instant text", () => {
    const settings = sanitizeTimelineSettings(
      JSON.parse(
        JSON.stringify({
          intervalBorder: "dashed",
          intervalBorderWidth: 3,
          intervalBorderColor: "#123456",
          intervalRadius: 0,
          intervalTextColor: "#abcdef",
        }),
      ),
    );
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { time: { start: "2000", end: "2005" } }, b: { time: { at: "2002" } } },
      edges: [],
    });
    for (const orientation of ["horizontal", "vertical"] as const) {
      const stage = buildTimelineStage({
        dag,
        selection: { type: "full" },
        timelineSettings: { ...settings, orientation },
      })!;
      const render = (key: string) =>
        renderToStaticMarkup(
          createElement(TimelineNode, {
            node: stage.nodeMap[key],
            isActive: false,
            onClick: () => {},
            onContextMenu: () => {},
            onFocusChange: () => {},
          }),
        );
      assert.match(render("a"), /data-interval-border="dashed"/);
      assert.match(render("a"), /--timeline-border-width:3/);
      assert.match(render("a"), /--timeline-border-color:#123456/);
      assert.match(render("a"), /--timeline-text-color:#abcdef/);
      assert.match(render("a"), /class="timeline-node__duration"[^>]*rx="0"/);
      assert.doesNotMatch(render("b"), /--timeline-text-color:/);
    }
    const invalid = sanitizeTimelineSettings({
      intervalRadius: -2,
      intervalBorderWidth: Infinity,
      intervalTextColor: "url(evil)",
    });
    assert.equal(invalid.intervalRadius, 0);
    assert.equal(invalid.intervalBorderWidth, 1.5);
    assert.equal(invalid.intervalTextColor, "");
  }),
  defineTest("track headings follow explicit rows instead of allocated track positions", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        a: { track: "First", space: 4, time: { at: "2000" } },
        b: { track: "Second", space: 1, time: { at: "2001" } },
      },
      edges: [],
    });
    for (const orientation of ["horizontal", "vertical"] as const) {
      const stage = buildTimelineStage({ dag, selection: { type: "full" }, timelineSettings: { orientation } })!;
      for (const track of stage.timeline!.tracks) {
        const node = stage.nodes.find((node) => node.timeline!.track === track.id)!;
        assert.equal(track.x + 10, orientation === "horizontal" ? node.y : node.x);
      }
    }
  }),
  defineTest("labels render above markers and edges with translucent backgrounds and one accessible control", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { title: "Event", time: { at: "2001" } } },
      edges: [],
    });
    const stage = buildTimelineStage({ dag, selection: { type: "full" } })!;
    const noop = () => {};
    const html = renderToStaticMarkup(
      createElement(GraphStage, {
        stage,
        focusedKey: null,
        hideNodeBorders: false,
        appearance: DEFAULT_GRAPH_APPEARANCE,
        svgRef: { current: null },
        onNodeClick: noop,
        onNodeDoubleClick: noop,
        onNodeContextMenu: noop,
        onBackgroundContextMenu: noop,
        onFocusChange: noop,
      }),
    );
    assert.ok(html.indexOf('class="timeline-label-layer"') > html.indexOf('class="dag-node-layer"'));
    assert.ok(html.indexOf('class="dag-node-layer"') > html.indexOf('class="dag-edge-layer"'));
    assert.ok(html.indexOf('class="dag-edge-layer"') > html.indexOf('class="timeline-leader-layer"'));
    assert.equal((html.match(/role="button"/g) || []).length, 1);
    assert.equal((html.match(/class="timeline-node__title"/g) || []).length, 1);
    assert.match(html, /fill-opacity: .65/);
    assert.match(html, /class="timeline-node__leader" d="M [\d. -]+ L [\d. -]+"/);
  }),
  defineTest("details are hidden by default and can be enabled", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { title: "Event", define: "Event details", time: { at: "2001-01-01" } } },
      edges: [],
    });
    const compact = buildTimelineStage({ dag, selection: { type: "full" } })!;
    const expanded = buildTimelineStage({ dag, selection: { type: "full" }, showNodeDetail: true })!;
    assert.deepEqual(compact.nodes[0].detailLines, []);
    assert.ok(expanded.nodes[0].detailLines.length > 0);
    const render = (node: (typeof compact.nodes)[number]) =>
      renderToStaticMarkup(
        createElement(TimelineNode, {
          node,
          isActive: false,
          onClick: () => {},
          onContextMenu: () => {},
          onFocusChange: () => {},
        }),
      );
    assert.doesNotMatch(render(compact.nodes[0]), /class="timeline-node__detail"/);
    assert.match(render(expanded.nodes[0]), /class="timeline-node__detail"/);
  }),
  defineTest("duration is one accessible event with exact endpoint positions", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { title: "Flight & return", time: { start: "1969-07-16", end: "1969-07-24" } } },
      edges: [],
    });
    const node = buildTimelineStage({ dag, selection: { type: "full" } })!.nodes[0];
    const html = renderToStaticMarkup(
      createElement(TimelineNode, {
        node,
        isActive: false,
        onClick: () => {},
        onContextMenu: () => {},
        onFocusChange: () => {},
      }),
    );
    assert.equal((html.match(/role="button"/g) || []).length, 1);
    assert.match(html, /data-time-kind="range"/);
    assert.match(html, /Flight &amp; return/);
    assert.match(html, /timeline-node__duration/);
    assert.ok(html.includes(`y1="${node.timeline!.endY}"`));
  }),
  defineTest("backward relations keep their direction marker and declared kind", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { time: { at: "2001-01-01" } }, b: { time: { at: "2000-01-01" } } },
      edges: [{ id: "ab", source: "a", target: "b", metadata: { timeline: { kind: "reference" } } }],
    });
    const edge = buildTimelineStage({ dag, selection: { type: "full" } })!.edges[0];
    const html = renderToStaticMarkup(createElement(GraphEdge, { edge, showLabel: true }));
    assert.match(html, /data-backward="true"/);
    assert.match(html, /data-timeline-kind="reference"/);
    assert.match(html, /marker-end="url\(#timeline-arrow-/);
  }),
  defineTest("ruler adapts detail to zoom and aligns years to the calendar", () => {
    const start = Date.parse("1957-01-01"),
      end = Date.parse("2026-01-01");
    const ppm = 2500 / (end - start);
    const distant = getVisibleTimeTicks(start, end, ppm, 100, 100, 2600, 0.2);
    const close = getVisibleTimeTicks(start, end, ppm, 100, 100, 2600, 2);
    assert.ok(close.length > distant.length);
    assert.ok(
      distant.every((tick) => new Date(tick.time).getUTCMonth() === 0 && new Date(tick.time).getUTCDate() === 1),
    );
    assert.ok(close.every((tick) => tick.time >= start && tick.time <= end));
    assert.deepEqual(getVisibleTimeTicks(null, null, 0, 0, 0, 500, 1), []);
  }),
]);
