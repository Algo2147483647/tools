import { BEND_COST, EPSILON, LANE_GAP, MIN_STRAIGHT, type Point } from "./types";
import type { RouteSegmentIndex } from "./spatial-index";

/** Keep each route's two sums separate, in original segment order. */
export function indexedSegmentCosts(
  index: RouteSegmentIndex,
  a: Point,
  b: Point,
  shared: (route: number) => readonly Point[],
  firstRoute = 0,
) {
  const costs = new Map<number, { route: number; parallel: number; crossing: number }>();
  const get = (route: number) => {
    let value = costs.get(route);
    if (!value) {
      value = { route, parallel: 0, crossing: 0 };
      costs.set(route, value);
    }
    return value;
  };
  for (const s of index.parallel(a, b))
    if (s.route >= firstRoute) get(s.route).parallel += parallelRouteCost(a, b, [s.a, s.b], shared(s.route));
  for (const s of index.crossing(a, b))
    if (s.route >= firstRoute) get(s.route).crossing += crossingCost(a, b, [s.a, s.b], shared(s.route));
  return [...costs.values()].sort((a, b) => a.route - b.route);
}

/** Match router's route -> candidate segment -> parallel/crossing reduction. */
export function indexedRouteCost(
  index: RouteSegmentIndex,
  points: readonly Point[],
  shared: (route: number) => readonly Point[],
) {
  const costs = new Map<number, number>();
  for (let i = 1; i < points.length; i++)
    for (const c of indexedSegmentCosts(index, points[i - 1], points[i], shared))
      costs.set(c.route, (costs.get(c.route) ?? 0) + c.parallel + c.crossing);
  return [...costs].sort(([a], [b]) => a - b).reduce((sum, [, cost]) => sum + cost, 0);
}

/** Only endpoints belonging to the same node may share a short exit. */
export function sharedEndpoints(
  a: { source: string; target: string },
  ap: readonly Point[],
  b: { source: string; target: string },
  bp: readonly Point[],
): Point[] {
  return (["source", "target"] as const).flatMap((end) => {
    const point = end === "source" ? ap[0] : ap[ap.length - 1];
    return point &&
      (["source", "target"] as const).some((other) => {
        const p = other === "source" ? bp[0] : bp[bp.length - 1];
        return a[end] === b[other] && p && Math.hypot(point.x - p.x, point.y - p.y) < EPSILON;
      })
      ? [point]
      : [];
  });
}

export function sharedExit(point: Point, shared: readonly Point[]) {
  return shared.some((p) => Math.abs(point.x - p.x) + Math.abs(point.y - p.y) <= MIN_STRAIGHT + EPSILON);
}

/** Length of overlap outside the short common exit; unrelated lines get no exemption. */
export function overlapLength(a: Point, b: Point, c: Point, d: Point, shared: readonly Point[] = []) {
  const horizontal = Math.abs(a.y - b.y) < EPSILON;
  const axis = horizontal ? "x" : "y",
    cross = horizontal ? "y" : "x";
  const low = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
  const high = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
  if (!shared.length || high <= low) return Math.max(0, high - low);
  let length = high - low,
    end = low;
  const intervals = shared
    .filter((p) => Math.abs(p[cross] - a[cross]) < EPSILON && Math.abs(p[cross] - c[cross]) < EPSILON)
    .map((p) => [Math.max(low, p[axis] - MIN_STRAIGHT), Math.min(high, p[axis] + MIN_STRAIGHT)])
    .sort((a, b) => a[0] - b[0]);
  for (const [start, stop] of intervals) {
    length -= Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return length;
}

export function crossingCost(a: Point, b: Point, points: readonly Point[], shared: readonly Point[] = []): number {
  let cost = 0;
  for (let i = 1; i < points.length; i++) {
    const c = points[i - 1],
      d = points[i];
    const horizontal = a.y === b.y;
    if (horizontal === (c.y === d.y)) continue;
    const along = horizontal ? c.x : c.y,
      across = horizontal ? a.y : a.x;
    const from = horizontal ? a.x : a.y,
      to = horizontal ? b.x : b.y,
      otherFrom = horizontal ? c.y : c.x,
      otherTo = horizontal ? d.y : d.x;
    if (
      along >= Math.min(from, to) - EPSILON &&
      along <= Math.max(from, to) + EPSILON &&
      across >= Math.min(otherFrom, otherTo) - EPSILON &&
      across <= Math.max(otherFrom, otherTo) + EPSILON
    ) {
      if (sharedExit(horizontal ? { x: along, y: across } : { x: across, y: along }, shared)) continue;
      // The visibility grid splits segments at crossings. Two half charges at a grid
      // vertex must equal one interior crossing, rather than making it free to cross.
      const end = Math.abs(along - from) < EPSILON || Math.abs(along - to) < EPSILON;
      const otherEnd = Math.abs(across - otherFrom) < EPSILON || Math.abs(across - otherTo) < EPSILON;
      cost += 160 * (end ? 0.5 : 1) * (otherEnd ? 0.5 : 1);
    }
  }
  return cost;
}

export function parallelRouteCost(a: Point, b: Point, route: readonly Point[], shared: readonly Point[] = []): number {
  const horizontal = a.y === b.y;
  let cost = 0;
  for (let i = 1; i < route.length; i++) {
    const c = route[i - 1],
      d = route[i];
    if ((c.y === d.y) !== horizontal) continue;
    const gap = Math.abs(horizontal ? a.y - c.y : a.x - c.x);
    const overlap = overlapLength(a, b, c, d, shared);
    if (overlap > 0 && gap < LANE_GAP) cost += overlap * (1 - gap / LANE_GAP) * 4;
  }
  return cost;
}

export function routeCost(points: readonly Point[]): number {
  let length = 0,
    bends = 0,
    shortSegments = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    length += segment;
    if (points.length > 2) shortSegments += Math.max(0, MIN_STRAIGHT - segment) * 2;
    if (
      i > 1 &&
      Math.abs(
        (points[i - 1].x - points[i - 2].x) * (points[i].y - points[i - 1].y) -
          (points[i - 1].y - points[i - 2].y) * (points[i].x - points[i - 1].x),
      ) > EPSILON
    )
      bends++;
  }
  return length + bends * BEND_COST + shortSegments;
}
