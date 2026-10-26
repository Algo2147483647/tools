import { routingHotspots } from "./diagnostics";
import type { LayoutProblem } from "./layout-plan";
import { measureLayout, validateLayoutGeometry } from "./layout-quality";

export function inspectCompoundLayout(problem: LayoutProblem, scopeId: string | null) {
  const byId = new Map(problem.projection.items.map((i) => [i.id, i]));
  if (scopeId !== null && scopeId !== problem.projection.focusGroupId && !byId.has(scopeId))
    throw new Error(`Layout scope is not visible: ${scopeId}.`);
  const scope = scopeId === problem.projection.focusGroupId ? null : scopeId;
  const scoped = problem.projection.items.filter((item) => {
    if (scope === null || item.id === scope) return true;
    let parent = item.parentId;
    while (parent !== null) {
      if (parent === scope) return true;
      parent = byId.get(parent)?.parentId ?? null;
    }
    return false;
  });
  const prioritized = [...scoped].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  // Include immediate boundary neighbors after the selected hierarchy, not unrelated alphabetical nodes.
  const scopeIds = new Set(scoped.map((i) => i.id));
  const boundaryIds = new Set(
    problem.projection.edges
      .filter((e) => scopeIds.has(e.source) !== scopeIds.has(e.target))
      .flatMap((e) => [e.source, e.target]),
  );
  const items = [
    ...prioritized,
    ...problem.projection.items.filter((i) => boundaryIds.has(i.id) && !scopeIds.has(i.id)),
  ].slice(0, 80);
  const ids = new Set(items.map((i) => i.id));
  const edges = problem.projection.edges.filter((e) => ids.has(e.source) || ids.has(e.target));
  return {
    scopeId,
    totalVisibleItems: problem.projection.items.length,
    totalScopeItems: scoped.length,
    returnedItems: items.length,
    truncated: prioritized.length > 80 || edges.length > 120,
    nodes: items.map((i) => ({
      id: i.id,
      title: i.title,
      containmentParentId: i.parentId ?? (i.external ? null : problem.projection.focusGroupId),
      containmentChildIds: problem.projection.items.filter((child) => child.parentId === i.id).map((child) => child.id),
      incomingEdgeIds: edges.filter((e) => e.target === i.id).flatMap((e) => e.originalEdgeIds),
      outgoingEdgeIds: edges.filter((e) => e.source === i.id).flatMap((e) => e.originalEdgeIds),
      collapsed: i.collapsed,
      external: i.external,
      box: problem.baseline.boxes[i.id],
    })),
    edges: edges.slice(0, 120),
  };
}
export function diagnoseCompoundLayout(problem: LayoutProblem) {
  return {
    metricsScope: "visible-graph",
    metrics: measureLayout(problem, problem.baseline),
    validation: validateLayoutGeometry(problem, problem.baseline),
    routingHotspots: routingHotspots(problem),
    capabilities: {
      supported: [
        "scoped-layout",
        "direction",
        "sibling-flow-order",
        "outer-route-preference",
        "port-side-preference",
        "multiple-ports-per-side",
        "container-title-avoidance",
        "unrelated-container-avoidance",
      ],
      unavailable: ["strict-container-gates", "reserved-routing-channels", "minimum-parallel-route-spacing"],
    },
  };
}
