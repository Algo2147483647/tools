import type { TimelineClock } from "../graph/timelineClock";
import type { cardContentLayout } from "./typography";
import type { DagNode, GraphRenderMode, GraphSelection, NodeKey, RelationValue } from "../graph/types";
import type { TimelinePrecision, TimelineRelationKind } from "../graph/timeline";
import type { TimelineAxisMap } from "./timeline-axis";
import type { TimelineTickInterval } from "./timeline-ticks";
import type { TimelineViewSettings } from "../graph/timelineSettings";

/** startY/endY/anchorY are canonical time-axis coordinates (canvas x in horizontal mode).
 * labelX/labelY are physical canvas coordinates; text moves independently of time anchors. */
export interface StageTimelineNode {
  orientation?: "vertical" | "horizontal";
  intervalTitle?: TimelineViewSettings["intervalTitle"];
  intervalAlign?: TimelineViewSettings["intervalAlign"];
  intervalStyle?: TimelineViewSettings["intervalStyle"];
  intervalBorder?: TimelineViewSettings["intervalBorder"];
  intervalBorderWidth?: number;
  intervalBorderColor?: string;
  intervalRadius?: number;
  intervalTextColor?: string;
  intervalTextColorMode?: TimelineViewSettings["intervalTextColorMode"];
  pointMarker?: TimelineViewSettings["pointMarker"];
  anchorMarker?: TimelineViewSettings["anchorMarker"];
  pointTextColor?: string;
  pointDateVisible?: boolean;
  displayDate?: string;
  labelMetrics?: { top: number; bottom: number; dateOffset: number; detailOffset: number };
  pointDateColor?: string;
  leaderStyle?: TimelineViewSettings["leaderStyle"];
  leaderColor?: string;
  leaderWidth?: number;
  barWidth?: number;
  minimumCross?: number;
  /** One-based protocol row/column index perpendicular to time; unaffected by auto layout or view pins. */
  space?: number;
  status: "dated" | "missing" | "invalid";
  kind: "instant" | "range" | "undated";
  start: number | null;
  end: number | null;
  /** Original calendar timestamps or relative values remain above; clipping only changes the rendered endpoints below. */
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
  ports?: { time: number; y: number }[];
}

export interface StageTimelineEdge {
  sourceTime?: number;
  targetTime?: number;
  kind: TimelineRelationKind;
  backward: boolean;
  sourceAnchor: "start" | "end";
  targetAnchor: "start" | "end";
  color: string;
}

export interface StageTimelineData {
  /** Canonical cross-axis/time-axis geometry used when projecting a horizontal view. */
  canonicalStage?: StageData;
  orientation?: "vertical" | "horizontal";
  clock?: TimelineClock;
  relativeTickStep?: number;
  layout?: TimelineViewSettings["layout"];
  edgeRouting?: TimelineViewSettings["edgeRouting"];
  axisMap?: TimelineAxisMap;
  tickInterval?: TimelineTickInterval;
  timeZone: "UTC" | null;
  filtered?: boolean;
  axisX: number;
  /** Stage y coordinate corresponding to the start of the displayed time domain. */
  originY: number;
  start: number | null;
  end: number | null;
  /** Pixels per millisecond for calendar time; pixels per declared unit for relative time. */
  pixelsPerUnit: number;
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
  spatial?: {
    coordinates: number[];
    depth: number;
    radius: number;
    color: string;
    opacity?: number;
    hollow?: boolean;
    labelPriority?: number;
    showLabel: boolean;
    labelSide: "left" | "right";
  };
  contentLayout?: ReturnType<typeof cardContentLayout>;
  timeline?: StageTimelineNode;
  kind?: "node" | "group";
  groupStatsOnly?: boolean;
  external?: boolean;
  key: NodeKey;
  layer: number;
  order: number;
  title: string;
  displayTitle: string;
  titleLayout?: { lines: string[]; x: number; anchor: "start" | "middle"; lineHeight: number };
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
  spatial?: { color: string; width: number; dashed: boolean; directed: boolean };
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
  compoundLayout?: import("./compound-layout-plan").LayoutProblem;
  spatial?: {
    metadata: import("../graph/space").SpaceMetadata | null;
    view: import("../graph/space").SpaceView;
    guides: { path: string; label?: string; x?: number; y?: number }[];
    fitBounds?: { x: number; y: number; width: number; height: number };
    unitScale: number;
    pixelsPerUnit: number;
    displayUnit: string;
    legend?: {
      title: string;
      description: string;
      items: { label: string; radius: number; opacity: number; hollow: boolean }[];
    };
  };
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
  colorFamilyIndex: number;
  title: string;
  depth: number;
  leafCount: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
