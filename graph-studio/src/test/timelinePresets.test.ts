import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getGraphPresetStyle, getGraphAppearancePresets } from "../schema/appearanceCommands";
import { sanitizeTimelineSettings } from "../graph/timeline/settings";
import { getDefaultChartStyle, createChartStyles, chartStylesEqual } from "../schema/chartStyles";
import { parseChartStyleFile, serializeChartStyle } from "../schema/styleProtocol";
import { createChartPreferences, chartPreferencesReducer, getChartStyles } from "../state/chartPreferences";
import { defineSuite, defineTest } from "./harness";

export const timelinePresetsSuite = defineSuite("Complete Timeline presets", [
  defineTest("Preset 2 matches the saved current style and round-trips as a standalone style", () => {
    const snapshot = JSON.parse(
      readFileSync(new URL("../../public/presets/timeline-preset-2.style.json", import.meta.url), "utf8"),
    );
    const preset = getGraphPresetStyle("timeline", "preset-2");
    assert.deepEqual(preset, parseChartStyleFile(snapshot, "timeline"));
    assert(chartStylesEqual(preset, parseChartStyleFile(snapshot, "timeline")));
    assert.deepEqual(JSON.parse(serializeChartStyle("timeline", preset)), snapshot);
    assert.deepEqual(
      getGraphAppearancePresets("timeline").map((p) => p.id),
      ["default", "preset-2"],
    );
    assert.equal(preset.timeline!.orientation, "horizontal");
    assert.equal(preset.timeline!.intervalTextColorMode, "event");
    assert.equal(preset.appearance.cssVars["--dag-title-font-style"], "italic");
    preset.timeline!.pointMarker.visible = false;
    assert.equal(getGraphPresetStyle("timeline", "preset-2").timeline!.pointMarker.visible, true);
  }),
  defineTest(
    "Default resets every Timeline option; undo and redo restore the complete style without affecting other charts",
    () => {
      const styles = createChartStyles();
      styles.timeline = getGraphPresetStyle("timeline", "preset-2");
      let history = createChartPreferences(styles);
      const nodeLink = history["node-link"];
      const before = sanitizeTimelineSettings({
        ...styles.timeline.timeline,
        pointMarker: { visible: false },
        anchorMarker: { shape: "diamond", size: 45 },
        leaderStyle: "none",
        pins: { event: 400 },
        locked: true,
      });
      const { appearance, timeline, ...display } = getDefaultChartStyle("timeline");
      history = chartPreferencesReducer(history, {
        chartType: "timeline",
        action: { type: "commit", appearance, display, timeline: { before, after: timeline! }, label: "Default" },
      });
      assert.deepEqual(getChartStyles(history).timeline, getDefaultChartStyle("timeline"));
      assert.equal(history.timeline.undoStack.length, 1);
      history = chartPreferencesReducer(history, { chartType: "timeline", action: { type: "undo" } });
      assert.deepEqual(history.timeline.timeline, before);
      assert.deepEqual(history.timeline.appearance, styles.timeline.appearance);
      history = chartPreferencesReducer(history, { chartType: "timeline", action: { type: "redo" } });
      assert.deepEqual(getChartStyles(history).timeline, getDefaultChartStyle("timeline"));
      assert.equal(history["node-link"], nodeLink);
    },
  ),
  defineTest("Default remains actionable when only Timeline controls changed", () => {
    let history = createChartPreferences(createChartStyles());
    const defaults = getDefaultChartStyle("timeline");
    const before = sanitizeTimelineSettings({ intervalRadius: 30, pointMarker: { size: 34 }, colorBy: "type" });
    history = chartPreferencesReducer(history, {
      chartType: "timeline",
      action: {
        type: "commit",
        appearance: defaults.appearance,
        label: "Default",
        timeline: { before, after: defaults.timeline! },
      },
    });
    assert.equal(history.timeline.undoStack.length, 1);
    assert.deepEqual(history.timeline.undoStack[0].beforeTimeline, before);
    assert.deepEqual(history.timeline.timeline, defaults.timeline);
  }),
]);
