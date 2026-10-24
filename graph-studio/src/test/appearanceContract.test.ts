import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defineSuite, defineTest } from "./harness";
import { getDefaultChartStyle } from "../state/chartStyles";
import { getAppearanceSchema } from "../schema/appearanceSchema";
import { createStyleDocument, parseStyleDocument, updateAppearanceSchemaValue } from "../schema/styleProtocol";
import { sanitizeTimelineSettings } from "../graph/timelineSettings";
import { sanitizeGraphAppearance } from "../graph/appearance";
import { normalizeDagInput } from "../graph/normalize";
import { buildTimelineStage } from "../layout/timeline-layout";
import { buildSpatialStage } from "../layout/spatial-layout";
import { buildStageData } from "../layout/stage-layout";
import { getStageAppearance } from "../layout/appearance";
import { buildCategoryColorMap } from "../graph/categoryColors";
import GraphDefs from "../rendering/GraphDefs";
import TimelineNode from "../rendering/TimelineNode";
import { createAppearanceUIModel } from "../components/settings/appearanceUIModel";
import { AppearanceUIContext, AppearanceUIOutlet } from "../components/settings/AppearanceUIContext";
import { APPEARANCE_UI, resolveUIPath, type AppearanceUINode } from "../components/settings/appearanceUIConfig";
import { APPEARANCE_RENDERERS } from "../components/settings/AppearanceUIRenderers";
import { resetChartStyleSection } from "../components/settings/appearanceSections";
import { PRESET_MANIFEST } from "../schema/presetManifest";
import { getGraphAppearancePresets } from "../graph/appearanceCommands";

const dag = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  metadata: { timeline: { clock: { mode: "relative" } } },
  nodes: {
    a: { title: "A long timeline title for measuring", define: "A longer description", time: { at: 1 } },
    b: { time: { at: 2 } },
  },
  edges: [{ id: "ab", source: "a", target: "b" }],
});
const noop = () => {};

export const appearanceContractSuite = defineSuite("Appearance contract", [
  defineTest("UI trees bind every registered level to Schema and retain rich controls", () => {
    for (const chart of ["node-link", "compound", "timeline", "sankey", "spatial"] as const) {
      const model = createAppearanceUIModel(chart, getDefaultChartStyle(chart));
      function check(node: AppearanceUINode, parent?: string) {
        if (node.charts && !node.charts.includes(chart)) return;
        const path = resolveUIPath(parent, node.path);
        if (path) assert.ok(model.bind(path), path);
        if (node.renderer) assert.ok(node.renderer in APPEARANCE_RENDERERS, node.renderer);
        node.children?.forEach((child) => check(child, path));
      }
      Object.values(APPEARANCE_UI).forEach((node) => check(node));
      const html = renderToStaticMarkup(
        createElement(
          AppearanceUIContext.Provider,
          { value: { model, registry: APPEARANCE_RENDERERS, commit: noop, query: "" } },
          createElement(AppearanceUIOutlet, { node: APPEARANCE_UI.dimensions }),
        ),
      );
      assert.match(html, /Minimum stage width/);
      assert.match(html, /Horizontal padding/);
      if (chart !== "spatial") assert.match(html, /Minimum width/);
    }
  }),
  defineTest("parent and leaf edits share atomic validation, resets and independent tuple coordinates", () => {
    const style = getDefaultChartStyle("timeline");
    style.timeline!.pins = { a: 24 };
    const model = createAppearanceUIModel("timeline", style);
    const widths = model.bind("style.appearance.layout").child("nodeWidthRange");
    const changed = widths.set([100, 500]);
    assert.deepEqual(changed.appearance.layout.nodeWidthRange, [100, 500]);
    assert.deepEqual(style.appearance.layout.nodeWidthRange, widths.defaultValue);
    assert.throws(() => widths.set([100]), /2 items/);
    const parent = model.bind("style.timeline").set({ ...style.timeline, orientation: "horizontal" });
    assert.deepEqual(parent.timeline!.pins, {});
    assert.deepEqual(parent, model.bind("style.timeline.orientation").set("horizontal"));
    assert.throws(() =>
      model.change([
        { path: "style.appearance.layout.stagePadding", value: [20, 30] },
        { path: "style.timeline.pointMarker.size", value: 200 },
      ]),
    );
    assert.deepEqual(style.timeline!.pins, { a: 24 });
    assert.deepEqual(
      style.appearance.layout.stagePadding,
      model.bind("style.appearance.layout.stagePadding").defaultValue,
    );
  }),
  defineTest("all boundaries enforce the same marker constraints without rewriting valid values", () => {
    for (const patch of [{ size: 200 }, { fill: "red" }, { borderWidth: -1 }]) {
      const style = getDefaultChartStyle("timeline");
      Object.assign(style.timeline!.pointMarker, patch);
      assert.throws(() => createStyleDocument("timeline", style));
      assert.throws(() => sanitizeTimelineSettings(style.timeline));
    }
    const style = getDefaultChartStyle("timeline");
    Object.assign(style.timeline!.pointMarker, { shape: "auto", size: 120, fill: "#ff0000" });
    const restored = parseStyleDocument(createStyleDocument("timeline", style), "timeline").style;
    assert.deepEqual(sanitizeTimelineSettings(restored.timeline), restored.timeline);
    assert.equal(restored.timeline!.pointMarker.shape, "auto");
    assert.throws(() => sanitizeGraphAppearance({ cssVars: { "--dag-title-font-size": "1.5em" } }), /pixel/);
    assert.throws(() => sanitizeGraphAppearance({ cssVars: { "--dag-flow-active-opacity": "2" } }), /opacity/);
  }),
  defineTest("minimum size and independent padding reach Timeline and Spatial geometry", () => {
    const style = getDefaultChartStyle("timeline");
    style.appearance.layout.stageMinSize = [5000, 4000];
    for (const orientation of ["vertical", "horizontal"] as const) {
      const stage = buildTimelineStage({
        dag,
        selection: null,
        appearance: getStageAppearance(style.appearance),
        timelineSettings: { ...style.timeline, orientation },
      })!;
      assert.ok(stage.stageWidth >= 5000 && stage.stageHeight >= 4000);
    }
    const spatialDag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      metadata: { space: { dimensions: 2, coordinateSystem: "cartesian" } },
      nodes: { a: { space: [0, 0] }, b: { space: [1, 1] } },
      edges: [],
    });
    const before = buildSpatialStage({ dag: spatialDag, appearance: getStageAppearance(style.appearance) });
    style.appearance.layout.stagePadding = [700, 800];
    const after = buildSpatialStage({ dag: spatialDag, appearance: getStageAppearance(style.appearance) });
    assert.ok(after.stageWidth >= 5000 && after.stageHeight >= 4000);
    assert.notDeepEqual(
      after.nodes.map((n) => [n.x, n.y]),
      before.nodes.map((n) => [n.x, n.y]),
    );
  }),
  defineTest("title and detail fonts change measured geometry and rendered label bounds together", () => {
    const style = getDefaultChartStyle("timeline");
    const build = () =>
      buildTimelineStage({
        dag,
        selection: null,
        appearance: getStageAppearance(style.appearance),
        timelineSettings: style.timeline,
        showNodeDetail: true,
      })!;
    const before = build();
    style.appearance.cssVars["--dag-title-font-size"] = "36px";
    style.appearance.cssVars["--dag-date-font-size"] = "24px";
    style.appearance.cssVars["--dag-detail-font-size"] = "26px";
    const after = build();
    assert.ok(after.nodeMap.a.timeline!.labelMetrics!.top > before.nodeMap.a.timeline!.labelMetrics!.top);
    assert.ok(after.nodeMap.a.timeline!.labelMetrics!.bottom > before.nodeMap.a.timeline!.labelMetrics!.bottom);
    const node = after.nodeMap.a,
      metrics = node.timeline!.labelMetrics!;
    const html = renderToStaticMarkup(
      createElement(TimelineNode, { node, isActive: false, onClick: noop, onContextMenu: noop, onFocusChange: noop }),
    );
    assert.ok(html.includes(`height="${metrics.top + metrics.bottom}"`));
    const small = buildStageData({
      dag,
      selection: null,
      appearance: getStageAppearance(getDefaultChartStyle("node-link").appearance),
      showNodeDetail: true,
    })!;
    const large = buildStageData({
      dag,
      selection: null,
      appearance: getStageAppearance(style.appearance),
      showNodeDetail: true,
    })!;
    assert.ok(large.nodeMap.a.contentLayout!.detailLineHeight > small.nodeMap.a.contentLayout!.detailLineHeight);
  }),
  defineTest("palettes, performance policy and custom CSS are configurable protocol values", () => {
    const style = getDefaultChartStyle("compound");
    const before = buildCategoryColorMap(["A", "B"], style.appearance.palette.categories);
    style.appearance.palette.categories = [[80, 60, 40]];
    assert.notDeepEqual(buildCategoryColorMap(["A", "B"], style.appearance.palette.categories), before);
    style.appearance.performance.denseShadows = "preserve";
    style.appearance.css = ".timeline-node__title { fill: #123456; }";
    assert.deepEqual(parseStyleDocument(createStyleDocument("compound", style), "compound").style, style);
    const html = renderToStaticMarkup(createElement(GraphDefs, { appearanceCss: style.appearance.css }));
    assert.ok(html.indexOf("@layer graph-custom {") > html.indexOf("@layer graph-theme {"));
    assert.ok(html.includes("#123456"));
    assert.equal(getDefaultChartStyle("timeline").appearance.css, "");
  }),
  defineTest("ordinary editors, resets and support declarations come from schema metadata", () => {
    const style = getDefaultChartStyle("timeline");
    style.appearance.cssVars["--dag-timeline-muted-opacity"] = "0.4";
    const model = createAppearanceUIModel("timeline", style);
    const html = renderToStaticMarkup(
      createElement(
        AppearanceUIContext.Provider,
        { value: { model, registry: APPEARANCE_RENDERERS, commit: noop, query: "" } },
        createElement(AppearanceUIOutlet, { node: APPEARANCE_UI.nodes }),
      ),
    );
    assert.match(html, /timeline-point-settings/);
    assert.match(html, /type="range"/);
    assert.match(html, /Point marker shape/);
    assert.doesNotMatch(html, /style.appearance.display.nodeCornerRadius/);
    const reset = resetChartStyleSection(style, "timeline", "nodes");
    assert.equal(reset.appearance.cssVars["--dag-timeline-muted-opacity"], "0.28");
    assert.equal(getAppearanceSchema("spatial").entries.get("style.appearance.layout.rowGap")?.editable, false);
    assert.equal(getAppearanceSchema("spatial").entries.get("style.appearance.layout.stageMinSize")?.editable, true);
    style.timeline!.pins = { a: 123 };
    assert.deepEqual(
      updateAppearanceSchemaValue("timeline", style, "style.timeline.orientation", "horizontal").timeline!.pins,
      {},
    );
  }),
  defineTest("preset registration accepts a new schema document without code branches", () => {
    const presets = PRESET_MANIFEST.timeline.presets;
    const added = structuredClone(presets[0]);
    added.id = "audit-preset";
    added.label = "Audit preset";
    added.document.style.appearance.layout.stageMinSize = [1400, 900];
    presets.push(added);
    try {
      assert.deepEqual(
        getGraphAppearancePresets("timeline").find((p) => p.id === "audit-preset")!.document.style.appearance.layout
          .stageMinSize,
        [1400, 900],
      );
    } finally {
      presets.pop();
    }
  }),
]);
