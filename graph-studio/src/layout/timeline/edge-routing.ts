import { getTimelineRelation } from "../../graph/timeline/time";
import { type TimelineViewSettings } from "../../graph/timeline/settings";
import type { GraphEdge } from "../../graph/types";
import type { StageEdge, StageNode, StageRoutePoint, StageTimelineData } from "../shared/types";
import { timelineTimeToY, type TimelineAxisMap } from "./axis";
import { roundedTimelinePath, routeAroundTimelineObstacles } from "./routing";
export function routeTimelineEdge(
  edge: GraphEdge,
  index: number,
  nodes: Record<string, StageNode>,
  tracks: StageTimelineData["tracks"],
  axis?: TimelineAxisMap,
  warnings: string[] = [],
  routing: TimelineViewSettings["edgeRouting"] = "avoid",
): StageEdge {
  return routeEdge(edge, index, nodes, tracks, axis, warnings, routing);
}

function routeEdge(
  edge: GraphEdge,
  index: number,
  nodes: Record<string, StageNode>,
  tracks: StageTimelineData["tracks"],
  axis?: TimelineAxisMap,
  warnings: string[] = [],
  routing: TimelineViewSettings["edgeRouting"] = "avoid",
): StageEdge {
  const source = nodes[edge.source];
  const target = nodes[edge.target];
  const relation = getTimelineRelation(edge.metadata, source.timeline?.precision === "relative");
  function anchor(node: StageNode, position: "start" | "end", time: number | undefined) {
    const data = node.timeline!;
    if (
      time !== undefined &&
      axis &&
      data.start !== null &&
      data.end !== null &&
      time >= data.start &&
      time <= data.end
    ) {
      const y = Math.max(data.startY, Math.min(data.endY, timelineTimeToY(axis, time)));
      if (!data.ports?.some((port) => port.time === time)) (data.ports ??= []).push({ time, y });
      return { time, y };
    }
    if (time !== undefined) warnings.push(`${edge.id}: time anchor outside ${node.key}; using ${position}.`);
    return { time: position === "end" ? data.end : data.start, y: position === "end" ? data.endY : data.startY };
  }
  const { time: sourceTime, y: sourceY } = anchor(source, relation.sourceAnchor, relation.sourceTime);
  const { time: targetTime, y: targetY } = anchor(target, relation.targetAnchor, relation.targetTime);
  const backward = sourceTime !== null && targetTime !== null && targetTime < sourceTime;
  const channel = 14 + (index % 5) * 4;
  const leftTrack = tracks.find((track) => track.id === (source.x < target.x ? source : target).timeline!.track);
  const points =
    routing === "direct"
      ? [
          { x: source.x, y: sourceY },
          { x: target.x, y: targetY },
        ]
      : timelineRoute(
          { x: source.x, y: sourceY },
          { x: target.x, y: targetY },
          Object.values(nodes).flatMap((node) => {
            const time = node.timeline!;
            const endpoint = node.key === source.key || node.key === target.key;
            // Endpoints are allowed, but a long duration body must not become an edge corridor.
            const top = time.startY + (endpoint ? 8 : -8);
            const bottom = time.endY + (endpoint ? -8 : 8);
            const boxes: RouteObstacle[] = [];
            if (top < bottom) {
              const cuts = [
                top,
                ...(node.key === source.key ? [sourceY - 10, sourceY + 10] : []),
                ...(node.key === target.key ? [targetY - 10, targetY + 10] : []),
                bottom,
              ]
                .filter((y) => y >= top && y <= bottom)
                .sort((a, b) => a - b);
              for (let i = 0; i < cuts.length - 1; i++) {
                const mid = (cuts[i] + cuts[i + 1]) / 2;
                if (
                  (node.key === source.key && Math.abs(mid - sourceY) < 10) ||
                  (node.key === target.key && Math.abs(mid - targetY) < 10)
                )
                  continue;
                boxes.push({
                  left: node.x - (time.barWidth ?? 12) / 2 - 2,
                  right: node.x + (time.barWidth ?? 12) / 2 + 2,
                  top: cuts[i],
                  bottom: cuts[i + 1],
                });
              }
            }
            return boxes;
          }),
          Math.max(180, (leftTrack?.x ?? Math.min(source.x, target.x)) - channel),
        );
  const path = roundedTimelinePath(points);
  const middle =
    points.length === 2
      ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      : points[Math.floor(points.length / 2)];
  return {
    id: edge.id,
    originalEdgeIds: [edge.id],
    source: edge.source,
    target: edge.target,
    weight: edge.value,
    label: edge.value === undefined || edge.value === null || edge.value === 1 ? "" : String(edge.value),
    description: `${relation.kind}${backward ? " · points to an earlier time" : ""}`,
    path,
    points: points.map((point, order): StageRoutePoint => ({ ...point, layer: 0, order })),
    labelPosition: middle,
    timeline: { ...relation, backward, color: source.timeline!.color },
  };
}

type RoutePoint = { x: number; y: number };
type RouteObstacle = { left: number; right: number; top: number; bottom: number };

function timelineRoute(from: RoutePoint, to: RoutePoint, obstacles: RouteObstacle[], corridorX: number): RoutePoint[] {
  if (from.x === to.x && from.y === to.y) return [from, to];
  const minY = Math.min(from.y, to.y),
    maxY = Math.max(from.y, to.y);
  const minX = Math.min(from.x, to.x),
    maxX = Math.max(from.x, to.x);
  const close = maxY - minY < 24;
  const candidates: RoutePoint[][] = [];
  if (from.x === to.x || from.y === to.y) candidates.push([from, to]);
  if (from.x !== to.x) {
    const middleY = (from.y + to.y) / 2;
    const bend = Math.min(18, (maxY - minY) / 2);
    const crossingYs = new Set([middleY, minY + bend, maxY - bend]);
    // Dense, simultaneous milestones may need a small bridge over an intervening marker.
    // It stays between their lanes, instead of doubling back through a distant side corridor.
    for (const obstacle of obstacles) {
      if (obstacle.left >= maxX || obstacle.right <= minX) continue;
      for (const y of [obstacle.top - 6, obstacle.bottom + 6]) {
        if (y > minY - (close ? 24 : 0) && y < maxY + (close ? 24 : 0)) crossingYs.add(y);
      }
    }
    for (const y of [...crossingYs].sort((a, b) => Math.abs(a - middleY) - Math.abs(b - middleY))) {
      candidates.push([from, { x: from.x, y }, { x: to.x, y }, to]);
    }
    if (!close) {
      const middleX = (from.x + to.x) / 2;
      candidates.push([from, { x: middleX, y: from.y }, { x: middleX, y: to.y }, to]);
    }
  }
  if (!close || from.x === to.x) {
    // Horizontal exits preserve the time direction, including backward edges. Fixed +/-12
    // vertical offsets used to cross on short edges and draw spurious loops.
    candidates.push([from, { x: corridorX, y: from.y }, { x: corridorX, y: to.y }, to]);
  }
  let best = candidates[0],
    fewestCollisions = Infinity;
  for (const candidate of candidates) {
    const collisions = obstacles.filter((obstacle) =>
      candidate.slice(1).some((point, index) => segmentHitsObstacle(candidate[index], point, obstacle)),
    ).length;
    if (collisions === 0) return candidate;
    if (collisions < fewestCollisions) {
      best = candidate;
      fewestCollisions = collisions;
    }
  }
  return routeAroundTimelineObstacles(from, to, obstacles) ?? best;
}

function segmentHitsObstacle(a: RoutePoint, b: RoutePoint, obstacle: RouteObstacle): boolean {
  // Clip each orthogonal segment against the obstacle bounds.
  let enter = 0,
    leave = 1;
  for (const [start, delta, low, high] of [
    [a.x, b.x - a.x, obstacle.left, obstacle.right],
    [a.y, b.y - a.y, obstacle.top, obstacle.bottom],
  ]) {
    if (delta === 0) {
      if (start < low || start > high) return false;
    } else {
      const first = (low - start) / delta,
        last = (high - start) / delta;
      enter = Math.max(enter, Math.min(first, last));
      leave = Math.min(leave, Math.max(first, last));
      if (enter > leave) return false;
    }
  }
  return true;
}
