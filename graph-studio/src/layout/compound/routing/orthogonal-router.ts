import type { LayoutGeometry, LayoutProblem } from "../layout-plan";
import type { CompoundRoutingOptions } from "./types";
import { routeCompoundEdges } from "./router";

export interface RoutingInput {
  problem: LayoutProblem;
  geometry: LayoutGeometry;
  options?: CompoundRoutingOptions;
}
export interface RoutingResult {
  geometry: LayoutGeometry;
  diagnostics: string[];
}
export interface OrthogonalRouter {
  route(input: RoutingInput): RoutingResult;
}

/** One complete call on final coordinates; the router never performs placement. */
export const compoundOrthogonalRouter: OrthogonalRouter = {
  route({ problem, geometry, options }) {
    // Include free corridors outside every obstacle, independent of initial canvas.
    // Label routing may further grow this extent beyond the layout's initial box.
    const gutter = Math.max(72, ...Object.values(problem.labelSizes).map((s) => s.width + s.height + 36));
    const width = Math.max(geometry.width, ...Object.values(geometry.boxes).map((b) => b.x + b.width + gutter));
    const height = Math.max(geometry.height, ...Object.values(geometry.boxes).map((b) => b.y + b.height + gutter));
    const routed = routeCompoundEdges(
      problem.projection,
      new Map(Object.entries(geometry.boxes)),
      { x: 0, y: 0, width, height },
      problem.showLabels,
      { ...options, labelSizes: problem.labelSizes, portMode: problem.stored.portMode, reverseOrder: false },
    );
    return {
      geometry: { ...geometry, routes: Object.fromEntries(routed.routes), width: routed.width, height: routed.height },
      diagnostics: routed.issues.map(
        (issue) => `${issue.kind}: ${issue.edgeIds.join(", ")} (${JSON.stringify(issue.evidence)})`,
      ),
    };
  },
};
