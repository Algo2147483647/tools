import type { GraphChartType } from "../graph/types";
import { sanitizeChartStyleForType, type ChartStyle } from "./chartStyles";

export function serializeChartStyle(chartType: GraphChartType, style: ChartStyle): string {
  const { stagePaddingX, stagePaddingY, ...layout } = style.appearance.layout;
  const portableStyle = {
    ...style,
    appearance: {
      ...style.appearance,
      layout: { stagePadding: [stagePaddingX, stagePaddingY], ...layout },
    },
  };
  return JSON.stringify({ format: "graph-studio-style", version: 1, chartType, style: portableStyle }, null, 2);
}

export function parseChartStyleFile(value: unknown, chartType: GraphChartType): ChartStyle {
  const file = record(value);
  if (file.format !== "graph-studio-style" || file.version !== 1) throw new Error("Unsupported style file format.");
  if (file.chartType !== chartType) throw new Error(`This style is for ${String(file.chartType)}, not ${chartType}.`);
  const style = record(file.style);
  for (const key of ["showNodeDetail", "hideNodeBorders", "alignNodeWidthsToMax"])
    if (typeof style[key] !== "boolean") throw new Error(`Missing style option: ${key}.`);
  const appearance = record(style.appearance);
  if (appearance.version !== 1 || typeof appearance.css !== "string") throw new Error("Invalid appearance.");
  const layout = record(appearance.layout);
  if (
    layout.stagePadding !== undefined &&
    (!Array.isArray(layout.stagePadding) ||
      layout.stagePadding.length !== 2 ||
      !layout.stagePadding.every((entry) => typeof entry === "number" && Number.isFinite(entry)))
  )
    throw new Error("stagePadding must be [x, y] with two finite numbers.");
  record(appearance.display);
  record(appearance.cssVars);
  return sanitizeChartStyleForType(chartType, style);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid style object.");
  return value as Record<string, unknown>;
}
