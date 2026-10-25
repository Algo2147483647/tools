// Read-compatibility fixtures only. Production never writes legacy geometry files.
import type { LayoutDocument } from "../schema/layoutProtocol";
import type { GraphChartType } from "../graph/types";
import { timelinePlanToFile } from "../schema/timelineLayoutFile";
import { timelineLayoutSettings, layoutScopeForChart } from "../schema/layoutGeometry";
/** Legacy version 3 fixture. */
export interface ChartLayoutDocument {
  format: "graph-studio-layout";
  version: 3;
  chartType: GraphChartType;
  layout: {
    settings: Record<string, unknown>;
    scope?: Record<string, unknown>;
    graphFingerprint?: string;
    settingsFingerprint?: string;
    geometry?: import("../schema/layoutGeometry").LayoutGeometryData;
  };
}
export function createChartLayoutDocument(data: LayoutDocument, chartType: GraphChartType): ChartLayoutDocument {
  const rendering = data.renderings?.[chartType];
  const settings = chartType in data.charts ? data.charts[chartType as keyof LayoutDocument["charts"]] : {};
  return {
    format: "graph-studio-layout",
    version: 3,
    chartType,
    layout: {
      settings: {
        ...settings,
        ...(chartType === "timeline" && data.charts.timeline.plan
          ? { plan: timelinePlanToFile(data.charts.timeline.plan) }
          : {}),
        ...(chartType === "timeline" && (rendering || data.timelineView)
          ? { view: timelineLayoutSettings(rendering?.timelineSettings ?? data.timelineView!) }
          : {}),
      },
      ...(rendering
        ? {
            scope: layoutScopeForChart(chartType, rendering.scope),
            graphFingerprint: rendering.graphFingerprint,
            settingsFingerprint: rendering.settingsFingerprint,
            geometry: rendering.geometry,
          }
        : {}),
    },
  };
}
