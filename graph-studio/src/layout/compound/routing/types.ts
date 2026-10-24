import type { CompoundRoute } from "../routes";

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
  reverseOrder?: boolean;
  fixedRoutes?: Map<string, CompoundRoute>;
  outerEdges?: Set<string>;
  portSides?: Map<string, { source?: number; target?: number }>;
  labelSizes?: Record<string, { width: number; height: number }>;
}
