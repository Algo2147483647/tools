import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import type { LayoutProblem, LayoutResult } from "../layout-plan";
import { measureLayout, validateLayoutGeometry } from "../layout-quality";
import { createFcoseModel, extractFcoseGeometry } from "./adapter";
import { fcoseParameters, FCOSE_ENGINE } from "./options";
import { compoundOrthogonalRouter, type OrthogonalRouter } from "../routing/orthogonal-router";
import { routingPreferences, portWarnings } from "../routing/preferences";

cytoscape.use(fcose);

export function solveFcose(problem: LayoutProblem, router: OrthogonalRouter = compoundOrthogonalRouter): LayoutResult {
  const start = performance.now();
  const model = createFcoseModel(problem);
  const parameters = { ...fcoseParameters(problem.stored.objective), tile: !model.fixedNodeConstraint.length };
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    layout: { name: "preset" },
    elements: model.elements,
    style: model.style,
  });
  const converted = performance.now();
  try {
    // fCoSE's spectral initializer reads Math.random. The worker runs synchronously;
    // scope a reproducible seed to this one call and restore it even on failure.
    const random = Math.random;
    let seed = parameters.randomSeed;
    try {
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      if (problem.projection.items.length)
        cy.layout({
          name: "fcose",
          ...parameters,
          ...(model.fixedNodeConstraint.length ? { fixedNodeConstraint: model.fixedNodeConstraint } : {}),
        } as cytoscape.LayoutOptions).run();
    } finally {
      Math.random = random;
    }
    const placed = extractFcoseGeometry(cy, problem, model);
    const layoutEnd = performance.now();
    // Pre-routing geometry check uses the same validator, with no edge requirements.
    const rectangles = validateLayoutGeometry({ ...problem, projection: { ...problem.projection, edges: [] } }, placed);
    if (!rectangles.valid) throw new Error(`fCoSE geometry invalid: ${rectangles.errors.join(" ")}`);
    const routeStart = performance.now();
    const { portSides, outerEdges, aggregatedPreferenceWarnings } = routingPreferences(problem, problem.stored);
    const routed = router.route({ problem, geometry: placed, options: { portSides, outerEdges } });
    const routeEnd = performance.now();
    const validation = validateLayoutGeometry(problem, routed.geometry);
    if (!validation.valid) throw new Error(`fCoSE routing validation failed: ${validation.errors.join(" ")}`);
    const metrics = measureLayout({ ...problem, baseline: placed }, routed.geometry);
    const end = performance.now();
    return {
      geometry: routed.geometry,
      quality: {
        metrics,
        validation,
        elapsedMs: end - start,
        timings: {
          conversionMs: converted - start,
          layoutMs: layoutEnd - converted,
          routingMs: routeEnd - routeStart,
          validationMs: routeStart - layoutEnd + end - routeEnd,
        },
      },
      diagnostics: [
        ...model.diagnostics,
        ...routed.diagnostics,
        ...aggregatedPreferenceWarnings,
        ...portWarnings(problem, routed.geometry, portSides),
      ],
      provenance: { method: "fcose", engine: FCOSE_ENGINE, parameters },
    };
  } finally {
    cy.destroy();
  }
}
