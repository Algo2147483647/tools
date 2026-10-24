import type { NodeKey } from "../../graph/types";
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
