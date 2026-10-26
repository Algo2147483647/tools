import type { CompoundProjection } from "../../../graph/compound/projection";
import type { CompoundBox, CompoundRoute } from "../../../graph/compound/geometry";
import { crossingCost, parallelRouteCost, routeCost, sharedEndpoints } from "./cost";
import { crossesBox, inflate, inside, simplifyRoute } from "./geometry";
import { labelBox, placeLabel } from "./labels";
import { sidePorts } from "./ports";
import { findOrthogonalPath, simpleRoutes } from "./search";
import { outerRoutes } from "./outer";
import { EPSILON, type CompoundRoutingOptions, type Point, type Port } from "./types";
import { compileRoutingPlan } from "./plan";
import { sides, type RoutingIssue } from "./intent";

/** Choose reusable side ports after placement; routing never moves node rectangles. */
export function routeCompoundEdges(
  projection: CompoundProjection,
  boxes: Map<string, CompoundBox>,
  bounds: CompoundBox,
  showLabels: boolean,
  options: CompoundRoutingOptions = {},
): { routes: Map<string, CompoundRoute>; width: number; height: number; issues: RoutingIssue[] } {
  const plan = options.intent
    ? compileRoutingPlan(
        projection,
        boxes,
        bounds,
        options.intent,
        options.portMode,
        options.fixedRoutes,
        options.reversePorts,
      )
    : undefined;
  const issues = plan?.issues ?? [];
  const items = new Map(projection.items.map((item) => [item.id, item]));
  const ancestors = (id: string) => {
    const result = new Set<string>([id]);
    let parent = items.get(id)?.parentId;
    while (parent && !result.has(parent)) {
      result.add(parent);
      parent = items.get(parent)?.parentId;
    }
    return result;
  };
  const degree = new Map<string, number>();
  for (const edge of projection.edges)
    for (const id of [edge.source, edge.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const obstacles = projection.items
    .filter((item) => item.kind !== "group" || item.collapsed)
    .map((item) => boxes.get(item.id)!);
  const portApproaches = showLabels
    ? [...boxes.values()].flatMap((box) =>
        sidePorts(box, 8, 1, "midpoints").map(({ point, stub }) => ({
          x: Math.min(point.x, stub.x) - 8,
          y: Math.min(point.y, stub.y) - 8,
          width: Math.abs(point.x - stub.x) + 16,
          height: Math.abs(point.y - stub.y) + 16,
        })),
      )
    : [];
  const extent = { ...bounds };
  let clearance = 8;
  for (let i = 0; i < obstacles.length; i++)
    for (let j = i + 1; j < obstacles.length; j++) {
      const a = obstacles[i],
        b = obstacles[j];
      const dx = Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width);
      const dy = Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height);
      clearance = Math.min(clearance, Math.hypot(dx, dy) / 3);
    }
  const edges = [...projection.edges].sort(
    (a, b) =>
      (options.edgePriority?.get(a.id) ?? 1) - (options.edgePriority?.get(b.id) ?? 1) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  if (options.reverseOrder) edges.reverse();
  const labelBoxes = new Map<string, CompoundBox>();
  const result = new Map<string, CompoundRoute>();
  const edgeLabelBox = (id: string, label: string, position: Point) => {
    const size = options.labelSizes?.[id];
    return size ? { x: position.x - size.width / 2, y: position.y - 10, ...size } : labelBox(label, position);
  };
  for (const edge of edges) {
    const fixed = options.fixedRoutes?.get(edge.id);
    if (!fixed) continue;
    result.set(edge.id, fixed);
    if (showLabels && edge.label) labelBoxes.set(edge.id, edgeLabelBox(edge.id, edge.label, fixed.labelPosition));
  }
  for (const edge of edges) {
    if (options.fixedRoutes?.has(edge.id)) continue;
    const accept = (route: CompoundRoute) => {
      result.set(edge.id, route);
    };
    const otherLabels = [...labelBoxes].filter(([id]) => id !== edge.id).map(([, box]) => box);
    const gap = clearance;
    const related = new Set([...ancestors(edge.source), ...ancestors(edge.target)]);
    const containers = projection.items
      .filter((item) => item.kind === "group" && !item.collapsed && boxes.has(item.id))
      .flatMap((item) => {
        const box = boxes.get(item.id)!;
        if (!related.has(item.id)) return [box];
        // An expanded group can itself be an ordinary relationship endpoint.
        if (item.id === edge.source || item.id === edge.target) return [];
        const north = plan?.passages
          .get(edge.id)
          ?.filter(
            (p) =>
              (p.direction === 1 || p.direction === 3) &&
              Math.min(p.entry.y, p.exit.y) < box.y &&
              Math.max(p.entry.y, p.exit.y) > box.y,
          );
        if (north?.length) {
          const x = north[0].entry.x;
          return [
            { ...box, width: Math.max(0, x - box.x - 12), height: Math.min(40, box.height) },
            { ...box, x: x + 12, width: Math.max(0, box.x + box.width - x - 12), height: Math.min(40, box.height) },
          ];
        }
        return [{ ...box, height: Math.min(40, box.height) }];
      });
    const padded = [...obstacles, ...otherLabels, ...containers].map((box) => inflate(box, gap));
    const ports = (id: string): Port[] => {
      const box = boxes.get(id)!;
      return sidePorts(box, gap, degree.get(id) ?? 1, options.portMode).filter(
        (port) =>
          !padded.some((box) => inside(port.stub, box)) &&
          !padded.some((box) => !inside(port.point, box) && crossesBox(port.point, port.stub, box)) &&
          port.stub.x >= extent.x &&
          port.stub.y >= extent.y &&
          port.stub.x <= extent.x + extent.width &&
          port.stub.y <= extent.y + extent.height,
      );
    };
    let costSources: Port[] | undefined, costTargets: Port[] | undefined;
    let costRoutes: { points: Point[]; shared: Point[] }[] = [];
    const sharedCost = (a: Point, b: Point) => {
      if (costSources !== sources || costTargets !== targets) {
        costSources = sources;
        costTargets = targets;
        costRoutes = [...result].map(([id, route]) => {
          const other = edges.find((e) => e.id === id)!;
          const shared: Point[] = [];
          for (const end of ["source", "target"] as const) {
            const candidates = end === "source" ? sources : targets;
            for (const otherEnd of ["source", "target"] as const) {
              const point = otherEnd === "source" ? route.points[0] : route.points[route.points.length - 1];
              if (
                edge[end] === other[otherEnd] &&
                candidates.some((p) => Math.hypot(p.point.x - point.x, p.point.y - point.y) < EPSILON)
              )
                shared.push(point);
            }
          }
          return { points: route.points, shared };
        });
      }
      return costRoutes.reduce(
        (sum, route) =>
          sum + parallelRouteCost(a, b, route.points, route.shared) + crossingCost(a, b, route.points, route.shared),
        0,
      );
    };
    function portPreferenceCost(id: string, point: Point) {
      const side = options.portSides?.get(edge.id)?.[id === edge.source ? "source" : "target"];
      if (side === undefined) return 0;
      const box = boxes.get(id)!;
      const onSide = [box.x + box.width, box.y + box.height, box.x, box.y][side];
      return Math.abs((side % 2 ? point.y : point.x) - onSide) < EPSILON ? 0 : 200;
    }
    const cost = (points: Point[]) =>
      routeCost(points) +
      portPreferenceCost(edge.source, points[0]) +
      portPreferenceCost(edge.target, points[points.length - 1]) +
      [...result].reduce((total, [id, route]) => {
        const other = edges.find((e) => e.id === id)!;
        const shared = sharedEndpoints(edge, points, other, route.points);
        return (
          total +
          points
            .slice(1)
            .reduce(
              (sum, point, i) =>
                sum +
                parallelRouteCost(points[i], point, route.points, shared) +
                crossingCost(points[i], point, route.points, shared),
              0,
            )
        );
      }, 0);
    const assigned = plan?.endpoints.get(edge.id);
    const requiredPort = (end: "source" | "target") =>
      options.intent?.ports.some(
        (p) => p.strength === "required" && p.ends.some((e) => e.edgeId === edge.id && e.end === end),
      );
    const endpointPorts = (end: "source" | "target") => {
      const p = assigned?.[end];
      if (!p) return ports(edge[end]);
      if (
        p.stub.x >= extent.x &&
        p.stub.y >= extent.y &&
        p.stub.x <= extent.x + extent.width &&
        p.stub.y <= extent.y + extent.height &&
        !padded.some((b) => inside(p.stub, b))
      )
        return [p];
      if (requiredPort(end))
        throw new Error(`Required ${end} port is obstructed: ${edge.id}. Change the port side or spacing.`);
      issues.push({
        id: `port-deviation:${edge.id}:${end}`,
        kind: "intent-deviation",
        scopeId: items.get(edge[end])?.parentId ?? null,
        nodeIds: [edge[end]],
        edgeIds: [edge.id],
        evidence: { end, assignedSide: sides[p.direction], reason: "Assigned port is obstructed" },
        repairLevel: "placement",
        suggestedActions: ["increase-gap", "change-port-side"],
      });
      return ports(edge[end]);
    };
    let sources = endpointPorts("source"),
      targets = endpointPorts("target");
    const passages = plan?.passages.get(edge.id) ?? [];
    const explicitPassages =
      options.intent?.gateways.some((g) => g.edgeIds.includes(edge.id)) ||
      options.intent?.channels.some((c) => c.edgeIds.includes(edge.id));
    const directedPort = (point: Point, direction: number): Port => ({ point, stub: point, direction });
    const via = () => {
      if (!passages.length) return null;
      const points: Point[] = [];
      let starts = sources;
      for (const p of passages) {
        if (
          [p.entry, p.exit].some(
            (point) =>
              point.x < extent.x ||
              point.y < extent.y ||
              point.x > extent.x + extent.width ||
              point.y > extent.y + extent.height,
          )
        )
          return null;
        if (padded.some((b) => crossesBox(p.entry, p.exit, b))) return null;
        const part = findOrthogonalPath(
          starts,
          [directedPort(p.entry, (p.direction + 2) % 4)],
          padded,
          extent,
          sharedCost,
          () => 0,
          () => 0,
        );
        if (!part) return null;
        points.push(...part, p.exit);
        starts = [directedPort(p.exit, p.direction)];
      }
      const last = findOrthogonalPath(
        starts,
        targets,
        padded,
        extent,
        sharedCost,
        () => 0,
        () => 0,
      );
      return last ? simplifyRoute([...points, ...last]) : null;
    };
    const planned = via();
    if (explicitPassages && !planned) {
      if (passages.some((p) => p.required))
        throw new Error(
          `Required passages cannot be routed: ${edge.id}; ${passages.map((p) => p.id).join(", ")}. Change gateways, channels or spacing.`,
        );
      issues.push({
        id: `passage-deviation:${edge.id}`,
        kind: "intent-deviation",
        scopeId: null,
        nodeIds: [edge.source, edge.target],
        edgeIds: [edge.id],
        evidence: { passages: passages.map((p) => p.id), reason: "No legal route through planned passages" },
        repairLevel: "placement",
        suggestedActions: ["change-gateway-side", "increase-gap"],
      });
    }
    const simple = simpleRoutes(sources, targets, padded);
    const lowerBound = Math.min(
      ...sources.flatMap((source) =>
        targets.map(
          (target) =>
            Math.abs(source.point.x - target.point.x) +
            Math.abs(source.point.y - target.point.y) +
            portPreferenceCost(edge.source, source.point) +
            portPreferenceCost(edge.target, target.point),
        ),
      ),
    );
    // All other costs are nonnegative: an optimal direct route needs no grid search.
    const candidate = simple.some((points) => cost(points) <= lowerBound + EPSILON)
      ? null
      : findOrthogonalPath(
          sources,
          targets,
          padded,
          extent,
          sharedCost,
          (port) => portPreferenceCost(edge.source, port.point),
          (port) => portPreferenceCost(edge.target, port.point),
        );
    // Inferred gateways are candidate hints. Do not force extra bends through every
    // nested boundary when a clean route already communicates the same connection.
    let normal =
      planned && explicitPassages
        ? [planned]
        : [...simple, ...(candidate ? [candidate] : []), ...(planned ? [planned] : [])];
    if (!normal.length && assigned && !passages.some((p) => p.required)) {
      if (!requiredPort("source")) sources = ports(edge.source);
      if (!requiredPort("target")) targets = ports(edge.target);
      const fallback = findOrthogonalPath(
        sources,
        targets,
        padded,
        extent,
        sharedCost,
        () => 0,
        () => 0,
      );
      normal = [...simpleRoutes(sources, targets, padded), ...(fallback ? [fallback] : [])];
      if (normal.length)
        issues.push({
          id: `endpoint-deviation:${edge.id}`,
          kind: "intent-deviation",
          scopeId: null,
          nodeIds: [edge.source, edge.target],
          edgeIds: [edge.id],
          evidence: { reason: "Endpoint side changed to obtain a legal route" },
          repairLevel: "routing",
          suggestedActions: ["change-port-side"],
        });
    }
    const shortest = Math.min(...normal.map(routeCost));
    const outer =
      !(planned && explicitPassages) && options.outerEdges?.has(edge.id)
        ? outerRoutes(sources, targets, padded, extent).filter((points) => routeCost(points) <= shortest * 1.35 + 48)
        : [];
    const candidates = [
      ...normal.map((points) => ({ points, cost: cost(points) })),
      ...outer.map((points) => ({ points, cost: cost(points) - 96 })),
    ].sort((a, b) => a.cost - b.cost);
    const lineObstacles = [...result.values()].flatMap((route) =>
      route.points.slice(1).map((point, i) => ({
        x: Math.min(point.x, route.points[i].x) - 4,
        y: Math.min(point.y, route.points[i].y) - 4,
        width: Math.abs(point.x - route.points[i].x) + 8,
        height: Math.abs(point.y - route.points[i].y) + 8,
      })),
    );
    if (!candidates.length) throw new Error(`Unable to route between side ports: ${edge.source} → ${edge.target}.`);
    const middle = candidates[0].points[Math.floor(candidates[0].points.length / 2)];
    let chosen = { points: candidates[0].points, labelPosition: { x: middle.x, y: middle.y - 10 } };
    let labelPlaced = false;
    for (const { points } of candidates) {
      const labelPosition =
        showLabels && edge.label
          ? placeLabel(
              edge.label,
              points,
              [...obstacles, ...containers, ...otherLabels, ...lineObstacles, ...portApproaches],
              extent,
              options.labelSizes?.[edge.id],
            )
          : chosen.labelPosition;
      if (labelPosition) {
        chosen = { points, labelPosition };
        labelPlaced = true;
        break;
      }
    }
    if (showLabels && edge.label) {
      if (!labelPlaced) {
        if (passages.some((p) => p.required))
          throw new Error(`No label space on planned route ${edge.id}. Increase channel space or change its gateway.`);
        if (explicitPassages)
          issues.push({
            id: `label-passage-deviation:${edge.id}`,
            kind: "intent-deviation",
            scopeId: null,
            nodeIds: [edge.source, edge.target],
            edgeIds: [edge.id],
            evidence: { reason: "Label requires a separate route lane" },
            repairLevel: "placement",
            suggestedActions: ["increase-channel-space"],
          });
        // Route through an outer label lane; only the canvas grows, never a node or container.
        const size =
          showLabels && edge.label
            ? edgeLabelBox(edge.id, edge.label, { x: 0, y: 0 })
            : { x: 0, y: 0, width: 32, height: 18 };
        const y = extent.y + extent.height + 36;
        const left = extent.x + 36,
          right = Math.max(left + size.width + 24, extent.x + extent.width - 36);
        extent.width = Math.max(extent.width, right - extent.x + 36);
        extent.height = y - extent.y + 36;
        const labelPosition = { x: (left + right) / 2, y };
        const labelObstacle = inflate({ ...size, x: labelPosition.x - size.width / 2, y: labelPosition.y - 10 }, gap);
        const entry: Port = { point: { x: left, y }, stub: { x: left - 20, y }, direction: 2 };
        const exit: Port = { point: { x: right, y }, stub: { x: right + 20, y }, direction: 0 };
        const start = findOrthogonalPath(
          sources,
          [entry],
          [...padded, labelObstacle],
          extent,
          sharedCost,
          (port) => portPreferenceCost(edge.source, port.point),
          () => 0,
        );
        const end = findOrthogonalPath(
          [exit],
          targets,
          [...padded, labelObstacle],
          extent,
          sharedCost,
          () => 0,
          (port) => portPreferenceCost(edge.target, port.point),
        );
        if (!start || !end) throw new Error(`Unable to route label lane: ${edge.source} → ${edge.target}.`);
        chosen = { points: simplifyRoute([...start, ...end]) ?? [...start, ...end], labelPosition };
      }
      if (showLabels && edge.label) labelBoxes.set(edge.id, edgeLabelBox(edge.id, edge.label, chosen.labelPosition));
    }
    accept(chosen);
  }
  return { routes: result, width: extent.width, height: extent.height, issues };
}

export { routeCost } from "./cost";
export type { CompoundRoutingOptions } from "./types";
