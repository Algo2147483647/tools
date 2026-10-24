import type { GraphChartType } from "../graph/types";

export interface GraphAppearance {
  version: 1;
  layout: GraphLayoutAppearance;
  display: GraphDisplayAppearance;
  cssVars: Record<string, string>;
  css: string;
}

export interface GraphDisplayAppearance {
  titleAlign: "left" | "center";
  titleOverflow: "ellipsis" | "clip" | "visible";
  titleWrap: boolean;
  edgeArrowStyle: "filled" | "open";
  showNodeDots: boolean;
  showEdgeLabels: boolean;
  showGroupStats: boolean;
  showGroupBorders: boolean;
  nodeCornerRadius: number;
  nodeShadow: boolean;
  shadowBlur: number;
  shadowOffset: number;
  shadowOpacity: number;
  sankeyNodeWidth: number;
  sankeyLinkOpacity: number;
}

export interface GraphLayoutAppearance {
  stagePadding: [number, number];
  columnGap: number;
  rowGap: number;
  edgeLaneGap: number;
  nodeHeight: number;
  minNodeWidth: number;
  maxNodeWidth: number;
  stageMinWidth: number;
  stageMinHeight: number;
}

export type TimelineTickUnit = "auto" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
export interface TimelineMarkerSettings {
  visible: boolean;
  shape: "auto" | "circle" | "square" | "diamond";
  size: number;
  fill: string;
  borderColor: string;
  borderWidth: number;
}

export interface TimelineViewSettings {
  layout: "tracks" | "flow";
  orientation: "vertical" | "horizontal";
  edgeRouting: "avoid" | "direct";
  colorBy: "track" | "type";
  typeColors: Record<string, string>;
  intervalWidth: number;
  intervalTitle: "outside" | "inside" | "hidden";
  intervalAlign: "start" | "center" | "end";
  intervalStyle: "soft" | "solid" | "outline";
  intervalBorder: "auto" | "none" | "solid" | "dashed";
  intervalBorderWidth: number;
  intervalBorderColor: string;
  intervalRadius: number;
  intervalTextColor: string;
  intervalTextColorMode: "theme" | "event" | "custom";
  pointMarker: TimelineMarkerSettings;
  anchorMarker: TimelineMarkerSettings;
  pointTextColor: string;
  pointDateVisible: boolean;
  pointDateColor: string;
  leaderStyle: "none" | "solid" | "dashed";
  leaderColor: string;
  leaderWidth: number;
  relativeTickStep: number;
  axis: "linear" | "adaptive";
  tickStep: number;
  tickUnit: TimelineTickUnit;
  nodeGap: number;
  horizontalSpread: number;
  compactness: number;
  locked: boolean;
  pins: Record<string, number>;
}

export interface ChartDisplayOptions {
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
}

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
