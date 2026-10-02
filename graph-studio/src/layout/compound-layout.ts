import type { ElkNode, ELK, ElkPoint } from "elkjs/lib/elk-api";
import { projectCompoundGraph } from "../graph/compoundProjection";
import type { CompoundView, NormalizedDag } from "../graph/types";
import type { StageAppearance } from "./appearance";
import { getNodeVisual, truncateTitleToWidth, wrapDetailText } from "./text";
import type { StageData, StageGroup, StageNode } from "./types";
import { roundedPolylinePath } from "./rounded-path";

export async function buildCompoundStage(
  input: {
    dag: NormalizedDag;
    view: CompoundView;
    selectedType?: string;
    appearance: StageAppearance;
    showNodeDetail: boolean;
    alignNodeWidthsToMax: boolean;
  },
  elk: Pick<ELK, "layout">,
): Promise<StageData> {
  const { dag, view, appearance, showNodeDetail, alignNodeWidthsToMax } = input;
  const projection = projectCompoundGraph(dag, view, input.selectedType);
  const theme = appearance.layout;
  const root: ElkNode = {
    id: "scene-root",
    children: [],
    edges: [],
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=36,left=36,bottom=36,right=36]",
      "elk.spacing.nodeNode": String(theme.rowGap),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(theme.columnGap),
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.randomSeed": "1",
    },
  };
  const sceneIds = new Map(projection.items.map((item, i) => [item.id, `item-${i}`]));
  const sourceIds = new Map([...sceneIds].map(([key, value]) => [value, key]));
  const elkItems = new Map<string, ElkNode>();
  const visuals = new Map<string, { title: string; detail: string; width: number }>();
  for (const item of projection.items) {
    const detail = `${item.leafCount} nodes · ${item.internalEdgeIds.length} internal relationships`;
    const visual =
      item.kind === "group"
        ? {
            title: item.title,
            detail,
            width: Math.max(theme.minNodeWidth, Math.min(theme.maxNodeWidth, 100 + item.title.length * 9)),
          }
        : getNodeVisual(
            item.id,
            dag.nodes[item.id],
            theme.minNodeWidth,
            theme.maxNodeWidth,
            showNodeDetail,
            alignNodeWidthsToMax,
          );
    visuals.set(item.id, visual);
    elkItems.set(item.id, {
      id: sceneIds.get(item.id)!,
      width: visual.width,
      height: theme.nodeHeight,
      ...(item.kind === "group" && !item.collapsed
        ? {
            children: [],
            layoutOptions: {
              "elk.padding": "[top=58,left=24,bottom=24,right=24]",
              "elk.nodeSize.constraints": "MINIMUM_SIZE",
              "elk.nodeSize.minimum": `(${Math.max(260, visual.width)},120)`,
            },
          }
        : {}),
    });
  }
  for (const item of projection.items)
    (item.parentId ? elkItems.get(item.parentId)! : root).children!.push(elkItems.get(item.id)!);
  root.edges = projection.edges.map((edge, i) => ({
    id: `edge-${i}`,
    sources: [sceneIds.get(edge.source)!],
    targets: [sceneIds.get(edge.target)!],
    labels: edge.label ? [{ text: edge.label, width: edge.label.length * 7 + 12, height: 18 }] : [],
  }));
  const result = await elk.layout(root);
  const nodes: StageNode[] = [];
  const groups: StageGroup[] = [];
  const nodeMap: StageData["nodeMap"] = Object.create(null);
  const positions = new Map<string, { x: number; y: number }>([[root.id, { x: 0, y: 0 }]]);
  const itemMap = new Map(projection.items.map((item) => [item.id, item]));
  const stack = (result.children ?? []).map((node) => ({ node, x: 0, y: 0 }));
  while (stack.length) {
    const { node, x, y } = stack.pop()!;
    const left = x + (node.x ?? 0),
      top = y + (node.y ?? 0);
    positions.set(node.id, { x: left, y: top });
    const id = sourceIds.get(node.id)!;
    const item = itemMap.get(id)!;
    const visual = visuals.get(id)!;
    const width = node.width ?? visual.width,
      height = node.height ?? theme.nodeHeight;
    if (node.children) {
      groups.push({
        id,
        title: item.title,
        depth: item.depth,
        leafCount: item.leafCount,
        x: left,
        y: top,
        width,
        height,
      });
      node.children.forEach((child) => stack.push({ node: child, x: left, y: top }));
    } else {
      const stageNode: StageNode = {
        key: id,
        kind: item.kind,
        external: item.external,
        layer: item.depth,
        order: nodes.length,
        title: visual.title,
        displayTitle: truncateTitleToWidth(visual.title, item.kind === "group" ? width - 48 : width),
        detail: visual.detail,
        detailLines: visual.detail ? wrapDetailText(visual.detail, width - 60, 2) : [],
        typeLabel: item.external ? "External" : item.kind === "group" ? "Subgraph" : undefined,
        width,
        height,
        isRoot: false,
        x: left + width / 2,
        y: top + height / 2,
      };
      nodes.push(stageNode);
      nodeMap[id] = stageNode;
    }
  }
  const edges: StageData["edges"] = [];
  const originalEdges = new Map(dag.edges.map((edge) => [edge.id, edge]));
  for (const edge of result.edges ?? []) {
    const original = projection.edges[Number(edge.id.slice(5))];
    const offset = positions.get(edge.container ?? root.id) ?? { x: 0, y: 0 };
    const shift = (point: ElkPoint) => ({ x: point.x + offset.x, y: point.y + offset.y });
    const sections = (edge.sections ?? []).map((section) =>
      [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(shift),
    );
    const points = sections.flat();
    if (!points.length) throw new Error(`No route for ${original.source} → ${original.target}.`);
    const middle = points[Math.floor(points.length / 2)];
    const label = edge.labels?.[0];
    edges.push({
      ...original,
      weight: undefined,
      description: original.originalEdgeIds
        .map((id) => {
          const source = originalEdges.get(id)!;
          return `${id}: ${source.source} → ${source.target}${source.value === undefined ? "" : ` (${source.value})`}`;
        })
        .join("\n"),
      path: sections.map((section) => roundedPolylinePath(section)).join(" "),
      labelPosition:
        label && label.x !== undefined && label.y !== undefined
          ? { x: label.x + offset.x + (label.width ?? 0) / 2, y: label.y + offset.y + 10 }
          : { x: middle.x, y: middle.y - 10 },
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
