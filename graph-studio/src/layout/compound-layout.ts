import { cardContentLayout, minimumCardHeight } from "./typography";
import type { ELK } from "elkjs/lib/elk-api";
import { projectCompoundGraph } from "../graph/compoundProjection";
import type { CompoundView, NormalizedDag } from "../graph/types";
import { stageTitleFont, type StageAppearance } from "./appearance";
import { getNodeVisual, truncateTitleToWidth, wrapDetailText, measureText } from "./text";
import type { StageData, StageGroup, StageNode } from "./types";
import { roundedPolylinePath } from "./rounded-path";
import { layoutCompoundHierarchy } from "./compound-hierarchy-layout";

export async function buildCompoundStage(
  input: {
    dag: NormalizedDag;
    view: CompoundView;
    selectedType?: string;
    appearance: StageAppearance;
    showNodeDetail: boolean;
    alignNodeWidthsToMax: boolean;
    showEdgeLabels?: boolean;
  },
  elk: Pick<ELK, "layout">,
): Promise<StageData> {
  const { dag, view, appearance, showNodeDetail, alignNodeWidthsToMax } = input;
  const projection = projectCompoundGraph(dag, view, input.selectedType);
  const groupParents = new Map(Object.entries(dag.hierarchy?.parentById ?? {}));
  // Use all original roots, including collapsed/hidden ones, to keep colors stable.
  const colorFamilies = new Map(
    Object.keys(dag.hierarchy?.groups ?? {})
      .filter((id) => !groupParents.has(id))
      .sort()
      .map((id, index) => [id, index]),
  );
  const theme = appearance.layout;
  const font = stageTitleFont(appearance);
  const visuals = new Map<string, { title: string; detail: string; width: number }>();
  for (const item of projection.items) {
    const internalEdgeCount = item.internalEdgeIds.length;
    const detail = `${item.leafCount} node${item.leafCount === 1 ? "" : "s"} · ${internalEdgeCount} internal edge${internalEdgeCount === 1 ? "" : "s"}`;
    const visual =
      item.kind === "group"
        ? {
            title: item.title,
            detail: appearance.display.showGroupStats === false ? "" : detail,
            width: alignNodeWidthsToMax
              ? theme.maxNodeWidth
              : Math.max(theme.minNodeWidth, Math.min(theme.maxNodeWidth, 122 + measureText(item.title, font))),
          }
        : getNodeVisual(
            item.id,
            dag.nodes[item.id],
            theme.minNodeWidth,
            theme.maxNodeWidth,
            showNodeDetail,
            alignNodeWidthsToMax,
            font,
          );
    visuals.set(item.id, visual);
  }
  const sizes = new Map(
    projection.items.map((item) => {
      const visual = visuals.get(item.id)!;
      const detailCount = visual.detail ? wrapDetailText(visual.detail, visual.width - 60, 2).length : 0;
      return [
        item.id,
        {
          width: visual.width,
          height: Math.max(
            theme.nodeHeight,
            minimumCardHeight(font, detailCount, item.external || item.kind === "group"),
          ),
        },
      ];
    }),
  );
  const result = await layoutCompoundHierarchy(projection, sizes, theme, input.showEdgeLabels ?? false, elk);
  const nodes: StageNode[] = [];
  const groups: StageGroup[] = [];
  const nodeMap: StageData["nodeMap"] = Object.create(null);
  for (const item of projection.items) {
    const id = item.id;
    const { x: left, y: top, width, height } = result.boxes.get(id)!;
    const visual = visuals.get(id)!;
    if (item.kind === "group" && !item.collapsed) {
      // Use the original root ancestor so drilling into a group preserves its color family.
      let colorFamilyId = id;
      while (groupParents.has(colorFamilyId)) {
        colorFamilyId = groupParents.get(colorFamilyId)!;
      }
      groups.push({
        id,
        colorFamilyIndex: colorFamilies.get(colorFamilyId) ?? 0,
        title: item.title,
        depth: item.depth,
        leafCount: item.leafCount,
        x: left,
        y: top,
        width,
        height,
      });
    } else {
      const stageNode: StageNode = {
        key: id,
        kind: item.kind,
        external: item.external,
        layer: item.depth,
        order: nodes.length,
        title: visual.title,
        displayTitle: truncateTitleToWidth(visual.title, item.kind === "group" ? width - 48 : width, font),
        detail: visual.detail,
        detailLines: visual.detail ? wrapDetailText(visual.detail, width - 60, 2) : [],
        typeLabel: item.external ? "External" : item.kind === "group" ? "Subgraph" : undefined,
        width,
        height,
        isRoot: false,
        x: left + width / 2,
        y: top + height / 2,
      };
      stageNode.contentLayout = cardContentLayout(height, font, stageNode.detailLines.length, !!stageNode.typeLabel);
      nodes.push(stageNode);
      nodeMap[id] = stageNode;
    }
  }
  const edges: StageData["edges"] = [];
  const originalEdges = new Map(dag.edges.map((edge) => [edge.id, edge]));
  for (const original of projection.edges) {
    const route = result.routes.get(original.id)!;
    edges.push({
      ...original,
      weight: undefined,
      description: original.originalEdgeIds
        .map((id) => {
          const source = originalEdges.get(id)!;
          return `${id}: ${source.source} → ${source.target}${source.value === undefined ? "" : ` (${source.value})`}`;
        })
        .join("\n"),
      points: route.points.map((point, order) => ({ ...point, layer: 0, order })),
      path: roundedPolylinePath(route.points),
      labelPosition: route.labelPosition,
    });
  }
  const connectedKeysByNode = new Map<string, Set<string>>(nodes.map((node) => [node.key, new Set<string>()]));
  edges.forEach((edge) => {
    connectedKeysByNode.get(edge.source)?.add(edge.target);
    connectedKeysByNode.get(edge.target)?.add(edge.source);
  });
  return {
    dag: dag.nodes,
    layoutMode: "compound",
    root: "",
    topLevelKeys: [],
    isForest: true,
    selection: {
      rootKey: "",
      topLevelKeys: [],
      isForest: true,
      label: projection.focusGroupId ? dag.hierarchy!.groups[projection.focusGroupId].title : "All groups",
      appSelection: { type: "full" },
    },
    nodeMap,
    nodes,
    groups: groups.sort((a, b) => a.depth - b.depth),
    edges,
    connectedKeysByNode,
    lanes: [],
    stageWidth: Math.max(result.width ?? 0, theme.stageMinWidth),
    stageHeight: Math.max(result.height ?? 0, theme.stageMinHeight),
    warnings: [],
  };
}
