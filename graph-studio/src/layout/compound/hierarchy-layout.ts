import type { GraphGeometryAppearance } from "../../schema/appearance/defaults";
import type { CompoundProjection } from "../../graph/compound/projection";
import type { CompoundBox } from "../../graph/compound/geometry";
import { arrangeTopology } from "./topology-layout";

interface Size {
  width: number;
  height: number;
}
interface Scope {
  children: string[];
  edges: [string, string][];
}

/** Placement only. Completed children are fixed rectangles; routes and labels never enter this pass. */
export function layoutCompoundHierarchy(
  projection: CompoundProjection,
  sizes: Map<string, Size>,
  theme: GraphGeometryAppearance,
) {
  const scopes = new Map<string | null, Scope>([[null, { children: [], edges: [] }]]);
  const parents = new Map(projection.items.map((item) => [item.id, item.parentId]));
  const ordered = [...projection.items].sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const item of ordered) {
    scopes.get(item.parentId)!.children.push(item.id);
    if (item.kind === "group" && !item.collapsed) scopes.set(item.id, { children: [], edges: [] });
  }
  const ancestry = (id: string) => {
    const path = [id];
    let parent = parents.get(id);
    while (parent != null) {
      path.push(parent);
      parent = parents.get(parent);
    }
    return path;
  };
  for (const edge of projection.edges) {
    const source = ancestry(edge.source),
      target = ancestry(edge.target);
    let common: string | null = null;
    while (source.length && target.length && source[source.length - 1] === target[target.length - 1]) {
      common = source.pop()!;
      target.pop();
    }
    // Parent-to-descendant edges route after placement, not as fictitious outer self-loops.
    if (source.length && target.length)
      scopes.get(common)!.edges.push([source[source.length - 1], target[target.length - 1]]);
  }
  const local = new Map<string | null, { boxes: Map<string, CompoundBox>; width: number; height: number }>();
  const fixedSizes = new Map(sizes);
  for (const id of [...scopes.keys()].reverse()) {
    const scope = scopes.get(id)!;
    const result = arrangeTopology(
      scope.children,
      scope.edges,
      fixedSizes,
      theme.nodes.spacing.column,
      theme.nodes.spacing.row,
    );
    const left = id === null ? 36 : 24,
      top = id === null ? 36 : 58,
      bottom = id === null ? 36 : 24;
    const width = Math.max(id === null ? 0 : sizes.get(id)!.width, result.width + 2 * left);
    const height = Math.max(id === null ? 0 : sizes.get(id)!.height, result.height + top + bottom);
    local.set(id, {
      boxes: new Map([...result.boxes].map(([key, box]) => [key, { ...box, x: box.x + left, y: box.y + top }])),
      width,
      height,
    });
    if (id !== null) fixedSizes.set(id, { width, height });
  }
  const boxes = new Map<string, CompoundBox>();
  const offsets = new Map<string | null, { x: number; y: number }>([[null, { x: 0, y: 0 }]]);
  for (const id of scopes.keys()) {
    const offset = offsets.get(id)!;
    for (const [child, box] of local.get(id)!.boxes) {
      const absolute = { ...box, x: box.x + offset.x, y: box.y + offset.y };
      boxes.set(child, absolute);
      if (scopes.has(child)) offsets.set(child, absolute);
    }
  }
  return { boxes, width: local.get(null)!.width, height: local.get(null)!.height };
}
