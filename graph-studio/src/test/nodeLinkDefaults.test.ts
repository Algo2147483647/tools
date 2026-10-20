import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getGraphAppearancePresets, applyAppearanceCommand } from "../graph/appearanceCommands";
import { getDefaultChartStyle, createChartStyles, sanitizeChartStyle } from "../state/chartStyles";
import { parseGraphPagePreferences } from "../state/preferences";
import { createChartPreferences, chartPreferencesReducer, getChartStyles } from "../state/chartPreferences";
import { resetAppearanceSection } from "../components/settings/appearanceSections";
import { buildStageData } from "../layout/stage-layout";
import GraphStage from "../rendering/GraphStage";
import { createSampleDag } from "./fixtures";
import { defineSuite, defineTest } from "./harness";
import { parseConsoleSource } from "../console/dsl";

export const nodeLinkDefaultsSuite = defineSuite("Node-link default preset", [
  defineTest("new graphs and Default share one complete style; presets stay scoped to chart type", () => {
    const style = getDefaultChartStyle("node-link");
    assert.deepEqual(createChartStyles()["node-link"], style);
    assert.deepEqual(
      getGraphAppearancePresets("node-link").map((p) => p.id),
      ["default"],
    );
    assert.deepEqual(
      applyAppearanceCommand(DEFAULT_GRAPH_APPEARANCE, { type: "applyPreset", presetId: "default" }, "node-link")
        .appearance,
      style.appearance,
    );
    assert.deepEqual(
      applyAppearanceCommand(DEFAULT_GRAPH_APPEARANCE, { type: "resetAppearance" }, "node-link").appearance,
      style.appearance,
    );
    for (const chartType of ["node-link", "compound", "sankey", "timeline"] as const) {
      const presets = getGraphAppearancePresets(chartType);
      assert.deepEqual(
        presets.map((preset) => preset.id),
        chartType === "compound" || chartType === "timeline" ? ["default", "preset-2"] : ["default"],
      );
      assert.deepEqual(presets[0].appearance, getDefaultChartStyle(chartType).appearance);
      assert.deepEqual(
        applyAppearanceCommand(style.appearance, { type: "applyPreset", presetId: "default" }, chartType).appearance,
        getDefaultChartStyle(chartType).appearance,
      );
    }
    for (const removed of ["simple", "compact", "slate", "blueprint", "contrast", "presentation"]) {
      assert.equal(parseConsoleSource(`/style-preset ${removed}`).ok, false);
    }
    assert.equal(parseConsoleSource("/style-preset preset-2").ok, true);
    assert.equal(
      applyAppearanceCommand(style.appearance, { type: "applyPreset", presetId: "preset-2" }, "compound").appearance
        .layout.maxNodeWidth,
      240,
    );
    assert.throws(
      () => applyAppearanceCommand(style.appearance, { type: "applyPreset", presetId: "preset-2" }, "node-link"),
      /not available/,
    );
    assert.equal(style.showNodeDetail, false);
    assert.equal(style.hideNodeBorders, true);
    assert.equal(style.alignNodeWidthsToMax, true);
    assert.equal(getDefaultChartStyle("compound").appearance.layout.nodeHeight, 100);
  }),
  defineTest("actual default nodes render equal widths, no details, dots and open stroke arrows", () => {
    const style = getDefaultChartStyle("node-link");
    const stage = buildStageData({ dag: createSampleDag(), selection: { type: "full" }, ...style })!;
    assert.ok(stage.nodes.every((node) => node.width === 240 && node.height === 48 && !node.detailLines.length));
    const noop = () => {};
    const html = renderToStaticMarkup(
      createElement(GraphStage, {
        ...style,
        stage,
        focusedKey: null,
        svgRef: { current: null },
        onNodeClick: noop,
        onNodeDoubleClick: noop,
        onNodeContextMenu: noop,
        onBackgroundContextMenu: noop,
        onFocusChange: noop,
      }),
    );
    assert.match(html, /data-borderless="true"/);
    assert.match(html, /rx="16" ry="16"/);
    assert.match(html, /d="M1 1 L9 4 L1 7" fill="none" stroke="context-stroke"/);
    assert.equal((html.match(/class="dag-node__pin-core"/g) || []).length, stage.nodes.length);
    assert.doesNotMatch(html, /class="dag-node__detail|class="dag-edge__label-text/);
    assert.equal(style.appearance.cssVars["--dag-title-font-family"], '"Times New Roman", serif');
    assert.equal(style.appearance.cssVars["--dag-edge"], "#e1e3e6");
    assert.equal(style.appearance.cssVars["--dag-edge-active"], "#8b1e2d");
  }),
  defineTest("saved styles retain explicit values without guessing previous defaults", () => {
    const previous = sanitizeChartStyle(null);
    const styles = createChartStyles();
    styles["node-link"] = previous;
    assert.deepEqual(parseGraphPagePreferences(JSON.stringify({ chartStyles: styles }))!.chartStyles, styles);
    styles["node-link"] = getDefaultChartStyle("node-link");
    styles["node-link"].appearance.cssVars["--dag-edge-active"] = "#a9afb8";
    assert.deepEqual(parseGraphPagePreferences(JSON.stringify({ chartStyles: styles }))!.chartStyles, styles);
  }),
  defineTest("Default applies atomically and undo/redo restore display options without touching other types", () => {
    const styles = createChartStyles();
    styles["node-link"] = sanitizeChartStyle(null);
    let state = createChartPreferences(styles);
    const original = getChartStyles(state)["node-link"];
    const compound = state.compound;
    const { appearance, ...display } = getDefaultChartStyle("node-link");
    state = chartPreferencesReducer(state, {
      chartType: "node-link",
      action: { type: "commit", appearance, display, label: "Default" },
    });
    assert.deepEqual(getChartStyles(state)["node-link"], { appearance, ...display });
    assert.equal(state["node-link"].undoStack.length, 1);
    state = chartPreferencesReducer(state, { chartType: "node-link", action: { type: "undo" } });
    assert.deepEqual(getChartStyles(state)["node-link"], original);
    state = chartPreferencesReducer(state, { chartType: "node-link", action: { type: "redo" } });
    assert.deepEqual(getChartStyles(state)["node-link"], { appearance, ...display });
    assert.equal(state.compound, compound);
  }),
  defineTest("section resets use Node-link defaults while preserving unrelated settings", () => {
    const defaults = getDefaultChartStyle("node-link").appearance;
    const custom = structuredClone(defaults);
    custom.display.nodeCornerRadius = 30;
    custom.display.edgeArrowStyle = "filled";
    custom.cssVars["--dag-edge"] = "#222222";
    const nodes = resetAppearanceSection(custom, "nodes", defaults);
    assert.equal(nodes.display.nodeCornerRadius, 16);
    assert.equal(nodes.cssVars["--dag-edge"], "#222222");
    const edges = resetAppearanceSection(custom, "edges", defaults);
    assert.equal(edges.display.edgeArrowStyle, "open");
    assert.equal(edges.cssVars["--dag-edge"], "#e1e3e6");
  }),
]);
