import type { CompoundRoute } from "../../../graph/compound/geometry";

export type Point = { x: number; y: number };

export interface Port {
  point: Point;
  stub: Point;
  /** Outward direction: east, south, west, north. */
  direction: number;
}

export const EPSILON = 0.001;

export const BEND_COST = 20;

export const MIN_STRAIGHT = 20;

export const LANE_GAP = 16;

export interface CompoundRoutingOptions {
  portMode?: "distributed" | "midpoints";
  reverseOrder?: boolean;
  edgePriority?: Map<string, number>;
  fixedRoutes?: Map<string, CompoundRoute>;
  outerEdges?: Set<string>;
  portSides?: Map<string, { source?: number; target?: number }>;
  labelSizes?: Record<string, { width: number; height: number }>;
}
