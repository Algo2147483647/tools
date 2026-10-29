import { parseToolOperations } from "../ai/tools/catalog";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defineSuite, defineTest } from "./harness";
import { normalizeDagInput } from "../graph/normalize";
import { getDefaultChartStyle, getCompoundPreset2Style, createChartStyles } from "../schema/appearance/styles";
import { parseChartStyleFile, serializeChartStyle } from "../schema/styleProtocol";
import { chartPreferencesReducer, createChartPreferences, getChartStyles } from "../app/preferences/chartPreferences";
import { getStageAppearance } from "../layout/shared/appearance";
import { buildStageData } from "../layout/node-link/layout";
import { buildCompoundStage } from "../layout/compound/layout";
import { PREVIEW_GRAPHS } from "../components/settings/previewModel";
import GraphStage from "../components/canvas/GraphStage";
import GraphNode from "../components/canvas/GraphNode";
import { measureText, layoutCardTitle } from "../layout/shared/text";
import { getTitleFont } from "../layout/shared/typography";
import { executeConsoleInstructions } from "../console/executor";

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
  defineTest("compound title bounds, alignment, wrapping and overflow follow the configured policy", async () => {
    const style = getCompoundPreset2Style();
    const font = getTitleFont(style.appearance);
    const text = "Set theory and mathematical logic";
    const fitted = layoutCardTitle(text, 240, font, {});
    assert.equal(fitted.x, 48);
    assert.ok(measureText(fitted.lines[0], font) <= 176);
    const full = layoutCardTitle(text, 240, font, { titleOverflow: "visible" });
    assert.equal(full.lines[0], text);
    const clip = layoutCardTitle(text, 240, font, { titleOverflow: "clip" });
    assert.ok(!clip.lines[0].endsWith("…"));
    assert.ok(measureText(clip.lines[0], font) <= 176);
    const noDot = layoutCardTitle(text, 240, font, { showNodeDots: false });
    assert.equal(noDot.x, 16);
    assert.ok(noDot.lines[0].length >= fitted.lines[0].length);
    const centered = layoutCardTitle(text, 240, font, { titleAlign: "center", titleWrap: true });
    assert.equal(centered.x, 120);
    assert.equal(centered.anchor, "middle");
    assert.equal(centered.lines.length, 2);
    for (const line of centered.lines) assert.ok(measureText(line, font) <= 144);
    style.appearance.display.titleAlign = "center";
    style.appearance.display.titleWrap = true;
    style.showNodeDetail = true;
    const stage = await buildCompoundStage({
      dag,
      view: { collapsedGroupIds: [], focusGroupId: null },
      ...style,
      appearance: getStageAppearance(style.appearance, "compound"),
    });
    const node = stage.nodeMap.a;
    assert.equal(node.titleLayout!.lines.length, 2);
    assert.equal(node.titleLayout!.x, node.width / 2);
    assert.ok(
      node.contentLayout!.titleY + node.titleLayout!.lineHeight / 2 + font.size * 0.6 < node.contentLayout!.detailY - 5,
    );
    const html = renderToStaticMarkup(
      createElement(GraphNode, { node, isActive: false, onClick: noop, onFocusChange: noop }),
    );
    assert.match(html, /text-anchor="middle" style="transform:none"/);
    assert.ok(html.includes(node.titleLayout!.lines[0]));
    const restored = parseChartStyleFile(JSON.parse(serializeChartStyle("compound", style)), "compound");
    assert.equal(restored.appearance.display.titleWrap, true);
    assert.equal(restored.appearance.display.titleAlign, "center");
  }),
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

          onFocusChange: noop,
        }),
      );
      assert.ok(html.includes(`y="${content.badgeY}"`));
      assert.ok(html.includes(`y="${content.titleY}"`));
    }
  }),
  defineTest("compound default cards are 200x100 and expanded borders have an independent switch", async () => {
    const style = getDefaultChartStyle("compound");
    const input = {
      dag: PREVIEW_GRAPHS.compound,
      ...style,
      appearance: getStageAppearance(style.appearance),
      view: { collapsedGroupIds: ["app", "storage"], focusGroupId: null },
    };
    const folded = await buildCompoundStage(input);
    assert.ok(folded.nodes.some((node) => node.kind === "group"));
    assert.ok(folded.nodes.every((node) => node.width === 200 && node.height === 100 && node.detailLines.length === 0));
    assert.equal(style.appearance.display.nodeCornerRadius, 20);
    assert.equal(style.appearance.display.titleAlign, "center");
    assert.equal(style.appearance.display.titleWrap, true);
    assert.equal(style.appearance.display.showNodeDots, false);
    assert.equal(style.appearance.cssVars["--dag-title-font-size"], "22px");
    assert.equal(style.appearance.cssVars["--dag-title-font-family"], '"Times New Roman", serif');
    assert.equal(style.appearance.cssVars["--dag-edge-active"], "#cc0000");
    const titledDag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { ...{ child: { title: "Child" } }, ...{ customer: { title: "Customer experience" } } },
      edges: [],
      hierarchy_edges: Object.entries({ child: "customer" }).map(([target, source]) => ({
        id: `hierarchy:${target}`,
        source,
        target,
      })),
    });
    const titleStage = await buildCompoundStage({
      ...input,
      dag: titledDag,
      view: { collapsedGroupIds: ["customer"], focusGroupId: null },
    });
    const customer = titleStage.nodeMap.customer;
    assert.deepEqual(customer.titleLayout!.lines, ["Customer", "experience"]);
    assert.equal(customer.width, 200);
    assert.equal(customer.height, 100);
    assert.equal(customer.titleLayout!.x, 100);
    assert.equal(customer.contentLayout!.titleY, 50);
    const previous = getCompoundPreset2Style();
    assert.equal(previous.appearance.nodes.widths[1], 240);
    assert.equal(previous.appearance.nodes.height, 48);
    assert.equal(previous.appearance.display.nodeCornerRadius, 16);
    assert.equal(previous.appearance.display.showNodeDots, true);
    assert.equal(style.appearance.display.showGroupBorders, false);
    assert.equal(style.appearance.nodes.spacing.column, 24);
    assert.equal(style.appearance.nodes.spacing.row, 24);
    assert.equal(style.appearance.display.edgeArrowStyle, "open");
    assert.equal(style.appearance.cssVars["--dag-edge"], "#cccccc");
    const expanded = await buildCompoundStage({ ...input, view: { collapsedGroupIds: [], focusGroupId: null } });
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
    assert.throws(() => parseChartStyleFile(style.appearance, "compound"), /unknown field/);
    assert.throws(
      () => parseChartStyleFile(JSON.parse(serializeChartStyle("compound", style)), "node-link"),
      /expected "node-link"/,
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
  defineTest("AI preset tool prepares the complete default style for every chart type", () => {
    for (const chartType of ["node-link", "compound", "sankey", "timeline"] as const) {
      const appearance = getDefaultChartStyle("sankey").appearance;
      const instructions = parseToolOperations("style_preset", { id: "default" }, { dag, chartType });
      const result = executeConsoleInstructions(dag, instructions, appearance, chartType);
      assert.ok(result.ok);
      assert.deepEqual(result.style, getDefaultChartStyle(chartType));
    }
  }),
]);
