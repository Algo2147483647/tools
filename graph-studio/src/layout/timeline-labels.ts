/** Pack labels around their time anchors, sharing displacement on both sides of a cluster.
 * Pool-adjacent-violators minimizes squared displacement subject to a fixed row gap.
 * Only labels move: event timestamps and duration endpoints remain exact.
 */
export function packTimelineLabels(anchors: number[], gap: number, minimumY: number): number[] {
  const blocks: { first: number; last: number; sum: number; count: number }[] = [];
  anchors.forEach((anchor, index) => {
    blocks.push({ first: index, last: index, sum: anchor - index * gap, count: 1 });
    while (blocks.length > 1) {
      const right = blocks[blocks.length - 1];
      const left = blocks[blocks.length - 2];
      if (left.sum / left.count <= right.sum / right.count) break;
      left.last = right.last;
      left.sum += right.sum;
      left.count += right.count;
      blocks.pop();
    }
  });
  const positions = new Array<number>(anchors.length);
  for (const block of blocks) {
    const base = Math.max(minimumY, block.sum / block.count);
    for (let index = block.first; index <= block.last; index++) positions[index] = base + index * gap;
  }
  return positions;
}
