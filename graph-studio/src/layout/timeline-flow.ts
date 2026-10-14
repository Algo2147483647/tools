import { getTimelineRelation } from "../graph/timeline";
import type { GraphEdge } from "../graph/types";
import type { StageNode } from "./types";
import {
  findFreeTimelineLabelPosition,
  timelineLabelBox as labelBox,
  timelineMarkerBox as markerBox,
} from "./timeline-labels";

type Box = { left: number; right: number; top: number; bottom: number };
type Neighbour = { key: string; offset: number; weight: number };
const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Fixed temporal anchors; only x and label positions participate in the layout. */
export function arrangeTimelineFlow(input: {
  nodes: StageNode[];
  edges: GraphEdge[];
  minimumX: number;
  gap: number;
  spread: number;
  pins: Record<string, number>;
}): { width: number; bottom: number } {
  const { nodes, edges, minimumX, gap, spread, pins } = input;
  if (!nodes.length) return { width: minimumX, bottom: 0 };
  const sorted = nodes.slice().sort((a, b) => a.y - b.y || compareKeys(a.key, b.key));
  const byKey = new Map(sorted.map((node) => [node.key, node]));
  const slot = (80 + gap) * spread;
  const clearance = Math.max(4, (20 + gap) * spread - 20);
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
    const offset = index < 0 ? 0 : (index - (siblings.length - 1) / 2) * slot;
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
      node.x = isPinned(node) ? pin : closestFreeX(node, desired, minimumX, placed, clearance);
      node.timeline!.labelX = node.x + 22;
      node.timeline!.labelY = node.y + 3;
      placed.push(markerBox(node));
    }
  }
  if (!nodes.some(isPinned)) {
    const shift = Math.min(...nodes.map((node) => node.x)) - minimumX;
    nodes.forEach((node) => {
      node.x -= shift;
      node.timeline!.labelX -= shift;
    });
  }
  // Text is packed after marker placement, so neither its size nor its position moves a time anchor.
  const occupied = nodes.map(markerBox);
  for (const node of sorted) {
    const position = findFreeTimelineLabelPosition(node, occupied, minimumX);
    node.timeline!.labelX = position.x;
    node.timeline!.labelY = position.y;
    occupied.push(labelBox(node));
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
    width: Math.max(...nodes.map((node) => Math.max(markerBox(node).right, labelBox(node).right))) + 48,
    bottom: Math.max(...nodes.map((node) => Math.max(markerBox(node).bottom, labelBox(node).bottom))),
  };
}

function closestFreeX(node: StageNode, desired: number, minimum: number, occupied: Box[], clearance: number): number {
  const footprints = [{ left: -10, right: 10, top: node.y - 10, bottom: node.timeline!.endY + 10 }];
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
