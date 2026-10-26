import type { CompoundBox, CompoundRoute } from "../../../graph/compound/geometry";
import type { CompoundProjection } from "../../../graph/compound/projection";
import { routeCompoundEdges } from "./router";
import { diagnoseRoutes } from "./diagnostics";
import { crossingCost, routeCost, sharedEndpoints } from "./cost";
import type { CompoundRoutingOptions } from "./types";

/** Bounded joint repair: release a local conflict set, retain all unrelated routes. */
export function routeDesignedEdges(
  projection: CompoundProjection,
  boxes: Map<string, CompoundBox>,
  bounds: CompoundBox,
  showLabels: boolean,
  options: CompoundRoutingOptions,
) {
  let result = routeCompoundEdges(projection, boxes, bounds, showLabels, options);
  const diagnostic = (routes: Map<string, CompoundRoute>) =>
    diagnoseRoutes(projection, boxes, routes, { showLabels, detours: false });
  const score = (r: typeof result) => {
    const edges = projection.edges.filter((e) => r.routes.has(e.id));
    const routes = edges.map((e) => r.routes.get(e.id)!);
    let crossings = 0;
    routes.forEach((a, i) => {
      routes.slice(i + 1).forEach((b, k) => {
        const shared = sharedEndpoints(edges[i], a.points, edges[i + k + 1], b.points);
        a.points.slice(1).forEach((p, j) => {
          crossings += crossingCost(a.points[j], p, b.points, shared);
        });
      });
    });
    return [
      r.issues.length + diagnostic(r.routes).length,
      crossings,
      routes.reduce((n, r) => n + routeCost(r.points), 0),
    ];
  };
  for (let pass = 0; pass < 3; pass++) {
    const problems = diagnostic(result.routes);
    const affected = [...new Set(problems.flatMap((p) => p.edgeIds))]
      .filter((id) => !options.fixedRoutes?.has(id))
      .slice(0, 8);
    if (!affected.length) break;
    const fixedRoutes = new Map([...result.routes].filter(([id]) => !affected.includes(id)));
    try {
      const next = routeCompoundEdges(
        projection,
        boxes,
        { ...bounds, width: result.width, height: result.height },
        showLabels,
        {
          ...options,
          fixedRoutes,
          reverseOrder: pass % 2 === 0,
          reversePorts: pass > 0 ? new Set(affected) : undefined,
        },
      );
      next.issues = [...result.issues.filter((i) => !i.edgeIds.some((id) => affected.includes(id))), ...next.issues];
      const before = score(result),
        after = score(next),
        different = after.findIndex((v, i) => Math.abs(v - before[i]) > 0.001);
      if (different >= 0 && after[different] < before[different]) result = next;
    } catch {
      continue;
    } // Keep the complete legal result if a local repair is infeasible.
  }
  return result;
}
