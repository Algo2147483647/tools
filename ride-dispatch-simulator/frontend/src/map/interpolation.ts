import type { Point, RoadNetwork, Vehicle } from '../types';

export interface DisplayPath {
  points: Point[];
  lengths: number[];
  length: number;
  heading: number;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function onSegment(point: Point, a: Point, b: Point) {
  return Math.abs(distance(a, point) + distance(point, b) - distance(a, b)) < 0.02;
}

/** Read the server's route geometry between two observations; never plan a route or extrapolate. */
export function observedPath(
  previous: Vehicle | undefined,
  current: Vehicle,
  network: RoadNetwork,
): DisplayPath {
  const snap = (): DisplayPath => ({
    points: [{ x: current.x, y: current.y }],
    lengths: [],
    length: 0,
    heading: current.heading,
  });
  if (!previous || distance(previous, current) < 0.001 || !previous.route.length) return snap();
  const ids = previous.route.slice(previous.routeIndex);
  // A pickup can join a trip route inside a telemetry interval, but only at a shared junction.
  if (current.route.length && ids.at(-1) === current.route[0]) ids.push(...current.route.slice(1));
  let startSegment = -1;
  let endSegment = -1;
  for (let i = 0; i < ids.length - 1; i++) {
    const a = network.nodes[ids[i]],
      b = network.nodes[ids[i + 1]];
    if (!a || !b) return snap();
    if (startSegment === -1 && onSegment(previous, a, b)) startSegment = i;
    if (startSegment !== -1 && onSegment(current, a, b)) {
      // The same edge must move forwards, never across an unobserved reset or U-turn.
      if (i === startSegment && distance(a, current) + 0.01 < distance(a, previous)) continue;
      endSegment = i;
      break;
    }
  }
  if (startSegment < 0 || endSegment < startSegment) return snap();
  const points: Point[] = [{ x: previous.x, y: previous.y }];
  for (let i = startSegment + 1; i <= endSegment; i++) points.push(network.nodes[ids[i]]);
  points.push({ x: current.x, y: current.y });
  const lengths = points.slice(1).map((point, i) => distance(points[i], point));
  return {
    points,
    lengths,
    length: lengths.reduce((sum, value) => sum + value, 0),
    heading: current.heading,
  };
}

/** Pure presentation interpolation, clamped to the latest authoritative observation. */
export function samplePath(path: DisplayPath, fraction: number): Point & { heading: number } {
  if (!path.length) return { ...path.points[0], heading: path.heading };
  let remaining = Math.max(0, Math.min(1, fraction)) * path.length;
  for (let i = 0; i < path.lengths.length; i++) {
    const length = path.lengths[i];
    if (remaining <= length || i === path.lengths.length - 1) {
      const a = path.points[i],
        b = path.points[i + 1];
      const t = length ? Math.min(1, remaining / length) : 1;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        heading: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    remaining -= length;
  }
  return { ...path.points.at(-1)!, heading: path.heading };
}
