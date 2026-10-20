import type { StageNode } from "./types";

export type TimelineLabelBox = { left: number; right: number; top: number; bottom: number };

export function timelineMarkerBox(node: StageNode): TimelineLabelBox {
  const time = node.timeline!;
  const marker = time.kind === "range" ? time.anchorMarker : time.pointMarker;
  const radius = marker && marker.visible ? marker.size / 2 : 0;
  const temporal = Math.max(10, radius + 4);
  const half = Math.max(10, (time.barWidth ?? 12) / 2 + 4, radius * (marker?.shape === "auto" ? 1.75 : 1) + 4);
  if (node.timeline!.orientation === "horizontal")
    return {
      left: node.timeline!.startY - temporal,
      right: node.timeline!.endY + temporal,
      top: node.y - half,
      bottom: node.y + half,
    };
  return { left: node.x - half, right: node.x + half, top: node.y - temporal, bottom: node.timeline!.endY + temporal };
}

export function timelineLabelBox(node: StageNode): TimelineLabelBox {
  const time = node.timeline!;
  if (time.kind === "range" && time.intervalTitle !== undefined && time.intervalTitle !== "outside")
    return timelineMarkerBox(node);
  return {
    left: time.labelX - 6,
    right: time.labelX + node.width + 6,
    top: time.labelY - 16,
    bottom: time.labelY + (node.detailLines.length ? 39 : 24),
  };
}

/** Labels may move in either direction; the event's temporal anchor never moves. */
export function findFreeTimelineLabelPosition(
  node: StageNode,
  occupied: TimelineLabelBox[],
  minimum = 180,
  minimumY = 48,
): { x: number; y: number } {
  const { labelX: desiredX, labelY: desiredY } = node.timeline!;
  const height = node.detailLines.length ? 39 : 24;
  const candidates = [
    ...new Set(
      [desiredY, minimumY, ...occupied.flatMap((box) => [box.top - height - 7, box.bottom + 23])].map((y) =>
        Math.max(minimumY, y),
      ),
    ),
  ].sort((a, b) => Math.abs(a - desiredY) - Math.abs(b - desiredY) || a - b);
  let best = { x: Math.max(minimum, desiredX), y: Math.max(minimumY, desiredY) };
  let cost = Infinity;
  for (const y of candidates) {
    const verticalCost = Math.abs(y - desiredY) * 1.15;
    if (verticalCost > cost) break;
    const intervals = occupied
      .filter((box) => y - 16 < box.bottom + 7 && y + height + 7 > box.top)
      .map((box) => [box.left - node.width - 13, box.right + 13])
      .sort((a, b) => a[0] - b[0]);
    const merged: number[][] = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval[0] < last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push(interval);
    }
    let x = Math.max(minimum, desiredX);
    const blocked = merged.find(([left, right]) => x > left && x < right);
    if (blocked) x = blocked[0] >= minimum && x - blocked[0] <= blocked[1] - x ? blocked[0] : blocked[1];
    const nextCost = Math.abs(x - desiredX) + verticalCost;
    if (nextCost < cost) {
      best = { x, y };
      cost = nextCost;
    }
  }
  return best;
}

/** A label column shares width across time. Pool adjacent collisions to minimize vertical displacement. */
export function packTimelineTrackLabels(nodes: StageNode[], minimumY: number): void {
  const sorted = nodes
    .filter(
      (node) =>
        node.timeline!.kind !== "range" || !node.timeline!.intervalTitle || node.timeline!.intervalTitle === "outside",
    )
    .sort((a, b) => a.y - b.y || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const offsets: number[] = [];
  const blocks: { start: number; end: number; total: number; count: number }[] = [];
  for (const [index, node] of sorted.entries()) {
    offsets[index] = index ? offsets[index - 1] + (sorted[index - 1].detailLines.length ? 63 : 48) : 0;
    blocks.push({ start: index, end: index, total: node.y + 3 - offsets[index], count: 1 });
    while (blocks.length > 1) {
      const right = blocks[blocks.length - 1],
        left = blocks[blocks.length - 2];
      if (left.total / left.count <= right.total / right.count) break;
      left.end = right.end;
      left.total += right.total;
      left.count += right.count;
      blocks.pop();
    }
  }
  for (const block of blocks) {
    const position = Math.max(minimumY, block.total / block.count);
    for (let index = block.start; index <= block.end; index++)
      sorted[index].timeline!.labelY = position + offsets[index];
  }
}
