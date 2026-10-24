import type { GraphChartType } from "../../graph/types";

// Data shapes for appearanceDefinition.json. Defaults and constraints live in JSON.
// Update these types when changing field structure, enum values, or tuple lengths.
export type GraphAppearance = {
  version: 1;
  canvas: {
    padding: [number, number];
    minSize: [number, number];
  };
  nodes: {
    widths: [number, number];
    height: number;
    spacing: {
      column: number;
      row: number;
      channel: number;
    };
    spread: number;
    width: number;
  };
  edges: {
    spacing: number;
  };
  display: {
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
    sankeyLinkOpacity: number;
  };
  cssVars: Record<string, string>;
  css: string;
  palette: {
    categories: Array<[number, number, number]>;
    groups: Array<Array<string>>;
  };
  performance: {
    denseThresholds: [number, number, number];
    denseShadows: "preserve" | "disable";
  };
};
export type GraphGeometryAppearance = Pick<GraphAppearance, "canvas" | "nodes" | "edges">;
export type GraphDisplayAppearance = GraphAppearance["display"];
export type TimelineViewSettings = {
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
  pointMarker: {
    visible: boolean;
    shape: "auto" | "circle" | "square" | "diamond";
    size: number;
    fill: string;
    borderColor: string;
    borderWidth: number;
  };
  anchorMarker: {
    visible: boolean;
    shape: "auto" | "circle" | "square" | "diamond";
    size: number;
    fill: string;
    borderColor: string;
    borderWidth: number;
  };
  pointTextColor: string;
  pointDateVisible: boolean;
  pointDateColor: string;
  leaderStyle: "none" | "solid" | "dashed";
  leaderColor: string;
  leaderWidth: number;
  relativeTickStep: number;
  axis: "linear" | "adaptive";
  tickStep: number;
  tickUnit: "auto" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
  compactness: number;
  locked: boolean;
  pins: Record<string, number>;
};
export type TimelineMarkerSettings = TimelineViewSettings["pointMarker"];
export type TimelineTickUnit = TimelineViewSettings["tickUnit"];
export type ChartDisplayOptions = {
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
};

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
