import { getNodeDefine, getNodeTitle } from "../../graph/accessors";
import { stageRoleFont } from "../shared/appearance";
import { roundedPolylinePath } from "../shared/rounded-path";
import { wrapDetailText } from "../shared/text";
import type { StageData, StageGroup, StageNode } from "../shared/types";
import type { LayoutResult } from "./layout-plan";
import type { PreparedCompound } from "./prepare";
export function assembleCompoundScene(prepared: PreparedCompound, solved: LayoutResult): StageData {
  const { input, problem, theme, visuals, cardGeometry, groupParents, colorFamilies } = prepared;
  const { dag, showNodeDetail } = input;
  const { projection } = problem;
  const detailFont = stageRoleFont(input.appearance, "detail");
  const warnings = solved.diagnostics;
  const geometry = solved.geometry;
  const result = {
    boxes: new Map(Object.entries(geometry.boxes)),
    routes: new Map(Object.entries(geometry.routes)),
    width: geometry.width,
    height: geometry.height,
  };
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
        titleMetrics: item.titleMetrics,
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
        detailLines: visual.detail ? wrapDetailText(visual.detail, width - 60, 2, detailFont) : [],
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
    stageWidth: Math.max(result.width ?? 0, theme.canvas.minSize[0]),
    stageHeight: Math.max(result.height ?? 0, theme.canvas.minSize[1]),
    warnings,
  };
}
