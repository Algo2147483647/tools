export type TimelineRoutePoint = { x: number; y: number };
export type TimelineRouteObstacle = { left: number; right: number; top: number; bottom: number };
type Interval = [number, number];

/** A rectilinear visibility grid is used only when the inexpensive route candidates are blocked. */
export function routeAroundTimelineObstacles(
  from: TimelineRoutePoint,
  to: TimelineRoutePoint,
  allObstacles: TimelineRouteObstacle[],
  expanded = false,
): TimelineRoutePoint[] | null {
  const left = Math.min(180, from.x - 24, to.x - 24);
  const right = Math.max(from.x, to.x) + 24;
  const top = expanded
    ? Math.min(from.y, to.y, ...allObstacles.map((box) => box.top)) - 12
    : Math.min(from.y, to.y) - 64;
  const bottom = expanded
    ? Math.max(from.y, to.y, ...allObstacles.map((box) => box.bottom)) + 12
    : Math.max(from.y, to.y) + 64;
  const obstacles = allObstacles.filter(
    (box) => box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom,
  );
  const xs = [
    ...new Set([
      left,
      right,
      from.x,
      to.x,
      ...obstacles.flatMap((box) => [box.left - 3, box.right + 3]).filter((x) => x > left && x < right),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      top,
      bottom,
      from.y,
      to.y,
      ...obstacles.flatMap((box) => [box.top - 3, box.bottom + 3]).filter((y) => y > top && y < bottom),
    ]),
  ].sort((a, b) => a - b);
  const rows = ys.map((y) =>
    mergeIntervals(obstacles.filter((box) => y >= box.top && y <= box.bottom).map((box) => [box.left, box.right])),
  );
  const columns = xs.map((x) =>
    mergeIntervals(obstacles.filter((box) => x >= box.left && x <= box.right).map((box) => [box.top, box.bottom])),
  );
  const width = xs.length;
  const count = width * ys.length * 2;
  const costs = new Float64Array(count).fill(Infinity);
  const parents = new Int32Array(count).fill(-1);
  const start = (ys.indexOf(from.y) * width + xs.indexOf(from.x)) * 2;
  const end = ys.indexOf(to.y) * width + xs.indexOf(to.x);
  const queue = new RouteQueue();
  for (const state of [start, start + 1]) {
    costs[state] = 0;
    queue.push(state, Math.abs(from.x - to.x) + Math.abs(from.y - to.y));
  }
  while (queue.length) {
    const item = queue.pop()!;
    const cell = Math.floor(item.state / 2),
      direction = item.state % 2;
    const xIndex = cell % width,
      yIndex = Math.floor(cell / width);
    const x = xs[xIndex],
      y = ys[yIndex];
    const heuristic = Math.abs(x - to.x) + Math.abs(y - to.y);
    if (item.cost > costs[item.state] + heuristic + 1e-7) continue;
    if (cell === end) {
      const path: TimelineRoutePoint[] = [];
      let state = item.state;
      while (state >= 0) {
        const point = Math.floor(state / 2);
        path.push({ x: xs[point % width], y: ys[Math.floor(point / width)] });
        state = parents[state];
      }
      return simplify(path.reverse());
    }
    for (const [nextX, nextY, nextDirection] of [
      [xIndex - 1, yIndex, 0],
      [xIndex + 1, yIndex, 0],
      [xIndex, yIndex - 1, 1],
      [xIndex, yIndex + 1, 1],
    ]) {
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= ys.length) continue;
      const nx = xs[nextX],
        ny = ys[nextY];
      if (
        nextDirection === 0
          ? blocked(rows[yIndex], Math.min(x, nx), Math.max(x, nx))
          : blocked(columns[xIndex], Math.min(y, ny), Math.max(y, ny))
      )
        continue;
      const nextState = (nextY * width + nextX) * 2 + nextDirection;
      const nextCost = costs[item.state] + Math.abs(nx - x) + Math.abs(ny - y) + (direction === nextDirection ? 0 : 12);
      if (nextCost >= costs[nextState]) continue;
      costs[nextState] = nextCost;
      parents[nextState] = item.state;
      queue.push(nextState, nextCost + Math.abs(nx - to.x) + Math.abs(ny - to.y));
    }
  }
  return expanded ? null : routeAroundTimelineObstacles(from, to, allObstacles, true);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  intervals.sort((a, b) => a[0] - b[0]);
  for (const interval of intervals) {
    const last = result[result.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else result.push(interval);
  }
  return result;
}
function blocked(intervals: Interval[], low: number, high: number): boolean {
  let first = 0,
    last = intervals.length;
  while (first < last) {
    const mid = (first + last) >>> 1;
    if (intervals[mid][1] < low) first = mid + 1;
    else last = mid;
  }
  return first < intervals.length && intervals[first][0] <= high;
}
function simplify(path: TimelineRoutePoint[]): TimelineRoutePoint[] {
  const result: TimelineRoutePoint[] = [];
  for (const point of path) {
    const last = result[result.length - 1],
      before = result[result.length - 2];
    if (last && last.x === point.x && last.y === point.y) continue;
    if (before && ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y)))
      result.pop();
    result.push(point);
  }
  return result;
}
class RouteQueue {
  private values: { state: number; cost: number }[] = [];
  get length() {
    return this.values.length;
  }
  push(state: number, cost: number) {
    const item = { state, cost };
    let index = this.values.length;
    this.values.push(item);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (this.values[parent].cost <= cost) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = item;
  }
  pop() {
    const first = this.values[0],
      last = this.values.pop();
    if (this.values.length && last) {
      let index = 0;
      while (index * 2 + 1 < this.values.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1].cost < this.values[child].cost) child++;
        if (this.values[child].cost >= last.cost) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = last;
    }
    return first;
  }
}
