import type { CompoundBox } from "../../../graph/compound/geometry";
import { crossesBox, inside, simplifyRoute } from "./geometry";
import { BEND_COST, EPSILON, type Point, type Port } from "./types";

/** Try clean one-/two-bend routes as well as the visibility search, so tiny jogs need not win by length. */
export function simpleRoutes(sources: Port[], targets: Port[], obstacles: CompoundBox[]): Point[][] {
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

/** A rectilinear visibility grid with multi-source A*: endpoints and approach directions are free. */
export function findOrthogonalPath(
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
