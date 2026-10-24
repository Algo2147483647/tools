type Point = { x: number; y: number };
import type { CompoundProjection } from "../graph/compoundProjection";
import type { CompoundBox, CompoundRoute } from "./compound-routes";
import { estimateTextWidth } from "./text";

interface Port {
  point: Point;
  stub: Point;
  /** Outward direction: east, south, west, north. */
  direction: number;
}
const EPSILON = 0.001;
const BEND_COST = 20;
const MIN_STRAIGHT = 20;
const LANE_GAP = 16;

export interface CompoundRoutingOptions {
  reverseOrder?: boolean;
  fixedRoutes?: Map<string, CompoundRoute>;
  outerEdges?: Set<string>;
  portSides?: Map<string, { source?: number; target?: number }>;
  labelSizes?: Record<string, { width: number; height: number }>;
}

const inside = (point: Point, box: CompoundBox) =>
  point.x > box.x + EPSILON &&
  point.x < box.x + box.width - EPSILON &&
  point.y > box.y + EPSILON &&
  point.y < box.y + box.height - EPSILON;
const inflate = (box: CompoundBox, gap: number): CompoundBox => ({
  x: box.x - gap,
  y: box.y - gap,
  width: box.width + gap * 2,
  height: box.height + gap * 2,
});
const overlaps = (a: CompoundBox, b: CompoundBox) =>
  a.x < b.x + b.width - EPSILON &&
  b.x < a.x + a.width - EPSILON &&
  a.y < b.y + b.height - EPSILON &&
  b.y < a.y + a.height - EPSILON;

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

function crossingCost(a: Point, b: Point, points: Point[]): number {
  let cost = 0;
  for (let i = 1; i < points.length; i++) {
    const c = points[i - 1],
      d = points[i];
    const horizontal = a.y === b.y;
    if (horizontal === (c.y === d.y)) continue;
    const along = horizontal ? c.x : c.y,
      across = horizontal ? a.y : a.x;
    const from = horizontal ? a.x : a.y,
      to = horizontal ? b.x : b.y,
      otherFrom = horizontal ? c.y : c.x,
      otherTo = horizontal ? d.y : d.x;
    if (
      along >= Math.min(from, to) - EPSILON &&
      along <= Math.max(from, to) + EPSILON &&
      across >= Math.min(otherFrom, otherTo) - EPSILON &&
      across <= Math.max(otherFrom, otherTo) + EPSILON
    ) {
      // The visibility grid splits segments at crossings. Two half charges at a grid
      // vertex must equal one interior crossing, rather than making it free to cross.
      const end = Math.abs(along - from) < EPSILON || Math.abs(along - to) < EPSILON;
      const otherEnd = Math.abs(across - otherFrom) < EPSILON || Math.abs(across - otherTo) < EPSILON;
      cost += 160 * (end ? 0.5 : 1) * (otherEnd ? 0.5 : 1);
    }
  }
  return cost;
}

/** Prefer the midpoint, then offer distinct ports clear of rounded card corners. */
function sidePorts(box: CompoundBox, clearance: number, degree: number): Port[] {
  return [0, 1, 2, 3].flatMap((direction) => {
    const sideLength = direction % 2 ? box.width : box.height;
    const count = Math.min(2, degree - 1, Math.floor((sideLength / 2 - 12) / LANE_GAP));
    const offsets = [0];
    for (let i = 1; i <= count; i++) offsets.push(-i * LANE_GAP, i * LANE_GAP);
    return offsets.flatMap((offset) => {
      const point = [
        { x: box.x + box.width, y: box.y + box.height / 2 + offset },
        { x: box.x + box.width / 2 + offset, y: box.y + box.height },
        { x: box.x, y: box.y + box.height / 2 + offset },
        { x: box.x + box.width / 2 + offset, y: box.y },
      ][direction];
      return [...new Set([MIN_STRAIGHT, clearance])].map((length) => ({
        point,
        direction,
        stub: {
          x: point.x + (direction === 0 ? length : direction === 2 ? -length : 0),
          y: point.y + (direction === 1 ? length : direction === 3 ? -length : 0),
        },
      }));
    });
  });
}

function crossesBox(a: Point, b: Point, box: CompoundBox): boolean {
  return a.x === b.x
    ? a.x > box.x + EPSILON &&
        a.x < box.x + box.width - EPSILON &&
        Math.max(a.y, b.y) > box.y + EPSILON &&
        Math.min(a.y, b.y) < box.y + box.height - EPSILON
    : a.y > box.y + EPSILON &&
        a.y < box.y + box.height - EPSILON &&
        Math.max(a.x, b.x) > box.x + EPSILON &&
        Math.min(a.x, b.x) < box.x + box.width - EPSILON;
}

function simplifyRoute(points: Point[]): Point[] | null {
  const result: Point[] = [];
  for (const point of points) {
    const b = result[result.length - 1],
      a = result[result.length - 2];
    if (b && Math.hypot(b.x - point.x, b.y - point.y) < EPSILON) continue;
    if (a && b && ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) {
      if ((b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) < 0) return null;
      result.pop();
    }
    result.push(point);
  }
  return result;
}

/** Try clean one-/two-bend routes as well as the visibility search, so tiny jogs need not win by length. */
function simpleRoutes(sources: Port[], targets: Port[], obstacles: CompoundBox[]): Point[][] {
  const result: Point[][] = [];
  const seen = new Set<string>();
  for (const source of sources)
    for (const target of targets) {
      // A straight connection may be shorter than two endpoint stubs; do not force a dogleg in a narrow gap.
      const dx = target.point.x - source.point.x,
        dy = target.point.y - source.point.y;
      const directDirection =
        Math.abs(dx) < EPSILON ? (dy > 0 ? 1 : 3) : Math.abs(dy) < EPSILON ? (dx > 0 ? 0 : 2) : -1;
      if (
        directDirection === source.direction &&
        (directDirection + 2) % 4 === target.direction &&
        !obstacles.some(
          (box) =>
            !inside(source.point, box) && !inside(target.point, box) && crossesBox(source.point, target.point, box),
        )
      )
        result.push([source.point, target.point]);
      const a = source.stub,
        b = target.stub;
      for (const middle of [
        [{ x: a.x, y: b.y }],
        [{ x: b.x, y: a.y }],
        [
          { x: (a.x + b.x) / 2, y: a.y },
          { x: (a.x + b.x) / 2, y: b.y },
        ],
        [
          { x: a.x, y: (a.y + b.y) / 2 },
          { x: b.x, y: (a.y + b.y) / 2 },
        ],
      ]) {
        const trunk = [a, ...middle, b];
        const points = simplifyRoute([source.point, ...trunk, target.point]);
        if (points && !trunk.slice(1).some((point, i) => obstacles.some((box) => crossesBox(trunk[i], point, box)))) {
          const key = JSON.stringify(points);
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(points);
        }
      }
    }
  return result;
}

function parallelRouteCost(a: Point, b: Point, route: Point[]): number {
  const horizontal = a.y === b.y;
  let cost = 0;
  for (let i = 1; i < route.length; i++) {
    const c = route[i - 1],
      d = route[i];
    if ((c.y === d.y) !== horizontal) continue;
    const gap = Math.abs(horizontal ? a.y - c.y : a.x - c.x);
    const overlap = horizontal
      ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
      : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    if (overlap > 0 && gap < LANE_GAP) cost += overlap * (1 - gap / LANE_GAP) * 4;
  }
  return cost;
}

function labelBox(label: string, position: Point): CompoundBox {
  const width = Math.max(label.length * 7 + 12, estimateTextWidth(label, 10) + 14);
  return { x: position.x - width / 2, y: position.y - 10, width, height: 18 };
}

function placeLabel(
  label: string,
  points: Point[],
  obstacles: CompoundBox[],
  extent: CompoundBox,
  measuredSize?: { width: number; height: number },
): Point | null {
  const segments = points
    .slice(1)
    .map((b, i) => ({ a: points[i], b, length: Math.abs(b.x - points[i].x) + Math.abs(b.y - points[i].y) }))
    .sort((a, b) => b.length - a.length);
  for (const { a, b } of segments)
    for (const fraction of [0.5, 0.25, 0.75]) {
      const position = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
      const box = measuredSize
        ? { x: position.x - measuredSize.width / 2, y: position.y - 10, ...measuredSize }
        : labelBox(label, position);
      if (
        box.x >= extent.x &&
        box.y >= extent.y &&
        box.x + box.width <= extent.x + extent.width &&
        box.y + box.height <= extent.y + extent.height &&
        !obstacles.some((obstacle) => overlaps(box, obstacle))
      )
        return position;
    }
  return null;
}

export function routeCost(points: readonly Point[]): number {
  let length = 0,
    bends = 0,
    shortSegments = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    length += segment;
    if (points.length > 2) shortSegments += Math.max(0, MIN_STRAIGHT - segment) * 2;
    if (
      i > 1 &&
      Math.abs(
        (points[i - 1].x - points[i - 2].x) * (points[i].y - points[i - 1].y) -
          (points[i - 1].y - points[i - 2].y) * (points[i].x - points[i - 1].x),
      ) > EPSILON
    )
      bends++;
  }
  return length + bends * BEND_COST + shortSegments;
}

/** A rectilinear visibility grid with multi-source A*: endpoints and approach directions are free. */
function findOrthogonalPath(
  sources: Port[],
  targets: Port[],
  obstacles: CompoundBox[],
  extent: CompoundBox,
  segmentCost: (a: Point, b: Point) => number,
  sourceCost: (port: Port) => number,
  targetCost: (port: Port) => number,
): Point[] | null {
  if (!sources.length || !targets.length) return null;
  const coordinates = (axis: "x" | "y") =>
    [
      ...new Set(
        [
          extent[axis],
          extent[axis] + (axis === "x" ? extent.width : extent.height),
          ...[...sources, ...targets].map((port) => port.stub[axis]),
          ...obstacles.flatMap((box) => [box[axis], box[axis] + (axis === "x" ? box.width : box.height)]),
        ].filter(
          (value) => value >= extent[axis] && value <= extent[axis] + (axis === "x" ? extent.width : extent.height),
        ),
      ),
    ].sort((a, b) => a - b);
  const xs = coordinates("x"),
    ys = coordinates("y");
  const width = xs.length,
    height = ys.length;
  const horizontal = new Uint8Array(width * height),
    vertical = new Uint8Array(width * height);
  const xIndex = new Map(xs.map((x, i) => [x, i])),
    yIndex = new Map(ys.map((y, i) => [y, i]));
  for (const box of obstacles) {
    for (let y = 0; y < height; y++) {
      if (ys[y] < box.y - EPSILON || ys[y] > box.y + box.height + EPSILON) continue;
      for (let x = 0; x < width; x++) {
        if (xs[x] < box.x - EPSILON || xs[x] > box.x + box.width + EPSILON) continue;
        const id = y * width + x;
        if (
          x + 1 < width &&
          ys[y] > box.y + EPSILON &&
          ys[y] < box.y + box.height - EPSILON &&
          xs[x] < box.x + box.width - EPSILON &&
          xs[x + 1] > box.x + EPSILON
        )
          horizontal[id] = 1;
        if (
          y + 1 < height &&
          xs[x] > box.x + EPSILON &&
          xs[x] < box.x + box.width - EPSILON &&
          ys[y] < box.y + box.height - EPSILON &&
          ys[y + 1] > box.y + EPSILON
        )
          vertical[id] = 1;
      }
    }
  }
  const at = (point: Point) => yIndex.get(point.y)! * width + xIndex.get(point.x)!;
  const targetCells = new Map(targets.map((port, index) => [at(port.stub), index]));
  const distance = new Float64Array(width * height * 4).fill(Infinity);
  const previous = new Int32Array(distance.length).fill(-1);
  const queue = new MinQueue();
  const heuristic = (cell: number) =>
    Math.min(
      ...targets.map(
        (port) => Math.abs(xs[cell % width] - port.stub.x) + Math.abs(ys[Math.floor(cell / width)] - port.stub.y),
      ),
    );
  sources.forEach((port, index) => {
    const cell = at(port.stub),
      state = cell * 4 + port.direction;
    const initial =
      sourceCost(port) +
      Math.hypot(port.point.x - port.stub.x, port.point.y - port.stub.y) +
      segmentCost(port.point, port.stub);
    if (initial >= distance[state]) return;
    distance[state] = initial;
    previous[state] = -index - 2;
    queue.push(state, distance[state] + heuristic(cell));
  });
  let best = Infinity,
    endState = -1,
    endPort = -1;
  while (queue.length) {
    const { state, score } = queue.pop()!;
    if (score >= best) break;
    const cell = Math.floor(state / 4),
      direction = state % 4;
    const cost = distance[state];
    if (score > cost + heuristic(cell) + EPSILON) continue;
    const target = targetCells.get(cell);
    if (target !== undefined && direction !== targets[target].direction) {
      const total =
        cost +
        (direction === (targets[target].direction + 2) % 4 ? 0 : BEND_COST) +
        targetCost(targets[target]) +
        Math.hypot(targets[target].point.x - targets[target].stub.x, targets[target].point.y - targets[target].stub.y) +
        segmentCost(targets[target].stub, targets[target].point);
      if (total < best) {
        best = total;
        endState = state;
        endPort = target;
      }
    }
    const x = cell % width,
      y = Math.floor(cell / width);
    const visit = (nextCell: number, nextDirection: number, length: number) => {
      if ((direction + 2) % 4 === nextDirection) return;
      const nextState = nextCell * 4 + nextDirection;
      const nextCost =
        cost +
        length +
        (direction === nextDirection ? 0 : BEND_COST) +
        segmentCost({ x: xs[x], y: ys[y] }, { x: xs[nextCell % width], y: ys[Math.floor(nextCell / width)] });
      if (nextCost >= distance[nextState] - EPSILON) return;
      distance[nextState] = nextCost;
      previous[nextState] = state;
      queue.push(nextState, nextCost + heuristic(nextCell));
    };
    if (x + 1 < width && !horizontal[cell]) visit(cell + 1, 0, xs[x + 1] - xs[x]);
    if (x > 0 && !horizontal[cell - 1]) visit(cell - 1, 2, xs[x] - xs[x - 1]);
    if (y + 1 < height && !vertical[cell]) visit(cell + width, 1, ys[y + 1] - ys[y]);
    if (y > 0 && !vertical[cell - width]) visit(cell - width, 3, ys[y] - ys[y - 1]);
  }
  if (endState < 0) return null;
  const reversed: Point[] = [targets[endPort].point];
  let state = endState;
  while (state >= 0) {
    const cell = Math.floor(state / 4);
    reversed.push({ x: xs[cell % width], y: ys[Math.floor(cell / width)] });
    const parent = previous[state];
    if (parent < -1) reversed.push(sources[-parent - 2].point);
    state = parent;
  }
  return simplifyRoute(reversed.reverse());
}

class MinQueue {
  private entries: { state: number; score: number }[] = [];
  get length() {
    return this.entries.length;
  }
  push(state: number, score: number) {
    const value = { state, score };
    let index = this.entries.length;
    this.entries.push(value);
    while (index) {
      const parent = Math.floor((index - 1) / 2);
      if (this.entries[parent].score <= score) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = value;
  }
  pop() {
    const first = this.entries[0],
      last = this.entries.pop();
    if (last && this.entries.length) {
      let index = 0;
      while (index * 2 + 1 < this.entries.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.entries.length && this.entries[child + 1].score < this.entries[child].score) child++;
        if (this.entries[child].score >= last.score) break;
        this.entries[index] = this.entries[child];
        index = child;
      }
      this.entries[index] = last;
    }
    return first;
  }
}
