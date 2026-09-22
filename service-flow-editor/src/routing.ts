import type { FlowEdge, Point, ServiceNode, Side } from './model';

export const PORT_CLEARANCE = 32;
const EPSILON = 0.000001;

const normals: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
const directions = [normals.right, normals.bottom, normals.left, normals.top];

const copy = (point: Point): Point => ({ x: point.x, y: point.y });
const same = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const offset = (point: Point, direction: Point, length: number): Point => ({
  x: point.x + direction.x * length,
  y: point.y + direction.y * length,
});
const directionIndex = (direction: Point): number =>
  directions.findIndex((item) => item.x === direction.x && item.y === direction.y);

export function anchor(node: ServiceNode, side: Side): Point {
  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
  }
}

/** Remove duplicate points and unnecessary straight-line vertices. */
export function simplifyPoints(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (result.length && same(result[result.length - 1], point)) continue;
    result.push(copy(point));
    while (result.length > 2) {
      const [a, b, c] = result.slice(-3);
      const vertical = Math.abs(a.x - b.x) < EPSILON && Math.abs(b.x - c.x) < EPSILON;
      const horizontal = Math.abs(a.y - b.y) < EPSILON && Math.abs(b.y - c.y) < EPSILON;
      if (!vertical && !horizontal) break;
      result.splice(result.length - 2, 1);
      if (result.length > 1 && same(result[result.length - 2], result[result.length - 1])) result.pop();
    }
  }
  return result;
}

export function isOrthogonal(points: Point[]): boolean {
  return points.every(
    (point, index) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      (index === 0 ||
        Math.abs(point.x - points[index - 1].x) < EPSILON ||
        Math.abs(point.y - points[index - 1].y) < EPSILON),
  );
}

function crossesInterior(a: Point, b: Point, node: ServiceNode): boolean {
  if (Math.abs(a.x - b.x) < EPSILON) {
    return (
      a.x > node.x + EPSILON &&
      a.x < node.x + node.width - EPSILON &&
      Math.max(a.y, b.y) > node.y + EPSILON &&
      Math.min(a.y, b.y) < node.y + node.height - EPSILON
    );
  }
  return (
    a.y > node.y + EPSILON &&
    a.y < node.y + node.height - EPSILON &&
    Math.max(a.x, b.x) > node.x + EPSILON &&
    Math.min(a.x, b.x) < node.x + node.width - EPSILON
  );
}

/** A small visibility grid routes around the two endpoint boxes, with no global obstacle search. */
function connectPorts(
  start: Point,
  finish: Point,
  source: ServiceNode,
  target: ServiceNode,
  sourceSide: Side,
  targetSide: Side,
): Point[] {
  const boxes = source.id === target.id ? [source] : [source, target];
  const xs = [
    ...new Set([
      start.x,
      finish.x,
      ...boxes.flatMap((node) => [node.x - PORT_CLEARANCE, node.x + node.width + PORT_CLEARANCE]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      finish.y,
      ...boxes.flatMap((node) => [node.y - PORT_CLEARANCE, node.y + node.height + PORT_CLEARANCE]),
    ]),
  ].sort((a, b) => a - b);
  const width = xs.length;
  const points = ys.flatMap((y) => xs.map((x) => ({ x, y })));
  const startVertex = ys.indexOf(start.y) * width + xs.indexOf(start.x);
  const finishVertex = ys.indexOf(finish.y) * width + xs.indexOf(finish.x);
  const startDirection = directionIndex(normals[sourceSide]);
  const forbiddenArrival = directionIndex(normals[targetSide]);
  const initial = startVertex * 4 + startDirection;
  const cost = new Map<number, number>([[initial, 0]]);
  const previous = new Map<number, number>();
  const pending = new Set<number>([initial]);
  let endState: number | undefined;
  while (pending.size) {
    let current = -1;
    let best = Infinity;
    for (const state of pending) {
      const value = cost.get(state)!;
      if (value < best) {
        current = state;
        best = value;
      }
    }
    pending.delete(current);
    const vertex = Math.floor(current / 4);
    const previousDirection = current % 4;
    if (vertex === finishVertex && previousDirection !== forbiddenArrival && current !== initial) {
      endState = current;
      break;
    }
    if (vertex === finishVertex && startVertex !== finishVertex && previousDirection !== forbiddenArrival) {
      endState = current;
      break;
    }
    const column = vertex % width;
    const row = Math.floor(vertex / width);
    for (let nextDirection = 0; nextDirection < 4; nextDirection++) {
      if (nextDirection === (previousDirection + 2) % 4) continue;
      const vector = directions[nextDirection];
      const nextColumn = column + vector.x;
      const nextRow = row + vector.y;
      if (nextColumn < 0 || nextColumn >= width || nextRow < 0 || nextRow >= ys.length) continue;
      const nextVertex = nextRow * width + nextColumn;
      const nextState = nextVertex * 4 + nextDirection;
      // A large penalty allows a usable path even when endpoint rectangles overlap.
      const crossings = boxes.filter((node) =>
        crossesInterior(points[vertex], points[nextVertex], node),
      ).length;
      const nextCost =
        best +
        distance(points[vertex], points[nextVertex]) +
        (previousDirection === nextDirection ? 0 : 12) +
        crossings * 100000;
      if (nextCost < (cost.get(nextState) ?? Infinity)) {
        cost.set(nextState, nextCost);
        previous.set(nextState, current);
        pending.add(nextState);
      }
    }
  }
  if (endState === undefined) return [copy(start), { x: start.x, y: finish.y }, copy(finish)];
  const route: Point[] = [];
  for (let state: number | undefined = endState; state !== undefined; state = previous.get(state))
    route.push(copy(points[Math.floor(state / 4)]));
  return route.reverse();
}

export function routeEdge(
  source: ServiceNode,
  target: ServiceNode,
  sourceSide: Side = 'right',
  targetSide: Side = 'left',
): Point[] {
  const from = anchor(source, sourceSide);
  const to = anchor(target, targetSide);
  const start = offset(from, normals[sourceSide], PORT_CLEARANCE);
  const finish = offset(to, normals[targetSide], PORT_CLEARANCE);
  return simplifyPoints([from, ...connectPorts(start, finish, source, target, sourceSide, targetSide), to]);
}

function leavesPort(points: Point[], side: Side): boolean {
  if (points.length < 2) return false;
  const delta = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
  const normal = normals[side];
  return (
    Math.abs(delta.x * normal.y - delta.y * normal.x) < EPSILON &&
    delta.x * normal.x + delta.y * normal.y > EPSILON
  );
}

/** Reattach an endpoint while retaining the old interior route wherever possible. */
function reattach(points: Point[], node: ServiceNode, side: Side): Point[] {
  const next = points.map(copy);
  const endpoint = anchor(node, side);
  if (same(endpoint, next[0]) && leavesPort(next, side)) return next;
  const normal = normals[side];
  next[0] = endpoint;
  if (normal.x) next[1].y = endpoint.y;
  else next[1].x = endpoint.x;
  if (leavesPort(next, side) && isOrthogonal(next)) return next;

  const oldJoin = points[1];
  const stub = offset(endpoint, normal, PORT_CLEARANCE);
  const elbow = normal.x ? { x: stub.x, y: oldJoin.y } : { x: oldJoin.x, y: stub.y };
  return [endpoint, stub, elbow, ...points.slice(1).map(copy)];
}

export function reconnectEdge(edge: FlowEdge, source: ServiceNode, target: ServiceNode): Point[] {
  const from = anchor(source, edge.sourceSide);
  const to = anchor(target, edge.targetSide);
  // Do not normalize saved geometry on load: manual paths must round-trip exactly.
  if (
    edge.points.length >= 2 &&
    same(edge.points[0], from) &&
    same(edge.points[edge.points.length - 1], to) &&
    isOrthogonal(edge.points)
  )
    return edge.points.map(copy);
  if (edge.points.length < 4 || !isOrthogonal(edge.points))
    return routeEdge(source, target, edge.sourceSide, edge.targetSide);
  const startAdjusted = reattach(edge.points, source, edge.sourceSide);
  const endAdjusted = reattach(startAdjusted.reverse(), target, edge.targetSide).reverse();
  const candidate = simplifyPoints(endAdjusted);
  if (
    isOrthogonal(candidate) &&
    leavesPort(candidate, edge.sourceSide) &&
    leavesPort([...candidate].reverse(), edge.targetSide)
  )
    return candidate;
  return routeEdge(source, target, edge.sourceSide, edge.targetSide);
}

/** Move one segment parallel to itself; the first and last anchors stay fixed. */
export function moveSegment(points: Point[], index: number, coordinate: number): Point[] {
  if (!Number.isInteger(index) || index < 0 || index >= points.length - 1 || !Number.isFinite(coordinate))
    return points.map(copy);
  const a = points[index];
  const b = points[index + 1];
  if (same(a, b)) return points.map(copy);
  const horizontal = Math.abs(a.y - b.y) < EPSILON;
  if (!horizontal && Math.abs(a.x - b.x) >= EPSILON) return points.map(copy);
  // An adjacent bend may approach a node, but cannot reverse its attachment stub.
  const constrainAtAnchor = (endpoint: Point, corner: Point): void => {
    const origin = horizontal ? endpoint.y : endpoint.x;
    const delta = horizontal ? corner.y - origin : corner.x - origin;
    if (Math.abs(delta) < EPSILON) return;
    const limit = origin + Math.sign(delta) * Math.min(PORT_CLEARANCE, Math.abs(delta));
    coordinate = delta > 0 ? Math.max(coordinate, limit) : Math.min(coordinate, limit);
  };
  if (index === 1) constrainAtAnchor(points[0], a);
  if (index === points.length - 3) constrainAtAnchor(points[points.length - 1], b);
  const movedA = horizontal ? { x: a.x, y: coordinate } : { x: coordinate, y: a.y };
  const movedB = horizontal ? { x: b.x, y: coordinate } : { x: coordinate, y: b.y };
  const direction = horizontal ? { x: Math.sign(b.x - a.x), y: 0 } : { x: 0, y: Math.sign(b.y - a.y) };
  const stubLength = Math.min(PORT_CLEARANCE, distance(a, b) / 3);
  const prefix = points.slice(0, index).map(copy);
  const suffix = points.slice(index + 2).map(copy);
  if (index === 0) {
    const stub = offset(a, direction, stubLength);
    prefix.push(copy(a), stub);
    if (horizontal) movedA.x = stub.x;
    else movedA.y = stub.y;
  } else {
    const previous = points[index - 1];
    // Non-minimal imported paths may have adjacent collinear segments.
    if (horizontal ? Math.abs(previous.y - a.y) < EPSILON : Math.abs(previous.x - a.x) < EPSILON)
      prefix.push(copy(a));
  }
  if (index === points.length - 2) {
    const stub = offset(b, direction, -stubLength);
    if (horizontal) movedB.x = stub.x;
    else movedB.y = stub.y;
    suffix.unshift(stub, copy(b));
  } else {
    const next = points[index + 2];
    if (horizontal ? Math.abs(next.y - b.y) < EPSILON : Math.abs(next.x - b.x) < EPSILON)
      suffix.unshift(copy(b));
  }
  return simplifyPoints([...prefix, movedA, movedB, ...suffix]);
}

/** Insert a rectangular dogleg into a selected segment. */
export function addBend(points: Point[], index: number): Point[] {
  if (!Number.isInteger(index) || index < 0 || index >= points.length - 1) return points.map(copy);
  const a = points[index];
  const b = points[index + 1];
  if (same(a, b)) return points.map(copy);
  const horizontal = Math.abs(a.y - b.y) < EPSILON;
  if (!horizontal && Math.abs(a.x - b.x) >= EPSILON) return points.map(copy);
  const first = { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
  const second = { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 };
  const detour = horizontal ? { x: 0, y: 40 } : { x: 40, y: 0 };
  return simplifyPoints([
    ...points.slice(0, index + 1),
    first,
    offset(first, detour, 1),
    offset(second, detour, 1),
    second,
    ...points.slice(index + 1),
  ]);
}

/** SVG path with strictly horizontal/vertical straight sections and quadratic rounded corners. */
export function roundedPath(points: Point[], radius = 12): string {
  const clean = simplifyPoints(points);
  if (!clean.length) return '';
  const format = (value: number): string => String(Math.round(value * 1000) / 1000);
  const xy = (point: Point): string => `${format(point.x)} ${format(point.y)}`;
  const commands = [`M ${xy(clean[0])}`];
  for (let index = 1; index < clean.length - 1; index++) {
    const previous = clean[index - 1];
    const corner = clean[index];
    const next = clean[index + 1];
    const previousLength = distance(previous, corner);
    const nextLength = distance(corner, next);
    const amount = Math.max(0, Math.min(radius, previousLength / 2, nextLength / 2));
    const incoming = {
      x: (corner.x - previous.x) / previousLength,
      y: (corner.y - previous.y) / previousLength,
    };
    const outgoing = { x: (next.x - corner.x) / nextLength, y: (next.y - corner.y) / nextLength };
    const before = offset(corner, incoming, -amount);
    const after = offset(corner, outgoing, amount);
    commands.push(`L ${xy(before)}`);
    if (amount) commands.push(`Q ${xy(corner)} ${xy(after)}`);
  }
  if (clean.length > 1) commands.push(`L ${xy(clean[clean.length - 1])}`);
  return commands.join(' ');
}
