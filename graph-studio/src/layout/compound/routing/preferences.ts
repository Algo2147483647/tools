import type { LayoutProblem, LayoutGeometry } from "../layout-plan";
import { onPortSide } from "../layout-quality";

export function routingPreferences(problem: LayoutProblem, data: LayoutProblem["stored"]) {
  const outerEdges = new Set<string>(),
    portSides = new Map<string, { source?: number; target?: number }>();
  const aggregatedPreferenceWarnings: string[] = [];
  for (const c of data.constraints) {
    if (c.type === "direction" || c.type === "flow-order") continue;
    for (const edge of problem.projection.edges.filter((e) => e.originalEdgeIds.includes(c.edgeId))) {
      if (c.type === "prefer-outer-route") outerEdges.add(edge.id);
      else {
        const side = ["east", "south", "west", "north"].indexOf(c.side),
          previous = portSides.get(edge.id)?.[c.end];
        if (previous !== undefined && previous !== side)
          aggregatedPreferenceWarnings.push(
            `Aggregated connection ${edge.originalEdgeIds.join(", ")} has conflicting ${c.end} port preferences; the first preference was retained.`,
          );
        else portSides.set(edge.id, { ...portSides.get(edge.id), [c.end]: side });
      }
    }
  }
  return { outerEdges, portSides, aggregatedPreferenceWarnings };
}

export function portWarnings(
  problem: LayoutProblem,
  geometry: LayoutGeometry,
  portSides: Map<string, { source?: number; target?: number }>,
) {
  const unmetPreferences: string[] = [];
  for (const [edgeId, preferences] of portSides) {
    const edge = problem.projection.edges.find((e) => e.id === edgeId)!;
    for (const end of ["source", "target"] as const) {
      const side = preferences[end];
      if (side === undefined) continue;
      const box = geometry.boxes[edge[end]],
        points = geometry.routes[edgeId].points,
        point = end === "source" ? points[0] : points.at(-1)!;
      if (!onPortSide(point, box, side))
        unmetPreferences.push(`Preferred ${end} port was unavailable for ${edge.originalEdgeIds.join(", ")}.`);
    }
  }
  return unmetPreferences;
}
