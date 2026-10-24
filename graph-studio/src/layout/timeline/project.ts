import type { TimelineTimeRange } from "../../graph/timeline/range";
import type { StageData } from "../shared/types";
import { timelineTimeToY } from "./axis";
import { findFreeTimelineLabelPosition, timelineLabelBox as labelBox, timelineMarkerBox } from "./labels";
import { routeTimelineEdge } from "./layout";
import { orientTimelineStage } from "./orientation";

/** Hide categories without changing the positions, clock or routes of surviving events. */
export function projectTimelineStage(
  stage: StageData | null,
  visible: ReadonlySet<string>,
  range?: TimelineTimeRange | null,
): StageData | null {
  if (!stage) return null;
  if (stage.timeline?.canonicalStage) {
    const projected = projectTimelineStage(stage.timeline.canonicalStage, visible, range);
    return projected ? orientTimelineStage(projected, "horizontal", stage) : null;
  }
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
      if (time.clippedStart) time.labelY = time.startY + 3;
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
                      : stage.timeline?.clock?.mode === "relative"
                        ? edge.timeline.sourceTime
                        : new Date(edge.timeline.sourceTime).toISOString(),
                  targetTime:
                    edge.timeline?.targetTime === undefined
                      ? undefined
                      : stage.timeline?.clock?.mode === "relative"
                        ? edge.timeline.targetTime
                        : new Date(edge.timeline.targetTime).toISOString(),
                },
              },
            },
            index,
            nodeMap,
            stage.timeline!.tracks,
            axis,
            [],
            stage.timeline?.edgeRouting,
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
  const occupied = nodes.flatMap((node) => [
    timelineMarkerBox(node),
    ...(!node.timeline!.clippedStart ? [labelBox(node)] : []),
  ]);
  const clipped = nodes
    .filter((node) => node.timeline!.clippedStart)
    .sort((a, b) => a.x - b.x || a.key.localeCompare(b.key));
  for (const node of clipped) {
    const time = node.timeline!;
    const position = findFreeTimelineLabelPosition(node, occupied);
    time.labelX = position.x;
    time.labelY = position.y;
    occupied.push(labelBox(node));
  }
}
