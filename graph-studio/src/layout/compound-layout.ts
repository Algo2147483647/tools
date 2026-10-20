import { getNodeTitle, getNodeDefine } from "../graph/accessors";
import { getGroupNodes } from "../graph/hierarchy";
import { cardContentLayout, minimumCardHeight } from "./typography";
import { projectCompoundGraph } from "../graph/compoundProjection";
import type { CompoundView, NormalizedDag } from "../graph/types";
import { stageTitleFont, type StageAppearance } from "./appearance";
import { getNodeVisual, layoutCardTitle, wrapDetailText } from "./text";
import type { StageData, StageGroup, StageNode } from "./types";
import { roundedPolylinePath } from "./rounded-path";
import { layoutCompoundHierarchy } from "./compound-hierarchy-layout";
import { routeCompoundEdges } from "./compound-orthogonal-router";

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
): Promise<StageData> {
  const { dag, view, appearance, showNodeDetail, alignNodeWidthsToMax } = input;
  const projection = projectCompoundGraph(dag, view, input.selectedType);
  const groupParents = new Map((dag.hierarchy_edges ?? []).map((edge) => [edge.target, edge.source]));
  // Use all original roots, including collapsed/hidden ones, to keep colors stable.
  const colorFamilies = new Map(
    Object.keys(getGroupNodes(dag))
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
    const visual = getNodeVisual(
      item.id,
      dag.nodes[item.id],
      theme.minNodeWidth,
      theme.maxNodeWidth,
      showNodeDetail,
      alignNodeWidthsToMax,
      font,
    );
    if (item.kind === "group" && !getNodeDefine(dag.nodes[item.id])) visual.detail = "";
    if (item.kind === "group" && appearance.display.showGroupStats !== false)
      visual.detail = [visual.detail, detail].filter(Boolean).join(" · ");
    visuals.set(item.id, visual);
  }
  function cardGeometry(
    visual: { title: string; detail: string; width: number },
    kind: string,
    external: boolean,
    fixedHeight?: number,
  ) {
    const detailLines = visual.detail ? wrapDetailText(visual.detail, visual.width - 60, 2) : [];
    const hasBadge = external || kind === "group";
    const titleLayout = layoutCardTitle(visual.title, visual.width, font, appearance.display);
    const height =
      fixedHeight ??
      Math.max(theme.nodeHeight, minimumCardHeight(font, detailLines.length, hasBadge, titleLayout.lines.length));
    const contentLayout = cardContentLayout(height, font, detailLines.length, hasBadge, titleLayout.lines.length);
    return { titleLayout, height, contentLayout, detailLines };
  }

  const sizes = new Map(
    projection.items.map((item) => {
      const visual = visuals.get(item.id)!;
      const { height } = cardGeometry(visual, item.kind, item.external);
      return [item.id, { width: visual.width, height }];
    }),
  );
  const placement = layoutCompoundHierarchy(projection, sizes, theme);
  const routing = routeCompoundEdges(projection, placement.boxes, {x:0, y:0, width:placement.width, height:placement.height}, input.showEdgeLabels ?? false);
  const result = {...placement, ...routing};
  const nodes: StageNode[] = [];
  const groups: StageGroup[] = [];
  const nodeMap: StageData["nodeMap"] = Object.create(null);
  for (const item of projection.items) {
    const id = item.id;
    const { x: left, y: top, width, height } = result.boxes.get(id)!;
    const visual = visuals.get(id)!;
    if (item.kind === "group" && !item.collapsed) {
      nodeMap[id] = {
        key: id,
        kind: "group",
        title: visual.title,
        displayTitle: visual.title,
        detail: visual.detail,
        detailLines: [],
        width,
        height,
        x: left + width / 2,
        y: top + height / 2,
        layer: item.depth,
        order: groups.length,
        isRoot: false,
      };
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
      const geometry = cardGeometry({ ...visual, width }, item.kind, item.external, height);
      const stageNode: StageNode = {
        key: id,
        kind: item.kind,
        groupStatsOnly: item.kind === "group" && (!showNodeDetail || !getNodeDefine(dag.nodes[id])),
        external: item.external,
        layer: item.depth,
        order: nodes.length,
        title: visual.title,
        displayTitle: geometry.titleLayout.lines.join("\n"),
        titleLayout: geometry.titleLayout,
        detail: visual.detail,
        detailLines: visual.detail ? wrapDetailText(visual.detail, width - 60, 2) : [],
        typeLabel: item.external ? "External" : item.kind === "group" ? "Subgraph" : undefined,
        width,
        height,
        isRoot: false,
        x: left + width / 2,
        y: top + height / 2,
      };
      stageNode.contentLayout = geometry.contentLayout;
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
  const connectedKeysByNode = new Map<string, Set<string>>(
    projection.items.map((item) => [item.id, new Set<string>()]),
  );
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
      label: projection.focusGroupId ? getNodeTitle(dag.nodes[projection.focusGroupId]) : "All groups",
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
