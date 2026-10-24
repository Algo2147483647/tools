import type { CompoundProjection } from "../../graph/compound/projection";
import type { LayoutSnapshot, CompoundLayoutData } from "../../graph/compound/layoutData";

export const COMPOUND_LAYOUT_VERSION = "compound-plan-1";

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
  viewKey: string;
  minimumSizes: Record<string, { width: number; height: number }>;
  projection: CompoundProjection;
  baseline: LayoutSnapshot;
  fingerprint: string;
  showLabels: boolean;
  labelSizes: Record<string, { width: number; height: number }>;
  columnGap: number;
  rowGap: number;
  stored: CompoundLayoutData;
}

export interface LayoutCandidate {
  id: string;
  title: string;
  snapshot: LayoutSnapshot;
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
  type LayoutPin,
  type LayoutSnapshot,
  type CompoundLayoutData,
  emptyLayoutData,
  parseLayoutConstraint,
  parseLayoutIntent,
  defaultLayoutIntent,
  layoutFingerprint,
  layoutMetadataValue,
  readLayoutData,
  parseLayoutSnapshot,
  writeLayoutData,
  remapImportedLayoutData,
  repairLayoutData,
} from "../../graph/compound/layoutData";
