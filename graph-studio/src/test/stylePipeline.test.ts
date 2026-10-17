import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ELK from "elkjs/lib/elk.bundled.js";
import { defineSuite, defineTest } from "./harness";
import { normalizeDagInput } from "../graph/normalize";
import { getDefaultChartStyle, createChartStyles } from "../state/chartStyles";
import { parseChartStyleFile, serializeChartStyle } from "../state/chartStyleFile";
import { chartPreferencesReducer, createChartPreferences, getChartStyles } from "../state/chartPreferences";
import { getStageAppearance } from "../layout/appearance";
import { buildStageData } from "../layout/stage-layout";
import { buildCompoundStage } from "../layout/compound-layout";
import { PREVIEW_GRAPHS } from "../components/settings/previewModel";
import GraphStage from "../rendering/GraphStage";
import GraphNode from "../rendering/GraphNode";
import { measureText } from "../layout/text";
import { getTitleFont } from "../layout/typography";
import { parseConsoleSource } from "../console/dsl";
import { executeConsoleInstructions } from "../console/executor";
import { validateCommandBatch } from "../ai/validation";
import type { CommandBatch } from "../ai/types";

const noop = () => {};
const dag = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  nodes: {
    a: {
      title: "A considerably longer title with narrow and wide letters",
      type: "A long classification",
      define: "A sufficiently long description that wraps onto a second line in this card.",
    },
    b: { title: "Next", type: "Step" },
  },
  edges: [{ id: "ab", source: "a", target: "b" }],
});

export const stylePipelineSuite = defineSuite("Complete style and content layout", [
  defineTest("font metrics invalidate geometry and fit titles for all node-link engines", () => {
    const style = getDefaultChartStyle("node-link");
    const large = structuredClone(style.appearance);
    large.cssVars["--dag-title-font-size"] = "28px";
    large.cssVars["--dag-title-font-family"] = "Consolas, monospace";
    large.cssVars["--dag-title-font-weight"] = "700";
    assert.notDeepEqual(getStageAppearance(style.appearance), getStageAppearance(large));
    for (const layoutMode of ["level", "sugiyama", "dagre"] as const) {
      const before = buildStageData({ dag, selection: { type: "full" }, ...style, layoutMode })!;
      const after = buildStageData({
        dag,
        selection: { type: "full" },
        ...style,
        appearance: getStageAppearance(large),
        layoutMode,
      })!;
      assert.notEqual(before.nodeMap.a.displayTitle, after.nodeMap.a.displayTitle);
      assert.ok(after.nodeMap.a.height > before.nodeMap.a.height);
      for (const node of after.nodes) assert.ok(measureText(node.displayTitle, getTitleFont(large)) <= node.width - 74);
      assert.ok(after.edges.every((edge) => !/NaN|Infinity/.test(edge.path)));
    }
    for (const key of ["--dag-title-font-family", "--dag-title-font-weight", "--dag-title-font-style"]) {
      const changed = structuredClone(style.appearance);
      changed.cssVars[key] = key.endsWith("family") ? "monospace" : key.endsWith("weight") ? "700" : "italic";
      assert.notDeepEqual(getStageAppearance(changed), getStageAppearance(style.appearance));
    }
  }),
  defineTest("short cards reserve space for details and Type without overlap or overflow", () => {
    for (const size of [15, 28, 40]) {
      const style = getDefaultChartStyle("node-link");
      style.showNodeDetail = true;
      style.appearance.cssVars["--dag-title-font-size"] = `${size}px`;
      const stage = buildStageData({ dag, selection: { type: "full" }, ...style })!;
      const node = stage.nodeMap.a;
      const content = node.contentLayout!;
      assert.equal(node.detailLines.length, 2);
      assert.ok(content.titleY + size * 0.6 < content.detailY - 5);
      assert.ok(content.detailY + content.detailLineHeight + 5 < content.badgeY);
      assert.ok(content.badgeY + 10 <= node.height - 3);
      const html = renderToStaticMarkup(
        createElement(GraphNode, {
          node,
          isActive: false,
          onClick: noop,
          onContextMenu: noop,
          onFocusChange: noop,
        }),
      );
      assert.ok(html.includes(`y="${content.badgeY}"`));
      assert.ok(html.includes(`y="${content.titleY}"`));
    }
  }),
  defineTest("compound default cards are 240x48 and expanded borders have an independent switch", async () => {
    const style = getDefaultChartStyle("compound");
    const input = {
      dag: PREVIEW_GRAPHS.compound,
      ...style,
      appearance: getStageAppearance(style.appearance),
      view: { collapsedGroupIds: ["app", "storage"], focusGroupId: null },
    };
    const folded = await buildCompoundStage(input, new ELK());
    assert.ok(folded.nodes.some((node) => node.kind === "group"));
    assert.ok(folded.nodes.every((node) => node.width === 240 && node.height === 48 && node.detailLines.length === 0));
    assert.equal(style.appearance.display.nodeCornerRadius, 16);
    assert.equal(style.appearance.display.edgeArrowStyle, "open");
    assert.equal(
      style.appearance.cssVars["--dag-edge"],
      getDefaultChartStyle("node-link").appearance.cssVars["--dag-edge"],
    );
    const expanded = await buildCompoundStage(
      { ...input, view: { collapsedGroupIds: [], focusGroupId: null } },
      new ELK(),
    );
    const render = (showGroupBorders: boolean) =>
      renderToStaticMarkup(
        createElement(GraphStage, {
          ...style,
          appearance: { ...style.appearance, display: { ...style.appearance.display, showGroupBorders } },
          stage: expanded,
          focusedKey: null,
          svgRef: { current: null },
          onNodeClick: noop,
          onNodeDoubleClick: noop,
          onNodeContextMenu: noop,
          onBackgroundContextMenu: noop,
          onFocusChange: noop,
        }),
      );
    assert.match(render(false), /class="dag-group-background" style="[^"]*stroke:none/);
    assert.doesNotMatch(render(true), /class="dag-group-background" style="[^"]*stroke:none/);
    assert.doesNotMatch(render(false), /class="dag-node__detail|class="dag-group-count/);
  }),
  defineTest("style file restores all display flags atomically and rejects obsolete or mismatched files", () => {
    const style = getDefaultChartStyle("compound");
    style.appearance.display.showGroupBorders = false;
    style.appearance.cssVars["--dag-title-font-size"] = "22px";
    const restored = parseChartStyleFile(JSON.parse(serializeChartStyle("compound", style)), "compound");
    assert.deepEqual(restored, style);
    assert.throws(() => parseChartStyleFile(style.appearance, "compound"), /Unsupported/);
    assert.throws(
      () => parseChartStyleFile(JSON.parse(serializeChartStyle("compound", style)), "node-link"),
      /not node-link/,
    );
    const incomplete = JSON.parse(serializeChartStyle("compound", style));
    delete incomplete.style.showNodeDetail;
    assert.throws(() => parseChartStyleFile(incomplete, "compound"), /Missing/);
    const styles = createChartStyles();
    styles.compound.showNodeDetail = true;
    styles.compound.hideNodeBorders = false;
    styles.compound.alignNodeWidthsToMax = false;
    let state = createChartPreferences(styles);
    const { appearance, ...display } = restored;
    state = chartPreferencesReducer(state, {
      chartType: "compound",
      action: { type: "commit", appearance, display, label: "Import" },
    });
    assert.deepEqual(getChartStyles(state).compound, restored);
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "undo" } });
    assert.deepEqual(getChartStyles(state), styles);
    state = chartPreferencesReducer(state, { chartType: "compound", action: { type: "redo" } });
    assert.deepEqual(getChartStyles(state).compound, restored);
  }),
  defineTest("AI preset preflight reports the same appearance diff as execution for every chart type", () => {
    const commands = ["/style-preset default"];
    const batch = { id: "style-check", commands, riskLevel: "low" } as CommandBatch;
    const parsed = parseConsoleSource(commands.join("\n"));
    assert.ok(parsed.ok);
    for (const chartType of ["node-link", "compound", "sankey", "timeline"] as const) {
      const appearance = getDefaultChartStyle("sankey").appearance;
      const report = validateCommandBatch({
        batch,
        dag,
        contextNodeKey: null,
        appearance,
        chartType,
        graphRevision: "1",
      });
      const executed = executeConsoleInstructions(dag, parsed.instructions, null, appearance, chartType);
      assert.ok(executed.ok && report.allPassed);
      const diff = executed.appearanceResults.flatMap((result) => result.diff);
      assert.deepEqual(report.results[0].expectedDiff, diff.length ? diff : ["No graph mutations expected."]);
    }
  }),
]);
