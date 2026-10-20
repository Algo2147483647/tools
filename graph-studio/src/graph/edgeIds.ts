/** Retain length-based edge IDs while allowing batch callers to reuse their ID index. */
export function nextEdgeId(used: ReadonlySet<string>, start: number): string {
  let number = start;
  while (used.has(`edge-${number}`)) number++;
  return `edge-${number}`;
}
