import { DEFAULT_GRAPH_APPEARANCE, type GraphAppearance } from "../../graph/appearance";
import type { AppearanceGroup } from "./settingsCatalog";
import { sanitizeTimelineSettings, type TimelineViewSettings } from "../../graph/timelineSettings";
import { getDefaultChartStyle, type ChartStyle } from "../../state/chartStyles";
import type { GraphChartType } from "../../graph/types";

const timelineKeys = {
  nodes: [
    "colorBy",
    "typeColors",
    "pointMarker",
    "intervalWidth",
    "intervalStyle",
    "intervalBorder",
    "intervalBorderWidth",
    "intervalBorderColor",
    "intervalRadius",
  ],
  edges: ["anchorMarker", "leaderStyle", "leaderColor", "leaderWidth"],
  text: [
    "intervalTitle",
    "intervalAlign",
    "intervalTextColor",
    "intervalTextColorMode",
    "pointTextColor",
    "pointDateVisible",
    "pointDateColor",
  ],
} as const satisfies Record<"nodes" | "edges" | "text", readonly (keyof TimelineViewSettings)[]>;

export function resetChartStyleSection(
  style: ChartStyle,
  chartType: GraphChartType,
  group: AppearanceGroup | "layout",
): ChartStyle {
  const defaults = getDefaultChartStyle(chartType);
  const next = { ...style, appearance: resetAppearanceSection(style.appearance, group, defaults.appearance) };
  if (group === "nodes" && chartType !== "timeline") {
    next.showNodeDetail = defaults.showNodeDetail;
    next.hideNodeBorders = defaults.hideNodeBorders;
    next.alignNodeWidthsToMax = defaults.alignNodeWidthsToMax;
  }
  if (chartType === "timeline" && (group === "nodes" || group === "edges" || group === "text")) {
    const timeline = { ...(style.timeline ?? sanitizeTimelineSettings(null)) };
    const defaultTimeline = defaults.timeline!;
    for (const key of timelineKeys[group]) Object.assign(timeline, { [key]: structuredClone(defaultTimeline[key]) });
    next.timeline = timeline;
    if (group === "text") next.showNodeDetail = defaults.showNodeDetail;
  }
  return next;
}

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
  text: ["titleAlign", "titleOverflow", "titleWrap"],
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
