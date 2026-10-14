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

export const timelineRenderingSuite = defineSuite("Timeline rendering", [
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
    assert.equal((html.match(/role="button"/g) || []).length, 1);
    assert.equal((html.match(/class="timeline-node__title"/g) || []).length, 1);
    assert.match(html, /fill-opacity: .65/);
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
