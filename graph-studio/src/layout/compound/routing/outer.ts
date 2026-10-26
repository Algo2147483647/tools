import type { CompoundBox } from "../../../graph/compound/geometry";
import { crossesBox, simplifyRoute } from "./geometry";
import type { Point, Port } from "./types";
import { ObstacleIndex } from "./spatial-index";
import { uniquePorts } from "./ports";

/** Nearby exterior corridors compete with ordinary routes; they never enlarge the canvas. */
export function outerRoutes(
  sources: Port[],
  targets: Port[],
  obstacles: CompoundBox[],
  extent: CompoundBox,
  index = new ObstacleIndex(obstacles),
): Point[][] {
  if (!sources.length || !targets.length) return [];
  const points = [...sources, ...targets].map((p) => p.stub);
  const xs = [
    Math.max(extent.x, Math.min(...points.map((p) => p.x)) - 16),
    Math.min(extent.x + extent.width, Math.max(...points.map((p) => p.x)) + 16),
  ];
  const ys = [
    Math.max(extent.y, Math.min(...points.map((p) => p.y)) - 16),
    Math.min(extent.y + extent.height, Math.max(...points.map((p) => p.y)) + 16),
  ];
  const result: Point[][] = [];
  const seen = new Set<string>(),
    checked = new Map<string, boolean>();
  for (const source of uniquePorts(sources))
    for (const target of uniquePorts(targets)) {
      const a = source.stub,
        b = target.stub;
      const trunks = [
        ...xs.map((x) => [a, { x, y: a.y }, { x, y: b.y }, b]),
        ...ys.map((y) => [a, { x: a.x, y }, { x: b.x, y }, b]),
      ];
      for (const trunk of trunks) {
        const route = simplifyRoute([source.point, ...trunk, target.point]);
        if (!route) continue;
        const key = JSON.stringify(route);
        if (seen.has(key)) continue;
        const trunkKey = JSON.stringify(trunk);
        let clear = checked.get(trunkKey);
        if (clear === undefined) {
          clear = !trunk
            .slice(1)
            .some((p, i) => index.segment(trunk[i], p).some((box) => crossesBox(trunk[i], p, box)));
          checked.set(trunkKey, clear);
        }
        if (clear) {
          seen.add(key);
          result.push(route);
        }
      }
    }
  return result;
}
