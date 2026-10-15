import type { ElkNode, ElkPoint } from "elkjs/lib/elk-api";

export interface RouteMetrics {
  length: number;
  bends: number;
  crossings: number;
  segments: number;
}

/** Compare real geometry, not a preferred direction. Aspect ratio is a soft penalty. */
export function compoundLayoutCost(graph: ElkNode, metrics: RouteMetrics): number {
  const width = Math.max(1, graph.width ?? 0),
    height = Math.max(1, graph.height ?? 0);
  const area = width * height;
  const count = Math.max(1, metrics.segments);
  return (
    Math.log(area) +
    0.35 * Math.abs(Math.log(width / height / 1.6)) +
    (0.18 * metrics.length) / (Math.sqrt(area) * Math.sqrt(count)) +
    (0.12 * metrics.bends) / count +
    (0.25 * metrics.crossings) / count
  );
}

export function measureCompoundRoutes(graph: ElkNode, children: Iterable<RouteMetrics>): RouteMetrics {
  const result: RouteMetrics = { length: 0, bends: 0, crossings: 0, segments: 0 };
  const lines: { a: ElkPoint; b: ElkPoint; edgeId: string }[] = [];
  for (const edge of graph.edges ?? []) {
    result.segments++;
    for (const section of edge.sections ?? []) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      result.bends += section.bendPoints?.length ?? 0;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        result.length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        lines.push({ a, b, edgeId: edge.id });
      }
    }
  }
  // Only proper crossings count. Shared endpoints and shared routing trunks are not crossings.
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const second = lines[j];
      if (first.edgeId === second.edgeId) continue;
      const horizontal = first.a.y === first.b.y ? first : second;
      const vertical = first.a.x === first.b.x ? first : second;
      if (horizontal === vertical || horizontal.a.y !== horizontal.b.y || vertical.a.x !== vertical.b.x) continue;
      if (
        vertical.a.x > Math.min(horizontal.a.x, horizontal.b.x) &&
        vertical.a.x < Math.max(horizontal.a.x, horizontal.b.x) &&
        horizontal.a.y > Math.min(vertical.a.y, vertical.b.y) &&
        horizontal.a.y < Math.max(vertical.a.y, vertical.b.y)
      )
        result.crossings++;
    }
  }
  for (const child of children) {
    result.length += child.length;
    result.bends += child.bends;
    result.crossings += child.crossings;
    result.segments += child.segments;
  }
  return result;
}
