import type { GraphChartType } from "../graph/types";

import type { APPEARANCE_DEFINITION, TIMELINE_DEFINITION, STYLE_OPTIONS_DEFINITION } from "./appearanceDefinition";
import type { InferDefinition } from "./definition";
export type GraphAppearance = InferDefinition<typeof APPEARANCE_DEFINITION>;
export type GraphGeometryAppearance = Pick<GraphAppearance, "canvas" | "nodes" | "edges">;
export type GraphDisplayAppearance = GraphAppearance["display"];
export type TimelineViewSettings = InferDefinition<typeof TIMELINE_DEFINITION>;
export type TimelineMarkerSettings = TimelineViewSettings["pointMarker"];
export type TimelineTickUnit = TimelineViewSettings["tickUnit"];

export type ChartDisplayOptions = InferDefinition<typeof STYLE_OPTIONS_DEFINITION>;

export interface ChartStyle extends ChartDisplayOptions {
  appearance: GraphAppearance;
  timeline?: TimelineViewSettings;
}

export type ChartStyles = Record<GraphChartType, ChartStyle>;

export interface ChartStyleDocument {
  format: "graph-studio-style";
  version: 1;
  chartType: GraphChartType;
  style: ChartStyle;
}
export type ChartStyleDocuments = Record<GraphChartType, ChartStyleDocument>;
