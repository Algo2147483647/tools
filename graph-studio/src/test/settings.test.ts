import { indexHierarchy } from "../graph/hierarchy";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NumericSetting from "../components/settings/NumericSetting";
import { LAYOUT_CONTROLS } from "../components/settings/settingsConfig";
import { sanitizeGraphAppearance } from "../graph/appearance";
import { sanitizeTimelineSettings } from "../graph/timelineSettings";
import { parseGraphPagePreferences } from "../state/preferences";
import { defineSuite, defineTest } from "./harness";
import { getSettingsCatalog, matchesSetting } from "../components/settings/settingsCatalog";
import { parseColorValue, formatColorValue } from "../components/settings/colorValue";
import { resetAppearanceSection, resetChartStyleSection } from "../components/settings/appearanceSections";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getInitialGraphPagePreferences, saveGraphPagePreferences } from "../state/preferences";
import { CHART_SCHEMAS } from "../components/settings/chartSchemas";
import { normalizeDagInput } from "../graph/normalize";
import { getSankeyError } from "../graph/sankey";
import { parseNodeTimeline } from "../graph/timeline";
import { createInitialGraphState } from "../state/initialState";
import { replaceDocument } from "../state/documentTransitions";
import TimelineColorSettings from "../components/TimelineColorSettings";
import fs from "node:fs";
import { parseChartStyleFile, serializeChartStyle } from "../state/chartStyleFile";
import { getDefaultChartStyle, createChartStyles } from "../state/chartStyles";
import { chartPreferencesReducer, createChartPreferences } from "../state/chartPreferences";

export const settingsSuite = defineSuite("Settings controls", [
  defineTest("Graph schema references a separate style; all Timeline options round-trip through that file", () => {
    const schema = JSON.parse(fs.readFileSync(new URL("../../public/graph.schema.json", import.meta.url), "utf8"));
    assert.equal(schema.properties.metadata.properties.timeline.properties.view, undefined);
    assert.equal(schema.properties.metadata.properties.timeline.properties.version, undefined);
    assert.equal(schema.properties.metadata.properties.style.type, "string");
    assert(!CHART_SCHEMAS.timeline.fields.some((field) => field.path.startsWith("metadata.timeline.view")));
    assert(CHART_SCHEMAS.timeline.fields.some((field) => field.path === "metadata.style"));
    const timeline = sanitizeTimelineSettings({
      horizontalSpread: 0,
      edgeRouting: "direct",
      colorBy: "type",
      intervalStyle: "outline",
      intervalTextColor: "#123456",
      intervalTextColorMode: "event",
      pointMarker: { shape: "diamond", size: 20, fill: "#123456", borderWidth: 3 },
      anchorMarker: { visible: false },
      pointDateVisible: false,
      leaderStyle: "dashed",
    });
    const style = { ...getDefaultChartStyle("timeline"), timeline };
    assert.deepEqual(parseChartStyleFile(JSON.parse(serializeChartStyle("timeline", style)), "timeline"), style);
    assert.equal(
      new Set(CHART_SCHEMAS.timeline.fields.map((field) => field.path)).size,
      CHART_SCHEMAS.timeline.fields.length,
    );
  }),
  defineTest("Type color controls stay generic and document palettes do not leak to another graph", () => {
    const view = { colorBy: "type", typeColors: { ExampleCategory: "#123456" } };
    const controls = renderToStaticMarkup(
      createElement(TimelineColorSettings, {
        settings: sanitizeTimelineSettings(view),
        onChange() {},
      }),
    );
    assert.doesNotMatch(controls, /ExampleCategory|palette|Edit colors/);
    const document = () =>
      normalizeDagInput({
        format: "graph-studio",
        version: 3,
        metadata: { timeline: {} },
        nodes: { a: { time: { at: "2000" } } },
        edges: [],
      });
    const action = (withColors: boolean) => ({
      type: "graphLoaded" as const,
      documentId: withColors ? "first" : "second",
      fileName: "graph.json",
      dag: document(),
      linkedStyle: withColors
        ? { ...getDefaultChartStyle("timeline"), timeline: sanitizeTimelineSettings(view) }
        : undefined,
      selection: { type: "full" as const },
      status: "",
    });
    const first = replaceDocument(createInitialGraphState(), action(true));
    assert.equal(first.timelineSettings.typeColors.ExampleCategory, "#123456");
    const second = replaceDocument(first, action(false));
    assert.deepEqual(second.timelineSettings.typeColors, {});
    assert.deepEqual(
      parseGraphPagePreferences(JSON.stringify({ timelineSettings: view }))!.timelineSettings!.typeColors,
      {},
    );
  }),
  defineTest("sliders start at zero while numeric inputs retain values outside their range", () => {
    for (const control of LAYOUT_CONTROLS) {
      assert.equal(control.min, 0);
      for (const value of [-12.3456789, 0, 10000.125]) {
        const html = renderToStaticMarkup(
          createElement(NumericSetting, {
            label: control.label,
            value,
            defaultValue: 24,
            min: control.min,
            max: control.max,
            onChange: () => {},
          }),
        );
        const numberInput = html.match(/<input[^>]*type="number"[^>]*>/)![0];
        assert.doesNotMatch(numberInput, /\s(?:min|max)=/);
        assert.ok(numberInput.includes(`value="${value}"`));
        assert.match(numberInput, /step="any"/);
        assert.match(html, /type="range" min="0"/);
      }
    }
  }),
  defineTest("finite numeric settings survive sanitizing and preference reload without rounding or bounds", () => {
    for (const value of [-12.3456789, 0, 10000.125]) {
      const appearance = sanitizeGraphAppearance({
        layout: { columnGap: value, rowGap: value, nodeHeight: value, maxNodeWidth: value },
        display: { nodeCornerRadius: value, shadowOpacity: value, sankeyNodeWidth: value },
      });
      const restored = parseGraphPagePreferences(JSON.stringify({ chartStyles: { compound: { appearance } } }))!
        .chartStyles!.compound.appearance;
      assert.deepEqual(restored, appearance);
      assert.equal(restored.layout.columnGap, value);
      assert.equal(restored.layout.rowGap, value);
      assert.equal(restored.layout.nodeHeight, value);
      assert.equal(restored.layout.maxNodeWidth, value);
      assert.equal(restored.display.nodeCornerRadius, value);
      assert.equal(restored.display.shadowOpacity, value);
      assert.equal(restored.display.sankeyNodeWidth, value);
      const timeline = sanitizeTimelineSettings({ horizontalSpread: value, compactness: value, tickStep: value });
      assert.equal(timeline.horizontalSpread, value);
      assert.equal(timeline.compactness, value);
      assert.equal(timeline.tickStep, value);
      assert.equal(parseColorValue(formatColorValue({ hex: "#123456", alpha: value }))!.alpha, value);
    }
  }),
  defineTest("chart schema examples import successfully and satisfy type-specific data requirements", () => {
    for (const profile of Object.values(CHART_SCHEMAS)) {
      const graph = normalizeDagInput(JSON.parse(JSON.stringify(profile.example)));
      assert.ok(Object.keys(graph.nodes).length > 0);
      assert.ok(graph.edges.length > 0);
    }
    const sankey = CHART_SCHEMAS.sankey.example;
    assert.equal(getSankeyError(sankey.nodes, sankey.edges), null);
    const compound = CHART_SCHEMAS.compound.example;
    assert.equal(indexHierarchy(compound).parent.get("request"), "api");
    for (const node of Object.values(CHART_SCHEMAS.timeline.example.nodes))
      assert.equal(parseNodeTimeline(node).status, "dated");
  }),
  defineTest("search targets individual controls, supports Chinese and respects chart capabilities", () => {
    const catalog = getSettingsCatalog("compound");
    const ids = (q: string) => catalog.filter((item) => matchesSetting(item, q)).map((item) => item.id);
    assert.deepEqual(ids("radius"), ["nodeCornerRadius"]);
    assert.deepEqual(ids("圆角"), ["nodeCornerRadius"]);
    assert.deepEqual(ids("node height"), ["nodeHeight"]);
    assert.deepEqual(ids("node fill"), ["--dag-node-fill"]);
    assert.deepEqual(ids("unknown-setting-xyz"), []);
    const timelineColors = getSettingsCatalog("timeline").find((item) => item.id === "timeline-colors")!;
    assert.equal(timelineColors.chapter, "appearance");
    assert.equal(timelineColors.group, "Nodes");
    assert.ok(matchesSetting(timelineColors, "按 类型 着色"));
    for (const type of ["node-link", "compound", "timeline", "sankey"] as const) {
      const items = getSettingsCatalog(type);
      assert.equal(new Set(items.map((item) => item.id)).size, items.length);
      if (type === "timeline" || type === "sankey") assert.ok(!items.some((item) => item.id === "nodeCornerRadius"));
    }
  }),
  defineTest("color editing preserves alpha and rejects invalid values", () => {
    assert.deepEqual(parseColorValue("#abc"), { hex: "#aabbcc", alpha: 1 });
    assert.equal(parseColorValue("#00000080")!.alpha, 128 / 255);
    assert.deepEqual(parseColorValue("rgba(91, 109, 142, 0.17)"), { hex: "#5b6d8e", alpha: 0.17 });
    assert.equal(formatColorValue({ hex: "#5b6d8e", alpha: 0.17 }), "rgba(91, 109, 142, 0.17)");
    for (const value of ["", "#xxffff", "rgb(256,0,0)", "url(example)"]) assert.equal(parseColorValue(value), null);
  }),
  defineTest("Timeline appearance search separates event shapes, connections and text", () => {
    const catalog = getSettingsCatalog("timeline");
    for (const [query, id, group] of [
      ["时间点 标记", "timeline-points", "Nodes"],
      ["区间 厚度", "timeline-intervals", "Nodes"],
      ["引导线", "timeline-anchors", "Edges"],
      ["时间点 标题", "timeline-point-text", "Text"],
      ["区间 对齐", "timeline-interval-text", "Text"],
      ["描述", "showNodeDetail", "Text"],
    ]) {
      const matches = catalog.filter((item) => matchesSetting(item, query));
      assert.deepEqual(
        matches.map((item) => item.id),
        [id],
      );
      assert.equal(matches[0].group, group);
    }
    assert.equal(catalog.find((item) => item.id === "timeline-routing")!.chapter, "layout");
  }),
  defineTest("Timeline section reset preserves other groups and can be undone in one step", () => {
    const original = {
      ...getDefaultChartStyle("timeline"),
      showNodeDetail: true,
      timeline: sanitizeTimelineSettings({
        pointMarker: { size: 25 },
        intervalWidth: 80,
        anchorMarker: { size: 18 },
        leaderWidth: 3,
        pointTextColor: "#123456",
        intervalTitle: "inside",
        edgeRouting: "direct",
        orientation: "horizontal",
        pins: { example: 42 },
      }),
    };
    const defaults = getDefaultChartStyle("timeline").timeline!;
    for (const group of ["nodes", "edges", "text"] as const) {
      const reset = resetChartStyleSection(original, "timeline", group);
      const view = reset.timeline!;
      assert.equal(view.pointMarker.size, group === "nodes" ? defaults.pointMarker.size : 25);
      assert.equal(view.intervalWidth, group === "nodes" ? defaults.intervalWidth : 80);
      assert.equal(view.anchorMarker.size, group === "edges" ? defaults.anchorMarker.size : 18);
      assert.equal(view.leaderWidth, group === "edges" ? defaults.leaderWidth : 3);
      assert.equal(view.pointTextColor, group === "text" ? defaults.pointTextColor : "#123456");
      assert.equal(view.intervalTitle, group === "text" ? defaults.intervalTitle : "inside");
      assert.equal(reset.showNodeDetail, group !== "text");
      assert.equal(view.edgeRouting, "direct");
      assert.equal(view.orientation, "horizontal");
      assert.deepEqual(view.pins, original.timeline.pins);
      const initial = createChartPreferences({ ...createChartStyles(), timeline: original });
      const { appearance, timeline, ...display } = reset;
      const committed = chartPreferencesReducer(initial, {
        chartType: "timeline",
        action: {
          type: "commit",
          label: `Reset ${group}`,
          appearance,
          display,
          timeline: { before: original.timeline, after: timeline! },
        },
      });
      assert.equal(committed.timeline.undoStack.length, 1);
      const undone = chartPreferencesReducer(committed, { chartType: "timeline", action: { type: "undo" } });
      assert.deepEqual(undone.timeline.timeline, original.timeline);
      assert.equal(undone.timeline.showNodeDetail, true);
      const redone = chartPreferencesReducer(undone, { chartType: "timeline", action: { type: "redo" } });
      assert.deepEqual(redone.timeline.timeline, reset.timeline);
      assert.equal(redone.timeline.showNodeDetail, reset.showNodeDetail);
    }
  }),
  defineTest("section resets preserve other sections and custom CSS", () => {
    const original = {
      ...DEFAULT_GRAPH_APPEARANCE,
      display: { ...DEFAULT_GRAPH_APPEARANCE.display, nodeCornerRadius: 4, sankeyLinkOpacity: 65 },
      cssVars: { ...DEFAULT_GRAPH_APPEARANCE.cssVars, "--dag-node-fill": "#123456", "--dag-edge": "#654321" },
      css: ".dag-node {opacity:.7}",
    };
    const reset = resetAppearanceSection(original, "nodes");
    assert.equal(reset.display.nodeCornerRadius, DEFAULT_GRAPH_APPEARANCE.display.nodeCornerRadius);
    assert.equal(reset.cssVars["--dag-node-fill"], DEFAULT_GRAPH_APPEARANCE.cssVars["--dag-node-fill"]);
    assert.equal(reset.cssVars["--dag-edge"], original.cssVars["--dag-edge"]);
    assert.equal(reset.display.sankeyLinkOpacity, 65);
    assert.equal(reset.css, original.css);
    assert.equal(original.display.nodeCornerRadius, 4);
  }),
  defineTest("saved status reflects storage success and failure", () => {
    const preferences = getInitialGraphPagePreferences();
    assert.equal(saveGraphPagePreferences(preferences, null), false);
    assert.equal(
      saveGraphPagePreferences(preferences, {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      }),
      false,
    );
    let saved = "";
    assert.equal(
      saveGraphPagePreferences(preferences, {
        getItem: () => null,
        setItem: (_key, value) => {
          saved = value;
        },
      }),
      true,
    );
    assert.equal(JSON.parse(saved).chartType, preferences.chartType);
  }),
]);
