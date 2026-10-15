import type { ElkPoint } from "elkjs/lib/elk-api";
import type { CompoundProjection } from "../graph/compoundProjection";
import type { CompoundBox, CompoundRoute } from "./compound-routes";
import { estimateTextWidth } from "./text";

interface Port {
  point: ElkPoint;
  stub: ElkPoint;
  axis: number;
}
const EPSILON = 0.001;
const BEND_COST = 20;

const inside = (point: ElkPoint, box: CompoundBox) =>
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

/** Final routing is independent of the direction chosen for node placement. All four sides are eligible. */
export function shortenCompoundRoutes(
  projection: CompoundProjection,
  boxes: Map<string, CompoundBox>,
  routes: Map<string, CompoundRoute>,
  bounds: CompoundBox,
  showLabels: boolean,
): Map<string, CompoundRoute> {
  const items = new Map(projection.items.map((item) => [item.id, item]));
  const groups = projection.items.filter((item) => item.kind === "group" && !item.collapsed);
  const leaves = projection.items.filter((item) => item.kind !== "group" || item.collapsed);
  const ancestry = (id: string) => {
    const path: string[] = [];
    let parent = items.get(id)?.parentId;
    while (parent) {
      path.push(parent);
      parent = items.get(parent)?.parentId;
    }
    return path;
  };
  const edges = [...projection.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const incidents = new Map<string, string[]>();
  for (const edge of edges)
    for (const id of [edge.source, edge.target]) incidents.set(id, [...(incidents.get(id) ?? []), edge.id]);
  const labelBoxes = new Map<string, CompoundBox>();
  if (showLabels)
    for (const edge of edges) {
      if (edge.label) labelBoxes.set(edge.id, labelBox(edge.label, routes.get(edge.id)!.labelPosition));
    }
  const result = new Map<string, CompoundRoute>();
  for (const edge of edges) {
    const original = routes.get(edge.id)!;
    const sourceAncestors = ancestry(edge.source),
      targetAncestors = ancestry(edge.target);
    const allowed = new Set([...sourceAncestors, ...targetAncestors]);
    const common = sourceAncestors.find((id) => targetAncestors.includes(id));
    const extent = common ? boxes.get(common)! : bounds;
    // A solid unrelated container also blocks all its descendants; omit those redundant obstacles.
    const blockedGroups = new Set(
      groups
        .filter((item) => !allowed.has(item.id) && (!item.parentId || allowed.has(item.parentId)))
        .map((item) => item.id),
    );
    const obstacles = [
      ...leaves
        .filter((item) => !ancestry(item.id).some((id) => blockedGroups.has(id)))
        .map((item) => boxes.get(item.id)!),
      ...groups
        .filter((item) => allowed.has(item.id) || blockedGroups.has(item.id))
        .map((item) => (allowed.has(item.id) ? { ...boxes.get(item.id)!, height: 50 } : boxes.get(item.id)!)),
    ].filter((box) => overlaps(inflate(box, 8), extent));
    const otherLabels = [...labelBoxes].filter(([id]) => id !== edge.id).map(([, box]) => box);
    const gap = 8;
    const padded = [...obstacles, ...otherLabels].map((box) => inflate(box, gap));
    const ports = (id: string): Port[] => {
      const box = boxes.get(id)!;
      const attached = incidents.get(id)!;
      const fraction = (attached.indexOf(edge.id) + 1) / (attached.length + 1);
      const x = box.x + 16 + (box.width - 32) * fraction;
      const y = box.y + 16 + (box.height - 32) * fraction;
      return [
        { point: { x: box.x, y }, stub: { x: box.x - gap, y }, axis: 0 },
        { point: { x: box.x + box.width, y }, stub: { x: box.x + box.width + gap, y }, axis: 0 },
        { point: { x, y: box.y }, stub: { x, y: box.y - gap }, axis: 1 },
        { point: { x, y: box.y + box.height }, stub: { x, y: box.y + box.height + gap }, axis: 1 },
      ].filter(
        (port) =>
          !padded.some((box) => inside(port.stub, box)) &&
          port.stub.x >= extent.x &&
          port.stub.y >= extent.y &&
          port.stub.x <= extent.x + extent.width &&
          port.stub.y <= extent.y + extent.height,
      );
    };
    const candidate = findOrthogonalPath(ports(edge.source), ports(edge.target), padded, extent);
    if (!candidate || routeCost(candidate) >= routeCost(original.points) - EPSILON) {
      result.set(edge.id, original);
      continue;
    }
    let labelPosition = original.labelPosition;
    if (showLabels && edge.label) {
      const placement = placeLabel(edge.label, candidate, [...obstacles, ...otherLabels], extent);
      // Keep the valid ELK path if a visible label cannot fit safely on the shortened route.
      if (!placement) {
        result.set(edge.id, original);
        continue;
      }
      labelPosition = placement;
      labelBoxes.set(edge.id, labelBox(edge.label, placement));
    }
    result.set(edge.id, { points: candidate, labelPosition });
  }
  return result;
}

function labelBox(label: string, position: ElkPoint): CompoundBox {
  const width = Math.max(label.length * 7 + 12, estimateTextWidth(label, 10) + 14);
  return { x: position.x - width / 2, y: position.y - 10, width, height: 18 };
}

function placeLabel(label: string, points: ElkPoint[], obstacles: CompoundBox[], extent: CompoundBox): ElkPoint | null {
  const segments = points
    .slice(1)
    .map((b, i) => ({ a: points[i], b, length: Math.abs(b.x - points[i].x) + Math.abs(b.y - points[i].y) }))
    .sort((a, b) => b.length - a.length);
  for (const { a, b } of segments)
    for (const fraction of [0.5, 0.25, 0.75]) {
      const position = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
      const box = labelBox(label, position);
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

export function routeCost(points: readonly ElkPoint[]): number {
  let length = 0,
    bends = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    if (
      i > 1 &&
      Math.abs(
        (points[i - 1].x - points[i - 2].x) * (points[i].y - points[i - 1].y) -
          (points[i - 1].y - points[i - 2].y) * (points[i].x - points[i - 1].x),
      ) > EPSILON
    )
      bends++;
  }
  return length + bends * BEND_COST;
}

/** A rectilinear visibility grid with multi-source A*: endpoints and approach directions are free. */
function findOrthogonalPath(
  sources: Port[],
  targets: Port[],
  obstacles: CompoundBox[],
  extent: CompoundBox,
): ElkPoint[] | null {
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
  const at = (point: ElkPoint) => yIndex.get(point.y)! * width + xIndex.get(point.x)!;
  const targetCells = new Map(targets.map((port, index) => [at(port.stub), index]));
  const distance = new Float64Array(width * height * 2).fill(Infinity);
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
      state = cell * 2 + port.axis;
    distance[state] = 0;
    previous[state] = -index - 2;
    queue.push(state, heuristic(cell));
  });
  let best = Infinity,
    endState = -1,
    endPort = -1;
  while (queue.length) {
    const { state, score } = queue.pop()!;
    if (score >= best) break;
    const cell = Math.floor(state / 2),
      axis = state % 2;
    const cost = distance[state];
    if (score > cost + heuristic(cell) + EPSILON) continue;
    const target = targetCells.get(cell);
    if (target !== undefined) {
      const total = cost + (axis === targets[target].axis ? 0 : BEND_COST);
      if (total < best) {
        best = total;
        endState = state;
        endPort = target;
      }
    }
    const x = cell % width,
      y = Math.floor(cell / width);
    const visit = (nextCell: number, nextAxis: number, length: number) => {
      const nextState = nextCell * 2 + nextAxis;
      const nextCost = cost + length + (axis === nextAxis ? 0 : BEND_COST);
      if (nextCost >= distance[nextState] - EPSILON) return;
      distance[nextState] = nextCost;
      previous[nextState] = state;
      queue.push(nextState, nextCost + heuristic(nextCell));
    };
    if (x + 1 < width && !horizontal[cell]) visit(cell + 1, 0, xs[x + 1] - xs[x]);
    if (x > 0 && !horizontal[cell - 1]) visit(cell - 1, 0, xs[x] - xs[x - 1]);
    if (y + 1 < height && !vertical[cell]) visit(cell + width, 1, ys[y + 1] - ys[y]);
    if (y > 0 && !vertical[cell - width]) visit(cell - width, 1, ys[y] - ys[y - 1]);
  }
  if (endState < 0) return null;
  const reversed: ElkPoint[] = [targets[endPort].point];
  let state = endState;
  while (state >= 0) {
    const cell = Math.floor(state / 2);
    reversed.push({ x: xs[cell % width], y: ys[Math.floor(cell / width)] });
    const parent = previous[state];
    if (parent < -1) reversed.push(sources[-parent - 2].point);
    state = parent;
  }
  const simplified: ElkPoint[] = [];
  for (const point of reversed.reverse()) {
    const b = simplified[simplified.length - 1],
      a = simplified[simplified.length - 2];
    if (b && Math.abs(b.x - point.x) + Math.abs(b.y - point.y) < EPSILON) continue;
    if (a && b && ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) simplified.pop();
    simplified.push(point);
  }
  return simplified;
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
