import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  appearanceToStageStyle,
  DEFAULT_GRAPH_APPEARANCE,
  DEFAULT_GRAPH_CSS,
  sanitizeGraphAppearance,
} from "../graph/appearance";
import { getStageAppearance } from "../layout/shared/appearance";
import { buildStageData } from "../layout/node-link/layout";
import GraphStage from "../rendering/GraphStage";
import { parseGraphPagePreferences } from "../state/preferences";
import { createStyleDocument } from "../schema/styleProtocol";
import { getDefaultChartStyle } from "../state/chartStyles";
import { createSampleDag } from "./fixtures";
import { defineSuite, defineTest } from "./harness";

export const appearanceSuite = defineSuite("appearance", [
  defineTest("card corner radius persists and renders within card bounds without changing layout inputs", () => {
    const stage = buildStageData({ dag: createSampleDag(), selection: { type: "node", key: "A" } })!;
    const noop = () => {};
    for (const [input, saved] of [
      [-10, -10],
      [0, 0],
      [16, 16],
      [999, 999],
    ]) {
      const appearance = sanitizeGraphAppearance({ display: { nodeCornerRadius: input } });
      const restored = parseGraphPagePreferences(
        JSON.stringify({
          chartStyles: {
            compound: createStyleDocument("compound", { ...getDefaultChartStyle("compound"), appearance }),
          },
        }),
      )!.chartStyles!.compound.style.appearance;
      assert.equal(restored.display.nodeCornerRadius, saved);
      assert.deepEqual(getStageAppearance(restored), getStageAppearance(DEFAULT_GRAPH_APPEARANCE));
      const html = renderToStaticMarkup(
        createElement(GraphStage, {
          stage,
          focusedKey: null,
          hideNodeBorders: false,
          appearance: restored,
          svgRef: { current: null },
          onNodeClick: noop,
          onNodeDoubleClick: noop,
          onNodeContextMenu: noop,
          onBackgroundContextMenu: noop,
          onFocusChange: noop,
        }),
      );
      const cards = [
        ...html.matchAll(/class="dag-node__shape" width="([\d.]+)" height="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g),
      ];
      assert.equal(cards.length, stage.nodes.length);
      for (const [, width, height, rx, ry] of cards) {
        assert.equal(Number(rx), Math.max(0, Math.min(saved, Number(width) / 2, Number(height) / 2)));
        assert.equal(rx, ry);
      }
    }
  }),
  defineTest("group statistics preference survives reload independently of node descriptions", () => {
    assert.equal(DEFAULT_GRAPH_APPEARANCE.display.showGroupStats, true);
    const appearance = sanitizeGraphAppearance({ display: { showGroupStats: false } });
    const parsed = parseGraphPagePreferences(
      JSON.stringify({
        chartStyles: {
          compound: createStyleDocument("compound", {
            ...getDefaultChartStyle("compound"),
            appearance,
            showNodeDetail: true,
          }),
        },
      }),
    );
    assert.equal(parsed!.chartStyles!.compound.style.appearance.display.showGroupStats, false);
    assert.equal(parsed!.chartStyles!.compound.style.showNodeDetail, true);
  }),
  defineTest("node dots default to visible and a hidden preference survives reload", () => {
    assert.equal(sanitizeGraphAppearance({ display: {} }).display.showNodeDots, true);
    const appearance = sanitizeGraphAppearance({ display: { showNodeDots: false } });
    const parsed = parseGraphPagePreferences(
      JSON.stringify({
        chartStyles: {
          "node-link": createStyleDocument("node-link", { ...getDefaultChartStyle("node-link"), appearance }),
        },
      }),
    );
    const restored = parsed!.chartStyles!["node-link"].style.appearance;
    assert.equal(restored.display.showNodeDots, false);
    assert.equal((appearanceToStageStyle(restored) as Record<string, unknown>)["--dag-node-pin-display"], "none");
    assert.equal(
      (appearanceToStageStyle(DEFAULT_GRAPH_APPEARANCE) as Record<string, unknown>)["--dag-node-pin-display"],
      "inline",
    );
  }),
  defineTest("sanitizeGraphAppearance fills defaults and preserves finite layout values", () => {
    const appearance = sanitizeGraphAppearance({
      nodes: { spacing: { column: -1, row: 999 }, widths: [999, 10] },
      canvas: { minSize: [10_000, 600] },
    });

    assert.equal(appearance.version, 1);
    assert.equal(appearance.nodes.spacing.column, -1);
    assert.equal(appearance.nodes.spacing.row, 999);
    assert.equal(appearance.nodes.widths[0], 999);
    assert.equal(appearance.nodes.widths[1], 10);
    assert.equal(appearance.canvas.minSize[0], 10_000);
    assert.equal(appearance.display.showEdgeLabels, false);
    assert.equal(appearance.css, DEFAULT_GRAPH_APPEARANCE.css);
  }),

  defineTest("sanitizeGraphAppearance preserves edge label display preference", () => {
    assert.equal(sanitizeGraphAppearance({ display: { showEdgeLabels: true } }).display.showEdgeLabels, true);
    assert.equal(sanitizeGraphAppearance({ display: { showEdgeLabels: false } }).display.showEdgeLabels, false);
    assert.throws(() => sanitizeGraphAppearance({ display: { showEdgeLabels: "false" } }), /expected boolean/);
    assert.equal(sanitizeGraphAppearance({ display: {} }).display.showEdgeLabels, false);
  }),

  defineTest("appearance input rejects unsupported variables and imports without rewriting", () => {
    assert.throws(() => sanitizeGraphAppearance({ cssVars: { "--graph-node-fill": "#000" } }), /--dag-/);
    assert.throws(() => sanitizeGraphAppearance({ css: "@import url(test);" }), /@import/);
    assert.throws(() => sanitizeGraphAppearance({ display: { nodeCornerRadius: NaN } }), /expected number/);
    assert.equal(
      sanitizeGraphAppearance({ css: ".dag-node__shape { fill: red; }" }).css,
      ".dag-node__shape { fill: red; }",
    );
  }),

  defineTest("default root and active node fills follow the configured node fill", () => {
    assert.equal(DEFAULT_GRAPH_APPEARANCE.cssVars["--dag-node-fill"], "#ffffff");
    assert.match(DEFAULT_GRAPH_CSS, /fill:\s*var\(--dag-node-root-fill,\s*var\(--dag-node-fill\)\)/);
    assert.match(DEFAULT_GRAPH_CSS, /fill:\s*var\(--dag-node-active-fill,\s*var\(--dag-node-fill\)\)/);
  }),

  defineTest("explicit translucent fills are preserved without legacy rewriting", () => {
    const legacy = sanitizeGraphAppearance({ cssVars: { "--dag-node-fill": "rgba(252, 253, 255, 0.88)" } });
    assert.equal(legacy.cssVars["--dag-node-fill"], "rgba(252, 253, 255, 0.88)");
    const changed = sanitizeGraphAppearance({
      ...legacy,
      display: { ...legacy.display, shadowBlur: 24, shadowOffset: 10, shadowOpacity: 35 },
    });
    const before = appearanceToStageStyle(legacy) as Record<string, unknown>;
    const after = appearanceToStageStyle(changed) as Record<string, unknown>;
    assert.equal(after["--dag-node-fill"], "rgba(252, 253, 255, 0.88)");
    assert.notEqual(before["--dag-node-shadow"], after["--dag-node-shadow"]);
    assert.deepEqual(changed.cssVars, legacy.cssVars);
    assert.equal(
      sanitizeGraphAppearance({ cssVars: { "--dag-node-fill": "#ffeedd" } }).cssVars["--dag-node-fill"],
      "#ffeedd",
    );
  }),

  defineTest("preferences parse appearance within its chart profile", () => {
    const raw = JSON.stringify({
      chartStyles: {
        "node-link": createStyleDocument("node-link", {
          ...getDefaultChartStyle("node-link"),
          appearance: {
            ...DEFAULT_GRAPH_APPEARANCE,
            cssVars: {
              "--dag-title-font-size": "18px",
              "--dag-title-font-style": "normal",
            },
            nodes: {
              ...DEFAULT_GRAPH_APPEARANCE.nodes,
              spacing: { ...DEFAULT_GRAPH_APPEARANCE.nodes.spacing, column: 144 },
            },
            display: {
              ...DEFAULT_GRAPH_APPEARANCE.display,
              showEdgeLabels: false,
            },
          },
        }),
      },
    });
    const parsed = parseGraphPagePreferences(raw);

    assert.equal(parsed?.chartStyles?.["node-link"].style.appearance?.nodes.spacing.column, 144);
    assert.equal(parsed?.chartStyles?.["node-link"].style.appearance?.display.showEdgeLabels, false);
    assert.equal(parsed?.chartStyles?.["node-link"].style.appearance?.cssVars["--dag-title-font-size"], "18px");
    assert.equal(parsed?.chartStyles?.["node-link"].style.appearance?.cssVars["--dag-title-font-style"], "normal");
  }),

  defineTest("buildStageData uses appearance layout minimum stage size", () => {
    const stage = buildStageData({
      dag: createSampleDag(),
      selection: { type: "node", key: "A" },
      appearance: {
        ...DEFAULT_GRAPH_APPEARANCE,
        canvas: { ...DEFAULT_GRAPH_APPEARANCE.canvas, minSize: [1234, 789] },
      },
    });

    assert.ok(stage);
    assert.equal(stage.stageWidth, 1234);
    assert.equal(stage.stageHeight, 789);
  }),
]);
