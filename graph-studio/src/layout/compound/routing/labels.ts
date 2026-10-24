import { estimateTextWidth } from "../../shared/text-estimate";
import type { CompoundBox } from "../../../graph/compound/geometry";
import { overlaps } from "./geometry";
import type { Point } from "./types";

export function labelBox(label: string, position: Point): CompoundBox {
  const width = Math.max(label.length * 7 + 12, estimateTextWidth(label, 10) + 14);
  return { x: position.x - width / 2, y: position.y - 10, width, height: 18 };
}

export function placeLabel(
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
