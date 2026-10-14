import type { StageData } from "./types";
import type { TimelineTimeRange } from "../graph/timelineRange";
import { timelineTimeToY } from "./timeline-axis";
import { routeTimelineEdge } from "./timeline-layout";

/** Hide categories without changing the positions, clock or routes of surviving events. */
export function projectTimelineStage(
  stage: StageData | null,
  visible: ReadonlySet<string>,
  range?: TimelineTimeRange | null,
): StageData | null {
  if (!stage) return null;
  const axis = stage.timeline?.axisMap;
  const nodes = stage.nodes
    .filter(
      (node) =>
        visible.has(node.key) &&
        (!range ||
          (node.timeline?.status === "dated" &&
            node.timeline.end! >= (range.start ?? -Infinity) &&
            node.timeline.start! <= (range.end ?? Infinity))),
    )
    .map((node) => {
      if (!range || !axis || !node.timeline) return node;
      const time = { ...node.timeline, ports: node.timeline.ports?.map((port) => ({ ...port })) };
      time.startY = timelineTimeToY(axis, Math.max(time.start!, range.start ?? -Infinity));
      time.endY = timelineTimeToY(axis, Math.min(time.end!, range.end ?? Infinity));
      time.anchorY = time.startY;
      time.clippedStart = time.start! < (range.start ?? -Infinity) || undefined;
      time.clippedEnd = time.end! > (range.end ?? Infinity) || undefined;
      if (time.clippedStart) time.labelY = Math.max(time.startY + 3, time.labelY);
      time.ports = time.ports?.filter((port) => port.y >= time.startY && port.y <= time.endY);
      return { ...node, y: time.startY, height: Math.max(36, time.endY - time.startY), timeline: time };
    });
  if (!nodes.length) return null;
  if (range) placeClippedLabels(nodes);
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.key, node]));
  const edges = stage.edges
    .filter((edge) => nodeMap[edge.source] && nodeMap[edge.target])
    .map((edge, index) =>
      range
        ? routeTimelineEdge(
            {
              id: edge.id,
              source: edge.source,
              target: edge.target,
              value: edge.weight,
              metadata: {
                timeline: {
                  ...edge.timeline,
                  sourceTime:
                    edge.timeline?.sourceTime === undefined
                      ? undefined
                      : new Date(edge.timeline.sourceTime).toISOString(),
                  targetTime:
                    edge.timeline?.targetTime === undefined
                      ? undefined
                      : new Date(edge.timeline.targetTime).toISOString(),
                },
              },
            },
            index,
            nodeMap,
            stage.timeline!.tracks,
            axis,
          )
        : edge,
    );
  const connectedKeysByNode = new Map(nodes.map((node) => [node.key, new Set([node.key])]));
  edges.forEach((edge) => {
    connectedKeysByNode.get(edge.source)!.add(edge.target);
    connectedKeysByNode.get(edge.target)!.add(edge.source);
  });
  return {
    ...stage,
    stageWidth: range
      ? Math.max(stage.stageWidth, ...nodes.map((node) => node.timeline!.labelX + node.width + 48))
      : stage.stageWidth,
    stageHeight: range
      ? Math.max(stage.stageHeight, ...nodes.map((node) => node.timeline!.labelY + 70))
      : stage.stageHeight,
    timeline: stage.timeline ? { ...stage.timeline, filtered: Boolean(range) || undefined } : undefined,
    nodes,
    edges,
    nodeMap,
    connectedKeysByNode,
  };
}

/** Several long periods may acquire the same visible start after clipping.
 * Keep their markers and all unaffected labels fixed; relocate only clipped labels.
 */
function placeClippedLabels(nodes: StageData["nodes"]) {
  type Box = { left: number; right: number; top: number; bottom: number };
  const labelBox = (node: StageData["nodes"][number]): Box => ({
    left: node.timeline!.labelX - 6,
    right: node.timeline!.labelX + node.width + 6,
    top: node.timeline!.labelY - 16,
    bottom: node.timeline!.labelY + (node.detailLines.length ? 39 : 24),
  });
  const occupied: Box[] = nodes.flatMap((node) => [
    { left: node.x - 10, right: node.x + 10, top: node.y - 10, bottom: node.timeline!.endY + 10 },
    ...(!node.timeline!.clippedStart ? [labelBox(node)] : []),
  ]);
  const clipped = nodes
    .filter((node) => node.timeline!.clippedStart)
    .sort((a, b) => a.x - b.x || a.key.localeCompare(b.key));
  for (const node of clipped) {
    const time = node.timeline!;
    const desiredX = time.labelX,
      desiredY = time.labelY;
    let best = { x: desiredX, y: desiredY, cost: Infinity };
    for (let row = 0; row <= clipped.length; row++) {
      const y = desiredY + row * 48;
      if (row * 96 >= best.cost) break;
      const height = node.detailLines.length ? 39 : 24;
      const intervals = occupied
        .filter((box) => y - 16 < box.bottom + 7 && y + height + 7 > box.top)
        .map((box) => [box.left - node.width - 13, box.right + 13] as const);
      const x = [desiredX, ...intervals.flatMap(([left, right]) => [left, right])]
        .filter((value) => value >= 180 && !intervals.some(([left, right]) => value > left && value < right))
        .sort((a, b) => Math.abs(a - desiredX) - Math.abs(b - desiredX) || a - b)[0];
      const cost = Math.abs(x - desiredX) + row * 96;
      if (cost < best.cost) best = { x, y, cost };
    }
    time.labelX = best.x;
    time.labelY = best.y;
    occupied.push(labelBox(node));
  }
}
