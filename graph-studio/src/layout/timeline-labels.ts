import type { StageNode } from "./types";

/** Avoid occupied geometry horizontally while preserving the label's exact time row. */
export function findFreeTimelineLabelX(
  node: StageNode,
  occupied: { left: number; right: number; top: number; bottom: number }[],
  minimum = 180,
): number {
  const { labelX: desired, labelY: y } = node.timeline!;
  const height = node.detailLines.length ? 39 : 24;
  const intervals = occupied
    .filter((box) => y - 16 < box.bottom + 7 && y + height + 7 > box.top)
    .map((box) => [box.left - node.width - 13, box.right + 13] as const);
  return [desired, minimum, ...intervals.flatMap(([left, right]) => [left, right])]
    .filter((x) => x >= minimum && !intervals.some(([left, right]) => x > left && x < right))
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)[0];
}
