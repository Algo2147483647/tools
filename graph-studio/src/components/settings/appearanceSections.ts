import { DEFAULT_GRAPH_APPEARANCE, type GraphAppearance } from "../../graph/appearance";
import type { AppearanceGroup } from "./settingsCatalog";

const displayKeys = {
  nodes: [
    "nodeCornerRadius",
    "showNodeDots",
    "nodeShadow",
    "shadowBlur",
    "shadowOffset",
    "shadowOpacity",
    "showGroupStats",
    "showGroupBorders",
  ],
  edges: ["showEdgeLabels", "sankeyLinkOpacity", "edgeArrowStyle"],
  text: [],
} as const;
export function resetAppearanceSection(
  appearance: GraphAppearance,
  group: AppearanceGroup | "layout",
  defaults = DEFAULT_GRAPH_APPEARANCE,
): GraphAppearance {
  if (group === "layout")
    return {
      ...appearance,
      layout: { ...defaults.layout },
      display: { ...appearance.display, sankeyNodeWidth: defaults.display.sankeyNodeWidth },
    };
  if (group !== "nodes" && group !== "edges" && group !== "text") return appearance;
  const display = { ...appearance.display };
  for (const key of displayKeys[group]) Object.assign(display, { [key]: defaults.display[key] });
  const cssVars = { ...appearance.cssVars };
  const prefix = group === "nodes" ? "--dag-node-" : group === "edges" ? "--dag-edge" : "--dag-text-";
  for (const key of Object.keys(cssVars)) {
    if (key.startsWith(prefix) || (group === "text" && key.startsWith("--dag-title-"))) {
      if (key in defaults.cssVars) cssVars[key] = defaults.cssVars[key];
      else delete cssVars[key];
    }
  }
  return { ...appearance, display, cssVars };
}
