import type { CompoundBox } from "../../graph/compound/geometry";
import type { CompoundProjection } from "../../graph/compound/projection";
import type { RectangleArrangement } from "./rectangle-packing";
import { indexedSegmentCosts, routeCost, sharedEndpoints } from "./routing/cost";
import { RouteSegmentIndex } from "./routing/spatial-index";
import { routeCompoundEdges } from "./routing/router";

export type PlacementScore = (boxes: Map<string, CompoundBox>) => number;

/** Rebase the completed scope once; parents add their own content padding. */
export function normalizePlacement(boxes: Map<string, CompoundBox>): RectangleArrangement {
  if (!boxes.size) return { boxes: new Map(), width: 0, height: 0 };
  const values = [...boxes.values()];
  const left = Math.min(...values.map((b) => b.x)),
    top = Math.min(...values.map((b) => b.y));
  return {
    boxes: new Map([...boxes].map(([id, b]) => [id, { ...b, x: b.x - left, y: b.y - top }])),
    width: Math.max(...values.map((b) => b.x + b.width)) - left,
    height: Math.max(...values.map((b) => b.y + b.height)) - top,
  };
}

/** The same finite trade-offs select seeds and every accepted local move. */
export function createPlacementScore(
  edges: readonly (readonly [string, string])[],
  context?: {
    projection: CompoundProjection;
    children: ReadonlyMap<string | null, { boxes: Map<string, CompoundBox> }>;
    showLabels?: boolean;
    portMode?: "distributed" | "midpoints";
    labelSizes?: Record<string, { width: number; height: number }>;
  },
): PlacementScore {
  const cache = new Map<string, number>();
  const score: PlacementScore = (input) => {
    const layout = normalizePlacement(input);
    const signature = JSON.stringify([...layout.boxes].sort(([a], [b]) => a.localeCompare(b)));
    const cached = cache.get(signature);
    if (cached !== undefined) return cached;
    const boxes = new Map([...layout.boxes].map(([id, b]) => [id, { ...b, x: b.x + 36, y: b.y + 36 }]));
    // Expand completed child geometry at its candidate offset, without changing it.
    for (const [id, box] of boxes) {
      for (const [child, local] of context?.children.get(id)?.boxes ?? [])
        boxes.set(child, { ...local, x: box.x + local.x, y: box.y + local.y });
    }
    const projection: CompoundProjection = context
      ? {
          ...context.projection,
          items: context.projection.items
            .filter((i) => boxes.has(i.id))
            .map((i) => ({ ...i, parentId: i.parentId !== null && boxes.has(i.parentId) ? i.parentId : null })),
          edges: context.projection.edges.filter((e) => boxes.has(e.source) && boxes.has(e.target)),
        }
      : {
          items: [...boxes.keys()].map((id) => ({
            id,
            kind: "node",
            title: id,
            parentId: null,
            collapsed: false,
            external: false,
            depth: 0,
            leafCount: 1,
            internalEdgeIds: [],
          })),
          edges: edges
            .filter(([a, b]) => a !== b && boxes.has(a) && boxes.has(b))
            .map(([source, target], i) => ({ id: String(i), source, target, label: "", originalEdgeIds: [String(i)] })),
          representative: new Map(),
          focusGroupId: null,
        };
    let value = Infinity;
    try {
      const routed = routeCompoundEdges(
        projection,
        boxes,
        { x: 0, y: 0, width: layout.width + 72, height: layout.height + 72 },
        context?.showLabels ?? false,
        { portMode: context?.portMode ?? "midpoints", labelSizes: context?.labelSizes },
      );
      value = 2 * Math.sqrt(routed.width * routed.height);
      const routes = projection.edges.map((e) => routed.routes.get(e.id)!.points);
      const index = new RouteSegmentIndex(routes);
      projection.edges.forEach((edge, i) => {
        const points = routes[i];
        value += routeCost(points);
        const shared = projection.edges.map((other, k) =>
          k > i ? sharedEndpoints(edge, points, other, routes[k]) : [],
        );
        const pairs = new Map<number, number[]>();
        for (let j = 1; j < points.length; j++)
          for (const c of indexedSegmentCosts(index, points[j - 1], points[j], (k) => shared[k], i + 1)) {
            let costs = pairs.get(c.route);
            if (!costs) {
              costs = [];
              pairs.set(c.route, costs);
            }
            costs.push(c.crossing + c.parallel);
          }
        // Preserve edge -> other edge -> segment accumulation, including rounding.
        for (const [, costs] of [...pairs].sort(([a], [b]) => a - b)) for (const cost of costs) value += cost;
      });
    } catch {
      // An unroutable candidate is infeasible; it must never replace a legal one.
    }
    cache.set(signature, value);
    return value;
  };
  return score;
}
