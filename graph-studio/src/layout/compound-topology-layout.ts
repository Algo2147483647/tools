import type { CompoundBox } from "./compound-routes";
import { compactFlow, packRectangles, compareArrangements } from "./compound-rectangle-packing";
import { refineLocalPlacement } from "./compound-local-refinement";
type Size = { width: number; height: number };
type Arrangement = { boxes: Map<string, CompoundBox>; width: number; height: number };
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Condense cycles before ranking. Every edge between components must point downstream. */
export function compoundTopology(ids: string[], edges: [string, string][]) {
  const outgoing = new Map(ids.map((id) => [id, new Set<string>()]));
  const incoming = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const [a, b] of edges)
    if (a !== b) {
      outgoing.get(a)!.add(b);
      incoming.get(b)!.add(a);
    }
  const visited = new Set<string>(),
    finish: string[] = [];
  for (const id of ids) {
    if (visited.has(id)) continue;
    visited.add(id);
    const stack: { id: string; next: Iterator<string> }[] = [{ id, next: outgoing.get(id)!.values() }];
    while (stack.length) {
      const item = stack[stack.length - 1],
        next = item.next.next();
      if (next.done) {
        finish.push(item.id);
        stack.pop();
      } else if (!visited.has(next.value)) {
        visited.add(next.value);
        stack.push({ id: next.value, next: outgoing.get(next.value)!.values() });
      }
    }
  }
  const component = new Map<string, number>(),
    members: string[][] = [];
  for (const id of finish.reverse()) {
    if (component.has(id)) continue;
    const index = members.length,
      group: string[] = [],
      stack = [id];
    component.set(id, index);
    while (stack.length) {
      const current = stack.pop()!;
      group.push(current);
      for (const previous of incoming.get(current)!)
        if (!component.has(previous)) {
          component.set(previous, index);
          stack.push(previous);
        }
    }
    members.push(group.sort(compare));
  }
  // Components arrive in topological order. Within a cycle favor sources/sinks;
  // backward relationships remain feedback edges, never reversed document edges.
  const order: string[] = [];
  for (const group of members) {
    const remaining = new Set(group),
      left: string[] = [],
      right: string[] = [];
    while (remaining.size) {
      const degree = (id: string, map: Map<string, Set<string>>) =>
        [...map.get(id)!].filter((other) => remaining.has(other)).length;
      const sink = [...remaining].find((id) => degree(id, outgoing) === 0);
      const next =
        sink ??
        [...remaining].sort(
          (a, b) =>
            degree(b, outgoing) - degree(b, incoming) - (degree(a, outgoing) - degree(a, incoming)) || compare(a, b),
        )[0];
      remaining.delete(next);
      if (sink) right.push(next);
      else left.push(next);
    }
    order.push(...left, ...right.reverse());
  }
  const position = new Map(order.map((id, i) => [id, i])),
    rank = new Map(ids.map((id) => [id, 0]));
  for (const id of order)
    for (const next of outgoing.get(id)!) {
      if (position.get(next)! > position.get(id)!) rank.set(next, Math.max(rank.get(next)!, rank.get(id)! + 1));
    }
  const layers: string[][] = [];
  for (const id of order) (layers[rank.get(id)!] ??= []).push(id);
  const row = new Map<string, number>();
  layers.forEach((layer) => {
    const barycenter = (id: string) => {
      const predecessors = [...incoming.get(id)!].filter((p) => rank.get(p)! < rank.get(id)!);
      return predecessors.length
        ? predecessors.reduce((sum, p) => sum + (row.get(p) ?? 0), 0) / predecessors.length
        : 0;
    };
    layer.sort((a, b) => barycenter(a) - barycenter(b) || compare(a, b));
    layer.forEach((id, i) => row.set(id, i));
  });
  return { layers, forward: edges.filter(([a, b]) => position.get(a)! < position.get(b)!) };
}
/** Seed from topology, then shorten local routes; child geometry stays frozen. */
export function arrangeTopology(
  ids: string[],
  edges: [string, string][],
  sizes: Map<string, Size>,
  columnGap: number,
  rowGap: number,
  direction: "AUTO" | "RIGHT" | "DOWN" = "AUTO",
): Arrangement {
  columnGap = Math.max(0, columnGap);
  rowGap = Math.max(0, rowGap);
  edges = [...edges].sort(([a, b], [c, d]) => compare(a, c) || compare(b, d));
  const adjacent = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const [a, b] of edges) {
    adjacent.get(a)!.add(b);
    adjacent.get(b)!.add(a);
  }
  const visited = new Set<string>(),
    pieces: Arrangement[] = [];
  for (const id of [...ids].sort(compare)) {
    if (visited.has(id)) continue;
    const members: string[] = [],
      stack = [id];
    visited.add(id);
    while (stack.length) {
      const current = stack.pop()!;
      members.push(current);
      for (const next of adjacent.get(current)!)
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
    }
    const memberSet = new Set(members);
    const localEdges = edges.filter(([a, b]) => memberSet.has(a) && memberSet.has(b));
    const { layers, forward } = compoundTopology(members.sort(compare), localEdges);
    const candidates: { layout: Arrangement; down: boolean }[] = [];
    for (const down of direction === "AUTO" ? [false, true] : [direction === "DOWN"]) {
      const oriented = new Map(
        members.map((id) => {
          const size = sizes.get(id)!;
          return [id, down ? { width: size.height, height: size.width } : size];
        }),
      );
      // Try both large-first and small-first siblings. Only independent nodes within a rank are exchanged.
      const orders = [
        layers.flat(),
        ...[1, -1].map((sign) =>
          layers.flatMap((layer) =>
            [...layer].sort(
              (a, b) =>
                sign *
                  (oriented.get(b)!.width * oriented.get(b)!.height -
                    oriented.get(a)!.width * oriented.get(a)!.height) || compare(a, b),
            ),
          ),
        ),
      ];
      const tried = new Set<string>();
      for (const order of orders) {
        const signature = JSON.stringify(order);
        if (tried.has(signature)) continue;
        tried.add(signature);
        const result = compactFlow(order, forward, oriented, down ? rowGap : columnGap, down ? columnGap : rowGap);
        const layout = down
          ? {
              boxes: new Map(
                [...result.boxes].map(([id, box]) => [
                  id,
                  { x: box.y, y: box.x, width: box.height, height: box.width },
                ]),
              ),
              width: result.height,
              height: result.width,
            }
          : result;
        candidates.push({ layout, down });
      }
    }
    candidates.sort((a, b) => compareArrangements(a.layout, b.layout, forward, columnGap, rowGap, a.down, b.down));
    const best = candidates[0];
    pieces.push(refineLocalPlacement(best.layout, localEdges, forward, columnGap, rowGap, best.down));
  }
  if (!pieces.length) return { boxes: new Map(), width: 0, height: 0 };
  const keys = pieces.map((_, i) => String(i)),
    pieceSizes = new Map(keys.map((key, i) => [key, pieces[i]]));
  const packed = packRectangles(keys, pieceSizes, columnGap, rowGap);
  const boxes = new Map<string, CompoundBox>();
  pieces.forEach((piece, i) => {
    const offset = packed.boxes.get(String(i))!;
    for (const [id, box] of piece.boxes) boxes.set(id, { ...box, x: box.x + offset.x, y: box.y + offset.y });
  });
  return { boxes, width: packed.width, height: packed.height };
}
