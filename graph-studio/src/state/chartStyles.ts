import { type GraphAppearance, sanitizeGraphAppearance, DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { NODE_LINK_DEFAULT_APPEARANCE, NODE_LINK_DEFAULT_DISPLAY } from "../graph/nodeLinkAppearance";
import type { GraphChartType } from "../graph/types";

export interface ChartDisplayOptions {
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
}

export interface ChartStyle extends ChartDisplayOptions {
  appearance: GraphAppearance;
}

export type ChartStyles = Record<GraphChartType, ChartStyle>;

export function mapChartTypes<T>(create: (type: GraphChartType) => T): Record<GraphChartType, T> {
  return {
    "node-link": create("node-link"),
    sankey: create("sankey"),
    compound: create("compound"),
    timeline: create("timeline"),
  };
}

export function sanitizeChartStyle(value: unknown): ChartStyle {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<ChartStyle>) : {};
  return {
    appearance: sanitizeGraphAppearance(input.appearance),
    showNodeDetail: typeof input.showNodeDetail === "boolean" ? input.showNodeDetail : true,
    hideNodeBorders: typeof input.hideNodeBorders === "boolean" ? input.hideNodeBorders : true,
    alignNodeWidthsToMax: typeof input.alignNodeWidthsToMax === "boolean" ? input.alignNodeWidthsToMax : false,
  };
}

export function createChartStyles(): ChartStyles {
  return mapChartTypes(getDefaultChartStyle);
}

export function getDefaultChartStyle(type: GraphChartType): ChartStyle {
  if (type === "node-link")
    return { appearance: structuredClone(NODE_LINK_DEFAULT_APPEARANCE), ...NODE_LINK_DEFAULT_DISPLAY };
  return type === "timeline" ? sanitizeTimelineChartStyle(null) : sanitizeChartStyle(null);
}

export function sanitizeNodeLinkChartStyle(value: unknown): ChartStyle {
  const defaults = getDefaultChartStyle("node-link");
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const input = value as Partial<ChartStyle>;
  const saved = sanitizeChartStyle(input);
  // Upgrade only the previous untouched default. Preserve customized styles.
  if (
    saved.showNodeDetail &&
    saved.hideNodeBorders &&
    !saved.alignNodeWidthsToMax &&
    JSON.stringify(saved.appearance) === JSON.stringify(sanitizeGraphAppearance(DEFAULT_GRAPH_APPEARANCE))
  )
    return defaults;
  return sanitizeChartStyle({ ...defaults, ...input, appearance: input.appearance ?? defaults.appearance });
}

export function sanitizeTimelineChartStyle(value: unknown): ChartStyle {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<ChartStyle>) : {};
  return sanitizeChartStyle({ ...input, showNodeDetail: input.showNodeDetail === true });
}
