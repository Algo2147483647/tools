import type { CompoundProjection } from "../../../graph/compound/projection";
import type { CompoundBox, CompoundRoute } from "../../../graph/compound/geometry";
import { crossingCost, parallelRouteCost, routeCost } from "./cost";
import { crossesBox, inflate, inside, simplifyRoute } from "./geometry";
import { labelBox, placeLabel } from "./labels";
import { sidePorts } from "./ports";
import { findOrthogonalPath, simpleRoutes } from "./search";
import { EPSILON, LANE_GAP, type CompoundRoutingOptions, type Point, type Port } from "./types";

/** Choose separated side ports after placement; routing never moves node rectangles. */
export function routeCompoundEdges(
  projection: CompoundProjection,
  boxes: Map<string, CompoundBox>,
  bounds: CompoundBox,
  showLabels: boolean,
  options: CompoundRoutingOptions = {},
): { routes: Map<string, CompoundRoute>; width: number; height: number } {
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
  const edges = [...projection.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (options.reverseOrder) edges.reverse();
  const attachments = new Map<string, Point[]>();
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
    for (const [id, point] of [
      [edge.source, fixed.points[0]],
      [edge.target, fixed.points[fixed.points.length - 1]],
    ] as const)
      attachments.set(id, [...(attachments.get(id) ?? []), point]);
    if (showLabels && edge.label) labelBoxes.set(edge.id, edgeLabelBox(edge.id, edge.label, fixed.labelPosition));
  }
  for (const edge of edges) {
    if (options.fixedRoutes?.has(edge.id)) continue;
    const accept = (route: CompoundRoute) => {
      result.set(edge.id, route);
      for (const [id, point] of [
        [edge.source, route.points[0]],
        [edge.target, route.points[route.points.length - 1]],
      ] as const)
        attachments.set(id, [...(attachments.get(id) ?? []), point]);
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
        return [{ ...box, height: Math.min(40, box.height) }];
      });
    const padded = [...obstacles, ...otherLabels, ...containers].map((box) => inflate(box, gap));
    const ports = (id: string): Port[] => {
      const box = boxes.get(id)!;
      return sidePorts(box, gap, degree.get(id) ?? 1).filter(
        (port) =>
          !padded.some((box) => inside(port.stub, box)) &&
          !padded.some((box) => !inside(port.point, box) && crossesBox(port.point, port.stub, box)) &&
          port.stub.x >= extent.x &&
          port.stub.y >= extent.y &&
          port.stub.x <= extent.x + extent.width &&
          port.stub.y <= extent.y + extent.height,
      );
    };
    const sharedCost = (a: Point, b: Point) =>
      [...result.values()].reduce(
        (sum, route) => sum + parallelRouteCost(a, b, route.points) + crossingCost(a, b, route.points),
        0,
      );
    const attachmentCost = (id: string, point: Point) =>
      (attachments.get(id) ?? []).reduce(
        (sum, used) => sum + Math.max(0, LANE_GAP - Math.hypot(point.x - used.x, point.y - used.y)) * 4,
        portPreferenceCost(id, point),
      );
    function portPreferenceCost(id: string, point: Point) {
      const side = options.portSides?.get(edge.id)?.[id === edge.source ? "source" : "target"];
      if (side === undefined) return 0;
      const box = boxes.get(id)!;
      const onSide = [box.x + box.width, box.y + box.height, box.x, box.y][side];
      return Math.abs((side % 2 ? point.y : point.x) - onSide) < EPSILON ? 0 : 200;
    }
    const cost = (points: Point[]) =>
      routeCost(points) +
      attachmentCost(edge.source, points[0]) +
      attachmentCost(edge.target, points[points.length - 1]) +
      points.slice(1).reduce((sum, point, i) => sum + sharedCost(points[i], point), 0);
    const sources = ports(edge.source),
      targets = ports(edge.target);
    const candidate = findOrthogonalPath(
      sources,
      targets,
      padded,
      extent,
      sharedCost,
      (port) => attachmentCost(edge.source, port.point),
      (port) => attachmentCost(edge.target, port.point),
    );
    const candidates = [...simpleRoutes(sources, targets, padded), ...(candidate ? [candidate] : [])]
      .map((points) => ({ points, cost: cost(points) }))
      .sort((a, b) => a.cost - b.cost);
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
              [...obstacles, ...containers, ...otherLabels, ...lineObstacles],
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
    if ((showLabels && edge.label) || options.outerEdges?.has(edge.id)) {
      if (!labelPlaced || options.outerEdges?.has(edge.id)) {
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
          (port) => attachmentCost(edge.source, port.point),
          () => 0,
        );
        const end = findOrthogonalPath(
          [exit],
          targets,
          [...padded, labelObstacle],
          extent,
          sharedCost,
          () => 0,
          (port) => attachmentCost(edge.target, port.point),
        );
        if (!start || !end) throw new Error(`Unable to route label lane: ${edge.source} → ${edge.target}.`);
        chosen = { points: simplifyRoute([...start, ...end]) ?? [...start, ...end], labelPosition };
      }
      if (showLabels && edge.label) labelBoxes.set(edge.id, edgeLabelBox(edge.id, edge.label, chosen.labelPosition));
    }
    accept(chosen);
  }
  return { routes: result, width: extent.width, height: extent.height };
}

export { routeCost } from "./cost";
export type { CompoundRoutingOptions } from "./types";
