import type { Point } from './model';
export type CanvasView = { x: number; y: number; scale: number };
export const clampScale = (scale: number) => Math.max(0.2, Math.min(2.5, scale));
/** Preserve the world point under the fingers while the centroid moves and distance changes. */
export function pinchView(view: CanvasView, start: Point, current: Point, factor: number): CanvasView {
  const scale = clampScale(view.scale * factor);
  return {
    scale,
    x: current.x - ((start.x - view.x) * scale) / view.scale,
    y: current.y - ((start.y - view.y) * scale) / view.scale,
  };
}
export function touchPair(points: Point[]) {
  const [a, b] = points;
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
  };
}
