import type { CompoundBox } from "../../../graph/compound/geometry";
import { EPSILON, LANE_GAP, type Point } from "./types";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Entry<T> = Bounds & { value: T; order: number };
type Branch<T> = Bounds & { entries?: Entry<T>[]; left?: Branch<T>; right?: Branch<T> };
const intersects = (a: Bounds, b: Bounds) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
export const segmentBounds = (a: Point, b: Point, padding = 0): Bounds => ({
  minX: Math.min(a.x, b.x) - padding,
  minY: Math.min(a.y, b.y) - padding,
  maxX: Math.max(a.x, b.x) + padding,
  maxY: Math.max(a.y, b.y) + padding,
});
const boxBounds = (b: CompoundBox): Bounds => ({ minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height });

/** Immutable broad phase. Inclusive bounds only discard impossible matches.
 * query() retains input order; tree traversal cannot change score sums. */
export class SpatialIndex<T> {
  private readonly root?: Branch<T>;
  constructor(values: readonly T[], bounds: (value: T) => Bounds) {
    const build = (entries: Entry<T>[]): Branch<T> | undefined => {
      if (!entries.length) return undefined;
      const node: Branch<T> = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const e of entries) {
        node.minX = Math.min(node.minX, e.minX);
        node.minY = Math.min(node.minY, e.minY);
        node.maxX = Math.max(node.maxX, e.maxX);
        node.maxY = Math.max(node.maxY, e.maxY);
      }
      if (entries.length <= 8) node.entries = entries;
      else {
        const axis = node.maxX - node.minX >= node.maxY - node.minY ? "minX" : "minY";
        entries.sort((a, b) => a[axis] - b[axis] || a.order - b.order);
        const middle = Math.floor(entries.length / 2);
        node.left = build(entries.slice(0, middle));
        node.right = build(entries.slice(middle));
      }
      return node;
    };
    this.root = build(values.map((value, order) => ({ ...bounds(value), value, order })));
  }
  query(bounds: Bounds): T[] {
    const found: Entry<T>[] = [];
    const visit = (node: Branch<T> | undefined) => {
      if (!node || !intersects(node, bounds)) return;
      if (node.entries) {
        for (const entry of node.entries) if (intersects(entry, bounds)) found.push(entry);
      } else {
        visit(node.left);
        visit(node.right);
      }
    };
    visit(this.root);
    found.sort((a, b) => a.order - b.order);
    return found.map((entry) => entry.value);
  }
  /** Unordered boolean query. The predicate must be pure; stop at the first exact hit. */
  some(bounds: Bounds, predicate: (value: T) => boolean): boolean {
    const visit = (node: Branch<T> | undefined): boolean => {
      if (!node || !intersects(node, bounds)) return false;
      if (node.entries) {
        for (const entry of node.entries) if (intersects(entry, bounds) && predicate(entry.value)) return true;
        return false;
      }
      return visit(node.left) || visit(node.right);
    };
    return visit(this.root);
  }
}

export class ObstacleIndex extends SpatialIndex<CompoundBox> {
  constructor(boxes: readonly CompoundBox[]) {
    super(boxes, boxBounds);
  }
  segment(a: Point, b: Point) {
    return this.query(segmentBounds(a, b));
  }
  segmentSome(a: Point, b: Point, predicate: (box: CompoundBox) => boolean): boolean {
    return this.some(segmentBounds(a, b), predicate);
  }
  point(p: Point) {
    return this.segment(p, p);
  }
  box(box: CompoundBox) {
    return this.query(boxBounds(box));
  }
}

export type IndexedSegment = { a: Point; b: Point; route: number };
export class RouteSegmentIndex {
  private readonly horizontal: SpatialIndex<IndexedSegment>;
  private readonly vertical: SpatialIndex<IndexedSegment>;
  constructor(routes: readonly (readonly Point[])[]) {
    const horizontal: IndexedSegment[] = [],
      vertical: IndexedSegment[] = [];
    routes.forEach((points, route) => {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        (a.y === b.y ? horizontal : vertical).push({ a, b, route });
      }
    });
    const bounds = (s: IndexedSegment) => segmentBounds(s.a, s.b);
    this.horizontal = new SpatialIndex(horizontal, bounds);
    this.vertical = new SpatialIndex(vertical, bounds);
  }
  crossing(a: Point, b: Point) {
    // Extra broad-phase slack protects inclusive EPSILON tests from rounding.
    const slack =
      EPSILON * 2 + Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y)) * Number.EPSILON * 4;
    return (a.y === b.y ? this.vertical : this.horizontal).query(segmentBounds(a, b, slack));
  }
  parallel(a: Point, b: Point) {
    const bounds = segmentBounds(a, b, LANE_GAP);
    // overlapLength treats almost-horizontal segments with its own EPSILON.
    // Keep those legacy exact semantics without pruning by the unused y axis.
    if (a.y !== b.y && Math.abs(a.y - b.y) < EPSILON) {
      bounds.minY = -Infinity;
      bounds.maxY = Infinity;
    }
    return (a.y === b.y ? this.horizontal : this.vertical).query(bounds);
  }
}
