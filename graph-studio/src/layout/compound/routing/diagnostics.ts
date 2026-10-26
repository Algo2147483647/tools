import type { CompoundBox, CompoundRoute } from "../../../graph/compound/geometry";
import type { CompoundProjection } from "../../../graph/compound/projection";
import type { RoutingIssue } from "./intent";
import { ancestry } from "./intent";
import { routeCost, crossingCost, overlapLength, sharedEndpoints } from "./cost";
import { inflate } from "./geometry";
import { sidePorts } from "./ports";
import { simpleRoutes } from "./search";
import type { Point } from "./types";

export function diagnoseRoutes(
  projection: CompoundProjection,
  boxes: Map<string, CompoundBox>,
  routes: Map<string, CompoundRoute>,
  options: { mainEdges?: Set<string>; direction?: "RIGHT" | "DOWN"; showLabels?: boolean; detours?: boolean } = {},
) {
  const issues: RoutingIssue[] = [];
  const emit = (
    kind: RoutingIssue["kind"],
    nodeIds: string[],
    edgeIds: string[],
    evidence: Record<string, unknown>,
    repairLevel: RoutingIssue["repairLevel"],
    suggestedActions: string[],
  ) => {
    issues.push({
      id: `${kind}:${[...edgeIds].sort().join("|")}:${nodeIds.join("|")}`,
      kind,
      scopeId: projection.items.find((n) => n.id === nodeIds[0])?.parentId ?? null,
      nodeIds,
      edgeIds: [...new Set(edgeIds)],
      evidence,
      repairLevel,
      suggestedActions,
    });
  };
  for (const e of projection.edges) {
    const points = routes.get(e.id)?.points;
    if (!points || points.length < 2) continue;
    if (options.mainEdges?.has(e.id)) {
      const axis = options.direction === "DOWN" ? "y" : "x";
      const reverse = points.slice(1).reduce((sum, p, i) => sum + Math.max(0, points[i][axis] - p[axis]), 0);
      if (reverse > 32)
        emit("main-path-backtrack", [e.source, e.target], [e.id], { axis, reverseLength: reverse }, "composition", [
          "verify-main-role",
          "align-region-interfaces",
          "change-port-side",
        ]);
    }
  }
  const edges = projection.edges.filter((e) => routes.has(e.id));
  const boundaryCoordinate = (points: Point[], box: CompoundBox, side: "east" | "west" | "north" | "south") => {
    const vertical = side === "east" || side === "west",
      coordinate =
        side === "east" ? box.x + box.width : side === "west" ? box.x : side === "south" ? box.y + box.height : box.y;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const axis = vertical ? "x" : "y",
        cross = vertical ? "y" : "x";
      if (a[axis] === b[axis] || coordinate < Math.min(a[axis], b[axis]) || coordinate > Math.max(a[axis], b[axis]))
        continue;
      const n = a[cross];
      if (n >= (vertical ? box.y : box.x) && n <= (vertical ? box.y + box.height : box.x + box.width)) return n;
    }
    return undefined;
  };
  const scopes = new Set(projection.items.map((n) => n.parentId));
  for (const scope of scopes) {
    const children = projection.items.filter((n) => n.parentId === scope && n.kind === "group" && !n.collapsed);
    for (let i = 0; i < children.length; i++)
      for (let j = i + 1; j < children.length; j++) {
        const a = children[i],
          b = children[j],
          ba = boxes.get(a.id)!,
          bb = boxes.get(b.id)!;
        const horizontal = ba.x + ba.width <= bb.x || bb.x + bb.width <= ba.x;
        const sideA = horizontal ? (ba.x < bb.x ? "east" : "west") : ba.y < bb.y ? "south" : "north";
        const sideB = sideA === "east" ? "west" : sideA === "west" ? "east" : sideA === "south" ? "north" : "south";
        const pairs = edges.flatMap((e) => {
          const sa = ancestry(projection, e.source),
            ta = ancestry(projection, e.target);
          if (!((sa.includes(a.id) && ta.includes(b.id)) || (sa.includes(b.id) && ta.includes(a.id)))) return [];
          const p = routes.get(e.id)!.points,
            start = boundaryCoordinate(p, ba, sideA),
            end = boundaryCoordinate(p, bb, sideB);
          return start === undefined || end === undefined ? [] : [{ id: e.id, start, end }];
        });
        for (let x = 0; x < pairs.length; x++)
          for (let y = x + 1; y < pairs.length; y++) {
            const p = pairs[x],
              q = pairs[y];
            if ((p.start - q.start) * (p.end - q.end) < -1)
              emit(
                "gateway-order-conflict",
                [a.id, b.id],
                [p.id, q.id],
                { first: [p.start, p.end], second: [q.start, q.end], sides: [sideA, sideB] },
                "routing",
                ["reorder-gateways", "reroute-together"],
              );
          }
      }
  }
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const ea = edges[i],
        eb = edges[j],
        a = routes.get(ea.id)!.points,
        b = routes.get(eb.id)!.points;
      const shared = sharedEndpoints(ea, a, eb, b);
      let closeLength = 0,
        minGap = Infinity;
      for (let x = 1; x < a.length; x++)
        for (let y = 1; y < b.length; y++) {
          const horizontal = a[x].y === a[x - 1].y;
          if (horizontal !== (b[y].y === b[y - 1].y)) continue;
          const across = horizontal ? "y" : "x";
          const gap = Math.abs(a[x][across] - b[y][across]);
          const overlap = overlapLength(a[x - 1], a[x], b[y - 1], b[y], shared);
          if (gap < 8 && overlap > 0) {
            closeLength += overlap;
            minGap = Math.min(minGap, gap);
          }
        }
      if (closeLength > 80)
        emit("ambiguous-parallel-run", [], [ea.id, eb.id], { closeLength, minimumGap: minGap }, "routing", [
          "separate-tracks",
          "reroute-together",
        ]);
    }
  // Only report detours with a concrete obstacle-safe alternative. Labels need their own
  // placement, so do not claim an alternative is legal when labels are enabled.
  if (options.detours !== false && !options.showLabels)
    for (const e of edges) {
      const route = routes.get(e.id)!,
        related = new Set([...ancestry(projection, e.source), ...ancestry(projection, e.target)]);
      const obstacles = projection.items
        .flatMap((n) => {
          const b = boxes.get(n.id)!;
          if (n.kind === "group" && !n.collapsed && related.has(n.id))
            return [{ ...b, height: Math.min(40, b.height) }];
          return [b];
        })
        .map((b) => inflate(b, 4));
      const candidates = simpleRoutes(
        sidePorts(boxes.get(e.source)!, 8, 1, "midpoints"),
        sidePorts(boxes.get(e.target)!, 8, 1, "midpoints"),
        obstacles,
      );
      const others = edges.filter((other) => other.id !== e.id);
      const crossings = (points: Point[]) =>
        points
          .slice(1)
          .reduce(
            (sum, p, i) =>
              sum +
              others.reduce(
                (n, other) =>
                  n +
                  crossingCost(
                    points[i],
                    p,
                    routes.get(other.id)!.points,
                    sharedEndpoints(e, points, other, routes.get(other.id)!.points),
                  ),
                0,
              ),
            0,
          );
      const alternative = candidates
        .sort((a, b) => routeCost(a) - routeCost(b))
        .find((p) => routeCost(p) < routeCost(route.points) * 0.7 && crossings(p) <= crossings(route.points));
      if (alternative)
        emit(
          "avoidable-detour",
          [e.source, e.target],
          [e.id],
          {
            currentCost: routeCost(route.points),
            alternativeCost: routeCost(alternative),
            alternativePoints: alternative,
            qualification: "Obstacle-safe alternative; check routing intent before adoption",
          },
          "routing",
          ["check-alternative-against-intent", "reroute-together"],
        );
    }
  return issues;
}
