import { getNodeChildren } from "../../graph/accessors";
import { type GraphGeometryAppearance } from "../../schema/appearance/defaults";
import { getRelationKeys } from "../../graph/relations";
import type { NodeKey, RelationValue } from "../../graph/types";
import { resolveStageEdgeGeometry } from "../shared/edgeGeometry";
import type { LayoutRoutePoint, StageData, StageRoutePoint } from "../shared/types";
import type { PreparedNodeLink } from "./input";
import type { NodeLinkNodes } from "./nodes";
import type { NodeLinkPositions } from "./position";
import { buildSugiyamaStageRoutes, buildSugiyamaVerticalPlanner } from "./sugiyama-edge-routing";
export function assembleNodeLinkStage(
  context: PreparedNodeLink,
  nodes: NodeLinkNodes,
  positions: NodeLinkPositions,
): StageData {
  const { layoutMode, theme, selection, layoutDag, edgeIds } = context;
  const { layoutResult, nodeKeys, nodesByLayer, nodeMap, edges } = nodes;
  const {
    laneCenters,
    lanes,
    slotCountsByLayer,
    stageInnerHeight,
    stageWidth,
    stageHeight,
    absoluteOffset,
    sugiyamaVerticalPlanner,
    sortedLayers,
  } = positions;
  const sugiyamaStageRoutes =
    layoutMode === "sugiyama"
      ? buildSugiyamaStageRoutes({
          edgeRoutes: layoutResult.edgeRoutes,
          nodeMap,
          nodesByLayer,
          planner:
            sugiyamaVerticalPlanner ||
            buildSugiyamaVerticalPlanner({
              nodesByLayer,
              logicalSlotCountsByLayer: slotCountsByLayer,
              sortedLayers,
              theme,
            }),
        })
      : undefined;

  nodeKeys.forEach((sourceKey) => {
    const sourceNode = layoutDag[sourceKey];
    const children = getNodeChildren(sourceNode);
    const childKeys = getRelationKeys(children);
    childKeys.forEach((targetKey) => {
      if (!nodeMap[targetKey]) {
        return;
      }
      const weight = Array.isArray(children) ? 1 : (children as Record<NodeKey, RelationValue>)[targetKey];
      const route = layoutResult.edgeRoutes?.get(JSON.stringify([sourceKey, targetKey]));
      const points =
        layoutMode === "sugiyama"
          ? sugiyamaStageRoutes?.get(JSON.stringify([sourceKey, targetKey]))
          : route?.points.map((point) =>
              getRoutePointPosition(point, laneCenters, slotCountsByLayer, stageInnerHeight, theme, absoluteOffset),
            );
      edges.push({
        id: edgeIds.get(JSON.stringify([sourceKey, targetKey]))!,
        source: sourceKey,
        target: targetKey,
        weight,
        label: getEdgeLabel(weight),
        points: points && points.length ? points : undefined,
        path: "",
        labelPosition: { x: 0, y: 0 },
      });
    });
  });

  const connectedKeysByNode = buildConnectedKeysByNode(nodeKeys, edges);
  edges.forEach((edge) => {
    const sourceNode = nodeMap[edge.source];
    const targetNode = nodeMap[edge.target];
    if (!sourceNode || !targetNode) {
      return;
    }
    const geometry = resolveStageEdgeGeometry(layoutMode, sourceNode, targetNode, edge.points);
    edge.path = geometry.path;
    edge.labelPosition = geometry.labelPosition;
  });

  return {
    dag: layoutDag,
    layoutMode,
    root: selection.rootKey,
    selection,
    topLevelKeys: selection.topLevelKeys,
    isForest: selection.isForest,
    nodeMap,
    nodes: Object.values(nodeMap),
    edges,
    connectedKeysByNode,
    lanes,
    stageWidth: Math.max(stageWidth, theme.canvas.minSize[0]),
    stageHeight: Math.max(stageHeight, theme.canvas.minSize[1]),
    warnings: layoutResult.warnings,
  };
}
function getRoutePointPosition(
  point: LayoutRoutePoint,
  laneCenters: Map<number, number>,
  slotCountsByLayer: Map<number, number>,
  stageInnerHeight: number,
  theme: GraphGeometryAppearance,
  absoluteOffset?: { x: number; y: number },
): StageRoutePoint {
  if (typeof point.x === "number" && typeof point.y === "number") {
    return {
      layer: point.layer,
      order: point.order,
      x: point.x + (absoluteOffset?.x || 0),
      y: point.y + (absoluteOffset?.y || 0),
    };
  }

  const slotCount = slotCountsByLayer.get(point.layer) || 1;
  const layerHeight = slotCount * theme.nodes.height + Math.max(slotCount - 1, 0) * theme.nodes.spacing.row;
  const startY = theme.canvas.padding[1] + (stageInnerHeight - layerHeight) / 2;
  return {
    layer: point.layer,
    order: point.order,
    x: laneCenters.get(point.layer) || theme.canvas.padding[0],
    y: startY + point.order * (theme.nodes.height + theme.nodes.spacing.row) + theme.nodes.height / 2,
  };
}

function getEdgeLabel(weight: unknown): string {
  if (weight === undefined || weight === null || weight === "" || weight === 1) {
    return "";
  }
  return String(weight);
}

function buildConnectedKeysByNode(nodeKeys: NodeKey[], edges: StageData["edges"]): Map<NodeKey, ReadonlySet<NodeKey>> {
  const connectedKeysByNode = new Map<NodeKey, Set<NodeKey>>();
  nodeKeys.forEach((nodeKey) => {
    connectedKeysByNode.set(nodeKey, new Set([nodeKey]));
  });

  edges.forEach((edge) => {
    const sourceKeys = connectedKeysByNode.get(edge.source);
    const targetKeys = connectedKeysByNode.get(edge.target);
    sourceKeys?.add(edge.target);
    targetKeys?.add(edge.source);
  });

  return new Map(
    Array.from(connectedKeysByNode.entries(), ([nodeKey, connectedKeys]) => [
      nodeKey,
      connectedKeys as ReadonlySet<NodeKey>,
    ]),
  );
}
