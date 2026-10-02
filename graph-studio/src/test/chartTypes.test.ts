import assert from "node:assert/strict";
import { sanitizeGraphAppearance } from "../graph/appearance";
import { normalizeDagInput } from "../graph/normalize";
import { getGraphRenderMode } from "../graph/types";
import { projectGraphByType } from "../graph/typeFilter";
import { buildStageData } from "../layout/stage-layout";
import { chartAppearanceHistoryReducer, createChartAppearanceHistory } from "../state/appearanceHistory";
import { createChartStyles } from "../state/chartStyles";
import { graphReducer } from "../state/graphReducer";
import { initialGraphAppState } from "../state/initialState";
import { getInitialGraphPagePreferences, loadGraphPagePreferences, parseGraphPagePreferences, saveGraphPagePreferences } from "../state/preferences";
import { defineSuite, defineTest } from "./harness";

const graph = (value: number | string = 10) => normalizeDagInput({
  format: "graph-studio", version: 2, nodes: { A: {}, B: {} },
  edges: [{ id: "ab", source: "A", target: "B", value }],
});

export const chartTypesSuite = defineSuite("chart types and independent styles", [
  defineTest("filtering an ordinary numeric graph in Sankey view never invents flows", () => {
    const source = normalizeDagInput({ format: "graph-studio", version: 2,
      nodes: { A: { type: "Visible" }, B: { type: "Hidden" }, C: { type: "Visible" } },
      edges: [{ id: "ab", source: "A", target: "B", value: 10 }, { id: "bc", source: "B", target: "C", value: 10 }],
    });
    const filtered = projectGraphByType(source, "Visible", undefined, "sankey");
    assert.equal(filtered.diagram, undefined);
    assert.equal(filtered.edges.length, 0);
    assert.equal(Object.keys(filtered.nodes).length, 2);
    assert.equal(buildStageData({ dag: filtered, selection: { type: "full" }, layoutMode: "sankey" })!.layoutMode, "sankey");
    assert.equal(projectGraphByType(source, "Visible").edges[0].value, "filtered_path");
  }),
  defineTest("switching chart type preserves data, selection, edits and node-link layout", () => {
    const loaded = graphReducer(initialGraphAppState, { type: "graphLoaded", dag: graph(), fileName: "numeric.json", selection: { type: "full" }, status: "" });
    const nodeLink = graphReducer(loaded, { type: "layoutModeChanged", mode: "dagre" });
    const sankey = graphReducer(nodeLink, { type: "chartTypeChanged", chartType: "sankey" });
    assert.equal(sankey.chartType, "sankey");
    assert.equal(sankey.layout.mode, "dagre");
    assert.equal(getGraphRenderMode(sankey.chartType, sankey.layout.mode), "sankey");
    assert.equal(sankey.dag, nodeLink.dag);
    assert.equal(sankey.selection, nodeLink.selection);
    assert.equal(sankey.editHistory, nodeLink.editHistory);
    assert.equal(sankey.source, nodeLink.source);
    assert.equal(sankey.dag?.diagram, undefined);
    assert.equal(graphReducer(sankey, { type: "layoutModeChanged", mode: "level" }), sankey);
    const returned = graphReducer(sankey, { type: "chartTypeChanged", chartType: "node-link" });
    assert.equal(getGraphRenderMode(returned.chartType, returned.layout.mode), "dagre");
  }),
  defineTest("text relationships cannot be silently converted into Sankey flows", () => {
    const state = { ...initialGraphAppState, dag: graph("supports") };
    const next = graphReducer(state, { type: "chartTypeChanged", chartType: "sankey" });
    assert.equal(next.chartType, "node-link");
    assert.match(next.ui.status, /non-negative numeric/);
    assert.equal(next.dag, state.dag);
  }),
  defineTest("an edit that invalidates a numeric view returns to node-link with a reason", () => {
    const state = graphReducer({ ...initialGraphAppState, dag: graph() }, { type: "chartTypeChanged", chartType: "sankey" });
    const edited = graph("supports");
    const next = graphReducer(state, { type: "graphReinterpreted", dag: edited, selection: { type: "full" }, history: [], status: "Updated" });
    assert.equal(next.chartType, "node-link");
    assert.equal(next.dag, edited);
    assert.match(next.ui.status, /Showing the node-link chart/);
  }),
  defineTest("legacy shared preferences migrate into two independent profiles", () => {
    const parsed = parseGraphPagePreferences(JSON.stringify({ layoutMode: "sankey", hideNodeBorders: true, showNodeDetail: false, appearance: { cssVars: { "--dag-text-strong": "#123456" }, display: { sankeyLinkOpacity: 55 } } }));
    assert.equal(parsed?.chartType, "sankey");
    const styles = parsed!.chartStyles!;
    assert.equal(styles["node-link"].hideNodeBorders, true);
    assert.equal(styles.sankey.showNodeDetail, false);
    assert.equal(styles.sankey.appearance.display.sankeyLinkOpacity, 55);
    assert.deepEqual(styles["node-link"], styles.sankey);
    assert.notEqual(styles["node-link"].appearance, styles.sankey.appearance);
    assert.notEqual(styles["node-link"].appearance.cssVars, styles.sankey.appearance.cssVars);
  }),
  defineTest("reload preserves both styles and the remembered node-link layout", () => {
    let stored = "";
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    const preferences = getInitialGraphPagePreferences();
    preferences.chartType = "sankey";
    preferences.layoutMode = "dagre";
    preferences.chartStyles["node-link"].appearance = sanitizeGraphAppearance({ cssVars: { "--dag-text-strong": "#123456" } });
    preferences.chartStyles.sankey.appearance = sanitizeGraphAppearance({ cssVars: { "--dag-text-strong": "#abcdef" }, display: { sankeyLinkOpacity: 65 } });
    preferences.chartStyles.sankey.hideNodeBorders = true;
    saveGraphPagePreferences(preferences, storage);
    assert.deepEqual(loadGraphPagePreferences(storage), preferences);
    const invalid = parseGraphPagePreferences('{"chartStyles":{"node-link":null,"sankey":{"appearance":{"display":{"sankeyLinkOpacity":999}}}}}')!;
    assert.equal(invalid.chartStyles!["node-link"].showNodeDetail, true);
    assert.equal(invalid.chartStyles!.sankey.appearance.display.sankeyLinkOpacity, 90);
  }),
  defineTest("appearance commits, resets, undo and redo affect only their chart type", () => {
    const styles = createChartStyles();
    let state = createChartAppearanceHistory(styles);
    const nodeLink = sanitizeGraphAppearance({ cssVars: { "--dag-text-strong": "#123456" } });
    const sankey = sanitizeGraphAppearance({ display: { sankeyLinkOpacity: 80 } });
    state = chartAppearanceHistoryReducer(state, { chartType: "node-link", action: { type: "commit", appearance: nodeLink, label: "Node-link color" } });
    const savedNodeLinkHistory = state["node-link"];
    state = chartAppearanceHistoryReducer(state, { chartType: "sankey", action: { type: "commit", appearance: sankey, label: "Flow opacity" } });
    state = chartAppearanceHistoryReducer(state, { chartType: "sankey", action: { type: "undo" } });
    assert.deepEqual(state.sankey.appearance, styles.sankey.appearance);
    assert.equal(state["node-link"], savedNodeLinkHistory);
    state = chartAppearanceHistoryReducer(state, { chartType: "sankey", action: { type: "redo" } });
    assert.equal(state.sankey.appearance, sankey);
    state = chartAppearanceHistoryReducer(state, { chartType: "sankey", action: { type: "commit", appearance: styles.sankey.appearance, label: "Reset" } });
    assert.equal(state["node-link"], savedNodeLinkHistory);
    assert.deepEqual(state.sankey.appearance, styles.sankey.appearance);
  }),
]);
