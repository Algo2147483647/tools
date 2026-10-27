import { routingPreferences, portWarnings } from "./routing/preferences";
export { routingPreferences, portWarnings } from "./routing/preferences";
import { compileConstraints, layoutScopeMembers, validateLayoutConstraints } from "./constraints";
import {
  layoutFingerprint,
  parseLayoutIntent,
  type LayoutCandidate,
  type LayoutDirection,
  type LayoutIntent,
  type LayoutProblem,
  type LayoutGeometry,
  type LayoutSolveResult,
} from "./layout-plan";
import { compareLayoutMetrics, measureLayout, sameBox, validateLayoutGeometry } from "./layout-quality";
import { place } from "./placement";
import { routeCompoundEdges } from "./routing/router";

export function solveCompoundLayout(
  problem: LayoutProblem,
  rawIntent: LayoutIntent,
  maxCandidates = 3,
): LayoutSolveResult {
  const intent = parseLayoutIntent(rawIntent);
  if (problem.projection.items.length > 1000 || problem.projection.edges.length > 2000)
    throw new Error("Select a smaller view: layout planning supports up to 1,000 visible items and 2,000 edges.");
  const members = layoutScopeMembers(problem, intent);
  if (!members.size) throw new Error("No visible members in this layout scope. Expand or enter the group first.");
  const data = compileConstraints(problem, intent, members);
  const baselineMetrics = measureLayout(problem, problem.baseline);
  const diagnostics: string[] = [],
    candidates: LayoutCandidate[] = [];
  const directions: LayoutDirection[] = ["AUTO", "RIGHT", "DOWN"];
  const seen = new Set<string>();
  for (let attempt = 0; attempt < Math.min(maxCandidates, directions.length); attempt++) {
    try {
      const boxes = place(problem, intent, data, members, directions[attempt]);
      const changed = new Set(
        problem.projection.items.filter((i) => !sameBox(boxes[i.id], problem.baseline.boxes[i.id])).map((i) => i.id),
      );
      const fixedRoutes = new Map(
        problem.projection.edges
          .filter(
            (e) => !members.has(e.source) && !members.has(e.target) && !changed.has(e.source) && !changed.has(e.target),
          )
          .map((e) => [e.id, problem.baseline.routes[e.id]]),
      );
      const { outerEdges, portSides, aggregatedPreferenceWarnings } = routingPreferences(problem, data);
      const fixedPoints = [...fixedRoutes.values()].flatMap((route) => route?.points ?? []);
      const width = Math.max(
        problem.minimumCanvas?.width ?? 0,
        ...Object.values(boxes).map((b) => b.x + b.width + 36),
        ...fixedPoints.map((p) => p.x + 36),
      );
      const height = Math.max(
        problem.minimumCanvas?.height ?? 0,
        ...Object.values(boxes).map((b) => b.y + b.height + 36),
        ...fixedPoints.map((p) => p.y + 36),
      );
      const routed = routeCompoundEdges(
        problem.projection,
        new Map(Object.entries(boxes)),
        { x: 0, y: 0, width, height },
        problem.showLabels,
        {
          reverseOrder: attempt % 2 === 1,
          fixedRoutes,
          outerEdges,
          portSides,
          labelSizes: problem.labelSizes,
          portMode: data.portMode,
        },
      );
      const geometry: LayoutGeometry = {
        boxes: Object.fromEntries(Object.entries(boxes)),
        routes: Object.fromEntries(routed.routes),
        width: routed.width,
        height: routed.height,
      };
      const validation = validateLayoutGeometry(problem, geometry);
      validation.errors.push(...validateLayoutConstraints(problem, geometry, data, intent));
      validation.valid = validation.errors.length === 0;
      if (!validation.valid) {
        diagnostics.push(...validation.errors);
        continue;
      }
      const signature = layoutFingerprint(geometry);
      if (seen.has(signature)) continue;
      seen.add(signature);
      const metrics = measureLayout(problem, geometry);
      const candidateData = structuredClone(data);
      const changedNodeIds = [...changed];
      const unmetPreferences: string[] = [...aggregatedPreferenceWarnings];
      unmetPreferences.push(...portWarnings(problem, geometry, portSides));
      const scopeDirection = data.constraints.find((c) => c.type === "direction" && c.scopeId === intent.scope.groupId);
      const effectiveDirection = scopeDirection?.type === "direction" ? scopeDirection.value : directions[attempt];
      candidates.push({
        id: `layout-${signature}`,
        title: `${effectiveDirection === "AUTO" ? "Automatic" : effectiveDirection === "RIGHT" ? "Left-to-right" : "Top-to-bottom"} arrangement ${attempt + 1}`,
        geometry,
        data: candidateData,
        metrics,
        validation,
        changedNodeIds,
        changedEdgeIds: problem.projection.edges
          .filter((e) => JSON.stringify(problem.baseline.routes[e.id]) !== JSON.stringify(geometry.routes[e.id]))
          .flatMap((e) => e.originalEdgeIds),
        expandedGroupIds: problem.projection.items
          .filter(
            (i) =>
              i.kind === "group" &&
              !i.collapsed &&
              (boxes[i.id].width > problem.baseline.boxes[i.id].width + 0.01 ||
                boxes[i.id].height > problem.baseline.boxes[i.id].height + 0.01),
          )
          .map((i) => i.id),
        unmetPreferences,
      });
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : "Layout search failed.");
    }
  }
  candidates.sort(
    (a, b) =>
      a.unmetPreferences.length - b.unmetPreferences.length ||
      compareLayoutMetrics(a.metrics, b.metrics, intent.objective),
  );
  if (!candidates.length && !diagnostics.length)
    diagnostics.push("No better legal arrangement was found. The current layout has been kept.");
  return { candidates, baselineMetrics, diagnostics: [...new Set(diagnostics)].slice(0, 12) };
}

export { layoutScopeMembers, validateLayoutConstraints } from "./constraints";
