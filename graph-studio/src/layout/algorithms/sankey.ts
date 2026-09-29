import { sankey, sankeyJustify, sankeyLinkHorizontal, type SankeyNode } from "d3-sankey";
import type { GraphAppearance } from "../../graph/appearance";
import type { GraphEdge, NormalizedDag } from "../../graph/types";
import { formatFlow } from "../../graph/sankey";
import type { ResolvedStageSelection, StageData, StageNode } from "../types";
import { truncateTitleToWidth } from "../text";

interface FlowNode { id: string }
interface FlowLink { id: string }
const COLORS = ["#5386ce", "#54a89c", "#cf9b4e", "#9775c6", "#cd7997", "#6f9fac", "#a59467"];

export function buildSankeyStage(
  dag: NormalizedDag,
  keys: Set<string>,
  selection: ResolvedStageSelection,
  visuals: Map<string, { title: string; detail: string; width: number }>,
  appearance: GraphAppearance,
): StageData {
  const theme = appearance.layout;
  const edges = dag.edges.filter(edge => keys.has(edge.source) && keys.has(edge.target));
  const positiveEdges = edges.filter(edge => Number(edge.value) > 0);
  const activeKeys = new Set(positiveEdges.flatMap(edge => [edge.source, edge.target]));
  const quietKeys = [...keys].filter(key => !activeKeys.has(key));
  const totals = new Map([...keys].map(key => [key, { incoming: 0, outgoing: 0 }]));
  edges.forEach(edge => {
    totals.get(edge.source)!.outgoing += Number(edge.value);
    totals.get(edge.target)!.incoming += Number(edge.value);
  });

  // Longest-path ranks provide space for every column before D3 optimizes crossings.
  const rank = new Map([...activeKeys].map(key => [key, 0]));
  const degrees = new Map([...activeKeys].map(key => [key, 0]));
  const outgoing = new Map<string, GraphEdge[]>();
  positiveEdges.forEach(edge => {
    degrees.set(edge.target, degrees.get(edge.target)! + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  });
  const queue = [...activeKeys].filter(key => degrees.get(key) === 0);
  for (let i = 0; i < queue.length; i++) {
    for (const edge of outgoing.get(queue[i]) ?? []) {
      rank.set(edge.target, Math.max(rank.get(edge.target)!, rank.get(edge.source)! + 1));
      degrees.set(edge.target, degrees.get(edge.target)! - 1);
      if (degrees.get(edge.target) === 0) queue.push(edge.target);
    }
  }
  const lastLayer = Math.max(0, ...rank.values());
  const counts = new Map<number, number>();
  activeKeys.forEach(key => {
    const layer = outgoing.has(key) ? rank.get(key)! : lastLayer;
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  });
  const nodeWidth = appearance.display.sankeyNodeWidth;
  const columnStep = nodeWidth + Math.max(theme.columnGap, theme.maxNodeWidth + 32);
  const innerHeight = Math.max(theme.stageMinHeight - 2 * theme.stagePaddingY, Math.max(1, ...counts.values()) * (Math.max(48, theme.nodeHeight) + theme.rowGap));
  const left = theme.stagePaddingX;
  const right = left + lastLayer * columnStep + nodeWidth;
  const nodeMap: Record<string, StageNode> = Object.create(null);
  const topLevel = new Set(selection.topLevelKeys);
  const addNode = (key: string, x: number, y: number, height: number, layer: number, order: number) => {
    const visual = visuals.get(key)!;
    const total = totals.get(key)!;
    const raw = dag.nodes[key];
    const color = typeof raw.color === "string" && /^#[\da-f]{6}$/i.test(raw.color) ? raw.color : colorFor(String(raw.type || key));
    nodeMap[key] = {
      key, x, y, layer, order, width: nodeWidth, height,
      title: visual.title, displayTitle: truncateTitleToWidth(visual.title, theme.maxNodeWidth),
      detail: visual.detail, detailLines: [], typeLabel: typeof raw.type === "string" ? raw.type : undefined,
      isRoot: topLevel.has(key),
      flow: { ...total, value: Math.max(total.incoming, total.outgoing), color, labelSide: "right", labelY: y },
    };
  };
  const stageEdges: StageData["edges"] = [];
  if (positiveEdges.length) {
    const maximum = Math.max(...positiveEdges.map(edge => Number(edge.value)));
    // Normalize the solver's values to avoid overflow for large units; retain original values in the document/UI.
    const result = sankey<FlowNode, FlowLink>()
      .nodeId(node => node.id).nodeWidth(nodeWidth).nodePadding(Math.max(18, theme.rowGap))
      .nodeAlign(sankeyJustify).iterations(32)
      .extent([[left, theme.stagePaddingY], [right, theme.stagePaddingY + innerHeight]])({
        nodes: [...activeKeys].map(id => ({ id })),
        links: positiveEdges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, value: Number(edge.value) / maximum })),
      });
    result.nodes.forEach((node, index) => addNode(node.id, (node.x0! + node.x1!) / 2, (node.y0! + node.y1!) / 2, node.y1! - node.y0!, Math.round((node.x0! - left) / columnStep), index));
    const path = sankeyLinkHorizontal<FlowNode, FlowLink>();
    const originalById = new Map(edges.map(edge => [edge.id, edge]));
    result.links.forEach(link => {
      const source = link.source as SankeyNode<FlowNode, FlowLink>;
      const target = link.target as SankeyNode<FlowNode, FlowLink>;
      const edge = originalById.get(link.id)!;
      const valueLabel = formatFlow(Number(edge.value));
      stageEdges.push({
        id: edge.id, source: edge.source, target: edge.target, weight: edge.value,
        label: typeof edge.metadata?.label === "string" ? `${edge.metadata.label} · ${valueLabel}` : valueLabel,
        path: path(link)!, labelPosition: { x: (source.x1! + target.x0!) / 2, y: (link.y0! + link.y1!) / 2 },
        flow: { width: link.width!, color: nodeMap[edge.source].flow!.color },
      });
    });
  }
  const quietStartY = positiveEdges.length ? theme.stagePaddingY + innerHeight + 64 : theme.stagePaddingY + 24;
  quietKeys.forEach((key, i) => addNode(key, left + nodeWidth / 2, quietStartY + i * 54, 0, 0, i));

  // Keep labels legible even when several very small flows meet a much larger one.
  for (let layer = 0; layer <= lastLayer; layer++) {
    const column = Object.values(nodeMap).filter(node => node.layer === layer).sort((a, b) => a.y - b.y);
    let labelBottom = theme.stagePaddingY - 24;
    column.forEach((node, index) => {
      node.order = index;
      node.flow!.labelY = Math.max(node.y, labelBottom + 38);
      labelBottom = node.flow!.labelY;
    });
  }
  const connectedKeysByNode = new Map([...keys].map(key => [key, new Set<string>()]));
  edges.forEach(edge => {
    connectedKeysByNode.get(edge.source)!.add(edge.target);
    connectedKeysByNode.get(edge.target)!.add(edge.source);
  });
  const warnings: string[] = [];
  const zeros = edges.length - positiveEdges.length;
  if (zeros) warnings.push(`${zeros} zero-value flow(s) have no visible band. Zero-flow nodes appear below the chart.`);
  const unbalanced = [...totals.values()].filter(t => t.incoming > 0 && t.outgoing > 0 && Math.abs(t.incoming - t.outgoing) > Math.max(t.incoming, t.outgoing) * 1e-9).length;
  if (unbalanced) warnings.push(`${unbalanced} node(s) have different incoming and outgoing totals; heights use the larger total.`);
  const nodes = Object.values(nodeMap);
  return {
    dag: dag.nodes, layoutMode: "sankey", root: selection.rootKey, selection, topLevelKeys: selection.topLevelKeys, isForest: selection.isForest,
    nodes, nodeMap, edges: stageEdges, connectedKeysByNode, lanes: [],
    stageWidth: Math.max(theme.stageMinWidth, right + theme.maxNodeWidth + theme.stagePaddingX),
    stageHeight: Math.max(theme.stageMinHeight, theme.stagePaddingY + innerHeight + theme.stagePaddingY, ...nodes.map(node => Math.max(node.y + node.height / 2, node.flow!.labelY + 24) + theme.stagePaddingY)),
    warnings,
  };
}

function colorFor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return COLORS[(hash >>> 0) % COLORS.length];
}
