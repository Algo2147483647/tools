import type { GraphChartType } from "../../graph/types";
import type { ChartStyleDocument } from "./types";
import compound from "./presets/compound.json" with { type: "json" };
import nodeLink from "./presets/node-link.json" with { type: "json" };
import sankey from "./presets/sankey.json" with { type: "json" };
import spatial from "./presets/spatial.json" with { type: "json" };
import timeline from "./presets/timeline.json" with { type: "json" };
import { parseStyleDocument } from "../styleProtocol";
interface StylePreset {
  id: string;
  label: string;
  document: ChartStyleDocument;
}
function loadPresets(
  chart: GraphChartType,
  source: { presets: { id: string; label: string; document: unknown }[] },
): { presets: StylePreset[] } {
  const ids = new Set<string>();
  return {
    presets: source.presets.map((preset) => {
      if (!preset.id || ids.has(preset.id))
        throw new Error("Invalid or duplicate preset ID for " + chart + ": " + preset.id);
      ids.add(preset.id);
      return { id: preset.id, label: preset.label, document: parseStyleDocument(preset.document, chart) };
    }),
  };
}
// Validate JSON documents once at the import boundary; callers receive cloned styles.
export const PRESET_MANIFEST: Record<GraphChartType, { presets: StylePreset[] }> = {
  "node-link": loadPresets("node-link", nodeLink),
  compound: loadPresets("compound", compound),
  timeline: loadPresets("timeline", timeline),
  sankey: loadPresets("sankey", sankey),
  spatial: loadPresets("spatial", spatial),
};
