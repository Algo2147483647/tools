import type { CompoundBox } from "../../../graph/compound/geometry";
import { LANE_GAP, MIN_STRAIGHT, type Port } from "./types";

/** Prefer the midpoint, then offer distinct ports clear of rounded card corners. */
export function sidePorts(box: CompoundBox, clearance: number, degree: number): Port[] {
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
