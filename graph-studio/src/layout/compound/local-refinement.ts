import type { RectangleArrangement } from "./rectangle-packing";
import { createPlacementScore, normalizePlacement, type PlacementScore } from "./placement-score";
import type { CompoundBox } from "../../graph/compound/geometry";

type Edge = readonly [string, string];
const EPSILON = 0.00001;
function separated(a: CompoundBox, b: CompoundBox) {
  return (
    a.x + a.width <= b.x + EPSILON ||
    b.x + b.width <= a.x + EPSILON ||
    a.y + a.height <= b.y + EPSILON ||
    b.y + b.height <= a.y + EPSILON
  );
}

/** Search all four sides without a direction or canvas boundary. */
export function refineLocalPlacement(
  initial: RectangleArrangement,
  inputEdges: readonly Edge[],
  gapX: number,
  gapY: number,
  score: PlacementScore = createPlacementScore(inputEdges),
): RectangleArrangement {
  const edges = inputEdges.filter(([a, b]) => a !== b);
  if (initial.boxes.size < 2 || !edges.length) return initial;
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
  let bestCost = score(boxes);
  while (true) {
    let moved = false;
    for (const id of order) {
      const original = boxes.get(id)!;
      let best = original;
      const candidates = new Map<string, CompoundBox>();
      const add = (x: number, y: number) => {
        if (Number.isFinite(x) && Number.isFinite(y)) candidates.set(`${x}:${y}`, { ...original, x, y });
      };
      const neighbors = new Set(
        incident
          .get(id)!
          .flatMap(([a, b]) => [a, b])
          .sort(),
      );
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
        if (Math.abs(candidate.x - original.x) < EPSILON && Math.abs(candidate.y - original.y) < EPSILON) continue;
        if ([...boxes].some(([other, box]) => other !== id && !separated(candidate, box))) continue;
        boxes.set(id, candidate);
        const value = score(boxes);
        if (value < bestCost - EPSILON) {
          best = candidate;
          bestCost = value;
        }
      }
      boxes.set(id, best);
      moved ||= best !== original;
    }
    if (!moved) break;
  }
  return normalizePlacement(boxes);
}
