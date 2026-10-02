import { sankey } from "d3-sankey";
import { findFeedbackEdges, formatFlow } from "../../graph/sankey";
import type { GraphEdge, NormalizedDag } from "../../graph/types";
import type { StageAppearance } from "../appearance";
import { truncateTitleToWidth } from "../text";
import type { ResolvedStageSelection, StageData, StageNode } from "../types";

interface FlowNode {
  id: string;
}
interface FlowLink {
  id: string;
}
const COLORS = ["#5386ce", "#54a89c", "#cf9b4e", "#9775c6", "#cd7997", "#6f9fac", "#a59467"];

export function buildSankeyStage(
  dag: NormalizedDag,
  keys: Set<string>,
  selection: ResolvedStageSelection,
  visuals: Map<string, { title: string; detail: string; width: number }>,
  appearance: StageAppearance,
): StageData {
  const theme = appearance.layout;
  const edges = dag.edges.filter((edge) => keys.has(edge.source) && keys.has(edge.target));
  const positiveEdges = edges.filter((edge) => Number(edge.value) > 0);
  const activeKeys = new Set(positiveEdges.flatMap((edge) => [edge.source, edge.target]));
  const quietKeys = [...keys].filter((key) => !activeKeys.has(key));
  const totals = new Map([...keys].map((key) => [key, { incoming: 0, outgoing: 0 }]));
  edges.forEach((edge) => {
    totals.get(edge.source)!.outgoing += Number(edge.value);
    totals.get(edge.target)!.incoming += Number(edge.value);
  });
  const feedback = findFeedbackEdges(activeKeys, positiveEdges);
  const forwardEdges = positiveEdges.filter((edge) => !feedback.has(edge.id));
  const returnEdges = positiveEdges.filter((edge) => feedback.has(edge.id));

  // Position only the acyclic backbone. Every original edge still contributes to
  // node size, port allocation and the common width scale, including returns.
  const rank = new Map([...activeKeys].map((key) => [key, 0]));
  const degrees = new Map([...activeKeys].map((key) => [key, 0]));
  const outgoing = new Map<string, GraphEdge[]>();
  forwardEdges.forEach((edge) => {
    degrees.set(edge.target, degrees.get(edge.target)! + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  });
  const queue = [...activeKeys].filter((key) => degrees.get(key) === 0);
  for (let i = 0; i < queue.length; i++) {
    for (const edge of outgoing.get(queue[i]) ?? []) {
      rank.set(edge.target, Math.max(rank.get(edge.target)!, rank.get(edge.source)! + 1));
      degrees.set(edge.target, degrees.get(edge.target)! - 1);
      if (degrees.get(edge.target) === 0) queue.push(edge.target);
    }
  }
  const lastLayer = Math.max(0, ...rank.values());
  // Keep final outputs at the right edge even when other branches have cycles.
  // A node with a return-only output is still a producer, not a terminal sink.
  const producers = new Set(positiveEdges.map((edge) => edge.source));
  const layerOf = (key: string) => (producers.has(key) ? rank.get(key)! : lastLayer);
  const columns = new Map<number, string[]>();
  activeKeys.forEach((key) => columns.set(layerOf(key), [...(columns.get(layerOf(key)) ?? []), key]));
  const padding = Math.max(18, theme.rowGap);
  const innerHeight = Math.max(
    theme.stageMinHeight - 2 * theme.stagePaddingY,
    Math.max(1, ...[...columns.values()].map((column) => column.length)) * (Math.max(48, theme.nodeHeight) + padding),
  );
  const maximum = Math.max(1e-300, ...positiveEdges.map((edge) => Number(edge.value)));
  const normalizedTotal = (key: string) => Math.max(totals.get(key)!.incoming, totals.get(key)!.outgoing) / maximum;
  const positionScale = positiveEdges.length
    ? Math.min(
        ...[...columns.values()].map(
          (column) =>
            (innerHeight - (column.length - 1) * padding) / column.reduce((sum, key) => sum + normalizedTotal(key), 0),
        ),
      )
    : 0;
  // Keep return gutters compact even when a catalyst dominates the quantities.
  // Shrink every band and bar by the same factor, retaining proportional values.
  // D3's roomier node centers still reserve space for readable labels.
  const largestReturn = Math.max(0, ...returnEdges.map((edge) => Number(edge.value) / maximum));
  const scale = largestReturn ? Math.min(positionScale, 96 / largestReturn) : positionScale;
  const widthOf = (edge: GraphEdge) => (Number(edge.value) / maximum) * scale;
  const returnWidth = Math.max(0, ...returnEdges.map(widthOf));
  const gutter = returnEdges.length ? returnWidth / 2 + 32 : 0;
  const nodeWidth = appearance.display.sankeyNodeWidth;
  const columnStep = nodeWidth + Math.max(theme.columnGap, theme.maxNodeWidth + 32, gutter * 2 + returnWidth + 32);
  const left = theme.stagePaddingX + gutter + returnWidth / 2;
  const right = left + lastLayer * columnStep + nodeWidth;
  const nodeMap: Record<string, StageNode> = Object.create(null);
  const topLevel = new Set(selection.topLevelKeys);
  const addNode = (key: string, x: number, y: number, height: number, layer: number, order: number) => {
    const visual = visuals.get(key)!;
    const total = totals.get(key)!;
    const raw = dag.nodes[key];
    const color =
      typeof raw.color === "string" && /^#[\da-f]{6}$/i.test(raw.color) ? raw.color : colorFor(String(raw.type || key));
    nodeMap[key] = {
      key,
      x,
      y,
      layer,
      order,
      width: nodeWidth,
      height,
      title: visual.title,
      displayTitle: truncateTitleToWidth(visual.title, theme.maxNodeWidth),
      detail: visual.detail,
      detailLines: [],
      typeLabel: typeof raw.type === "string" ? raw.type : undefined,
      isRoot: topLevel.has(key),
      flow: { ...total, value: Math.max(total.incoming, total.outgoing), color, labelSide: "right", labelY: y },
    };
  };
  if (forwardEdges.length) {
    const result = sankey<FlowNode, FlowLink>()
      .nodeId((node) => node.id)
      .nodeWidth(nodeWidth)
      .nodePadding(padding)
      .nodeAlign((node) => layerOf(node.id))
      .iterations(32)
      .extent([
        [left, theme.stagePaddingY],
        [right, theme.stagePaddingY + innerHeight],
      ])({
      nodes: [...activeKeys].map((id) => ({ id, fixedValue: normalizedTotal(id) })),
      links: forwardEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        value: Number(edge.value) / maximum,
      })),
    });
    result.nodes.forEach((node, index) =>
      addNode(
        node.id,
        (node.x0! + node.x1!) / 2,
        (node.y0! + node.y1!) / 2,
        normalizedTotal(node.id) * scale,
        layerOf(node.id),
        index,
      ),
    );
  } else {
    // D3 divides by the number of column gaps; place a return-only column directly.
    let y = theme.stagePaddingY;
    [...activeKeys].forEach((key, index) => {
      const height = normalizedTotal(key) * scale;
      addNode(key, left + nodeWidth / 2, y + height / 2, height, 0, index);
      y += height + padding;
    });
  }
  const quietStartY = positiveEdges.length ? theme.stagePaddingY + innerHeight + 64 : theme.stagePaddingY + 24;
  quietKeys.forEach((key, i) => addNode(key, left + nodeWidth / 2, quietStartY + i * 54, 0, 0, i));

  // Keep labels legible even when several very small flows meet a larger one.
  for (let layer = 0; layer <= lastLayer; layer++) {
    const column = Object.values(nodeMap)
      .filter((node) => node.layer === layer)
      .sort((a, b) => a.y - b.y);
    let labelBottom = theme.stagePaddingY - 24;
    column.forEach((node, index) => {
      node.order = index;
      node.flow!.labelY = Math.max(node.y, labelBottom + 38);
      labelBottom = node.flow!.labelY;
    });
  }
  const nodes = Object.values(nodeMap);
  const bottom = Math.max(
    theme.stagePaddingY + innerHeight,
    ...nodes.map((node) => Math.max(node.y + node.height / 2, node.flow!.labelY + 24)),
  );

  // Non-overlapping horizontal spans can share a lane. Reserve the widest band.
  const lanes: { right: number; width: number; y: number }[] = [];
  const laneByEdge = new Map<string, number>();
  returnEdges
    .slice()
    .sort(
      (a, b) =>
        Math.min(nodeMap[a.source].x, nodeMap[a.target].x) - Math.min(nodeMap[b.source].x, nodeMap[b.target].x) ||
        a.id.localeCompare(b.id),
    )
    .forEach((edge) => {
      const minX = Math.min(nodeMap[edge.source].x, nodeMap[edge.target].x) - gutter - nodeWidth;
      const maxX = Math.max(nodeMap[edge.source].x, nodeMap[edge.target].x) + gutter + nodeWidth;
      let index = lanes.findIndex((lane) => lane.right + 24 < minX);
      if (index < 0) {
        index = lanes.length;
        lanes.push({ right: maxX, width: 0, y: 0 });
      }
      lanes[index].right = maxX;
      lanes[index].width = Math.max(lanes[index].width, widthOf(edge));
      laneByEdge.set(edge.id, index);
    });
  let laneBottom = bottom + 40;
  lanes.forEach((lane) => {
    lane.y = laneBottom + lane.width / 2;
    laneBottom += lane.width + 28;
  });

  const ports = new Map(positiveEdges.map((edge) => [edge.id, { source: 0, target: 0 }]));
  for (const end of ["source", "target"] as const) {
    const grouped = new Map<string, GraphEdge[]>();
    positiveEdges.forEach((edge) => grouped.set(edge[end], [...(grouped.get(edge[end]) ?? []), edge]));
    grouped.forEach((list, key) => {
      const other = end === "source" ? "target" : "source";
      list.sort(
        (a, b) =>
          Number(feedback.has(a.id)) - Number(feedback.has(b.id)) ||
          nodeMap[a[other]].y - nodeMap[b[other]].y ||
          a.id.localeCompare(b.id),
      );
      let y = nodeMap[key].y - nodeMap[key].height / 2;
      list.forEach((edge) => {
        const width = widthOf(edge);
        ports.get(edge.id)![end] = y + width / 2;
        y += width;
      });
    });
  }
  const stageEdges: StageData["edges"] = positiveEdges.map((edge) => {
    const source = nodeMap[edge.source],
      target = nodeMap[edge.target];
    const sx = source.x + nodeWidth / 2,
      tx = target.x - nodeWidth / 2;
    const sy = ports.get(edge.id)!.source,
      ty = ports.get(edge.id)!.target;
    const mx = (sx + tx) / 2;
    const valueLabel = formatFlow(Number(edge.value));
    const label = typeof edge.metadata?.label === "string" ? `${edge.metadata.label} · ${valueLabel}` : valueLabel;
    const result: StageData["edges"][number] = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      weight: edge.value,
      label,
      path: `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`,
      labelPosition: { x: mx, y: (sy + ty) / 2 },
      flow: { width: widthOf(edge), color: source.flow!.color },
    };
    if (feedback.has(edge.id)) {
      const y = lanes[laneByEdge.get(edge.id)!].y;
      const outX = sx + gutter,
        inX = tx - gutter;
      const direction = Math.sign(inX - outX) || -1;
      const radius = Math.min(16 + widthOf(edge) / 2, Math.abs(inX - outX) / 2);
      result.path = `M${sx},${sy}Q${outX},${sy} ${outX},${sy + radius}L${outX},${y - radius}Q${outX},${y} ${outX + direction * radius},${y}L${inX - direction * radius},${y}Q${inX},${y} ${inX},${y - radius}L${inX},${ty + radius}Q${inX},${ty} ${tx},${ty}`;
      result.label = `Return flow · ${label}`;
      result.labelPosition = { x: mx, y: y - widthOf(edge) / 2 - 12 };
      result.flow!.feedback = true;
      result.flow!.directionPath = `M${mx - direction * 6},${y - 4}L${mx},${y}L${mx - direction * 6},${y + 4}`;
    }
    return result;
  });
  const connectedKeysByNode = new Map([...keys].map((key) => [key, new Set<string>([key])]));
  edges.forEach((edge) => {
    connectedKeysByNode.get(edge.source)!.add(edge.target);
    connectedKeysByNode.get(edge.target)!.add(edge.source);
  });
  const warnings: string[] = [];
  const zeros = edges.length - positiveEdges.length;
  if (zeros) warnings.push(`${zeros} zero-value flow(s) have no visible band. Zero-flow nodes appear below the chart.`);
  if (returnEdges.length)
    warnings.push(`${returnEdges.length} return flow(s) run below the chart; arrows show their original direction.`);
  const unbalanced = [...totals.values()].filter(
    (t) =>
      t.incoming > 0 && t.outgoing > 0 && Math.abs(t.incoming - t.outgoing) > Math.max(t.incoming, t.outgoing) * 1e-9,
  ).length;
  if (unbalanced)
    warnings.push(`${unbalanced} node(s) have different incoming and outgoing totals; heights use the larger total.`);
  return {
    dag: dag.nodes,
    layoutMode: "sankey",
    root: selection.rootKey,
    selection,
    topLevelKeys: selection.topLevelKeys,
    isForest: selection.isForest,
    nodes,
    nodeMap,
    edges: stageEdges,
    connectedKeysByNode,
    lanes: [],
    stageWidth: Math.max(
      theme.stageMinWidth,
      right + Math.max(theme.maxNodeWidth, gutter + returnWidth / 2) + theme.stagePaddingX,
    ),
    stageHeight: Math.max(theme.stageMinHeight, (lanes.length ? laneBottom : bottom) + theme.stagePaddingY),
    warnings,
  };
}

function colorFor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return COLORS[(hash >>> 0) % COLORS.length];
}
