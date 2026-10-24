import { type GraphGeometryAppearance } from "../../schema/appearance/defaults";
import type { NodeKey } from "../../graph/types";
import type { StageData, StageNode } from "../shared/types";
import type { PreparedNodeLink } from "./input";
import type { NodeLinkNodes } from "./nodes";
import { buildSugiyamaVerticalPlanner } from "./sugiyama-edge-routing";
export function positionNodeLinkNodes(context: PreparedNodeLink, nodes: NodeLinkNodes) {
  const { layoutMode, theme, selection } = context;
  const { layoutResult, nodeKeys, nodesByLayer, nodeMap, incomingMap } = nodes;
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
      const layerHeight = slotCount * theme.nodes.height + Math.max(slotCount - 1, 0) * theme.nodes.spacing.row;
      const startY = theme.canvas.padding[1] + (stageInnerHeight - layerHeight) / 2;
      layerNodes.forEach((nodeData) => {
        nodeData.y = startY + nodeData.order * (theme.nodes.height + theme.nodes.spacing.row) + theme.nodes.height / 2;
      });
    });

    const columnWidths = sortedLayers.map((layer) => {
      const layerNodes = nodesByLayer.get(layer) || [];
      return layerNodes.length ? Math.max(...layerNodes.map((node) => node.width)) : theme.nodes.widths[0];
    });
    let cursorX = theme.canvas.padding[0];

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
      cursorX += layerWidth + theme.nodes.spacing.column;
    });

    stageWidth = cursorX - theme.nodes.spacing.column + theme.canvas.padding[0];
    stageHeight = stageInnerHeight + theme.canvas.padding[1] * 2;
  }

  return {
    laneCenters,
    lanes,
    slotCountsByLayer,
    stageInnerHeight,
    stageWidth,
    stageHeight,
    absoluteOffset,
    sugiyamaVerticalPlanner,
    sortedLayers,
  };
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

function measureStageInnerHeight(slotCountsByLayer: Map<number, number>, theme: GraphGeometryAppearance): number {
  let maxHeight = 0;
  slotCountsByLayer.forEach((slotCount) => {
    const layerHeight = slotCount * theme.nodes.height + Math.max(slotCount - 1, 0) * theme.nodes.spacing.row;
    maxHeight = Math.max(maxHeight, layerHeight);
  });
  return Math.max(maxHeight, theme.nodes.height * 3.4);
}

function applyAbsoluteLayoutGeometry(input: {
  nodeKeys: NodeKey[];
  nodeMap: Record<NodeKey, StageNode>;
  nodesByLayer: Map<number, StageNode[]>;
  sortedLayers: number[];
  nodePositions: Map<NodeKey, { x: number; y: number }>;
  theme: GraphGeometryAppearance;
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
    maxRight = theme.nodes.widths[0];
    maxBottom = theme.nodes.height * 2;
  }

  const absoluteOffset = {
    x: theme.canvas.padding[0] - minLeft,
    y: theme.canvas.padding[1] - minTop,
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

  const stageWidth = maxRight - minLeft + theme.canvas.padding[0] * 2;
  const stageHeight = maxBottom - minTop + theme.canvas.padding[1] * 2;

  return {
    lanes,
    laneCenters,
    slotCountsByLayer,
    stageInnerHeight: Math.max(stageHeight - theme.canvas.padding[1] * 2, theme.nodes.height * 3.4),
    stageWidth,
    stageHeight,
    absoluteOffset,
  };
}
export type NodeLinkPositions = ReturnType<typeof positionNodeLinkNodes>;
