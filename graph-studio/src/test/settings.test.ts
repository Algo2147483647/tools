import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppearanceSchema from "../components/settings/AppearanceSchema";
import AiSettingsPanel from "../components/settings/AiSettingsPanel";
import NumericSetting from "../components/settings/NumericSetting";
import ProtocolSchema from "../components/settings/ProtocolSchema";
import { resetAppearanceSection, resetChartStyleSection } from "../components/settings/appearanceSections";
import { APPEARANCE_UI } from "../components/settings/appearanceUIConfig";
import { CHART_SCHEMAS } from "../schema/document/definition";
import { formatColorValue, parseColorValue } from "../components/settings/colorValue";
import { APPEARANCE_GROUPS, getSettingsCatalog, matchesSetting } from "../components/settings/settingsCatalog";
import TimelineColorSettings from "../components/timeline/TimelineColorSettings";
import { DEFAULT_GRAPH_APPEARANCE, sanitizeGraphAppearance } from "../schema/appearance/defaults";
import { indexHierarchy } from "../graph/compound/hierarchy";
import { normalizeDagInput } from "../graph/normalize";
import { getSankeyError } from "../graph/sankey";
import { resolveTimeline as sanitizeTimelineSettings } from "../schema/appearance/contract";
import { parseNodeTimeline } from "../graph/timeline/time";
import { getGraphAppearancePresets } from "../schema/appearance/commands";
import { getAppearanceSchema } from "../schema/appearance/schema";
import { createChartStyles, getDefaultChartStyle } from "../schema/appearance/styles";
import { orderSchemaFields, type SchemaField } from "../schema/fields";
import {
  createStyleDocument,
  parseChartStyleFile,
  parseStyleDocument,
  serializeChartStyle,
  updateAppearanceSchemaValue,
} from "../schema/styleProtocol";
import { chartPreferencesReducer, createChartPreferences } from "../app/preferences/chartPreferences";
import { replaceDocument } from "../app/document/documentTransitions";
import { createInitialGraphState } from "../app/document/initialState";
import {
  getInitialGraphPagePreferences,
  parseGraphPagePreferences,
  saveGraphPagePreferences,
} from "../app/preferences/preferences";
import { defineSuite, defineTest } from "./harness";

export const settingsSuite = defineSuite("Settings controls", [
  defineTest("Schema exposes only explicit style binding and no preset or persistence copy", () => {
    const markup = renderToStaticMarkup(
      createElement(AppearanceSchema, {
        chartType: "compound",
        style: getDefaultChartStyle("compound"),
        onChange: () => {},
      }),
    );
    assert.doesNotMatch(markup, /Update current appearance/);
    assert.doesNotMatch(markup, /Preset|Open a local workspace graph|Appearance edits apply to this session/);
    assert.ok(!getSettingsCatalog("compound").some((item) => item.id === "presets"));
    const parsed = parseGraphPagePreferences(JSON.stringify({ chartStyles: { compound: { invalid: true } } }));
    assert.equal(parsed, null);
  }),

  defineTest("legacy AI generation and execution settings are dropped and controls are absent", () => {
    const original = getInitialGraphPagePreferences();
    const restored = parseGraphPagePreferences(
      JSON.stringify({
        ...original,
        aiSettings: { ...original.aiSettings, executionMode: "ask", temperature: 0, maxTokens: 100 },
      }),
    )!;
    assert.deepEqual(restored.aiSettings, original.aiSettings);
    const markup = renderToStaticMarkup(
      createElement(AiSettingsPanel, {
        aiSettings: restored.aiSettings!,
        aiBusy: false,
        providerMenuOpen: false,
        aiConnectionStatus: "idle",
        onProviderMenuOpenChange: () => {},
        onAiConnectionTestClick: () => {},
        onAiSettingsChange: () => {},
      }),
    );
    assert.doesNotMatch(markup, /Temperature|Console output tokens|Auto Edit|Execution/);
    assert.match(markup, /Model/);
  }),

  defineTest("layout tuples remain canonical through editing, export and preferences", () => {
    for (const key of ["canvas.padding", "canvas.minSize", "nodes.widths"] as const) {
      const style = updateAppearanceSchemaValue(
        "timeline",
        getDefaultChartStyle("timeline"),
        `style.appearance.${key}`,
        [320, 640],
      );
      const document = JSON.parse(serializeChartStyle("timeline", style));
      assert.deepEqual(
        getAppearanceSchema("timeline", parseStyleDocument(document, "timeline").style).entries.get(
          `style.appearance.${key}`,
        )?.value,
        [320, 640],
      );
      assert.deepEqual(
        getAppearanceSchema("timeline", style).entries.get(`style.appearance.${key}`)?.value,
        [320, 640],
      );
      const preferences = getInitialGraphPagePreferences();
      preferences.chartStyles.timeline = document;
      assert.equal(parseGraphPagePreferences(JSON.stringify(preferences))!.chartStyles, undefined);
      assert.throws(() => updateAppearanceSchemaValue("timeline", style, `style.appearance.${key}`, [320]));
    }
    const document = createStyleDocument("timeline", getDefaultChartStyle("timeline"));
    for (const branch of [
      document.style.appearance,
      document.style.appearance.display,
      document.style.timeline!.pointMarker,
    ]) {
      Object.assign(branch, { undeclaredField: 100 });
      assert.throws(() => parseStyleDocument(document, "timeline"), /unknown field undeclaredField/);
      delete (branch as Record<string, unknown>).undeclaredField;
    }
  }),
  defineTest("presets, persistence, examples and model share the canonical schema document", () => {
    const preferences = getInitialGraphPagePreferences();
    let stored = "";
    assert.equal(
      saveGraphPagePreferences(preferences, {
        getItem: () => stored,
        setItem: (_key, value) => {
          stored = value;
        },
      }),
      true,
    );
    const raw = JSON.parse(stored);
    assert.equal("timelineSettings" in raw, false);
    const { chartStyles: _styles, ...persisted } = preferences;
    assert.deepEqual(raw, persisted);
    assert.equal("chartStyles" in raw, false);
    for (const type of Object.keys(preferences.chartStyles) as (keyof typeof preferences.chartStyles)[]) {
      const document = preferences.chartStyles[type];
      assert.deepEqual(parseStyleDocument(document, type), document);
      assert.deepEqual(getAppearanceSchema(type, document.style).example, document);
      for (const preset of getGraphAppearancePresets(type)) {
        assert.deepEqual(parseStyleDocument(preset.document, type), preset.document);
        assert.deepEqual(JSON.parse(serializeChartStyle(type, preset.document.style)), preset.document);
      }
    }
    const walk = (directory: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(file) : entry.name.endsWith(".style.json") ? [file] : [];
      });
    for (const file of walk("public")) {
      const document = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.deepEqual(parseStyleDocument(document, document.chartType), document, file);
    }
    const invalid = structuredClone(preferences.chartStyles.timeline);
    Object.assign(invalid.style.appearance, { undeclaredField: 10 });
    assert.throws(() => parseStyleDocument(invalid, "timeline"), /unknown field/);
    const old = parseGraphPagePreferences(JSON.stringify({ chartStyles: { timeline: invalid.style } }));
    assert.deepEqual(old!.chartStyles!.timeline, preferences.chartStyles.timeline);
    const before = getDefaultChartStyle("timeline");
    getDefaultChartStyle("spatial");
    assert.deepEqual(getDefaultChartStyle("timeline"), before);
  }),
  defineTest("appearance schema edits canonical values and rejects undeclared fields", () => {
    const original = getDefaultChartStyle("timeline");
    const updated = updateAppearanceSchemaValue("timeline", original, "style.appearance.canvas.padding", [32, 48]);
    assert.deepEqual(updated.appearance.canvas.padding, [32, 48]);
    assert.notDeepEqual(updated.appearance, original.appearance);
    const schema = getAppearanceSchema("timeline", updated);
    assert.deepEqual(schema.entries.get("style.appearance.canvas.padding")?.value, [32, 48]);
    assert.equal(schema.entries.has("style.appearance.undeclaredField"), false);
    assert.deepEqual(parseChartStyleFile(schema.example, "timeline"), updated);
    const negativePadding = structuredClone(original);
    negativePadding.appearance.canvas.padding[0] = -12.5;
    assert.deepEqual(
      parseChartStyleFile(JSON.parse(serializeChartStyle("timeline", negativePadding)), "timeline"),
      negativePadding,
    );
    const mixed = structuredClone(schema.example);
    Object.assign(mixed.style.appearance, { undeclaredField: 999 });
    assert.throws(() => parseChartStyleFile(mixed, "timeline"), /unknown field undeclaredField/);
    assert.deepEqual(
      parseChartStyleFile(
        { format: "graph-studio-style", version: 1, chartType: "timeline", style: original },
        "timeline",
      ),
      original,
    );
    assert.throws(() => updateAppearanceSchemaValue("timeline", updated, "style.appearance.canvas.padding", [1]));
    assert.throws(() => updateAppearanceSchemaValue("timeline", updated, "style.appearance.canvas.padding", [1, NaN]));
    assert.throws(() => updateAppearanceSchemaValue("timeline", updated, "style.appearance.nodes.height", "abc"));
    assert.throws(() => updateAppearanceSchemaValue("timeline", updated, "style.timeline.orientation", "diagonal"));
    assert.throws(() => updateAppearanceSchemaValue("timeline", updated, "format", "other"));
    const toggled = updateAppearanceSchemaValue("timeline", updated, "style.timeline.pointMarker.visible", false);
    assert.equal(toggled.timeline?.pointMarker.visible, false);
    const colored = updateAppearanceSchemaValue("timeline", updated, "style.timeline.typeColors", {
      type: "#ff0000",
      "release.v2": "#00ff00",
    });
    assert.equal(
      getAppearanceSchema("timeline", colored).entries.get("style.timeline.typeColors[release.v2]")?.value,
      "#00ff00",
    );
    assert.equal(
      updateAppearanceSchemaValue("timeline", colored, "style.timeline.typeColors[release.v2]", "#0000ff").timeline
        ?.typeColors["release.v2"],
      "#0000ff",
    );
    const histories = createChartPreferences({ ...createChartStyles(), timeline: original });
    const committed = chartPreferencesReducer(histories, {
      chartType: "timeline",
      action: {
        type: "commit",
        label: "Edited appearance schema.",
        appearance: updated.appearance,
        display: {
          showNodeDetail: updated.showNodeDetail,
          hideNodeBorders: updated.hideNodeBorders,
          alignNodeWidthsToMax: updated.alignNodeWidthsToMax,
        },
        timeline: { before: original.timeline!, after: updated.timeline! },
      },
    });
    assert.deepEqual(committed.timeline.appearance.canvas.padding, [32, 48]);
    assert.deepEqual(
      chartPreferencesReducer(committed, { chartType: "timeline", action: { type: "undo" } }).timeline.appearance,
      original.appearance,
    );
  }),
  defineTest("protocol tables keep parent branches contiguous and mark required fields", () => {
    const schemas = Object.entries(CHART_SCHEMAS).flatMap(([type, schema]) => [
      schema,
      getAppearanceSchema(type as keyof typeof CHART_SCHEMAS),
    ]);
    for (const schema of schemas) {
      const fields: SchemaField[] = schema.fields;
      assert.equal(new Set(fields.map((field) => field.path)).size, fields.length);
      assert.deepEqual(orderSchemaFields(fields), fields);
      for (const [index, field] of fields.entries()) {
        assert.match(field.requirement, /^(Required|Optional)$/);
        assert.ok(field.description);
        assert.doesNotMatch(field.description, /[\r\n]/);
        const descendants = fields.flatMap((candidate, i) =>
          candidate.path.startsWith(`${field.path}.`) || candidate.path.startsWith(`${field.path}[`) ? [i] : [],
        );
        if (descendants.length)
          assert.deepEqual(
            descendants,
            descendants.map((_, i) => index + i + 1),
          );
      }
    }
    const timeline = CHART_SCHEMAS.timeline;
    const markup = renderToStaticMarkup(
      createElement(ProtocolSchema, {
        label: "Timeline",
        fields: timeline.fields,
        value: timeline.example,
        fileName: "timeline-current.json",
      }),
    );
    assert.equal((markup.match(/<table\b/g) ?? []).length, 1);
    assert.doesNotMatch(markup, /scope="col">Required \/ Optional/);
    assert.equal(
      (markup.match(/class="schema-required"/g) ?? []).length,
      timeline.fields.filter((field) => field.requirement === "Required").length,
    );
    assert.match(markup, /scope="col">Description/);
    assert.doesNotMatch(markup, /<dl|chart-schema-field-group/);
  }),
  defineTest("appearance schema examples are complete chart defaults and pair with graph examples", () => {
    assert.deepEqual(
      APPEARANCE_GROUPS.slice(0, 2).map((group) => group.id),
      ["schema", "canvas"],
    );
    for (const type of Object.keys(CHART_SCHEMAS) as (keyof typeof CHART_SCHEMAS)[]) {
      const schema = getAppearanceSchema(type);
      const imported = parseChartStyleFile(schema.example, type);
      assert.deepEqual(imported, getDefaultChartStyle(type));
      assert.equal(CHART_SCHEMAS[type].example.metadata?.style, `${type}.style.json`);
      assert.ok(
        schema.fields.some((field) => field.path === "style.appearance.css" && field.requirement === "Required"),
      );
      if (type === "timeline") {
        assert.deepEqual(imported.timeline?.pins, {});
        for (const key of Object.keys(imported.timeline!))
          assert.ok(schema.fields.some((field) => field.path === `style.timeline.${key}`));
      }
    }
    assert.ok(CHART_SCHEMAS.sankey.example.edges.some((edge) => edge.metadata?.feedback === true));
    assert.ok(
      CHART_SCHEMAS.timeline.example.edges.some(
        (edge) => (edge.metadata?.timeline as Record<string, unknown>)?.sourceTime,
      ),
    );
    assert.ok(Object.values(CHART_SCHEMAS.spatial.example.nodes).some((node) => node.spatialStyle));
  }),
  defineTest("Graph schema references a separate style; all Timeline options round-trip through that file", () => {
    const schema = JSON.parse(fs.readFileSync(new URL("../../public/graph.schema.json", import.meta.url), "utf8"));
    assert.equal(schema.properties.metadata.properties.timeline.properties.view, undefined);
    assert.equal(schema.properties.metadata.properties.timeline.properties.version, undefined);
    assert.equal(schema.properties.metadata.properties.style.type, "string");
    assert(!CHART_SCHEMAS.timeline.fields.some((field) => field.path.startsWith("metadata.timeline.view")));
    assert(CHART_SCHEMAS.timeline.fields.some((field) => field.path === "metadata.style"));
    const timeline = sanitizeTimelineSettings({
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
    assert.doesNotMatch(controls, /ExampleCategory/);
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
    assert.equal(parseGraphPagePreferences(JSON.stringify({ timelineSettings: view })), null);
  }),
  defineTest("sliders start at zero while numeric inputs retain values outside their range", () => {
    for (const node of [...APPEARANCE_UI.canvas.children!, ...APPEARANCE_UI.nodes.children![0].children!]) {
      const control = { label: node.label ?? node.id, min: node.options?.min ?? 0, max: node.options?.max ?? 100 };
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
  defineTest("finite numeric settings survive style JSON round trips without rounding or bounds", () => {
    for (const value of [-12.3456789, 0, 10000.125]) {
      const appearance = sanitizeGraphAppearance({
        nodes: {
          spacing: { column: value, row: value },
          height: value,
          widths: [188, value],
          width: value,
          spread: value,
        },
        display: { nodeCornerRadius: value, shadowOpacity: value },
      });
      const restored = parseChartStyleFile(
        JSON.parse(serializeChartStyle("compound", { ...getDefaultChartStyle("compound"), appearance })),
        "compound",
      ).appearance;
      assert.deepEqual(restored, appearance);
      assert.equal(restored.nodes.spacing.column, value);
      assert.equal(restored.nodes.spacing.row, value);
      assert.equal(restored.nodes.height, value);
      assert.equal(restored.nodes.widths[1], value);
      assert.equal(restored.display.nodeCornerRadius, value);
      assert.equal(restored.display.shadowOpacity, value);
      assert.equal(restored.nodes.width, value);
      const timeline = sanitizeTimelineSettings({ compactness: value, tickStep: value });
      assert.equal(restored.nodes.spread, value);
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
  defineTest("search is generated from field metadata and respects chart capabilities", () => {
    const catalog = getSettingsCatalog("compound");
    assert.ok(
      catalog.some((item) => item.id === "style.appearance.display.nodeCornerRadius" && matchesSetting(item, "圆角")),
    );
    assert.ok(
      catalog.some((item) => item.id === "style.appearance.nodes.height" && matchesSetting(item, "node height")),
    );
    assert.deepEqual(
      catalog.filter((item) => matchesSetting(item, "unknown-setting-xyz")),
      [],
    );
    for (const type of ["node-link", "compound", "timeline", "sankey", "spatial"] as const) {
      const items = getSettingsCatalog(type);
      assert.equal(new Set(items.map((item) => item.id)).size, items.length);
      if (type === "timeline" || type === "spatial")
        assert.ok(!items.some((item) => item.id === "style.appearance.display.nodeCornerRadius"));
    }
  }),

  defineTest("color editing preserves alpha and rejects invalid values", () => {
    assert.deepEqual(parseColorValue("#abc"), { hex: "#aabbcc", alpha: 1 });
    assert.equal(parseColorValue("#00000080")!.alpha, 128 / 255);
    assert.deepEqual(parseColorValue("rgba(91, 109, 142, 0.17)"), { hex: "#5b6d8e", alpha: 0.17 });
    assert.equal(formatColorValue({ hex: "#5b6d8e", alpha: 0.17 }), "rgba(91, 109, 142, 0.17)");
    for (const value of ["", "#xxffff", "rgb(256,0,0)", "url(example)"]) assert.equal(parseColorValue(value), null);
  }),
  defineTest("Timeline search and groups use the same field definitions as the editors", () => {
    const catalog = getSettingsCatalog("timeline");
    for (const [path, group] of [
      ["pointMarker.size", "Nodes"],
      ["intervalWidth", "Nodes"],
      ["leaderWidth", "Edges"],
      ["pointTextColor", "Nodes"],
      ["intervalAlign", "Nodes"],
    ])
      assert.equal(catalog.find((item) => item.id === `style.timeline.${path}`)?.group, group);
    assert.equal(catalog.find((item) => item.id === "style.timeline.edgeRouting")?.chapter, "layout");
    assert.ok(catalog.some((item) => matchesSetting(item, "区间 厚度")));
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
    for (const group of ["nodes", "edges", "canvas"] as const) {
      const reset = resetChartStyleSection(original, "timeline", group);
      const view = reset.timeline!;
      assert.equal(view.pointMarker.size, group === "nodes" ? defaults.pointMarker.size : 25);
      assert.equal(view.intervalWidth, group === "nodes" ? defaults.intervalWidth : 80);
      assert.equal(view.anchorMarker.size, group === "edges" ? defaults.anchorMarker.size : 18);
      assert.equal(view.leaderWidth, group === "edges" ? defaults.leaderWidth : 3);
      assert.equal(view.pointTextColor, group === "nodes" ? defaults.pointTextColor : "#123456");
      assert.equal(view.intervalTitle, group === "nodes" ? defaults.intervalTitle : "inside");
      assert.equal(reset.showNodeDetail, group !== "nodes");
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
