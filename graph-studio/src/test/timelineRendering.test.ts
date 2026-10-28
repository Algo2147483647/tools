import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getSettingsCatalog } from "../components/settings/settingsCatalog";
import TimelineIntervalSettings from "../components/timeline/TimelineIntervalSettings";
import TimelinePointSettings from "../components/timeline/TimelinePointSettings";
import { TimelineIntervalTextSettings, TimelinePointTextSettings } from "../components/timeline/TimelineTextSettings";
import { DEFAULT_GRAPH_APPEARANCE } from "../schema/appearance/defaults";
import { normalizeDagInput } from "../graph/normalize";
import { timelineTypeColor } from "../graph/timeline/colors";
import { resolveTimeline as sanitizeTimelineSettings } from "../schema/appearance/contract";
import { buildStageData } from "../layout/node-link/layout";
import { buildTimelineStage } from "../layout/timeline/layout";
import { timelineBarBox } from "../layout/timeline/orientation";
import { projectTimelineStage } from "../layout/timeline/project";
import { getVisibleTimeTicks } from "../layout/timeline/ticks";
import GraphEdge from "../components/canvas/GraphEdge";
import GraphStage from "../components/canvas/GraphStage";
import TimelineNode from "../components/canvas/TimelineNode";
import { TIMELINE_CSS } from "../styles/timelineStyles";
import { defineSuite, defineTest } from "./harness";

export const timelineRenderingSuite = defineSuite("Timeline rendering", [
  defineTest(
    "point and anchor styles render independently; interval titles follow automatic colors and italic font",
    () => {
      const dag = normalizeDagInput({
        format: "graph-studio",
        version: 3,
        metadata: { timeline: { clock: { mode: "relative" } } },
        nodes: { point: { type: "Event", time: { at: 5 } }, bar: { type: "Period", time: { start: 0, end: 10 } } },
        edges: [{ id: "link", source: "bar", target: "point", metadata: { timeline: { sourceTime: 5 } } }],
      });
      const settings = sanitizeTimelineSettings({
        colorBy: "type",
        intervalTitle: "inside",
        intervalTextColorMode: "event",
        pointMarker: { shape: "square", size: 22, fill: "#112233", borderColor: "#abcdef", borderWidth: 3 },
        anchorMarker: { shape: "diamond", size: 10, fill: "#456789", borderWidth: 2 },
        pointTextColor: "#135790",
        pointDateVisible: false,
        leaderStyle: "dashed",
        leaderColor: "#345678",
        leaderWidth: 2,
      });
      const appearance = structuredClone(DEFAULT_GRAPH_APPEARANCE);
      appearance.cssVars["--dag-title-font-style"] = "italic";
      for (const orientation of ["horizontal", "vertical"] as const) {
        const stage = buildTimelineStage({
          dag,
          selection: { type: "full" },
          appearance,
          timelineSettings: { ...settings, orientation },
        })!;
        const render = (key: string) =>
          renderToStaticMarkup(
            createElement(TimelineNode, {
              node: stage.nodeMap[key],
              isActive: false,
              onClick() {},
              onFocusChange() {},
            }),
          );
        const point = render("point"),
          bar = render("bar");
        assert.match(point, /<rect[^>]*timeline-node__instant[^>]*width="22"/);
        assert.match(point, /--timeline-marker-fill:#112233/);
        assert.match(point, /--timeline-text-color:#135790/);
        assert.doesNotMatch(point, /<text class="timeline-node__date"/);
        assert.match(point, /--timeline-leader-dash:var\(--dag-timeline-leader-dash\)/);
        assert.equal((bar.match(/timeline-node__point timeline-node__anchor/g) || []).length, 3);
        assert.match(bar, /--timeline-marker-fill:#456789/);
        assert.ok(bar.includes(`--timeline-text-color:${stage.nodeMap.bar.timeline!.color}`));
        const hidden = buildTimelineStage({
          dag,
          selection: { type: "full" },
          timelineSettings: {
            ...settings,
            orientation,
            pointMarker: { ...settings.pointMarker, visible: false },
            anchorMarker: { ...settings.anchorMarker, visible: false },
            leaderStyle: "none",
          },
        })!;
        const markup = renderToStaticMarkup(
          createElement(TimelineNode, {
            node: hidden.nodeMap.point,
            isActive: false,
            onClick() {},
            onFocusChange() {},
          }),
        );
        assert.doesNotMatch(markup, /class="timeline-node__point|class="timeline-node__leader"/);
        assert.match(markup, /role="button"/);
        assert.equal(hidden.nodeMap.point.timeline!.start, 5);
      }
      assert.match(TIMELINE_CSS, /font-style: var\(--dag-title-font-style/);
      assert(
        getSettingsCatalog("timeline").some((item) => item.id === "style.appearance.cssVars[--dag-title-font-style]"),
      );
      const menu = renderToStaticMarkup(createElement(TimelinePointSettings, { settings, onChange() {} }));
      assert.match(menu, /Point marker shape/);
      assert.doesNotMatch(menu, /Point title color|Show point time label|Label leaders/);
      const intervalMenu = renderToStaticMarkup(createElement(TimelineIntervalSettings, { settings, onChange() {} }));
      assert.match(intervalMenu, /Interval fill style/);
      assert.doesNotMatch(intervalMenu, /Match interval|Interval title placement/);
      const pointText = renderToStaticMarkup(createElement(TimelinePointTextSettings, { settings, onChange() {} }));
      assert.match(pointText, /Point title color|Show point time label/);
      assert.doesNotMatch(pointText, /Point marker shape/);
      const intervalText = renderToStaticMarkup(
        createElement(TimelineIntervalTextSettings, { settings, onChange() {} }),
      );
      assert.match(intervalText, /Match interval/);
      assert.match(intervalText, /Interval title placement/);
      assert.doesNotMatch(intervalText, /Interval fill style/);
    },
  ),
  defineTest("zero cross-axis spread makes adjacent bars touch in tracks, flow, and explicit rows", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      for (const layout of ["tracks", "flow"] as const) {
        for (const rows of [false, true]) {
          for (const width of [8, 36, 80]) {
            const dag = normalizeDagInput({
              format: "graph-studio",
              version: 3,
              metadata: { timeline: { clock: { mode: "relative" } } },
              nodes: Object.fromEntries(
                ["a", "b", "c"].map((id, i) => [
                  id,
                  { time: { start: 0, end: 10 }, ...(rows ? { space: i + 1 } : {}) },
                ]),
              ),
              edges: [],
            });
            const stage = buildTimelineStage({
              dag,
              selection: { type: "full" },
              appearance: { ...DEFAULT_GRAPH_APPEARANCE, nodes: { ...DEFAULT_GRAPH_APPEARANCE.nodes, spread: 0 } },
              timelineSettings: {
                orientation,
                layout,
                intervalWidth: width,
                intervalTitle: "inside",
              },
            })!;
            const boxes = stage.nodes
              .map(timelineBarBox)
              .sort((a, b) => (orientation === "horizontal" ? a.y - b.y : a.x - b.x));
            for (let i = 1; i < boxes.length; i++) {
              const previous = boxes[i - 1],
                current = boxes[i];
              assert.equal(orientation === "horizontal" ? current.y - previous.y : current.x - previous.x, width);
            }
          }
        }
      }
    }
  }),
  defineTest("direct routes keep time anchors and stay straight after orientation and range projection", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      metadata: { timeline: { clock: { mode: "relative" } } },
      nodes: {
        a: { space: 1, time: { start: 0, end: 10 } },
        obstacle: { space: 2, time: { start: 0, end: 10 } },
        b: { space: 3, time: { at: 8 } },
      },
      edges: [
        { id: "ab", source: "a", target: "b", metadata: { timeline: { sourceTime: 2, targetTime: 8 } } },
        { id: "ba", source: "b", target: "a", metadata: { timeline: { sourceTime: 8, targetTime: 2 } } },
      ],
    });
    for (const orientation of ["horizontal", "vertical"] as const) {
      const stage = buildTimelineStage({
        dag,
        selection: { type: "full" },
        timelineSettings: { orientation, edgeRouting: "direct" },
      })!;
      const avoided = buildTimelineStage({
        dag,
        selection: { type: "full" },
        timelineSettings: { orientation, edgeRouting: "avoid" },
      })!;
      assert.ok(avoided.edges.some((edge) => edge.points!.length > 2));
      for (const edge of stage.edges) {
        assert.equal(edge.points!.length, 2);
        assert.doesNotMatch(edge.path, /[QC]/);
        assert.deepEqual(edge.points![0], avoided.edges.find((e) => e.id === edge.id)!.points![0]);
        assert.equal(edge.timeline!.backward, edge.id === "ba");
      }
      const projected = projectTimelineStage(stage, new Set(["a", "b", "obstacle"]), { start: 3, end: 9 })!;
      for (const edge of projected.edges) {
        assert.equal(edge.points!.length, 2);
        assert.doesNotMatch(edge.path, /[QC]/);
      }
      assert.equal(projected.timeline!.edgeRouting, "direct");
    }
    assert.throws(() => sanitizeTimelineSettings({ edgeRouting: "invalid" }), /expected/);
  }),
  defineTest("Timeline uses the same Type tokens as Node-link before and after filtering", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        a: { type: "Alpha", time: { start: "2000", end: "2003" } },
        b: { type: "Beta", time: { at: "2001" } },
        c: { type: " Alpha ", time: { at: "2002" } },
      },
      edges: [],
    });
    const nodes = buildStageData({ dag, selection: { type: "full" } })!;
    const timeline = buildTimelineStage({ dag, selection: { type: "full" }, timelineSettings: { colorBy: "type" } })!;
    for (const node of timeline.nodes) {
      assert.deepEqual(node.colorTokens, nodes.nodeMap[node.key].colorTokens);
      assert.equal(node.timeline!.color, node.colorTokens!.pinCore);
    }
    const filtered = projectTimelineStage(timeline, new Set(["b"]))!;
    assert.deepEqual(filtered.nodeMap.b.colorTokens, nodes.nodeMap.b.colorTokens);
    assert.notEqual(timeline.nodeMap.a.timeline!.color, timeline.nodeMap.b.timeline!.color);
  }),
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
          typeColors: { Period: "#6c8ebf", Other: "rgba(10, 20, 30, 0.5)" },
        }),
      ),
    );
    assert.throws(() => sanitizeTimelineSettings({ typeColors: { invalid: "url(evil)" } }), /color/);
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
            onFocusChange() {},
          }),
        );
        assert.match(svg, /--dag-timeline-color:#6c8ebf/);
      }
    }
    assert.equal(timelineTypeColor("Period", {}), timelineTypeColor("Period", { Other: "#000000" }));
    assert.match(timelineTypeColor("__proto__", {}), /^hsla\(/);
    assert.throws(() => sanitizeTimelineSettings({ colorBy: "invalid", typeColors: [] }), /expected/);
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
          intervalTextColorMode: "custom",
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
    for (const invalid of [{ intervalRadius: -1 }, { intervalBorderWidth: NaN }, { intervalTextColor: "url(evil)" }])
      assert.throws(() => sanitizeTimelineSettings(invalid));
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
        onFocusChange: noop,
      }),
    );
    assert.ok(html.indexOf('class="timeline-label-layer"') > html.indexOf('class="dag-node-layer"'));
    assert.ok(html.indexOf('class="dag-node-layer"') > html.indexOf('class="dag-edge-layer"'));
    assert.ok(html.indexOf('class="dag-edge-layer"') > html.indexOf('class="timeline-leader-layer"'));
    assert.equal((html.match(/role="button"/g) || []).length, 1);
    assert.equal((html.match(/class="timeline-node__title"/g) || []).length, 1);
    assert.match(html, /fill-opacity: var\(--dag-timeline-label-opacity\)/);
    assert.match(html, /--dag-timeline-label-opacity:0.65/);
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
