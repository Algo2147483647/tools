import type { DagNode, GraphRenderMode, GraphSelection, NodeKey, RelationValue } from "../../graph/types";
import type { StageTimelineData, StageTimelineEdge, StageTimelineNode } from "../timeline/stage-types";
import type { StageRoutePoint } from "./algorithm-types";
import type { cardContentLayout } from "./typography";
export type { StageTimelineData, StageTimelineEdge, StageTimelineNode } from "../timeline/stage-types";
export type { LayoutEdgeRoute, LayoutResult, LayoutRoutePoint, StageRoutePoint } from "./algorithm-types";
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

export interface ResolvedStageSelection {
  rootKey: NodeKey;
  topLevelKeys: NodeKey[];
  isForest: boolean;
  label: string;
  appSelection: GraphSelection;
}

export interface StageData {
  compoundLayout?: import("../compound/layout-plan").LayoutProblem;
  spatial?: {
    metadata: import("../../graph/space").SpaceMetadata | null;
    view: import("../../graph/space").SpaceView;
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
