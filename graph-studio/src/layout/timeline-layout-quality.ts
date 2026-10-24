import type { StageData } from "./types";
import { timelineLabelBox } from "./timeline-labels";

export interface TimelineLayoutMetrics {
  crossings: number;
  labelOverlaps: number;
  routeLength: number;
  width: number;
  height: number;
  movedEvents: number;
  sampled: boolean;
}
export function measureTimelineLayout(stage: StageData, baseline: StageData = stage): TimelineLayoutMetrics {
  const metrics: TimelineLayoutMetrics = {
    crossings: 0,
    labelOverlaps: 0,
    routeLength: 0,
    width: stage.stageWidth,
    height: stage.stageHeight,
    movedEvents: 0,
    sampled: false,
  };
  const segments = stage.edges.flatMap((edge) =>
    (edge.points ?? []).slice(1).map((b, i) => ({ id: edge.id, a: edge.points![i], b })),
  );
  let checks = 0;
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    metrics.routeLength += Math.hypot(a.a.x - a.b.x, a.a.y - a.b.y);
    for (let j = i + 1; j < segments.length && checks < 300000; j++) {
      checks++;
      const b = segments[j];
      if (a.id === b.id) continue;
      const cross = (p: typeof a.a, q: typeof a.a, r: typeof a.a) =>
        (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      if (cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) < -0.01 && cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) < -0.01)
        metrics.crossings++;
    }
  }
  metrics.sampled = checks === 300000;
  const labels = stage.nodes
    .filter(
      (node) =>
        node.timeline?.kind !== "range" || !node.timeline.intervalTitle || node.timeline.intervalTitle === "outside",
    )
    .map(timelineLabelBox);
  checks = 0;
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i];
    for (let j = i + 1; j < labels.length && checks < 300000; j++) {
      checks++;
      const b = labels[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) metrics.labelOverlaps++;
    }
  }
  metrics.sampled ||= checks === 300000;
  for (const node of stage.nodes) {
    const old = baseline.nodeMap[node.key];
    if (old && (Math.abs(old.x - node.x) > 0.01 || Math.abs(old.y - node.y) > 0.01)) metrics.movedEvents++;
  }
  return metrics;
}
export function validateTimelineArrangement(baseline: StageData, candidate: StageData): string[] {
  const errors: string[] = [];
  const finite = (...values: number[]) => values.every(Number.isFinite);
  if (
    !candidate.timeline ||
    candidate.layoutMode !== "timeline" ||
    !finite(candidate.stageWidth, candidate.stageHeight) ||
    candidate.stageWidth <= 0 ||
    candidate.stageHeight <= 0
  )
    errors.push("Invalid timeline geometry.");
  if (
    baseline.timeline?.orientation !== candidate.timeline?.orientation ||
    JSON.stringify(baseline.timeline?.axisMap) !== JSON.stringify(candidate.timeline?.axisMap)
  )
    errors.push("The layout changed the time axis.");
  if (baseline.nodes.length !== candidate.nodes.length || baseline.edges.length !== candidate.edges.length)
    errors.push("The layout changed timeline membership.");
  const timeKeys = ["start", "end", "status", "kind", "precision", "ongoing", "space", "track", "ports"] as const;
  for (const node of candidate.nodes) {
    const old = baseline.nodeMap[node.key];
    const time = node.timeline;
    if (
      !old?.timeline ||
      !time ||
      !finite(node.x, node.y, node.width, node.height, time.labelX, time.labelY) ||
      timeKeys.some((key) => JSON.stringify(time[key]) !== JSON.stringify(old.timeline![key])) ||
      (time?.status === "dated" &&
        (["startY", "endY", "anchorY"] as const).some((key) => time[key] !== old?.timeline?.[key]))
    ) {
      errors.push(`Event time or geometry changed: ${node.key}.`);
      if (errors.length > 10) break;
    }
  }
  const edgeMap = new Map(baseline.edges.map((edge) => [edge.id, edge]));
  for (const edge of candidate.edges) {
    const old = edgeMap.get(edge.id);
    if (
      !old ||
      old.source !== edge.source ||
      old.target !== edge.target ||
      JSON.stringify(old.timeline) !== JSON.stringify(edge.timeline) ||
      edge.points?.some((point) => !finite(point.x, point.y))
    )
      errors.push(`Relationship changed: ${edge.id}.`);
  }
  return errors.slice(0, 12);
}
