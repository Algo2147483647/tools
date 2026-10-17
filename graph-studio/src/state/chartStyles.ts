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
  if (type === "compound")
    return {
      appearance: sanitizeGraphAppearance({
        ...DEFAULT_GRAPH_APPEARANCE,
        layout: { ...DEFAULT_GRAPH_APPEARANCE.layout, columnGap: 24, rowGap: 24, nodeHeight: 48, maxNodeWidth: 240 },
        display: {
          ...DEFAULT_GRAPH_APPEARANCE.display,
          nodeCornerRadius: 16,
          showGroupStats: false,
          showGroupBorders: false,
          showEdgeLabels: false,
          edgeArrowStyle: "open",
        },
        cssVars: { ...DEFAULT_GRAPH_APPEARANCE.cssVars, "--dag-edge": "#e1e3e6", "--dag-edge-active": "#8b1e2d" },
        css: `${DEFAULT_GRAPH_APPEARANCE.css}\n.dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }`,
      }),
      showNodeDetail: false,
      hideNodeBorders: true,
      alignNodeWidthsToMax: true,
    };
  return sanitizeChartStyle(type === "timeline" ? { showNodeDetail: false } : null);
}

export function sanitizeChartStyleForType(type: GraphChartType, value: unknown): ChartStyle {
  const defaults = getDefaultChartStyle(type);
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<ChartStyle>) : {};
  return sanitizeChartStyle({ ...defaults, ...input, appearance: input.appearance ?? defaults.appearance });
}
