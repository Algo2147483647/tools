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
import { resetAppearanceSection } from "../components/settings/appearanceSections";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getInitialGraphPagePreferences, saveGraphPagePreferences } from "../state/preferences";
import { CHART_SCHEMAS } from "../components/settings/chartSchemas";
import { normalizeDagInput } from "../graph/normalize";
import { getSankeyError } from "../graph/sankey";
import { parseNodeTimeline } from "../graph/timeline";

export const settingsSuite = defineSuite("Settings controls", [
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
    assert.equal(compound.hierarchy?.parentById.request, "api");
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
