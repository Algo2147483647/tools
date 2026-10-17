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
  ],
  edges: ["showEdgeLabels", "sankeyLinkOpacity"],
  text: [],
} as const;
export function resetAppearanceSection(
  appearance: GraphAppearance,
  group: AppearanceGroup | "layout",
): GraphAppearance {
  if (group === "layout")
    return {
      ...appearance,
      layout: { ...DEFAULT_GRAPH_APPEARANCE.layout },
      display: { ...appearance.display, sankeyNodeWidth: DEFAULT_GRAPH_APPEARANCE.display.sankeyNodeWidth },
    };
  if (group !== "nodes" && group !== "edges" && group !== "text") return appearance;
  const display = { ...appearance.display };
  for (const key of displayKeys[group]) Object.assign(display, { [key]: DEFAULT_GRAPH_APPEARANCE.display[key] });
  const cssVars = { ...appearance.cssVars };
  const prefix = group === "nodes" ? "--dag-node-" : group === "edges" ? "--dag-edge" : "--dag-text-";
  for (const key of Object.keys(cssVars)) {
    if (key.startsWith(prefix) || (group === "text" && key.startsWith("--dag-title-"))) {
      if (key in DEFAULT_GRAPH_APPEARANCE.cssVars) cssVars[key] = DEFAULT_GRAPH_APPEARANCE.cssVars[key];
      else delete cssVars[key];
    }
  }
  return { ...appearance, display, cssVars };
}
