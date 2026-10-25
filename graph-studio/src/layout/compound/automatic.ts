import { defaultLayoutIntent, type LayoutIntent, type LayoutProblem, type LayoutResult } from "./layout-plan";
import { solveCompoundLayout } from "./layout-solver";
import { compareLayoutMetrics, measureLayout, validateLayoutGeometry } from "./layout-quality";
import { directionWarnings } from "./constraints";
import { routeCompoundEdges } from "./routing/router";

export function automaticIntent(problem: LayoutProblem): LayoutIntent {
  return { ...defaultLayoutIntent(problem.projection.focusGroupId), objective: problem.stored.objective,
    constraints: problem.stored.direction === "AUTO" ? [] : [{ type: "direction", scopeId: problem.projection.focusGroupId, value: problem.stored.direction, strength: "soft" }] };
}

/** Every solve starts from freshly measured topology, never from saved geometry. */
export function arrangeCompound(problem: LayoutProblem, intent = automaticIntent(problem)): LayoutResult {
  const start = performance.now();
  const route = routeCompoundEdges(problem.projection, new Map(Object.entries(problem.baseline.boxes)),
    { x: 0, y: 0, width: problem.baseline.width, height: problem.baseline.height }, problem.showLabels,
    { labelSizes: problem.labelSizes });
  problem = { ...problem, baseline: { ...problem.baseline, routes: Object.fromEntries(route.routes), width: route.width, height: route.height } };
  let geometry = problem.baseline;
  let validation = validateLayoutGeometry(problem, geometry);
  let metrics = measureLayout(problem, geometry);
  let diagnostics: string[] = [];
  if (problem.projection.items.some(item => !item.external)) {
    const solved = solveCompoundLayout(problem, intent);
    const best = solved.candidates[0];
    const preferences = intent.constraints.length > 0 || problem.stored.constraints.length > 0;
    if (best && (!validation.valid || preferences || compareLayoutMetrics(best.metrics, metrics, intent.objective) < 0)) {
      geometry = best.geometry;
      validation = best.validation;
      metrics = best.metrics;
      diagnostics = best.unmetPreferences;
    } else if (!best) diagnostics = solved.diagnostics;
  }
  if (!validation.valid) throw new Error(`No valid layout: ${validation.errors.slice(0, 4).join(" ")}`);
  diagnostics.push(...directionWarnings(problem, geometry, problem.stored));
  return { geometry, quality: { metrics, validation, elapsedMs: performance.now() - start }, diagnostics: [...new Set(diagnostics)] };
}
