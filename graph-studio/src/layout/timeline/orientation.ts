import type { StageData, StageNode } from "../shared/types";
import { findFreeTimelineLabelPosition, timelineLabelBox, timelineMarkerBox, type TimelineLabelBox } from "./labels";
import { roundedTimelinePath } from "./routing";

/** Layout solves cross-axis channels and time-axis positions. Map those coordinates to
 * the canvas once; text remains upright and gets its own physical collision pass. */
export function orientTimelineStage(
  stage: StageData,
  orientation: "vertical" | "horizontal",
  previous?: StageData,
): StageData {
  if (orientation === "vertical") return stage;
  const nodes = stage.nodes.map((node) => ({
    ...node,
    x: node.y,
    y: node.x,
    timeline: { ...node.timeline!, orientation: "horizontal" as const, labelX: node.y + 10, labelY: node.x + 28 },
  }));
  const boxes: TimelineLabelBox[] = nodes.map(timelineMarkerBox);
  const outside = (node: StageNode) =>
    node.timeline!.kind !== "range" || !node.timeline!.intervalTitle || node.timeline!.intervalTitle === "outside";
  const retained = new Set<string>();
  for (const node of nodes.filter(outside)) {
    const old = previous?.nodeMap[node.key];
    if (old && !node.timeline!.clippedStart) {
      node.timeline!.labelX = old.timeline!.labelX;
      node.timeline!.labelY = old.timeline!.labelY;
      boxes.push(timelineLabelBox(node));
      retained.add(node.key);
    }
  }
  for (const node of nodes.filter(outside)) {
    if (retained.has(node.key)) continue;
    const position = findFreeTimelineLabelPosition(node, boxes, 80, 180);
    node.timeline!.labelX = position.x;
    node.timeline!.labelY = position.y;
    boxes.push(timelineLabelBox(node));
  }
  const edges = stage.edges.map((edge) => {
    const points = edge.points?.map((p) => ({ ...p, x: p.y, y: p.x }));
    return {
      ...edge,
      points,
      path: points ? roundedTimelinePath(points) : edge.path,
      labelPosition: { x: edge.labelPosition.y, y: edge.labelPosition.x },
    };
  });
  return {
    ...stage,
    nodes,
    nodeMap: Object.fromEntries(nodes.map((n) => [n.key, n])),
    edges,
    stageWidth: Math.max(stage.stageHeight, ...boxes.map((b) => b.right + 40)),
    stageHeight: Math.max(stage.stageWidth, ...boxes.map((b) => b.bottom + 40)),
    timeline: { ...stage.timeline!, orientation, canonicalStage: stage },
  };
}
export function timelineBarBox(node: StageNode) {
  const time = node.timeline!;
  const thickness = time.barWidth ?? 12;
  const length = Math.max(2, time.endY - time.startY);
  return time.orientation === "horizontal"
    ? { x: time.startY, y: node.y - thickness / 2, width: length, height: thickness }
    : { x: node.x - thickness / 2, y: time.startY, width: thickness, height: length };
}
export function timelinePoint(node: StageNode, timePosition: number) {
  return node.timeline?.orientation === "horizontal" ? { x: timePosition, y: node.y } : { x: node.x, y: timePosition };
}
