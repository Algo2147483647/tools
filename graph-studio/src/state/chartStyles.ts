import { type GraphAppearance, sanitizeGraphAppearance } from "../graph/appearance";
import type { GraphChartType } from "../graph/types";

export interface ChartDisplayOptions {
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
}

interface ChartStyle extends ChartDisplayOptions {
  appearance: GraphAppearance;
}

export type ChartStyles = Record<GraphChartType, ChartStyle>;

export function sanitizeChartStyle(value: unknown): ChartStyle {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<ChartStyle>) : {};
  return {
    appearance: sanitizeGraphAppearance(input.appearance),
    showNodeDetail: typeof input.showNodeDetail === "boolean" ? input.showNodeDetail : true,
    hideNodeBorders: typeof input.hideNodeBorders === "boolean" ? input.hideNodeBorders : false,
    alignNodeWidthsToMax: typeof input.alignNodeWidthsToMax === "boolean" ? input.alignNodeWidthsToMax : false,
  };
}

export function createChartStyles(): ChartStyles {
  return {
    "node-link": sanitizeChartStyle(null),
    sankey: sanitizeChartStyle(null),
    compound: sanitizeChartStyle(null),
  };
}
