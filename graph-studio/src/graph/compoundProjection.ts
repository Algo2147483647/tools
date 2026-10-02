import { getNodeTitle, getNodeType } from "./accessors";
import { indexHierarchy, isHierarchyDescendant } from "./hierarchy";
import type { CompoundView, GraphEdge, NormalizedDag } from "./types";

export interface CompoundItem {
  id: string;
  kind: "node" | "group";
  title: string;
  parentId: string | null;
  collapsed: boolean;
  external: boolean;
  depth: number;
  leafCount: number;
  internalEdgeIds: string[];
}

export interface CompoundEdge {
  id: string;
  source: string;
  target: string;
  originalEdgeIds: string[];
  label: string;
}

export interface CompoundProjection {
  items: CompoundItem[];
  edges: CompoundEdge[];
  representative: Map<string, string>;
  focusGroupId: string | null;
}

/** Builds a disposable scene without introducing nodes or edges into G. */
export function projectCompoundGraph(doc: NormalizedDag, view: CompoundView, selectedType = ""): CompoundProjection {
  const h = doc.hierarchy;
  const index = indexHierarchy(doc);
  const groups = new Set(Object.keys(h?.groups ?? {}));
  const focus = view.focusGroupId && groups.has(view.focusGroupId) ? view.focusGroupId : null;
  const collapsed = new Set(view.collapsedGroupIds.filter((id) => id !== focus));
  const items = new Map<string, CompoundItem>();
  const representative = new Map<string, string>();
  const activeLeaves = new Set<string>();
  const inside = (id: string) => !focus || isHierarchyDescendant(index, id, focus);
  const add = (id: string, external = false): CompoundItem => {
    let item = items.get(id);
    if (item) return item;
    const isGroup = groups.has(id);
    const parent = index.parent.get(id) ?? null;
    item = {
      id,
      kind: isGroup ? "group" : "node",
      title: isGroup ? h!.groups[id].title || id : getNodeTitle(doc.nodes[id]) || id,
      parentId: external || parent === focus ? null : parent,
      collapsed: isGroup && (external || collapsed.has(id)),
      external,
      depth: external ? 0 : (index.depth.get(id) ?? 0) - (focus ? index.depth.get(focus)! + 1 : 0),
      leafCount: index.leafCount.get(id) ?? 1,
      internalEdgeIds: [],
    };
    items.set(id, item);
    return item;
  };
  // A top-down traversal makes an outer collapsed ancestor win over inner ones.
  const hiddenBy = new Map<string, string>();
  for (const id of index.order) {
    if (!inside(id) || id === focus) continue;
    const parent = index.parent.get(id);
    const hidden = parent && parent !== focus ? hiddenBy.get(parent) : undefined;
    const proxy = hidden ?? (groups.has(id) && collapsed.has(id) ? id : undefined);
    if (proxy) hiddenBy.set(id, proxy);
    if (!groups.has(id) && (!selectedType || getNodeType(doc.nodes[id]) === selectedType)) {
      activeLeaves.add(id);
      const rep = proxy ?? id;
      representative.set(id, rep);
      add(rep);
      let ancestor = index.parent.get(rep);
      while (ancestor && ancestor !== focus && !items.has(ancestor)) {
        add(ancestor);
        ancestor = index.parent.get(ancestor);
      }
    }
  }
  // While drilling down, preserve incident external relationships as boundary summaries.
  const externalRep = (id: string) => {
    let current = id;
    // Stop below an ancestor of the focus: an external summary must never contain the focused scope itself.
    while (index.parent.has(current) && !isHierarchyDescendant(index, focus!, index.parent.get(current)!))
      current = index.parent.get(current)!;
    add(current, true);
    representative.set(id, current);
    return current;
  };
  const aggregates = new Map<string, { source: string; target: string; edges: GraphEdge[] }>();
  for (const edge of doc.edges) {
    const sourceActive = activeLeaves.has(edge.source);
    const targetActive = activeLeaves.has(edge.target);
    if (!sourceActive && !targetActive) continue;
    if ((!sourceActive && inside(edge.source)) || (!targetActive && inside(edge.target))) continue;
    const source = representative.get(edge.source) ?? externalRep(edge.source);
    const target = representative.get(edge.target) ?? externalRep(edge.target);
    if (source === target) {
      items.get(source)!.internalEdgeIds.push(edge.id);
      continue;
    }
    const relation = typeof edge.value === "number" ? "numeric" : JSON.stringify([typeof edge.value, edge.value]);
    const key = JSON.stringify([source, target, relation]);
    const aggregate = aggregates.get(key) ?? { source, target, edges: [] };
    aggregate.edges.push(edge);
    aggregates.set(key, aggregate);
  }
  const edges = [...aggregates].map(([key, bucket]) => ({
    id: `aggregate:${key}`,
    source: bucket.source,
    target: bucket.target,
    originalEdgeIds: bucket.edges.map((edge) => edge.id),
    label: bucket.edges.length > 1 ? `${bucket.edges.length} relationships` : String(bucket.edges[0].value ?? ""),
  }));
  return { items: [...items.values()].sort((a, b) => a.depth - b.depth), edges, representative, focusGroupId: focus };
}
