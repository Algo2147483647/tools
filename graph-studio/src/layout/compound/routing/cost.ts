import { BEND_COST, EPSILON, LANE_GAP, MIN_STRAIGHT, type Point } from "./types";

export function crossingCost(a: Point, b: Point, points: Point[]): number {
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
      // The visibility grid splits segments at crossings. Two half charges at a grid
      // vertex must equal one interior crossing, rather than making it free to cross.
      const end = Math.abs(along - from) < EPSILON || Math.abs(along - to) < EPSILON;
      const otherEnd = Math.abs(across - otherFrom) < EPSILON || Math.abs(across - otherTo) < EPSILON;
      cost += 160 * (end ? 0.5 : 1) * (otherEnd ? 0.5 : 1);
    }
  }
  return cost;
}

export function parallelRouteCost(a: Point, b: Point, route: Point[]): number {
  const horizontal = a.y === b.y;
  let cost = 0;
  for (let i = 1; i < route.length; i++) {
    const c = route[i - 1],
      d = route[i];
    if ((c.y === d.y) !== horizontal) continue;
    const gap = Math.abs(horizontal ? a.y - c.y : a.x - c.x);
    const overlap = horizontal
      ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
      : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
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
