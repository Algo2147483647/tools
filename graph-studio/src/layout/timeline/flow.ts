import type { GraphEdge } from "../../graph/types";
import type { StageNode } from "../shared/types";
import { assignTimelineChannels } from "./channels";
import { findFreeTimelineLabelPosition, timelineLabelBox as labelBox, timelineMarkerBox as markerBox } from "./labels";

const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Fixed temporal anchors; connected chains share x and text is packed independently. */
export function arrangeTimelineFlow(input: {
  nodes: StageNode[];
  edges: GraphEdge[];
  minimumX: number;
  gap: number;
  spread: number;
  pins: Record<string, number>;
  packLabels?: boolean;
  order?: readonly string[];
}): { width: number; bottom: number } {
  const { nodes, edges, minimumX, gap, spread, pins } = input;
  if (!nodes.length) return { width: minimumX, bottom: 0 };
  const sorted = nodes.slice().sort((a, b) => a.y - b.y || compareKeys(a.key, b.key));
  const positions = assignTimelineChannels({
    events: nodes.map((node) => ({ key: node.key, start: node.y, end: node.timeline!.endY })),
    edges,
    minimum: minimumX,
    step: Math.max(0, ...nodes.map((node) => node.timeline!.barWidth ?? 12), (55.2 + gap) * Math.max(0, spread)),
    pins,
    order: input.order,
    fixedPositions: Object.fromEntries(
      nodes.filter((node) => node.timeline!.space !== undefined).map((node) => [node.key, node.x]),
    ),
  });
  for (const node of sorted) {
    node.x = positions.get(node.key)!;
    node.timeline!.labelX = node.x + 22;
    node.timeline!.labelY = node.y + 3;
  }
  // Text never participates in channel assignment or moves a time anchor.
  const occupied = nodes.map(markerBox);
  for (const node of sorted) {
    if (input.packLabels === false) continue;
    if (node.timeline!.kind === "range" && node.timeline!.intervalTitle && node.timeline!.intervalTitle !== "outside")
      continue;
    const position = findFreeTimelineLabelPosition(node, occupied, minimumX);
    node.timeline!.labelX = position.x;
    node.timeline!.labelY = position.y;
    occupied.push(labelBox(node));
  }
  nodes
    .slice()
    .sort((a, b) => a.x - b.x || compareKeys(a.key, b.key))
    .forEach((node, index) => {
      node.order = index;
      node.timeline!.lane = index;
    });
  return {
    width:
      Math.max(
        ...nodes.map((node) => Math.max(markerBox(node).right, input.packLabels === false ? 0 : labelBox(node).right)),
      ) + 48,
    bottom: Math.max(
      ...nodes.map((node) => Math.max(markerBox(node).bottom, input.packLabels === false ? 0 : labelBox(node).bottom)),
    ),
  };
}
