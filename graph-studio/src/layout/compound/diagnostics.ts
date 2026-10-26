import { overlapLength, sharedEndpoints, sharedExit } from "./routing/cost";
import type { LayoutProblem, LayoutGeometry } from "./layout-plan";
import { close, GEOMETRY_EPSILON, routeSegments, segmentCrossesBox } from "./layout-quality";

/** Complete evidence for the visible graph. IDs refer to original business edges. */
export function routingHotspots(problem: LayoutProblem, geometry: LayoutGeometry = problem.baseline) {
  const edges = problem.projection.edges;
  const items = new Map(problem.projection.items.map((item) => [item.id, item]));
  const ancestors = (id: string) => {
    const result = new Set<string>([id]);
    let parent = items.get(id)?.parentId;
    while (parent && !result.has(parent)) {
      result.add(parent);
      parent = items.get(parent)?.parentId;
    }
    return result;
  };
  const crossings: { edgeIds: string[]; x: number; y: number }[] = [];
  const sharedRuns: { edgeIds: string[]; length: number }[] = [];
  const detours: { edgeIds: string[]; length: number; directDistance: number; ratio: number }[] = [];
  const containerPassages: { edgeIds: string[]; groupId: string; region: "header" | "unrelated-interior" }[] = [];
  const groups = new Map<string, { sourceGroupId: string | null; targetGroupId: string | null; edgeIds: string[] }>();
  const segments = edges.flatMap((edge) =>
    routeSegments(geometry.routes[edge.id]?.points ?? []).map(([a, b]) => ({ edge, a, b })),
  );
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const b = segments[j];
      if (a.edge.id === b.edge.id) continue;
      const shared = sharedEndpoints(
        a.edge,
        geometry.routes[a.edge.id].points,
        b.edge,
        geometry.routes[b.edge.id].points,
      );
      const ah = close(a.a.y, a.b.y),
        bh = close(b.a.y, b.b.y);
      const edgeIds = [...a.edge.originalEdgeIds, ...b.edge.originalEdgeIds];
      if (ah === bh) {
        if (!close(ah ? a.a.y : a.a.x, bh ? b.a.y : b.a.x)) continue;
        const length = overlapLength(a.a, a.b, b.a, b.b, shared);
        if (length > 12) sharedRuns.push({ edgeIds, length: Math.round(length) });
      } else {
        const h = ah ? a : b,
          v = ah ? b : a,
          e = GEOMETRY_EPSILON;
        if (
          v.a.x >= Math.min(h.a.x, h.b.x) - e &&
          v.a.x <= Math.max(h.a.x, h.b.x) + e &&
          h.a.y >= Math.min(v.a.y, v.b.y) - e &&
          h.a.y <= Math.max(v.a.y, v.b.y) + e &&
          !sharedExit({ x: v.a.x, y: h.a.y }, shared)
        )
          crossings.push({ edgeIds, x: v.a.x, y: h.a.y });
      }
    }
  }
  for (const edge of edges) {
    const points = geometry.routes[edge.id]?.points ?? [];
    const first = points[0],
      last = points.at(-1);
    if (!first || !last) continue;
    const parts = routeSegments(points);
    const length = parts.reduce((total, [a, b]) => total + Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 0);
    const directDistance = Math.abs(first.x - last.x) + Math.abs(first.y - last.y);
    if (length > Math.max(160, directDistance * 1.8))
      detours.push({
        edgeIds: edge.originalEdgeIds,
        length: Math.round(length),
        directDistance: Math.round(directDistance),
        ratio: Math.round((length / Math.max(1, directDistance)) * 10) / 10,
      });
    const sourceAncestors = ancestors(edge.source),
      targetAncestors = ancestors(edge.target);
    for (const item of problem.projection.items) {
      if (item.kind !== "group" || item.collapsed) continue;
      const box = geometry.boxes[item.id];
      if (!box) continue;
      const unrelated = !sourceAncestors.has(item.id) && !targetAncestors.has(item.id);
      if (groupTitleObstacles(item, box).some((title) => parts.some(([a, b]) => segmentCrossesBox(a, b, title))))
        containerPassages.push({ edgeIds: edge.originalEdgeIds, groupId: item.id, region: "header" });
      else if (unrelated && parts.some(([a, b]) => segmentCrossesBox(a, b, box)))
        containerPassages.push({ edgeIds: edge.originalEdgeIds, groupId: item.id, region: "unrelated-interior" });
    }
    const sourceGroupId = items.get(edge.source)?.parentId ?? null,
      targetGroupId = items.get(edge.target)?.parentId ?? null;
    if (sourceGroupId !== targetGroupId) {
      const key = JSON.stringify([sourceGroupId, targetGroupId]);
      const entry = groups.get(key) ?? { sourceGroupId, targetGroupId, edgeIds: [] };
      entry.edgeIds.push(...edge.originalEdgeIds);
      groups.set(key, entry);
    }
  }
  return {
    scope: "visible-graph",
    sampledEdges: edges.length,
    truncated: false,
    crossings,
    sharedRuns,
    detours: detours.sort((a, b) => b.ratio - a.ratio),
    containerPassages,
    crowdedPorts: [] as { nodeId: string; edgeIds: string[] }[],
    groupConnections: [...groups.values()].sort((a, b) => b.edgeIds.length - a.edgeIds.length),
  };
}
import { groupTitleObstacles } from "../shared/group-title";
