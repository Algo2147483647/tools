import { getNodeType } from "../../graph/accessors";
import { DEFAULT_GRAPH_APPEARANCE, type GraphGeometryAppearance } from "../../schema/appearance/defaults";
import { buildCategoryColorMap } from "../../graph/categoryColors";
import { cloneGraphDocument } from "../../graph/serialize";
import { collectDescendantKeys } from "../../graph/traversal";
import type { GraphRenderMode, GraphSelection, NodeKey, NormalizedDag } from "../../graph/types";
import { stageRoleFont, stageTitleFont, type StageAppearance } from "../shared/appearance";
import { resolveStageSelection, withSyntheticSelectionRoot } from "../shared/selection";
import { getNodeVisual, wrapDetailText } from "../shared/text";
import { minimumCardHeight, type TextFont } from "../shared/typography";
export interface NodeLinkLayoutInput {
  dag: NormalizedDag;
  colorSourceDag?: NormalizedDag;

  selection: GraphSelection | null;
  layoutMode?: GraphRenderMode;
  appearance?: StageAppearance;
  showNodeDetail?: boolean;
  alignNodeWidthsToMax?: boolean;
}
export function prepareNodeLinkInput(input: NodeLinkLayoutInput) {
  const {
    dag: sourceDag,
    selection: requestedSelection,
    layoutMode = sourceDag.diagram === "sankey" ? "sankey" : "sugiyama",
    appearance = DEFAULT_GRAPH_APPEARANCE,
    showNodeDetail = true,
    alignNodeWidthsToMax = false,
  } = input;
  const font = stageTitleFont(appearance);
  const detailFont = stageRoleFont(appearance, "detail"),
    detailLineHeight = Math.ceil(detailFont.size * 1.2);
  const theme = { ...appearance, nodes: { ...appearance.nodes } };
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
  const visualByKey = buildNodeVisualMap(
    layoutDag,
    reachable,
    theme,
    showNodeDetail,
    alignNodeWidthsToMax,
    font,
    detailFont,
  );

  for (const [key, visual] of visualByKey) {
    const detailCount = visual.detail
      ? wrapDetailText(visual.detail, Math.max(visual.width - 74, 72), 2, detailFont).length
      : 0;
    theme.nodes.height = Math.max(
      theme.nodes.height,
      minimumCardHeight(font, detailCount, !!getNodeType(layoutDag[key]!), 1, detailLineHeight),
    );
  }

  return {
    sourceDag,
    layoutMode,
    appearance,
    showNodeDetail,
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
    edgeIds,
    visualByKey,
  };
}
function buildNodeVisualMap(
  dag: Record<NodeKey, NormalizedDag["nodes"][NodeKey] | undefined>,
  nodeKeys: Set<NodeKey>,
  theme: GraphGeometryAppearance,
  showNodeDetail: boolean,
  alignNodeWidthsToMax: boolean,
  font: TextFont,
  detailFont: TextFont,
): Map<NodeKey, ReturnType<typeof getNodeVisual>> {
  const visuals = new Map<NodeKey, ReturnType<typeof getNodeVisual>>();
  nodeKeys.forEach((nodeKey) => {
    const node = dag[nodeKey];
    if (!node) {
      return;
    }
    visuals.set(
      nodeKey,
      getNodeVisual(nodeKey, node, theme.nodes.widths, showNodeDetail, alignNodeWidthsToMax, font, detailFont),
    );
  });
  return visuals;
}
export type PreparedNodeLink = NonNullable<ReturnType<typeof prepareNodeLinkInput>>;
