import type { CompoundProjection } from "../../graph/compound/projection";
import type { CompoundLayoutData } from "../../graph/compound/layoutData";

import type { CompoundBox, CompoundRoute } from "../../graph/compound/geometry";
export interface LayoutGeometry {
  boxes: Record<string, CompoundBox>;
  routes: Record<string, CompoundRoute>;
  width: number;
  height: number;
}
export interface LayoutResult {
  geometry: LayoutGeometry;
  quality: { metrics: LayoutMetrics; validation: LayoutValidation; elapsedMs: number; aiAssessment?: string };
  diagnostics: string[];
}

export const COMPOUND_LAYOUT_VERSION = "compound-plan-2";

export interface LayoutMetrics {
  crossings: number;
  sharedLength: number;
  labelCollisions: number;
  bends: number;
  length: number;
  area: number;
  movedNodes: number;
  movement: number;
  changedEdges: number;
}

export interface LayoutValidation {
  valid: boolean;
  errors: string[];
}

export interface LayoutProblem {
  design?: import("./ai/design").CompoundDesign;
  viewKey: string;
  minimumSizes: Record<string, { width: number; height: number }>;
  projection: CompoundProjection;
  baseline: LayoutGeometry;
  fingerprint: string;
  showLabels: boolean;
  labelSizes: Record<string, { width: number; height: number }>;
  columnGap: number;
  rowGap: number;
  minimumCanvas?: { width: number; height: number };
  stored: CompoundLayoutData;
  nodeSemantics?: Record<string, { type: string; description: string }>;
}

export interface LayoutCandidate {
  id: string;
  title: string;
  geometry: LayoutGeometry;
  data: CompoundLayoutData;
  metrics: LayoutMetrics;
  validation: LayoutValidation;
  changedNodeIds: string[];
  changedEdgeIds: string[];
  expandedGroupIds: string[];
  unmetPreferences: string[];
}

export interface LayoutSolveResult {
  candidates: LayoutCandidate[];
  baselineMetrics: LayoutMetrics;
  diagnostics: string[];
}

export {
  type LayoutDirection,
  type LayoutObjective,
  type LayoutConstraint,
  type LayoutIntent,
  type CompoundLayoutData,
  emptyLayoutData,
  parseLayoutConstraint,
  parseLayoutIntent,
  defaultLayoutIntent,
  layoutFingerprint,
} from "../../graph/compound/layoutData";
