import type { CompoundBox } from "../../../graph/compound/geometry";
import { crossesBox, simplifyRoute } from "./geometry";
import type { Point, Port } from "./types";

/** Nearby exterior corridors compete with ordinary routes; they never enlarge the canvas. */
export function outerRoutes(
  sources: Port[],
  targets: Port[],
  obstacles: CompoundBox[],
  extent: CompoundBox,
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
  for (const source of sources)
    for (const target of targets) {
      const a = source.stub,
        b = target.stub;
      const trunks = [
        ...xs.map((x) => [a, { x, y: a.y }, { x, y: b.y }, b]),
        ...ys.map((y) => [a, { x: a.x, y }, { x: b.x, y }, b]),
      ];
      for (const trunk of trunks) {
        if (trunk.slice(1).some((p, i) => obstacles.some((box) => crossesBox(trunk[i], p, box)))) continue;
        const route = simplifyRoute([source.point, ...trunk, target.point]);
        if (route) result.push(route);
      }
    }
  return result;
}
