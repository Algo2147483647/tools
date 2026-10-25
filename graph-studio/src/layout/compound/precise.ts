import type { CompoundBox } from "../../graph/compound/geometry";
import type { LayoutGeometry, LayoutProblem, LayoutResult } from "./layout-plan";
import { buildScopes, directionWarnings } from "./constraints";
import { measureLayout, validateLayoutGeometry } from "./layout-quality";
import { portWarnings, routingPreferences } from "./layout-solver";
import { routeCompoundEdges } from "./routing/router";

/** Transient design instructions, never part of the graph or layout document. */
export interface CompoundPlacement {
  nodeId: string;
  x: number;
  y: number;
}
export interface CompoundRuntimePlacement {
  placements: CompoundPlacement[];
  baseline: LayoutGeometry;
}

/** Coordinates are offsets from the parent's content origin, in measured pixels. */
export function contentOrigin(parent?: CompoundBox) {
  return parent ? { x: parent.x + 24, y: parent.y + 58 } : { x: 36, y: 36 };
}

export function arrangePreciseCompound(problem: LayoutProblem, runtime: CompoundRuntimePlacement): LayoutResult {
  const start = performance.now();
  const baseline = runtime.baseline.boxes;
  const { scopes } = buildScopes(problem.projection);
  const placements = new Map<string, CompoundPlacement>();
  for (const p of runtime.placements) {
    const item = problem.projection.items.find((item) => item.id === p.nodeId);
    if (!item || item.external || placements.has(p.nodeId) || ![p.x, p.y].every((v) => Number.isFinite(v) && v >= 0))
      throw new Error(`Invalid or unavailable placement: ${p.nodeId}.`);
    placements.set(p.nodeId, p);
  }
  const sizes = new Map(problem.projection.items.map((item) => [item.id, { ...problem.minimumSizes[item.id] }]));
  const locals = new Map<string, CompoundBox>();
  // Resolve descendants first so containers fit their contents without moving siblings.
  for (const [scopeId, scope] of [...scopes].reverse()) {
    const origin = contentOrigin(scopeId === null ? undefined : baseline[scopeId]);
    for (const id of scope.children) {
      const old = baseline[id],
        position = placements.get(id);
      if (!old) throw new Error(`Missing observed rectangle: ${id}.`);
      locals.set(id, { ...sizes.get(id)!, x: position?.x ?? old.x - origin.x, y: position?.y ?? old.y - origin.y });
    }
    if (scopeId !== null)
      sizes.set(scopeId, {
        width: Math.max(
          problem.minimumSizes[scopeId].width,
          ...scope.children.map((id) => {
            const b = locals.get(id)!;
            return b.x + b.width + 48;
          }),
        ),
        height: Math.max(
          problem.minimumSizes[scopeId].height,
          ...scope.children.map((id) => {
            const b = locals.get(id)!;
            return b.y + b.height + 82;
          }),
        ),
      });
  }
  const boxes: Record<string, CompoundBox> = Object.create(null);
  for (const [scopeId, scope] of scopes) {
    const origin = contentOrigin(scopeId === null ? undefined : boxes[scopeId]);
    for (const id of scope.children) {
      const b = locals.get(id)!;
      boxes[id] = { ...b, ...sizes.get(id)!, x: b.x + origin.x, y: b.y + origin.y };
    }
  }
  const bounds = {
    width: Math.max(problem.minimumCanvas?.width ?? 0, ...Object.values(boxes).map((b) => b.x + b.width + 36)),
    height: Math.max(problem.minimumCanvas?.height ?? 0, ...Object.values(boxes).map((b) => b.y + b.height + 36)),
  };
  // Validate placement before routing; stale routes are deliberately excluded.
  const boxValidation = validateLayoutGeometry(
    { ...problem, projection: { ...problem.projection, edges: [] } },
    { boxes, routes: {}, ...bounds },
  );
  if (!boxValidation.valid) throw new Error(`Invalid AI placement: ${boxValidation.errors.join(" ")}`);
  const preferences = routingPreferences(problem, problem.stored);
  const routed = routeCompoundEdges(
    problem.projection,
    new Map(Object.entries(boxes)),
    { x: 0, y: 0, ...bounds },
    problem.showLabels,
    {
      labelSizes: problem.labelSizes,
      outerEdges: preferences.outerEdges,
      portSides: preferences.portSides,
      portMode: problem.stored.portMode,
    },
  );
  const geometry = { boxes, routes: Object.fromEntries(routed.routes), width: routed.width, height: routed.height };
  const validation = validateLayoutGeometry(problem, geometry);
  if (!validation.valid) throw new Error(`Invalid AI geometry: ${validation.errors.join(" ")}`);
  return {
    geometry,
    quality: {
      metrics: measureLayout({ ...problem, baseline: runtime.baseline }, geometry),
      validation,
      elapsedMs: performance.now() - start,
    },
    diagnostics: [
      ...directionWarnings(problem, geometry, problem.stored),
      ...preferences.aggregatedPreferenceWarnings,
      ...portWarnings(problem, geometry, preferences.portSides),
    ],
  };
}
