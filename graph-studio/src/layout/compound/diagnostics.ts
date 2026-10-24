import type { LayoutProblem,LayoutSnapshot } from "./layout-plan";
import { close,GEOMETRY_EPSILON,routeSegments,segmentCrossesBox } from "./layout-quality";

/** Bounded, actionable evidence. IDs refer to original business edges, never guessed labels. */
export function routingHotspots(problem: LayoutProblem, snapshot: LayoutSnapshot = problem.baseline) {
  const edges = problem.projection.edges.slice(0, 200);
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
  const ports = new Map<string, { nodeId: string; edgeIds: string[] }>();
  const groups = new Map<string, { sourceGroupId: string | null; targetGroupId: string | null; edgeIds: string[] }>();
  const segments = edges.flatMap((edge) =>
    routeSegments(snapshot.routes[edge.id]?.points ?? []).map(([a, b]) => ({ edge, a, b })),
  );
  let comparisons = 0;
  outer: for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      if (++comparisons > 30000) break outer;
      const b = segments[j];
      if (a.edge.id === b.edge.id) continue;
      const ah = close(a.a.y, a.b.y),
        bh = close(b.a.y, b.b.y);
      const edgeIds = [...a.edge.originalEdgeIds, ...b.edge.originalEdgeIds];
      if (ah === bh) {
        if (!close(ah ? a.a.y : a.a.x, bh ? b.a.y : b.a.x)) continue;
        const length =
          Math.min(Math.max(ah ? a.a.x : a.a.y, ah ? a.b.x : a.b.y), Math.max(bh ? b.a.x : b.a.y, bh ? b.b.x : b.b.y)) -
          Math.max(Math.min(ah ? a.a.x : a.a.y, ah ? a.b.x : a.b.y), Math.min(bh ? b.a.x : b.a.y, bh ? b.b.x : b.b.y));
        if (length > 12 && sharedRuns.length < 20) sharedRuns.push({ edgeIds, length: Math.round(length) });
      } else {
        const h = ah ? a : b,
          v = ah ? b : a,
          e = GEOMETRY_EPSILON;
        if (
          v.a.x > Math.min(h.a.x, h.b.x) + e &&
          v.a.x < Math.max(h.a.x, h.b.x) - e &&
          h.a.y > Math.min(v.a.y, v.b.y) + e &&
          h.a.y < Math.max(v.a.y, v.b.y) - e &&
          crossings.length < 20
        )
          crossings.push({ edgeIds, x: v.a.x, y: h.a.y });
      }
    }
  }
  for (const edge of edges) {
    const points = snapshot.routes[edge.id]?.points ?? [];
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
    for (const [nodeId, point] of [
      [edge.source, first],
      [edge.target, last],
    ] as const) {
      const key = JSON.stringify([nodeId, Math.round(point.x), Math.round(point.y)]);
      const entry = ports.get(key) ?? { nodeId, edgeIds: [] };
      entry.edgeIds.push(...edge.originalEdgeIds);
      ports.set(key, entry);
    }
    const sourceAncestors = ancestors(edge.source),
      targetAncestors = ancestors(edge.target);
    for (const item of problem.projection.items) {
      if (item.kind !== "group" || item.collapsed || containerPassages.length >= 24) continue;
      const box = snapshot.boxes[item.id];
      if (!box) continue;
      const unrelated = !sourceAncestors.has(item.id) && !targetAncestors.has(item.id);
      if (parts.some(([a, b]) => segmentCrossesBox(a, b, { ...box, height: Math.min(40, box.height) })))
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
  const crowdedPorts = [...ports.values()]
    .filter((p) => p.edgeIds.length >= 3)
    .sort((a, b) => b.edgeIds.length - a.edgeIds.length);
  return {
    scope: "visible-graph",
    sampledEdges: edges.length,
    limits: { edges: 200, segmentPairs: 30000, findingsPerCategory: 20, containerPassages: 24 },
    truncated:
      edges.length < problem.projection.edges.length ||
      comparisons > 30000 ||
      crossings.length === 20 ||
      sharedRuns.length === 20 ||
      containerPassages.length === 24 ||
      detours.length > 20 ||
      crowdedPorts.length > 20 ||
      groups.size > 20,
    crossings,
    sharedRuns,
    detours: detours.sort((a, b) => b.ratio - a.ratio).slice(0, 20),
    containerPassages,
    crowdedPorts: crowdedPorts.slice(0, 20),
    groupConnections: [...groups.values()].sort((a, b) => b.edgeIds.length - a.edgeIds.length).slice(0, 20),
  };
}
