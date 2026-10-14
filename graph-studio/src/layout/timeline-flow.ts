import { getTimelineRelation } from "../graph/timeline";
import type { GraphEdge } from "../graph/types";
import type { StageNode } from "./types";

type Box = { left: number; right: number; top: number; bottom: number };
type Neighbour = { key: string; offset: number; weight: number };
const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Fixed temporal anchors; only x and label positions participate in the layout. */
export function arrangeTimelineFlow(input: {
  nodes: StageNode[];
  edges: GraphEdge[];
  minimumX: number;
  gap: number;
  pins: Record<string, number>;
}): { width: number; bottom: number } {
  const { nodes, edges, minimumX, gap, pins } = input;
  if (!nodes.length) return { width: minimumX, bottom: 0 };
  const sorted = nodes.slice().sort((a, b) => a.y - b.y || compareKeys(a.key, b.key));
  const byKey = new Map(sorted.map((node) => [node.key, node]));
  const slot = Math.max(...nodes.map((node) => node.width)) + gap;
  const center = minimumX + slot * 0.5;
  const neighbours = new Map<string, Neighbour[]>(nodes.map((node) => [node.key, []]));
  const branches = new Map<string, GraphEdge[]>();
  edges.forEach((edge) => {
    if (["reference", "part-of"].includes(getTimelineRelation(edge.metadata).kind)) return;
    branches.set(edge.source, [...(branches.get(edge.source) || []), edge]);
  });
  branches.forEach((siblings) =>
    siblings.sort((a, b) => byKey.get(a.target)!.y - byKey.get(b.target)!.y || compareKeys(a.target, b.target)),
  );
  for (const edge of edges) {
    const kind = getTimelineRelation(edge.metadata).kind;
    const siblings = branches.get(edge.source) || [];
    const index = siblings.findIndex((item) => item.id === edge.id);
    // Sibling offsets keep distinct paths readable until the declared merge node.
    const offset = index < 0 ? 0 : (index - (siblings.length - 1) / 2) * Math.min(slot, 160 + gap);
    const weight = kind === "reference" || kind === "part-of" ? 0.35 : 3;
    neighbours.get(edge.target)!.push({ key: edge.source, offset, weight });
    neighbours.get(edge.source)!.push({ key: edge.target, offset: -offset, weight });
  }
  for (const node of sorted) {
    node.x = center;
    node.timeline!.labelX = center + 22;
    node.timeline!.labelY = node.y + 3;
  }

  const isPinned = (node: StageNode) => Number.isFinite(pins[node.key]);
  // Each sweep minimizes a local relationship objective, then projects onto
  // collision-free horizontal positions. No category owns a permanent column.
  for (let pass = 0; pass < 10; pass++) {
    const previous = new Map(nodes.map((node) => [node.key, node.x]));
    const placed: Box[] = [];
    const order = sorted
      .slice()
      .sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || a.y - b.y || compareKeys(a.key, b.key));
    for (const node of order) {
      let total = center * 0.8;
      let weight = 0.8;
      for (const neighbour of neighbours.get(node.key)!) {
        total += (previous.get(neighbour.key)! + neighbour.offset) * neighbour.weight;
        weight += neighbour.weight;
      }
      const desired = Math.max(minimumX, total / weight);
      const pin = Math.max(minimumX, pins[node.key]);
      // Prefer a short leader over another full label-width column.
      // The marker stays on the clock while dense labels can use adjacent rows.
      const placement = [0, 48, 96]
        .map((offset) => {
          const x = closestFreeX(node, desired, minimumX, placed, gap / 4, offset);
          return { x, offset, cost: Math.abs(x - desired) + offset * 1.25 };
        })
        .sort((a, b) => a.cost - b.cost || a.offset - b.offset || a.x - b.x)[0];
      node.x = isPinned(node) ? pin : placement.x;
      node.timeline!.labelX = node.x + 22;
      node.timeline!.labelY = node.y + 3 + (isPinned(node) ? 0 : placement.offset);
      if (isPinned(node)) {
        // A pin fixes the marker, while its label can still avoid earlier pins.
        while (placed.some((box) => intersects(labelBox(node), box))) node.timeline!.labelY += 48;
      }
      placed.push(markerBox(node), labelBox(node));
    }
  }
  if (!nodes.some(isPinned)) {
    const shift = Math.min(...nodes.map((node) => node.x)) - minimumX;
    nodes.forEach((node) => {
      node.x -= shift;
      node.timeline!.labelX -= shift;
    });
  }
  // Stable order values describe horizontal order, not category membership.
  nodes
    .slice()
    .sort((a, b) => a.x - b.x || compareKeys(a.key, b.key))
    .forEach((node, index) => {
      node.order = index;
      node.timeline!.lane = index;
    });
  return {
    width: Math.max(...nodes.map((node) => labelBox(node).right)) + 48,
    bottom: Math.max(...nodes.map((node) => Math.max(markerBox(node).bottom, labelBox(node).bottom))),
  };
}

function markerBox(node: StageNode): Box {
  return { left: node.x - 10, right: node.x + 10, top: node.y - 10, bottom: node.timeline!.endY + 10 };
}
function labelBox(node: StageNode): Box {
  const time = node.timeline!;
  return {
    left: time.labelX - 6,
    right: time.labelX + node.width + 6,
    top: time.labelY - 16,
    bottom: time.labelY + (node.detailLines.length ? 39 : 24),
  };
}
function intersects(a: Box, b: Box): boolean {
  return a.left < b.right + 7 && a.right + 7 > b.left && a.top < b.bottom + 7 && a.bottom + 7 > b.top;
}
function closestFreeX(
  node: StageNode,
  desired: number,
  minimum: number,
  occupied: Box[],
  clearance: number,
  labelOffset: number,
): number {
  const footprints = [
    { left: -10, right: 10, top: node.y - 10, bottom: node.timeline!.endY + 10 },
    {
      left: 16,
      right: node.width + 28,
      top: node.y + labelOffset - 16,
      bottom: node.y + labelOffset + (node.detailLines.length ? 42 : 27),
    },
  ];
  const forbidden: [number, number][] = [];
  for (const footprint of footprints) {
    for (const box of occupied) {
      if (footprint.top >= box.bottom + clearance || footprint.bottom + clearance <= box.top) continue;
      forbidden.push([box.left - footprint.right - clearance, box.right - footprint.left + clearance]);
    }
  }
  forbidden.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const interval of forbidden) {
    const last = merged[merged.length - 1];
    if (last && interval[0] < last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push(interval.slice() as [number, number]);
  }
  const candidates = [desired, minimum, ...merged.flatMap(([left, right]) => [left, right])];
  return candidates
    .filter((x) => x >= minimum && !merged.some(([left, right]) => x > left && x < right))
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)[0];
}
