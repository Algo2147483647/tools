import type { ChartStyle, ChartStyles } from "../schema/appearanceModel";
export type { ChartStyle, ChartStyles, ChartDisplayOptions } from "../schema/appearanceModel";
import { defaultChartStyle, styleDefinition } from "../schema/appearanceContract";
import { resolveDefinition } from "../schema/definition";
import { PRESET_MANIFEST } from "../schema/presetManifest";
import type { GraphChartType } from "../graph/types";

/** Imported JSON can use a different property order without changing the style. */
export function chartStylesEqual(left: ChartStyle, right: ChartStyle): boolean {
  const stable = (value: ChartStyle) =>
    JSON.stringify(value, (_key, entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
        : entry,
    );
  return stable(left) === stable(right);
}

export function mapChartTypes<T>(create: (type: GraphChartType) => T): Record<GraphChartType, T> {
  return {
    "node-link": create("node-link"),
    sankey: create("sankey"),
    compound: create("compound"),
    timeline: create("timeline"),
    spatial: create("spatial"),
  };
}

export const getDefaultChartStyle = defaultChartStyle;
export function createChartStyles(): ChartStyles {
  return mapChartTypes(getDefaultChartStyle);
}
export function getManifestPresetStyle(chart: GraphChartType, id: string): ChartStyle {
  const entry = PRESET_MANIFEST[chart].presets.find((preset) => preset.id === id);
  if (!entry) throw new Error(`Unknown preset ${id} for ${chart}.`);
  return resolveDefinition(styleDefinition(chart), entry.document.style, "style") as ChartStyle;
}
export function getTimelinePreset2Style(): ChartStyle {
  return getManifestPresetStyle("timeline", "preset-2");
}
export function getCompoundPreset2Style(): ChartStyle {
  return getManifestPresetStyle("compound", "preset-2");
}
