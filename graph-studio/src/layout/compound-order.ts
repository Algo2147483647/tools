import type { CompoundProjection } from "../graph/compoundProjection";
import { indexHierarchy } from "../graph/hierarchy";
import type { NormalizedDag } from "../graph/types";
import type { StageData } from "./types";

export type ExternalDirection = "incoming" | "outgoing" | "both";

/** Direction is relative to the focused scope, not relative to the external card. */
export function getExternalDirections(projection: CompoundProjection): Map<string, ExternalDirection> {
  const directions = new Map<string, ExternalDirection>();
  const external = new Set(projection.items.filter((item) => item.external).map((item) => item.id));
  const mark = (id: string, direction: ExternalDirection) => {
    if (!external.has(id)) return;
    const previous = directions.get(id);
    directions.set(id, previous && previous !== direction ? "both" : direction);
  };
  for (const edge of projection.edges) {
    mark(edge.source, "incoming");
    mark(edge.target, "outgoing");
  }
  return directions;
}

/** Reuse the last visible sibling order; collapsed groups retain their expanded group's place. */
export function orderCompoundItems(
  projection: CompoundProjection,
  dag: NormalizedDag,
  previousStage?: StageData | null,
) {
  const index = indexHierarchy(dag);
  const modelOrder = new Map(index.order.map((id, rank) => [id, rank]));
  const previousPositions = new Map<string, { x: number; y: number }>();
  if (
    previousStage?.layoutMode === "compound" &&
    previousStage.dag === dag.nodes &&
    (previousStage.compound?.focusGroupId ?? null) === projection.focusGroupId
  ) {
    for (const group of previousStage.groups ?? []) previousPositions.set(group.id, { x: group.x, y: group.y });
    for (const node of previousStage.nodes)
      previousPositions.set(node.key, { x: node.x - node.width / 2, y: node.y - node.height / 2 });
  }
  const siblings = new Map<string | null, typeof projection.items>();
  for (const item of projection.items) {
    const items = siblings.get(item.parentId) ?? [];
    items.push(item);
    siblings.set(item.parentId, items);
  }
  for (const items of siblings.values()) {
    // Sorting only known slots leaves newly visible members in their authored hierarchy order.
    items.sort((a, b) => (modelOrder.get(a.id) ?? Infinity) - (modelOrder.get(b.id) ?? Infinity));
    const known = items.filter((item) => previousPositions.has(item.id));
    known.sort((a, b) => {
      const first = previousPositions.get(a.id)!;
      const second = previousPositions.get(b.id)!;
      return first.y - second.y || first.x - second.x || modelOrder.get(a.id)! - modelOrder.get(b.id)!;
    });
    let next = 0;
    for (let i = 0; i < items.length; i++) if (previousPositions.has(items[i].id)) items[i] = known[next++];
  }
  const ordered: typeof projection.items = [];
  const stack = [...(siblings.get(null) ?? [])].reverse();
  while (stack.length) {
    const item = stack.pop()!;
    ordered.push(item);
    stack.push(...[...(siblings.get(item.id) ?? [])].reverse());
  }
  return ordered;
}

/** Each edge is counted at its lowest common ancestor, then propagated once up H. */
export function countGroupInternalEdges(dag: NormalizedDag): Map<string, number> {
  const index = indexHierarchy(dag);
  const counts = new Map(Object.keys(dag.hierarchy?.groups ?? {}).map((id) => [id, 0]));
  for (const edge of dag.edges) {
    let source = index.parent.get(edge.source);
    let target = index.parent.get(edge.target);
    while (source && target && source !== target) {
      if (index.depth.get(source)! >= index.depth.get(target)!) source = index.parent.get(source);
      else target = index.parent.get(target);
    }
    if (source && source === target) counts.set(source, counts.get(source)! + 1);
  }
  for (const id of [...index.order].reverse()) {
    const parent = index.parent.get(id);
    if (parent && counts.has(id)) counts.set(parent, counts.get(parent)! + counts.get(id)!);
  }
  return counts;
}
