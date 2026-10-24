import { getNodeChildKeys, getNodeType } from "../../graph/accessors";
import { normalizeTypeLabel } from "../../graph/categoryColors";
import type { NodeKey, NormalizedDag } from "../../graph/types";
import { truncateTitleToWidth, wrapDetailText } from "../shared/text";
import type { StageData, StageNode } from "../shared/types";
import { cardContentLayout, minimumCardHeight } from "../shared/typography";
import { resolveLayout } from "./algorithm";
import type { PreparedNodeLink } from "./input";
const DETAIL_HORIZONTAL_INSET = 74;
const DETAIL_MIN_LINE_WIDTH = 72;
const DETAIL_MAX_LINES = 2;
export function buildNodeLinkNodes(context: PreparedNodeLink) {
  const {
    layoutMode,
    theme,
    font,
    detailFont,
    detailLineHeight,
    selection,
    layoutDag,
    forestTopLevelSet,
    layoutRoots,
    reachable,
    typeColorMap,
    visualByKey,
  } = context;
  for (const [key, visual] of visualByKey) {
    const detailCount = visual.detail
      ? wrapDetailText(visual.detail, Math.max(visual.width - 74, 72), 2, detailFont).length
      : 0;
    theme.nodes.height = Math.max(
      theme.nodes.height,
      minimumCardHeight(font, detailCount, !!getNodeType(layoutDag[key]!), 1, detailLineHeight),
    );
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
            detailFont,
          )
        : [],
      typeLabel,
      colorTokens: typeLabel ? typeColorMap.get(typeLabel) : undefined,
      width: visual.width,
      height: theme.nodes.height,
      isRoot: selection.isForest ? forestTopLevelSet.has(nodeKey) : nodeKey === selection.rootKey,
      x: 0,
      y: 0,
    };

    nodeData.contentLayout = cardContentLayout(
      nodeData.height,
      font,
      nodeData.detailLines.length,
      !!typeLabel,
      1,
      detailLineHeight,
    );

    if (!nodesByLayer.has(layer)) {
      nodesByLayer.set(layer, []);
    }
    nodesByLayer.get(layer)!.push(nodeData);
    nodeMap[nodeKey] = nodeData;
  });

  return { layoutResult, coordinates, nodeKeys, nodesByLayer, nodeMap, edges, incomingMap };
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
export type NodeLinkNodes = ReturnType<typeof buildNodeLinkNodes>;
