import type { CompoundBox } from "../../graph/compound/geometry";

export type RectangleSize = Pick<CompoundBox, "width" | "height">;
export interface RectangleArrangement extends RectangleSize {
  boxes: Map<string, CompoundBox>;
}
type Dependency = readonly [string, string];
const EPSILON = 0.00001;

function extent(boxes: Map<string, CompoundBox>): RectangleSize {
  let width = 0,
    height = 0;
  for (const box of boxes.values()) {
    width = Math.max(width, box.x + box.width);
    height = Math.max(height, box.y + box.height);
  }
  return { width, height };
}

function separated(a: CompoundBox, b: CompoundBox, gapX: number, gapY: number) {
  return (
    a.x + a.width + gapX <= b.x + EPSILON ||
    b.x + b.width + gapX <= a.x + EPSILON ||
    a.y + a.height + gapY <= b.y + EPSILON ||
    b.y + b.height + gapY <= a.y + EPSILON
  );
}

function alignment(boxes: Map<string, CompoundBox>, edges: readonly Dependency[], down = false) {
  let total = 0;
  for (const [a, b] of edges) {
    const source = boxes.get(a),
      target = boxes.get(b);
    if (source && target)
      total += down
        ? Math.abs(source.x + source.width / 2 - target.x - target.width / 2)
        : Math.abs(source.y + source.height / 2 - target.y - target.height / 2);
  }
  return total;
}

/** Include the outer half-gap on each side, so equal-sized cells do not favor a long strip over a compact pack. */
function score(
  boxes: Map<string, CompoundBox>,
  edges: readonly Dependency[],
  gapX: number,
  gapY: number,
  down = false,
) {
  const { width, height } = extent(boxes);
  return [(width + gapX) * (height + gapY), alignment(boxes, edges, down), width + height];
}
function better(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPSILON) return a[i] < b[i];
  return false;
}

function candidateRows(boxes: Map<string, CompoundBox>, size: RectangleSize, neighbors: string[], gap: number) {
  const rows = new Set<number>([0]);
  for (const box of boxes.values()) {
    rows.add(box.y);
    rows.add(box.y + box.height + gap);
    rows.add(Math.max(0, box.y - size.height - gap));
    rows.add(Math.max(0, box.y + box.height - size.height));
  }
  for (const id of neighbors) {
    const box = boxes.get(id);
    if (box) rows.add(Math.max(0, box.y + box.height / 2 - size.height / 2));
  }
  return [...rows].sort((a, b) => a - b);
}

/** Only actual predecessor widths constrain a node's downstream coordinate. No rank-wide columns. */
export function compactFlow(
  order: string[],
  edges: readonly Dependency[],
  sizes: Map<string, RectangleSize>,
  gapX: number,
  gapY: number,
): RectangleArrangement {
  const parents = new Map(order.map((id) => [id, [] as string[]]));
  const neighbors = new Map(order.map((id) => [id, [] as string[]]));
  for (const [a, b] of edges) {
    parents.get(b)!.push(a);
    neighbors.get(a)!.push(b);
    neighbors.get(b)!.push(a);
  }
  const boxes = new Map<string, CompoundBox>();
  for (const id of order) {
    const size = sizes.get(id)!;
    const x = Math.max(
      0,
      ...parents.get(id)!.map((parent) => {
        const box = boxes.get(parent)!;
        return box.x + box.width + gapX;
      }),
    );
    let best: CompoundBox | undefined, bestScore: number[] | undefined;
    for (const y of candidateRows(boxes, size, parents.get(id)!, gapY)) {
      const candidate = { ...size, x, y };
      if ([...boxes.values()].some((box) => !separated(candidate, box, gapX, gapY))) continue;
      boxes.set(id, candidate);
      const value = score(boxes, edges, gapX, gapY);
      boxes.delete(id);
      if (!bestScore || better(value, bestScore)) {
        best = candidate;
        bestScore = value;
      }
    }
    if (!best) throw new Error(`Unable to place rectangle ${id}.`);
    boxes.set(id, best);
  }
  // Revisit both ends of a branch: a later tall child may make a better centerline available.
  // These moves preserve every downstream coordinate and cannot change topology or overlap rectangles.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const id of pass % 2 ? [...order].reverse() : order) {
      const original = boxes.get(id)!;
      let best = original,
        bestScore = score(boxes, edges, gapX, gapY);
      boxes.delete(id);
      for (const y of candidateRows(boxes, original, neighbors.get(id)!, gapY)) {
        const candidate = { ...original, y };
        if ([...boxes.values()].some((box) => !separated(candidate, box, gapX, gapY))) continue;
        boxes.set(id, candidate);
        const value = score(boxes, edges, gapX, gapY);
        boxes.delete(id);
        if (better(value, bestScore)) {
          best = candidate;
          bestScore = value;
        }
      }
      boxes.set(id, best);
      changed ||= best.y !== original.y;
    }
    if (!changed) break;
  }
  return { boxes, ...extent(boxes) };
}

/** Pack fixed rectangles against occupied contours, allowing several small rectangles beside a tall one. */
export function packRectangles(
  ids: string[],
  sizes: Map<string, RectangleSize>,
  gapX: number,
  gapY: number,
): RectangleArrangement {
  const area = (id: string) => sizes.get(id)!.width * sizes.get(id)!.height;
  const orders = [
    [...ids].sort((a, b) => area(b) - area(a) || (a < b ? -1 : a > b ? 1 : 0)),
    [...ids].sort(
      (a, b) =>
        Math.max(sizes.get(b)!.width, sizes.get(b)!.height) - Math.max(sizes.get(a)!.width, sizes.get(a)!.height) ||
        (a < b ? -1 : a > b ? 1 : 0),
    ),
  ];
  let best: RectangleArrangement | undefined;
  for (const order of orders) {
    const boxes = new Map<string, CompoundBox>();
    for (const id of order) {
      const size = sizes.get(id)!;
      const sorted = [...boxes.values()].sort((a, b) => a.x - b.x);
      let chosen: CompoundBox | undefined, chosenScore: number[] | undefined;
      for (const y of candidateRows(boxes, size, [], gapY)) {
        let x = 0;
        for (const box of sorted) {
          if (!separated({ ...size, x, y }, box, gapX, gapY)) x = box.x + box.width + gapX;
        }
        const candidate = { ...size, x, y };
        boxes.set(id, candidate);
        const value = score(boxes, [], gapX, gapY);
        boxes.delete(id);
        if (!chosenScore || better(value, chosenScore)) {
          chosen = candidate;
          chosenScore = value;
        }
      }
      boxes.set(id, chosen!);
    }
    const result = { boxes, ...extent(boxes) };
    if (!best || better(score(boxes, [], gapX, gapY), score(best.boxes, [], gapX, gapY))) best = result;
  }
  return best ?? { boxes: new Map(), width: 0, height: 0 };
}
