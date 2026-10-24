import { buildSpatialStage } from "./spatial-layout";
import { buildCategoryColorMap, normalizeTypeLabel } from "../graph/categoryColors";
import { cardContentLayout, minimumCardHeight, type TextFont } from "./typography";
import { getNodeChildKeys, getNodeChildren, getNodeType } from "../graph/accessors";
import { type GraphLayoutAppearance, DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getRelationKeys } from "../graph/relations";
import { getSankeyError } from "../graph/sankey";
import { cloneGraphDocument } from "../graph/serialize";
import { collectDescendantKeys } from "../graph/traversal";
import type { GraphRenderMode, GraphSelection, NodeKey, NormalizedDag, RelationValue } from "../graph/types";
import { buildDagreLayout } from "./algorithms/dagre";
import { buildLevelLayout } from "./algorithms/level";
import { buildSankeyStage } from "./algorithms/sankey";
import { buildSugiyamaLayout } from "./algorithms/sugiyama";
import { stageTitleFont, type StageAppearance } from "./appearance";
import { resolveStageEdgeGeometry } from "./edgeGeometry";
import { resolveStageSelection, withSyntheticSelectionRoot } from "./selection";
import { buildSugiyamaStageRoutes, buildSugiyamaVerticalPlanner } from "./sugiyama-edge-routing";
import { getNodeVisual, truncateTitleToWidth, wrapDetailText } from "./text";
import type { LayoutRoutePoint, StageData, StageNode, StageRoutePoint } from "./types";

const DETAIL_HORIZONTAL_INSET = 74;
const DETAIL_MIN_LINE_WIDTH = 72;
const DETAIL_MAX_LINES = 2;
export function buildStageData(input: {
  dag: NormalizedDag;
  colorSourceDag?: NormalizedDag;

  selection: GraphSelection | null;
  layoutMode?: GraphRenderMode;
  appearance?: StageAppearance;
  showNodeDetail?: boolean;
  alignNodeWidthsToMax?: boolean;
}): StageData | null {
  const {
    dag: sourceDag,
    selection: requestedSelection,
    layoutMode = sourceDag.diagram === "sankey" ? "sankey" : "sugiyama",
    appearance = DEFAULT_GRAPH_APPEARANCE,
    showNodeDetail = true,
    alignNodeWidthsToMax = false,
  } = input;
  if (layoutMode === "spatial") return buildSpatialStage(input);
  const font = stageTitleFont(appearance);
  const theme = { ...appearance.layout };
  if (!sourceDag || Object.keys(sourceDag.nodes).length === 0) {
    return null;
  }

  const dag = cloneGraphDocument(sourceDag);
  const selection = resolveStageSelection(dag, requestedSelection);
  const layoutDag = withSyntheticSelectionRoot(dag, selection);
  const forestTopLevelSet = new Set(selection.topLevelKeys);
  const layoutRoots = selection.isForest ? selection.topLevelKeys : [selection.rootKey];
  const reachable =
    layoutMode === "sankey" && selection.appSelection.type === "full"
      ? new Set(Object.keys(sourceDag.nodes))
      : new Set(collectDescendantKeys(layoutDag, layoutRoots));
  const typeColorMap = buildCategoryColorMap(Object.values((input.colorSourceDag ?? sourceDag).nodes).map(getNodeType));
  const edgeIds = new Map(sourceDag.edges.map((edge) => [JSON.stringify([edge.source, edge.target]), edge.id]));
  const visualByKey = buildNodeVisualMap(layoutDag, reachable, theme, showNodeDetail, alignNodeWidthsToMax, font);
  if (layoutMode === "sankey") {
    const error = getSankeyError(sourceDag.nodes, sourceDag.edges);
    if (error) {
      const fallback = buildStageData({ ...input, layoutMode: "sugiyama" });
      if (fallback) fallback.warnings.unshift(`${error} Showing the layered layout.`);
      return fallback;
    }
    return buildSankeyStage(sourceDag, reachable, selection, visualByKey, appearance);
  }
  for (const [key, visual] of visualByKey) {
    const detailCount = visual.detail ? wrapDetailText(visual.detail, Math.max(visual.width - 74, 72), 2).length : 0;
    theme.nodeHeight = Math.max(theme.nodeHeight, minimumCardHeight(font, detailCount, !!getNodeType(layoutDag[key]!)));
  }
  const layoutResult = resolveLayout(layoutMode, layoutDag, layoutRoots, visualByKey, theme);
  const coordinates = layoutResult.coordinates;
  const nodeKeys = Array.from(reachable).filter((key) => layoutDag[key] && coordinates.has(key));
  const nodesByLayer = new Map<number, StageNode[]>();
  const nodeMap: Record<NodeKey, StageNode> = Object.create(null);
  const edges: StageData["edges"] = [];
  const incomingMap = buildIncomingMap(layoutDag, nodeKeys);

  nodeKeys.forEach((nodeKey) => {
    const node = layoutDag[nodeKey];
    const coordinate = coordinates.get(nodeKey);
    const visual = visualByKey.get(nodeKey);
    if (!coordinate || !visual) {
      return;
    }

    const [layer, order] = coordinate;
    const typeLabel = normalizeTypeLabel(getNodeType(node));
    const nodeData: StageNode = {
      key: nodeKey,
      layer,
      order,
      title: visual.title,
      displayTitle: truncateTitleToWidth(visual.title, visual.width, font),
      detail: visual.detail,
      detailLines: visual.detail
        ? wrapDetailText(
            visual.detail,
            Math.max(visual.width - DETAIL_HORIZONTAL_INSET, DETAIL_MIN_LINE_WIDTH),
            DETAIL_MAX_LINES,
          )
        : [],
      typeLabel,
      colorTokens: typeLabel ? typeColorMap.get(typeLabel) : undefined,
      width: visual.width,
      height: theme.nodeHeight,
      isRoot: selection.isForest ? forestTopLevelSet.has(nodeKey) : nodeKey === selection.rootKey,
      x: 0,
      y: 0,
    };

    nodeData.contentLayout = cardContentLayout(nodeData.height, font, nodeData.detailLines.length, !!typeLabel);

    if (!nodesByLayer.has(layer)) {
      nodesByLayer.set(layer, []);
    }
    nodesByLayer.get(layer)!.push(nodeData);
    nodeMap[nodeKey] = nodeData;
  });

  const fallbackSlotCounts = new Map(
    Array.from(nodesByLayer.entries()).map(([layer, layerNodes]) => [layer, layerNodes.length]),
  );
  const sortedLayers = Array.from(
    new Set([...nodesByLayer.keys(), ...(layoutResult.layerSlotCounts?.keys() || [])]),
  ).sort((a, b) => a - b);

  let laneCenters = new Map<number, number>();
  let lanes: StageData["lanes"] = [];
  let slotCountsByLayer = layoutResult.layerSlotCounts || fallbackSlotCounts;
  let stageInnerHeight = measureStageInnerHeight(slotCountsByLayer, theme);
  let stageWidth = 0;
  let stageHeight = 0;
  let absoluteOffset: { x: number; y: number } | undefined;
  let sugiyamaVerticalPlanner: ReturnType<typeof buildSugiyamaVerticalPlanner> | undefined;

  if (layoutResult.nodePositions?.size) {
    const absoluteGeometry = applyAbsoluteLayoutGeometry({
      nodeKeys,
      nodeMap,
      nodesByLayer,
      sortedLayers,
      nodePositions: layoutResult.nodePositions,
      theme,
      selection,
    });
    lanes = absoluteGeometry.lanes;
    laneCenters = absoluteGeometry.laneCenters;
    slotCountsByLayer = absoluteGeometry.slotCountsByLayer;
    stageInnerHeight = absoluteGeometry.stageInnerHeight;
    stageWidth = absoluteGeometry.stageWidth;
    stageHeight = absoluteGeometry.stageHeight;
    absoluteOffset = absoluteGeometry.absoluteOffset;
  } else {
    if (layoutMode === "sugiyama") {
      sugiyamaVerticalPlanner = buildSugiyamaVerticalPlanner({
        nodesByLayer,
        logicalSlotCountsByLayer: slotCountsByLayer,
        sortedLayers,
        theme,
      });
      stageInnerHeight = sugiyamaVerticalPlanner.stageInnerHeight;
    }

    sortedLayers.forEach((layer) => {
      const layerNodes = (nodesByLayer.get(layer) || []).sort((a, b) => a.order - b.order);
      if (layoutMode === "level" && layer > 0) {
        layerNodes.sort((a, b) => {
          const aScore = getBarycentricScore(a.key, incomingMap, nodeMap);
          const bScore = getBarycentricScore(b.key, incomingMap, nodeMap);
          return aScore === bScore ? a.order - b.order : aScore - bScore;
        });
      }

      if (layoutMode === "level") {
        layerNodes.forEach((nodeData, index) => {
          nodeData.order = index;
        });
      }

      if (layoutMode === "sugiyama" && sugiyamaVerticalPlanner) {
        layerNodes.forEach((nodeData) => {
          const displayOrder = sugiyamaVerticalPlanner?.nodeDisplayOrderByKey.get(nodeData.key);
          const centerY = sugiyamaVerticalPlanner?.nodeCenterYByKey.get(nodeData.key);
          if (displayOrder !== undefined) {
            nodeData.order = displayOrder;
          }
          if (centerY !== undefined) {
            nodeData.y = centerY;
          }
        });
        return;
      }

      const slotCount = slotCountsByLayer.get(layer) || layerNodes.length || 1;
      const layerHeight = slotCount * theme.nodeHeight + Math.max(slotCount - 1, 0) * theme.rowGap;
      const startY = theme.stagePadding[1] + (stageInnerHeight - layerHeight) / 2;
      layerNodes.forEach((nodeData) => {
        nodeData.y = startY + nodeData.order * (theme.nodeHeight + theme.rowGap) + theme.nodeHeight / 2;
      });
    });

    const columnWidths = sortedLayers.map((layer) => {
      const layerNodes = nodesByLayer.get(layer) || [];
      return layerNodes.length ? Math.max(...layerNodes.map((node) => node.width)) : theme.minNodeWidth;
    });
    let cursorX = theme.stagePadding[0];

    sortedLayers.forEach((layer, index) => {
      const layerWidth = columnWidths[index];
      const layerNodes = nodesByLayer.get(layer) || [];
      const laneCenter = cursorX + layerWidth / 2;
      laneCenters.set(layer, laneCenter);
      layerNodes.forEach((nodeData) => {
        nodeData.x = laneCenter;
      });
      lanes.push({
        layer,
        label: layer === 0 ? (selection.isForest ? "Root" : "Focus") : `Tier ${layer}`,
        x: laneCenter,
        width: layerWidth,
      });
      cursorX += layerWidth + theme.columnGap;
    });

    stageWidth = cursorX - theme.columnGap + theme.stagePadding[0];
    stageHeight = stageInnerHeight + theme.stagePadding[1] * 2;
  }

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
    stageWidth: Math.max(stageWidth, theme.stageMinWidth),
    stageHeight: Math.max(stageHeight, theme.stageMinHeight),
    warnings: layoutResult.warnings,
  };
}

function resolveLayout(
  layoutMode: GraphRenderMode,
  layoutDag: Record<NodeKey, NormalizedDag["nodes"][NodeKey] | undefined>,
  layoutRoots: NodeKey[],
  visualByKey: Map<NodeKey, { width: number }>,
  theme: GraphLayoutAppearance,
) {
  if (layoutMode === "sugiyama") {
    return buildSugiyamaLayout(layoutDag, layoutRoots);
  }
  if (layoutMode === "dagre") {
    const nodeSizes = new Map<NodeKey, { width: number; height: number }>();
    visualByKey.forEach((visual, nodeKey) => {
      nodeSizes.set(nodeKey, { width: visual.width, height: theme.nodeHeight });
    });
    return buildDagreLayout(layoutDag, layoutRoots, nodeSizes);
  }
  return buildLevelLayout(layoutDag, layoutRoots);
}

function buildNodeVisualMap(
  dag: Record<NodeKey, NormalizedDag["nodes"][NodeKey] | undefined>,
  nodeKeys: Set<NodeKey>,
  theme: GraphLayoutAppearance,
  showNodeDetail: boolean,
  alignNodeWidthsToMax: boolean,
  font: TextFont,
): Map<NodeKey, ReturnType<typeof getNodeVisual>> {
  const visuals = new Map<NodeKey, ReturnType<typeof getNodeVisual>>();
  nodeKeys.forEach((nodeKey) => {
    const node = dag[nodeKey];
    if (!node) {
      return;
    }
    visuals.set(
      nodeKey,
      getNodeVisual(nodeKey, node, theme.minNodeWidth, theme.maxNodeWidth, showNodeDetail, alignNodeWidthsToMax, font),
    );
  });
  return visuals;
}

function buildIncomingMap(
  dag: Record<NodeKey, NormalizedDag["nodes"][NodeKey] | undefined>,
  nodeKeys: NodeKey[],
): Record<NodeKey, NodeKey[]> {
  const visibleKeys = new Set(nodeKeys);
  const incomingMap: Record<NodeKey, NodeKey[]> = Object.create(null);
  nodeKeys.forEach((nodeKey) => {
    incomingMap[nodeKey] = [];
  });
  nodeKeys.forEach((sourceKey) => {
    const sourceNode = dag[sourceKey];
    if (!sourceNode) {
      return;
    }
    getNodeChildKeys(sourceNode).forEach((targetKey) => {
      if (visibleKeys.has(targetKey)) {
        incomingMap[targetKey].push(sourceKey);
      }
    });
  });
  return incomingMap;
}

function getBarycentricScore(
  nodeKey: NodeKey,
  incomingMap: Record<NodeKey, NodeKey[]>,
  nodeMap: Record<NodeKey, StageNode>,
): number {
  const parents = incomingMap[nodeKey] || [];
  if (!parents.length) {
    return nodeMap[nodeKey].order;
  }
  const total = parents.reduce((sum, parentKey) => sum + (nodeMap[parentKey] ? nodeMap[parentKey].order : 0), 0);
  return total / parents.length;
}

function measureStageInnerHeight(slotCountsByLayer: Map<number, number>, theme: GraphLayoutAppearance): number {
  let maxHeight = 0;
  slotCountsByLayer.forEach((slotCount) => {
    const layerHeight = slotCount * theme.nodeHeight + Math.max(slotCount - 1, 0) * theme.rowGap;
    maxHeight = Math.max(maxHeight, layerHeight);
  });
  return Math.max(maxHeight, theme.nodeHeight * 3.4);
}

function applyAbsoluteLayoutGeometry(input: {
  nodeKeys: NodeKey[];
  nodeMap: Record<NodeKey, StageNode>;
  nodesByLayer: Map<number, StageNode[]>;
  sortedLayers: number[];
  nodePositions: Map<NodeKey, { x: number; y: number }>;
  theme: GraphLayoutAppearance;
  selection: StageData["selection"];
}): {
  lanes: StageData["lanes"];
  laneCenters: Map<number, number>;
  slotCountsByLayer: Map<number, number>;
  stageInnerHeight: number;
  stageWidth: number;
  stageHeight: number;
  absoluteOffset: { x: number; y: number };
} {
  const { nodeKeys, nodeMap, nodesByLayer, sortedLayers, nodePositions, theme, selection } = input;
  let minLeft = Infinity;
  let maxRight = -Infinity;
  let minTop = Infinity;
  let maxBottom = -Infinity;

  nodeKeys.forEach((nodeKey) => {
    const node = nodeMap[nodeKey];
    const position = nodePositions.get(nodeKey);
    if (!node || !position) {
      return;
    }
    minLeft = Math.min(minLeft, position.x - node.width / 2);
    maxRight = Math.max(maxRight, position.x + node.width / 2);
    minTop = Math.min(minTop, position.y - node.height / 2);
    maxBottom = Math.max(maxBottom, position.y + node.height / 2);
  });

  if (
    !Number.isFinite(minLeft) ||
    !Number.isFinite(minTop) ||
    !Number.isFinite(maxRight) ||
    !Number.isFinite(maxBottom)
  ) {
    minLeft = 0;
    minTop = 0;
    maxRight = theme.minNodeWidth;
    maxBottom = theme.nodeHeight * 2;
  }

  const absoluteOffset = {
    x: theme.stagePadding[0] - minLeft,
    y: theme.stagePadding[1] - minTop,
  };

  nodeKeys.forEach((nodeKey) => {
    const node = nodeMap[nodeKey];
    const position = nodePositions.get(nodeKey);
    if (!node || !position) {
      return;
    }
    node.x = position.x + absoluteOffset.x;
    node.y = position.y + absoluteOffset.y;
  });

  const lanes: StageData["lanes"] = [];
  const laneCenters = new Map<number, number>();
  const slotCountsByLayer = new Map<number, number>();

  sortedLayers.forEach((layer) => {
    const layerNodes = nodesByLayer.get(layer) || [];
    slotCountsByLayer.set(layer, layerNodes.length);
    if (!layerNodes.length) {
      return;
    }

    const laneCenter = layerNodes.reduce((sum, node) => sum + node.x, 0) / layerNodes.length;
    laneCenters.set(layer, laneCenter);
    lanes.push({
      layer,
      label: layer === 0 ? (selection.isForest ? "Root" : "Focus") : `Tier ${layer}`,
      x: laneCenter,
      width: Math.max(...layerNodes.map((node) => node.width)),
    });
  });

  const stageWidth = maxRight - minLeft + theme.stagePadding[0] * 2;
  const stageHeight = maxBottom - minTop + theme.stagePadding[1] * 2;

  return {
    lanes,
    laneCenters,
    slotCountsByLayer,
    stageInnerHeight: Math.max(stageHeight - theme.stagePadding[1] * 2, theme.nodeHeight * 3.4),
    stageWidth,
    stageHeight,
    absoluteOffset,
  };
}

function getRoutePointPosition(
  point: LayoutRoutePoint,
  laneCenters: Map<number, number>,
  slotCountsByLayer: Map<number, number>,
  stageInnerHeight: number,
  theme: GraphLayoutAppearance,
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
  const layerHeight = slotCount * theme.nodeHeight + Math.max(slotCount - 1, 0) * theme.rowGap;
  const startY = theme.stagePadding[1] + (stageInnerHeight - layerHeight) / 2;
  return {
    layer: point.layer,
    order: point.order,
    x: laneCenters.get(point.layer) || theme.stagePadding[0],
    y: startY + point.order * (theme.nodeHeight + theme.rowGap) + theme.nodeHeight / 2,
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
