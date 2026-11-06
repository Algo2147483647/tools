import { edgeLabelSize } from "../../shared/edge-label";
import { getRoleFont } from "../../shared/typography";
import type { CompoundBox } from "../../../graph/compound/geometry";
import { overlaps } from "./geometry";
import type { Point } from "./types";
import { ObstacleIndex } from "./spatial-index";

export function labelBox(
  label: string,
  position: Point,
  measuredSize?: { width: number; height: number },
): CompoundBox {
  const { width, height } = measuredSize ?? edgeLabelSize(label, getRoleFont({ cssVars: {} }, "edge-label"));
  return { x: position.x - width / 2, y: position.y - height / 2, width, height };
}

export function placeLabel(
  label: string,
  points: Point[],
  obstacles: CompoundBox[],
  extent: CompoundBox,
  measuredSize?: { width: number; height: number },
  index = new ObstacleIndex(obstacles),
): Point | null {
  const segments = points
    .slice(1)
    .map((b, i) => ({ a: points[i], b, length: Math.abs(b.x - points[i].x) + Math.abs(b.y - points[i].y) }))
    .sort((a, b) => b.length - a.length);
  for (const { a, b } of segments)
    for (const fraction of [0.5, 0.25, 0.75]) {
      const position = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
      const box = labelBox(label, position, measuredSize);
      if (
        box.x >= extent.x &&
        box.y >= extent.y &&
        box.x + box.width <= extent.x + extent.width &&
        box.y + box.height <= extent.y + extent.height &&
        !index.box(box).some((obstacle) => overlaps(box, obstacle))
      )
        return position;
    }
  return null;
}
