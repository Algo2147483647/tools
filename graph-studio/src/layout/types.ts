import type { DagNode, GraphRenderMode, GraphSelection, NodeKey, RelationValue } from "../graph/types";
import type { TimelinePrecision, TimelineRelationKind } from "../graph/timeline";

/** All y coordinates are absolute stage coordinates. Labels may move; time anchors never do. */
export interface StageTimelineNode {
  status: "dated" | "missing" | "invalid";
  kind: "instant" | "range" | "undated";
  start: number | null;
  end: number | null;
  /** Original timestamps remain above; clipping only changes the rendered endpoints below. */
  clippedStart?: boolean;
  clippedEnd?: boolean;
  ongoing: boolean;
  precision: TimelinePrecision | null;
  track: string;
  lane: number;
  startY: number;
  endY: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  label: string;
  color: string;
  warning?: string;
}

export interface StageTimelineEdge {
  kind: TimelineRelationKind;
  backward: boolean;
  sourceAnchor: "start" | "end";
  targetAnchor: "start" | "end";
  color: string;
}

export interface StageTimelineData {
  timeZone: "UTC";
  filtered?: boolean;
  axisX: number;
  /** Stage y coordinate corresponding to the start of the displayed time domain. */
  originY: number;
  start: number | null;
  end: number | null;
  pixelsPerMillisecond: number;
  ticks: { time: number; y: number; label: string }[];
  /** Track x/width describe the complete header and content extent, not marker centers. */
  tracks: { id: string; label: string; x: number; width: number; color: string }[];
  undatedY: number | null;
}

export interface StageNodeColorTokens {
  glow: string;
  border: string;
  borderStrong: string;
  activeBorder: string;
  pinFill: string;
  pinStroke: string;
  pinCore: string;
  affordanceBg: string;
  affordanceText: string;
}

export interface StageNode {
  timeline?: StageTimelineNode;
  kind?: "node" | "group";
  external?: boolean;
  key: NodeKey;
  layer: number;
  order: number;
  title: string;
  displayTitle: string;
  detail: string;
  detailLines: string[];
  typeLabel?: string;
  colorTokens?: StageNodeColorTokens;
  width: number;
  height: number;
  isRoot: boolean;
  x: number;
  y: number;
  flow?: {
    value: number;
    incoming: number;
    outgoing: number;
    color: string;
    labelSide: "left" | "right";
    labelY: number;
  };
}

export interface StageEdge {
  timeline?: StageTimelineEdge;
  originalEdgeIds?: string[];
  description?: string;
  id: string;
  source: NodeKey;
  target: NodeKey;
  weight: RelationValue | 1 | undefined;
  label: string;
  points?: StageRoutePoint[];
  path: string;
  labelPosition: { x: number; y: number };
  flow?: { width: number; color: string; feedback?: boolean; directionPath?: string };
}

interface StageLane {
  layer: number;
  label: string;
  x: number;
  width: number;
}

type LayoutCoordinate = [number, number];

type LayoutCoordinateMap = Map<NodeKey, LayoutCoordinate>;

export interface LayoutRoutePoint {
  layer: number;
  order: number;
  x?: number;
  y?: number;
}

export interface LayoutEdgeRoute {
  source: NodeKey;
  target: NodeKey;
  points: LayoutRoutePoint[];
  reversedForLayout?: boolean;
}

export interface StageRoutePoint extends LayoutRoutePoint {
  x: number;
  y: number;
}

export interface LayoutResult {
  coordinates: LayoutCoordinateMap;
  warnings: string[];
  layerSlotCounts?: Map<number, number>;
  edgeRoutes?: Map<string, LayoutEdgeRoute>;
  nodePositions?: Map<NodeKey, { x: number; y: number }>;
}

export interface ResolvedStageSelection {
  rootKey: NodeKey;
  topLevelKeys: NodeKey[];
  isForest: boolean;
  label: string;
  appSelection: GraphSelection;
}

export interface StageData {
  timeline?: StageTimelineData;
  groups?: StageGroup[];
  dag: Record<NodeKey, DagNode & { synthetic?: boolean }>;
  layoutMode: GraphRenderMode;
  root: NodeKey;
  selection: ResolvedStageSelection;
  topLevelKeys: NodeKey[];
  isForest: boolean;
  nodeMap: Record<NodeKey, StageNode>;
  nodes: StageNode[];
  edges: StageEdge[];
  connectedKeysByNode: Map<NodeKey, ReadonlySet<NodeKey>>;
  lanes: StageLane[];
  stageWidth: number;
  stageHeight: number;
  warnings: string[];
}

export interface StageGroup {
  id: string;
  title: string;
  depth: number;
  leafCount: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
