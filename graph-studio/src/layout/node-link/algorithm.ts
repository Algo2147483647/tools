import { type GraphGeometryAppearance } from "../../graph/appearance";
import type { GraphRenderMode, NodeKey, NormalizedDag } from "../../graph/types";
import { buildDagreLayout } from "./algorithms/dagre";
import { buildLevelLayout } from "./algorithms/level";
import { buildSugiyamaLayout } from "./algorithms/sugiyama";
export function resolveLayout(
  layoutMode: GraphRenderMode,
  layoutDag: Record<NodeKey, NormalizedDag["nodes"][NodeKey] | undefined>,
  layoutRoots: NodeKey[],
  visualByKey: Map<NodeKey, { width: number }>,
  theme: GraphGeometryAppearance,
) {
  if (layoutMode === "sugiyama") {
    return buildSugiyamaLayout(layoutDag, layoutRoots);
  }
  if (layoutMode === "dagre") {
    const nodeSizes = new Map<NodeKey, { width: number; height: number }>();
    visualByKey.forEach((visual, nodeKey) => {
      nodeSizes.set(nodeKey, { width: visual.width, height: theme.nodes.height });
    });
    return buildDagreLayout(layoutDag, layoutRoots, nodeSizes);
  }
  return buildLevelLayout(layoutDag, layoutRoots);
}
