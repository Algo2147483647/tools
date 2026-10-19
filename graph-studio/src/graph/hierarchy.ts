import type { GraphDocument, HierarchyEdge } from "./types";
const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
const validId = (value: unknown): value is string => typeof value === "string" && Boolean(value) && value.trim() === value && !/[\r\n,]/.test(value);

export function validateHierarchyEdges(value: unknown, nodes: GraphDocument["nodes"]): asserts value is HierarchyEdge[] {
  if (!Array.isArray(value)) throw new Error("/hierarchy_edges must be an array.");
  const ids = new Set<string>();
  const parents = new Map<string, string>();
  for (const [i, edge] of value.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge) || Object.keys(edge).some(key => !["id", "source", "target"].includes(key)) || !validId(edge.id) || !validId(edge.source) || !validId(edge.target))
      throw new Error(`/hierarchy_edges/${i} requires id, source and target only.`);
    if (ids.has(edge.id)) throw new Error(`Duplicate hierarchy edge ID "${edge.id}".`);
    ids.add(edge.id);
    if (!has(nodes, edge.source) || !has(nodes, edge.target)) throw new Error("Hierarchy edge endpoints must exist in nodes.");
    if (parents.has(edge.target)) throw new Error(`Node "${edge.target}" has more than one hierarchy parent.`);
    parents.set(edge.target, edge.source);
  }
  const done = new Set<string>();
  for (const id of Object.keys(nodes)) {
    const path = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !done.has(current)) {
      if (path.has(current)) throw new Error(`Hierarchy cycle at "${current}".`);
      path.add(current); current = parents.get(current);
    }
    path.forEach(key => done.add(key));
  }
}

export function getGroupNodes(doc: GraphDocument | null | undefined): GraphDocument["nodes"] {
  return Object.fromEntries([...new Set((doc?.hierarchy_edges ?? []).map(edge => edge.source))].map(id => [id, doc!.nodes[id]]));
}

export interface HierarchyIndex {
  groups: Set<string>;
  children: Map<string | null, string[]>;
  parent: Map<string, string>;
  order: string[];
  depth: Map<string, number>;
  leafCount: Map<string, number>;
  start: Map<string, number>;
  end: Map<string, number>;
}

export function indexHierarchy(doc: GraphDocument): HierarchyIndex {
  const groups = new Set((doc.hierarchy_edges ?? []).map((edge) => edge.source));
  const parent = new Map((doc.hierarchy_edges ?? []).map((edge) => [edge.target, edge.source]));
  const children = new Map<string | null, string[]>([[null, []]]);
  [...groups].forEach((id) => children.set(id, []));
  for (const id of Object.keys(doc.nodes)) children.get(parent.get(id) ?? null)!.push(id);
  const order: string[] = [];
  const depth = new Map<string, number>();
  const start = new Map<string, number>();
  const end = new Map<string, number>();
  const leafCount = new Map<string, number>();
  const stack = children
    .get(null)!
    .slice()
    .reverse()
    .map((id) => ({ id, level: 0, exit: false }));
  while (stack.length) {
    const { id, level, exit } = stack.pop()!;
    if (exit) {
      end.set(id, order.length);
      leafCount.set(
        id,
        (children.get(id) ?? []).reduce((n, child) => n + leafCount.get(child)!, 0),
      );
      continue;
    }
    start.set(id, order.length);
    order.push(id);
    depth.set(id, level);
    if (groups.has(id)) {
      stack.push({ id, level, exit: true });
      for (const child of children.get(id)!.slice().reverse()) stack.push({ id: child, level: level + 1, exit: false });
    } else {
      leafCount.set(id, 1);
      end.set(id, order.length);
    }
  }
  return { groups, children, parent, order, depth, leafCount, start, end };
}

export function isHierarchyDescendant(index: HierarchyIndex, id: string, ancestor: string): boolean {
  const position = index.start.get(id);
  return (
    position !== undefined &&
    position >= (index.start.get(ancestor) ?? Infinity) &&
    position < (index.end.get(ancestor) ?? -1)
  );
}

/** Remove dangling membership edges; nodes never disappear merely because they become empty. */
export function pruneHierarchyEdges(doc: GraphDocument): void {
  if (doc.hierarchy_edges) doc.hierarchy_edges = doc.hierarchy_edges.filter(edge => has(doc.nodes, edge.source) && has(doc.nodes, edge.target));
}

export type HierarchyCommand =
  | { type: "groupCreate"; id: string; title: string; memberIds: string[] }
  | { type: "groupMove"; memberIds: string[]; parentId: string | null }
  | { type: "groupRename"; id: string; title: string }
  | { type: "groupDissolve"; id: string };

export function applyHierarchyCommand(doc: GraphDocument, command: HierarchyCommand): void {
  doc.hierarchy_edges ??= [];
  const index = indexHierarchy(doc);
  const setParent = (id: string, parent: string | null) => {
    const previous = doc.hierarchy_edges!.find(edge => edge.target === id);
    doc.hierarchy_edges = doc.hierarchy_edges!.filter(edge => edge.target !== id);
    if (parent !== null) {
      let edgeId = previous?.id ?? `hierarchy:${id}`;
      let n = 1;
      while (doc.hierarchy_edges.some(edge => edge.id === edgeId)) edgeId = `hierarchy:${id}:${n++}`;
      doc.hierarchy_edges.push({id: edgeId, source: parent, target: id});
    }
  };
  if (command.type === "groupRename" || command.type === "groupDissolve") {
    if (!index.groups.has(command.id)) throw new Error(`Group "${command.id}" does not exist.`);
    if (command.type === "groupRename") doc.nodes[command.id].title = command.title;
    else {
      const parent = index.parent.get(command.id) ?? null;
      for (const child of index.children.get(command.id) ?? []) setParent(child, parent);
      // Dissolving containment retains the parent node, its fields and its ordinary relationships.
    }
    return;
  }
  const ids = [...new Set(command.memberIds)];
  if (!ids.length) throw new Error("Select at least one member.");
  for (const id of ids) if (!has(doc.nodes, id)) throw new Error(`Unknown member "${id}".`);
  for (const id of ids) for (const other of ids)
    if (id !== other && isHierarchyDescendant(index, id, other)) throw new Error("Select a group or its descendants, not both.");
  if (command.type === "groupCreate") {
    if (!validId(command.id) || has(doc.nodes, command.id)) throw new Error("Enter a unique group ID.");
    const parent = index.parent.get(ids[0]) ?? null;
    if (ids.some(id => (index.parent.get(id) ?? null) !== parent)) throw new Error("New groups require members with the same parent.");
    Object.defineProperty(doc.nodes, command.id, { value: {title: command.title}, enumerable: true, configurable: true, writable: true });
    setParent(command.id, parent);
    ids.forEach(id => setParent(id, command.id));
  } else {
    if (command.parentId !== null && !has(doc.nodes, command.parentId)) throw new Error("Target node does not exist.");
    for (const id of ids) if (command.parentId !== null && isHierarchyDescendant(index, command.parentId, id)) throw new Error("A node cannot be moved into itself or its descendants.");
    ids.forEach(id => setParent(id, command.parentId));
  }
}
