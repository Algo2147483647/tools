import assert from "node:assert/strict";
import { sanitizeGraphAppearance } from "../graph/appearance";
import { applyGraphCommand } from "../graph/commands";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { getInitialSelection } from "../graph/selectors";
import { getTimelineTrackOptions, isTimelineDocument, projectGraphByTimelineTrack } from "../graph/timelineView";
import { getTimelineEditError, getTimelineReferenceTime } from "../graph/timelineEditing";
import { parseTimelineRangeInput, timelineRangeDates } from "../graph/timelineRange";
import { projectGraphByType } from "../graph/typeFilter";
import { getGraphRenderMode } from "../graph/types";
import { getNodeLocatePoint } from "../hooks/useGraphZoom";
import { buildStageData } from "../layout/stage-layout";
import { buildTimelineStage } from "../layout/timeline-layout";
import { chartPreferencesReducer, createChartPreferences, getChartStyles } from "../state/chartPreferences";
import { createChartStyles, getDefaultChartStyle } from "../state/chartStyles";
import { graphReducer } from "../state/graphReducer";
import { prepareGraphTransaction } from "../state/graphTransactions";
import { initialGraphAppState } from "../state/initialState";
import {
  getInitialGraphPagePreferences,
  loadGraphPagePreferences,
  parseGraphPagePreferences,
  saveGraphPagePreferences,
} from "../state/preferences";
import { defineSuite, defineTest } from "./harness";

const graph = (value: number | string = 10) =>
  normalizeDagInput({
    format: "graph-studio",
    version: 3,
    nodes: { A: {}, B: {} },
    edges: [{ id: "ab", source: "A", target: "B", value }],
  });

export const chartTypesSuite = defineSuite("chart types and independent styles", [
  defineTest("display preferences survive appearance undo and persist without history stacks", () => {
    let state = createChartPreferences(createChartStyles());
    state = chartPreferencesReducer(state, {
      chartType: "node-link",
      action: { type: "toggleDisplay", key: "showNodeDetail" },
    });
    const appearance = sanitizeGraphAppearance({ cssVars: { "--dag-text-strong": "#123456" } });
    state = chartPreferencesReducer(state, {
      chartType: "node-link",
      action: { type: "commit", appearance, label: "Color" },
    });
    state = chartPreferencesReducer(state, { chartType: "node-link", action: { type: "undo" } });
    assert.equal(state["node-link"].showNodeDetail, true);
    assert.equal(state.sankey.showNodeDetail, true);
    state = chartPreferencesReducer(state, { chartType: "node-link", action: { type: "redo" } });
    const persisted = getChartStyles(state);
    assert.equal(persisted["node-link"].showNodeDetail, true);
    assert.equal("undoStack" in persisted["node-link"], false);
    assert.equal("redoStack" in persisted["node-link"], false);
    const documents = Object.fromEntries(
      Object.entries(persisted).map(([type, style]) => [
        type,
        { format: "graph-studio-style", version: 1, chartType: type, style },
      ]),
    );
    assert.deepEqual(parseGraphPagePreferences(JSON.stringify({ chartStyles: documents }))?.chartStyles, documents);
  }),
  defineTest("timeline hints open every event without changing v3 diagram semantics", () => {
    const source = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      diagram: "dag",
      metadata: { timeline: { timeZone: "UTC" } },
      nodes: { A: { time: { at: "1969-07-16" } }, B: {} },
      edges: [{ id: "ab", source: "A", target: "B" }],
    });
    assert.equal(isTimelineDocument(source), true);
    assert.deepEqual(getInitialSelection(source), { type: "full" });
    const loaded = graphReducer(initialGraphAppState, {
      type: "graphLoaded",
      documentId: "timeline",
      dag: source,
      fileName: "timeline.json",
      selection: { type: "node", key: "A" },
      status: "Loaded",
    });
    assert.equal(loaded.chartType, "timeline");
    assert.deepEqual(loaded.selection, { type: "full" });
    assert.equal(loaded.dag, source);
    assert.equal(serializeDag(source).diagram, "dag");
    assert.deepEqual(serializeDag(source).metadata, { timeline: { timeZone: "UTC" } });
    assert.equal(isTimelineDocument({ metadata: { timeline: {} } }), true);
    assert.equal(isTimelineDocument({ metadata: { timeline: null } }), false);
    assert.throws(
      () => normalizeDagInput({ ...serializeDag(source), metadata: { timeline: { version: 1 } } }),
      /Unknown timeline field/,
    );
    assert.throws(
      () =>
        normalizeDagInput({ ...serializeDag(source), metadata: { timeline: { view: { intervalStyle: "solid" } } } }),
      /Unknown timeline field/,
    );
  }),
  defineTest("timeline accepts ordinary undated graphs and preserves other view state", () => {
    const original = {
      ...initialGraphAppState,
      dag: graph("related"),
      selection: { type: "node" as const, key: "A" },
      layout: { mode: "dagre" as const },
    };
    const timeline = graphReducer(original, { type: "chartTypeChanged", chartType: "timeline" });
    assert.equal(timeline.chartType, "timeline");
    assert.equal(getGraphRenderMode(timeline.chartType, timeline.layout.mode), "timeline");
    assert.equal(timeline.dag, original.dag);
    assert.equal(timeline.selection, original.selection);
    assert.equal(timeline.editHistory, original.editHistory);
    const returned = graphReducer(timeline, { type: "chartTypeChanged", chartType: "node-link" });
    assert.equal(returned.layout.mode, "dagre");
    assert.equal(returned.dag, original.dag);
  }),
  defineTest("timeline type and track filters never bridge hidden historical events", () => {
    const source = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        A: { track: " Mission ", type: "show" },
        B: { track: "Other", type: "hide" },
        C: { track: "Mission", type: "show" },
        constructor: { track: "Other", type: "hide" },
      },
      edges: [
        { id: "ab", source: "A", target: "B" },
        { id: "bc", source: "B", target: "C" },
        { id: "cc", source: "C", target: "constructor" },
      ],
    });
    const snapshot = serializeDag(source);
    assert.deepEqual(getTimelineTrackOptions(source), ["Mission", "Other"]);
    const byType = projectGraphByType(source, "show", "timeline");
    const byTrack = projectGraphByTimelineTrack(source, "Mission");
    for (const view of [byType, byTrack]) {
      assert.deepEqual(Object.keys(view.nodes), ["A", "C"]);
      assert.equal(view.edges.length, 0);
    }
    assert.deepEqual(serializeDag(source), snapshot);
    assert.equal(projectGraphByTimelineTrack(source, ""), source);
  }),
  defineTest("timeline time edits validate before committing and undo with their track", () => {
    const source = graph();
    const before = { ...initialGraphAppState, dag: source, selection: { type: "full" as const } };
    for (const time of [
      { at: "2024-02-30" },
      { at: "2024-01-01T12:00:00" },
      { start: "2024-02-02", end: "2024-02-01" },
      { at: "2024-01-01", start: "2024-01-01", end: null },
    ]) {
      assert.throws(() => applyGraphCommand(source, { type: "updateNodeFields", key: "A", fields: { time } }));
    }
    assert.equal(source.nodes.A.time, undefined);
    const time = { start: "1969-07-16T13:32:00Z", end: "1969-07-24T16:50:35Z" };
    const result = applyGraphCommand(source, {
      type: "updateNodeFields",
      key: "A",
      fields: { time, track: "Mission" },
    });
    const changed = graphReducer(before, prepareGraphTransaction(before, [result], "Set event time")!);
    assert.deepEqual(changed.dag!.nodes.A.time, time);
    assert.equal(changed.source.dirty, true);
    const undone = graphReducer(changed, { type: "undoRequested" });
    assert.equal(undone.dag, source);
    const redone = graphReducer(undone, { type: "redoRequested" });
    assert.deepEqual(redone.dag!.nodes.A.time, time);
    assert.equal(redone.dag!.nodes.A.track, "Mission");
    assert.deepEqual(normalizeDagInput(serializeDag(redone.dag!)).nodes.A.time, time);
  }),
  defineTest("timeline preferences survive reload and appearance undo stays isolated", () => {
    const preferences = getInitialGraphPagePreferences();
    assert.equal(preferences.chartStyles.timeline.style.appearance.display.showEdgeLabels, false);
    assert.equal(preferences.chartStyles.timeline.style.showNodeDetail, false);
    preferences.chartType = "timeline";
    preferences.chartStyles.timeline.style.appearance = sanitizeGraphAppearance({
      cssVars: { "--dag-text-strong": "#234567" },
    });
    preferences.chartStyles.timeline.style.showNodeDetail = true;
    const parsed = parseGraphPagePreferences(JSON.stringify(preferences));
    assert.deepEqual(parsed!.chartStyles!.timeline, preferences.chartStyles.timeline);
    assert.equal(parsed!.chartType, "timeline");
    const defaults = createChartStyles();
    let history = createChartPreferences(defaults);
    const original = history["node-link"];
    history = chartPreferencesReducer(history, {
      chartType: "timeline",
      action: {
        type: "commit",
        appearance: preferences.chartStyles.timeline.style.appearance,
        label: "Timeline color",
      },
    });
    history = chartPreferencesReducer(history, { chartType: "timeline", action: { type: "undo" } });
    assert.equal(history["node-link"], original);
    assert.deepEqual(history.timeline.appearance, defaults.timeline.appearance);
    const migrated = parseGraphPagePreferences('{"chartStyles":{"node-link":{}}}');
    assert.equal(migrated!.chartStyles!.timeline.style.appearance.display.showEdgeLabels, false);
    assert.equal(migrated!.chartStyles!.timeline.style.showNodeDetail, false);
    const partial = parseGraphPagePreferences('{"chartStyles":{"timeline":{}}}');
    assert.equal(partial!.chartStyles!.timeline.style.showNodeDetail, false);
  }),
  defineTest("unrelated edits preserve malformed imported time while date edits must fix it", () => {
    const time = { start: "not-a-date", end: null };
    const source = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { A: { title: "Old", time } },
      edges: [],
    });
    assert.equal(getTimelineEditError(source.nodes.A, { title: "New", time }), null);
    const updated = applyGraphCommand(source, {
      type: "updateNodeFields",
      key: "A",
      fields: { title: "New", time, track: "Imported" },
    }).dag;
    assert.deepEqual(updated.nodes.A.time, time);
    assert.equal(updated.nodes.A.title, "New");
    assert.ok(getTimelineEditError(updated.nodes.A, { time: { start: "still-bad", end: null } }));
    assert.equal(getTimelineEditError(updated.nodes.A, { time: { start: "1969-07-16", end: null } }), null);
  }),
  defineTest("Locate targets displaced event labels rather than their unchanged time anchors", () => {
    const source = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { A: { time: { at: "1969-07-16" } }, B: { time: { at: "1969-07-16" } } },
      edges: [],
    });
    const stage = buildTimelineStage({ dag: source, selection: { type: "full" } })!;
    const second = stage.nodeMap.B;
    assert.ok(second.timeline!.labelY > second.y);
    assert.deepEqual(getNodeLocatePoint(second), {
      x: second.timeline!.labelX + second.width / 2,
      y: second.timeline!.labelY,
    });
    const plain = buildStageData({ dag: source, selection: { type: "full" }, layoutMode: "sugiyama" })!.nodeMap.A;
    assert.deepEqual(getNodeLocatePoint(plain), { x: plain.x, y: plain.y });
  }),
  defineTest("date range controls use inclusive UTC days and reject invalid drafts", () => {
    assert.deepEqual(parseTimelineRangeInput("", ""), { ok: true, range: null });
    const range = parseTimelineRangeInput("1969-07-20", "1969-07-20");
    assert.ok(range.ok && range.range);
    if (!range.ok || !range.range) throw new Error("Expected bounded range");
    assert.equal(range.range.start, Date.parse("1969-07-20T00:00:00Z"));
    assert.equal(range.range.end, Date.parse("1969-07-20T23:59:59.999Z"));
    assert.deepEqual(timelineRangeDates(range.range), { from: "1969-07-20", to: "1969-07-20" });
    assert.equal(parseTimelineRangeInput("1969-07-21", "1969-07-20").ok, false);
    assert.equal(parseTimelineRangeInput("2024-02-30", "").ok, false);
    assert.equal(parseTimelineRangeInput("1969-07-20T12:00:00Z", "").ok, false);
    const source = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: {
        A: { time: { at: "1969-07-20T23:59:59Z" } },
        B: { time: { at: "1969-07-21T00:00:00Z" } },
        C: { time: { start: "1969-07-19", end: "1969-07-21" } },
      },
      edges: [],
    });
    const before = serializeDag(source);
    const stage = buildTimelineStage({ dag: source, selection: { type: "full" }, timeRange: range.range })!;
    assert.deepEqual(stage.nodes.map((node) => node.key).sort(), ["A", "C"]);
    assert.equal(stage.nodeMap.C.timeline!.clippedStart, true);
    assert.equal(stage.nodeMap.C.timeline!.clippedEnd, true);
    assert.deepEqual(serializeDag(source), before);
  }),
  defineTest("ongoing edits use the document snapshot time consistently with rendering", () => {
    const source = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      metadata: { timeline: { asOf: "2025-01-01" } },
      nodes: { A: {} },
      edges: [],
    });
    const reference = getTimelineReferenceTime(source);
    assert.equal(reference, Date.parse("2025-01-01"));
    assert.ok(getTimelineEditError(source.nodes.A, { time: { start: "2025-01-02", end: null } }, reference));
    assert.throws(
      () =>
        applyGraphCommand(source, {
          type: "updateNodeFields",
          key: "A",
          fields: { time: { start: "2025-01-02", end: null } },
        }),
      /future/,
    );
    const result = applyGraphCommand(source, {
      type: "updateNodeFields",
      key: "A",
      fields: { time: { start: "2024-01-01", end: null } },
    });
    const stage = buildTimelineStage({ dag: result.dag, selection: { type: "full" } })!;
    assert.equal(stage.nodeMap.A.timeline!.end, reference);
    assert.equal(stage.nodeMap.A.timeline!.ongoing, true);
  }),
  defineTest("filtering an ordinary numeric graph in Sankey view never invents flows", () => {
    const source = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { A: { type: "Visible" }, B: { type: "Hidden" }, C: { type: "Visible" } },
      edges: [
        { id: "ab", source: "A", target: "B", value: 10 },
        { id: "bc", source: "B", target: "C", value: 10 },
      ],
    });
    const filtered = projectGraphByType(source, "Visible", "sankey");
    assert.equal(filtered.diagram, undefined);
    assert.equal(filtered.edges.length, 0);
    assert.equal(Object.keys(filtered.nodes).length, 2);
    assert.equal(
      buildStageData({ dag: filtered, selection: { type: "full" }, layoutMode: "sankey" })!.layoutMode,
      "sankey",
    );
    assert.equal(projectGraphByType(source, "Visible").edges[0].value, "filtered_path");
  }),
  defineTest("switching chart type preserves data, selection, edits and node-link layout", () => {
    const loaded = graphReducer(initialGraphAppState, {
      type: "graphLoaded",
      documentId: "test-document",
      dag: graph(),
      fileName: "numeric.json",
      selection: { type: "full" },
      status: "",
    });
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
    const state = graphReducer(
      { ...initialGraphAppState, dag: graph() },
      { type: "chartTypeChanged", chartType: "sankey" },
    );
    const edited = graph("supports");
    const next = graphReducer(state, prepareGraphTransaction(state, [{ dag: edited, changedKeys: [] }], "Updated")!);
    assert.equal(next.chartType, "node-link");
    assert.equal(next.dag, edited);
    assert.match(next.ui.status, /Showing the node-link chart/);
  }),
  defineTest("obsolete shared styles and layout aliases are not migrated", () => {
    assert.equal(
      parseGraphPagePreferences(
        JSON.stringify({
          layoutMode: "sankey",
          hideNodeBorders: true,
          showNodeDetail: false,
          appearance: { cssVars: { "--dag-text-strong": "#123456" } },
        }),
      ),
      null,
    );
  }),
  defineTest("reload preserves both styles and the remembered node-link layout", () => {
    let stored = "";
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    const preferences = getInitialGraphPagePreferences();
    preferences.chartType = "sankey";
    preferences.layoutMode = "dagre";
    preferences.chartStyles["node-link"].style.appearance = sanitizeGraphAppearance({
      cssVars: { "--dag-text-strong": "#123456" },
    });
    preferences.chartStyles.sankey.style.appearance = sanitizeGraphAppearance({
      cssVars: { "--dag-text-strong": "#abcdef" },
      display: { sankeyLinkOpacity: 65 },
    });
    preferences.chartStyles.sankey.style.hideNodeBorders = true;
    saveGraphPagePreferences(preferences, storage);
    assert.deepEqual(loadGraphPagePreferences(storage), preferences);
    const invalid = parseGraphPagePreferences(
      '{"chartStyles":{"node-link":null,"sankey":{"appearance":{"display":{"sankeyLinkOpacity":999}}}}}',
    )!;
    assert.equal(invalid.chartStyles!["node-link"].style.showNodeDetail, false);
    assert.equal(
      invalid.chartStyles!.sankey.style.appearance.display.sankeyLinkOpacity,
      getDefaultChartStyle("sankey").appearance.display.sankeyLinkOpacity,
    );
  }),
  defineTest("appearance commits, resets, undo and redo affect only their chart type", () => {
    const styles = createChartStyles();
    let state = createChartPreferences(styles);
    const nodeLink = sanitizeGraphAppearance({ cssVars: { "--dag-text-strong": "#123456" } });
    const sankey = sanitizeGraphAppearance({ display: { sankeyLinkOpacity: 80 } });
    state = chartPreferencesReducer(state, {
      chartType: "node-link",
      action: { type: "commit", appearance: nodeLink, label: "Node-link color" },
    });
    const savedNodeLinkHistory = state["node-link"];
    state = chartPreferencesReducer(state, {
      chartType: "sankey",
      action: { type: "commit", appearance: sankey, label: "Flow opacity" },
    });
    state = chartPreferencesReducer(state, { chartType: "sankey", action: { type: "undo" } });
    assert.deepEqual(state.sankey.appearance, styles.sankey.appearance);
    assert.equal(state["node-link"], savedNodeLinkHistory);
    state = chartPreferencesReducer(state, { chartType: "sankey", action: { type: "redo" } });
    assert.equal(state.sankey.appearance, sankey);
    state = chartPreferencesReducer(state, {
      chartType: "sankey",
      action: { type: "commit", appearance: styles.sankey.appearance, label: "Reset" },
    });
    assert.equal(state["node-link"], savedNodeLinkHistory);
    assert.deepEqual(state.sankey.appearance, styles.sankey.appearance);
  }),
]);
