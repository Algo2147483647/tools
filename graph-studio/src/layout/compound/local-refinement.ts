import type { RectangleArrangement } from "./rectangle-packing";
import type { CompoundBox } from "./routes";

type Edge = readonly [string, string];
const EPSILON = 0.00001;
const ALIGNMENT_COST = 40;

/** Rectangle proximity and centerline alignment only; no ports or routes are chosen here. */
function edgeCost(a: CompoundBox, b: CompoundBox) {
  const dx = Math.abs(a.x + a.width / 2 - b.x - b.width / 2);
  const dy = Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
  const horizontal = dx - (a.width + b.width) / 2;
  const vertical = dy - (a.height + b.height) / 2;
  return Math.min(
    horizontal >= -EPSILON ? Math.max(0, horizontal) + dy + (dy > EPSILON ? ALIGNMENT_COST : 0) : Infinity,
    vertical >= -EPSILON ? Math.max(0, vertical) + dx + (dx > EPSILON ? ALIGNMENT_COST : 0) : Infinity,
  );
}

function separated(a: CompoundBox, b: CompoundBox, gapX: number, gapY: number) {
  return (
    a.x + a.width + gapX <= b.x + EPSILON ||
    b.x + b.width + gapX <= a.x + EPSILON ||
    a.y + a.height + gapY <= b.y + EPSILON ||
    b.y + b.height + gapY <= a.y + EPSILON
  );
}

/**
 * Topological reading order: left to right, bottom to top within a column;
 * for vertical flow, top to bottom, right to left within a row.
 * Every forward edge must strictly advance in this order. Feedback edges keep
 * their original direction but cannot obey an acyclic order.
 */
function downstream(a: CompoundBox, b: CompoundBox, down: boolean) {
  const dx = b.x + b.width / 2 - a.x - a.width / 2;
  const dy = b.y + b.height / 2 - a.y - a.height / 2;
  const main = down ? dy : dx;
  const cross = down ? dx : dy;
  return main > EPSILON || (Math.abs(main) <= EPSILON && cross < -EPSILON);
}

/** Refine within the original bounds before freezing the scope; children stay opaque rectangles. */
export function refineLocalPlacement(
  initial: RectangleArrangement,
  inputEdges: readonly Edge[],
  forward: readonly Edge[],
  gapX: number,
  gapY: number,
  down: boolean,
): RectangleArrangement {
  const edges = inputEdges.filter(([a, b]) => a !== b);
  if (initial.boxes.size < 3 || !edges.length) return initial;
  const boxes = new Map(initial.boxes);
  const incident = new Map([...boxes.keys()].map((id) => [id, [] as Edge[]]));
  for (const edge of edges) {
    incident.get(edge[0])!.push(edge);
    incident.get(edge[1])!.push(edge);
  }
  // Move sparse branches before hubs; stable IDs make input enumeration irrelevant.
  const order = [...boxes.keys()].sort(
    (a, b) => incident.get(a)!.length - incident.get(b)!.length || (a < b ? 1 : a > b ? -1 : 0),
  );
  const constraints = new Map([...boxes.keys()].map((id) => [id, [] as Edge[]]));
  for (const edge of forward) {
    constraints.get(edge[0])!.push(edge);
    constraints.get(edge[1])!.push(edge);
  }
  const cost = (id: string) =>
    incident.get(id)!.reduce((sum, [a, b]) => sum + edgeCost(boxes.get(a)!, boxes.get(b)!), 0);
  let budget = 4096,
    changed = false;
  for (let pass = 0; pass < 4 && budget > 0; pass++) {
    let moved = false;
    for (const id of order) {
      const original = boxes.get(id)!;
      let best = original,
        bestCost = cost(id);
      const candidates = new Map<string, CompoundBox>();
      const add = (x: number, y: number) => {
        if (
          x >= 0 &&
          y >= 0 &&
          x + original.width <= initial.width + EPSILON &&
          y + original.height <= initial.height + EPSILON
        )
          candidates.set(`${x}:${y}`, { ...original, x, y });
      };
      const neighbors = new Set(incident.get(id)!.flatMap(([a, b]) => [a, b]));
      neighbors.delete(id);
      for (const neighbor of neighbors) {
        const box = boxes.get(neighbor)!;
        const x = box.x + (box.width - original.width) / 2;
        const y = box.y + (box.height - original.height) / 2;
        add(x, original.y);
        add(original.x, y);
        add(box.x - original.width - gapX, y);
        add(box.x + box.width + gapX, y);
        add(x, box.y - original.height - gapY);
        add(x, box.y + box.height + gapY);
      }
      for (const candidate of candidates.values()) {
        if (--budget < 0) break;
        if ([...boxes].some(([other, box]) => other !== id && !separated(candidate, box, gapX, gapY))) continue;
        boxes.set(id, candidate);
        if (!constraints.get(id)!.every(([a, b]) => downstream(boxes.get(a)!, boxes.get(b)!, down))) continue;
        const value = cost(id);
        if (value < bestCost - EPSILON) {
          best = candidate;
          bestCost = value;
        }
      }
      boxes.set(id, best);
      moved ||= best !== original;
      if (budget <= 0) break;
    }
    changed ||= moved;
    if (!moved) break;
  }
  if (!changed) return initial;

  const left = Math.min(...[...boxes.values()].map((box) => box.x)),
    top = Math.min(...[...boxes.values()].map((box) => box.y));
  for (const [id, box] of boxes) boxes.set(id, { ...box, x: box.x - left, y: box.y - top });
  return {
    boxes,
    width: Math.max(...[...boxes.values()].map((box) => box.x + box.width)),
    height: Math.max(...[...boxes.values()].map((box) => box.y + box.height)),
  };
}
