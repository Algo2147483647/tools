import type { CompoundBox } from "../routes";
import { EPSILON, type Point } from "./types";

export const inside = (point: Point, box: CompoundBox) =>
  point.x > box.x + EPSILON &&
  point.x < box.x + box.width - EPSILON &&
  point.y > box.y + EPSILON &&
  point.y < box.y + box.height - EPSILON;

export const inflate = (box: CompoundBox, gap: number): CompoundBox => ({
  x: box.x - gap,
  y: box.y - gap,
  width: box.width + gap * 2,
  height: box.height + gap * 2,
});

export const overlaps = (a: CompoundBox, b: CompoundBox) =>
  a.x < b.x + b.width - EPSILON &&
  b.x < a.x + a.width - EPSILON &&
  a.y < b.y + b.height - EPSILON &&
  b.y < a.y + a.height - EPSILON;

export function crossesBox(a: Point, b: Point, box: CompoundBox): boolean {
  return a.x === b.x
    ? a.x > box.x + EPSILON &&
        a.x < box.x + box.width - EPSILON &&
        Math.max(a.y, b.y) > box.y + EPSILON &&
        Math.min(a.y, b.y) < box.y + box.height - EPSILON
    : a.y > box.y + EPSILON &&
        a.y < box.y + box.height - EPSILON &&
        Math.max(a.x, b.x) > box.x + EPSILON &&
        Math.min(a.x, b.x) < box.x + box.width - EPSILON;
}

export function simplifyRoute(points: Point[]): Point[] | null {
  const result: Point[] = [];
  for (const point of points) {
    const b = result[result.length - 1],
      a = result[result.length - 2];
    if (b && Math.hypot(b.x - point.x, b.y - point.y) < EPSILON) continue;
    if (a && b && ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) {
      if ((b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) < 0) return null;
      result.pop();
    }
    result.push(point);
  }
  return result;
}
