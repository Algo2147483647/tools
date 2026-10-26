import { defaultLayoutIntent, type LayoutIntent, type LayoutProblem, type LayoutResult } from "./layout-plan";
import { solveCompoundLayout, routingPreferences, portWarnings } from "./layout-solver";
import { compareLayoutMetrics, measureLayout, validateLayoutGeometry } from "./layout-quality";
import { compileConstraints, layoutScopeMembers } from "./constraints";
import { routeCompoundEdges } from "./routing/router";

export function automaticIntent(problem: LayoutProblem): LayoutIntent {
  return {
    ...defaultLayoutIntent(problem.projection.focusGroupId),
    objective: problem.stored.objective,
    constraints:
      problem.stored.direction === "AUTO"
        ? []
        : [
            {
              type: "direction",
              scopeId: problem.projection.focusGroupId,
              value: problem.stored.direction,
              strength: "soft",
            },
          ],
  };
}

/** Every solve starts from freshly measured topology, never from saved geometry. */
export function arrangeCompound(problem: LayoutProblem, intent = automaticIntent(problem)): LayoutResult {
  const start = performance.now();
  const data = compileConstraints(problem, intent, layoutScopeMembers(problem, intent));
  const preferences = routingPreferences(problem, data);
  const route = routeCompoundEdges(
    problem.projection,
    new Map(Object.entries(problem.baseline.boxes)),
    { x: 0, y: 0, width: problem.baseline.width, height: problem.baseline.height },
    problem.showLabels,
    {
      labelSizes: problem.labelSizes,
      outerEdges: preferences.outerEdges,
      portSides: preferences.portSides,
      portMode: data.portMode,
    },
  );
  problem = {
    ...problem,
    baseline: {
      ...problem.baseline,
      routes: Object.fromEntries(route.routes),
      width: route.width,
      height: route.height,
    },
  };
  let geometry = problem.baseline;
  let validation = validateLayoutGeometry(problem, geometry);
  let metrics = measureLayout(problem, geometry);
  let diagnostics = [
    ...preferences.aggregatedPreferenceWarnings,
    ...portWarnings(problem, geometry, preferences.portSides),
  ];
  if (problem.projection.items.some((item) => !item.external)) {
    const solved = solveCompoundLayout(problem, intent);
    const best = solved.candidates[0];
    const preferenceDelta = best ? best.unmetPreferences.length - diagnostics.length : 0;
    if (
      best &&
      (!validation.valid ||
        preferenceDelta < 0 ||
        (preferenceDelta === 0 && compareLayoutMetrics(best.metrics, metrics, intent.objective) < 0))
    ) {
      geometry = best.geometry;
      validation = best.validation;
      metrics = best.metrics;
      diagnostics = best.unmetPreferences;
    } else if (!best) diagnostics.push(...solved.diagnostics);
  }
  if (!validation.valid) throw new Error(`No valid layout: ${validation.errors.slice(0, 4).join(" ")}`);
  return {
    geometry,
    quality: { metrics, validation, elapsedMs: performance.now() - start },
    diagnostics: [...new Set(diagnostics)],
  };
}
