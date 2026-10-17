import assert from "node:assert/strict";
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
    for (const value of ["", "#xxffff", "rgb(256,0,0)", "rgba(1,2,3,1.1)", "url(example)"])
      assert.equal(parseColorValue(value), null);
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
