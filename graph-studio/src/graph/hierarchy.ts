import type { GraphDocument, GraphHierarchy } from "./types";

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (value: unknown): value is string =>
  typeof value === "string" && Boolean(value) && value.trim() === value && !/[\r\n,]/.test(value);

export function validateHierarchy(value: unknown, nodes: GraphDocument["nodes"]): asserts value is GraphHierarchy {
  if (!record(value) || !validId(value.id) || !record(value.groups) || !record(value.parentById))
    throw new Error("/hierarchy requires id, groups and parentById.");
  if (Object.keys(value).some((key) => !["id", "groups", "parentById"].includes(key)))
    throw new Error("Unknown hierarchy field.");
  const groups = value.groups;
  for (const [id, group] of Object.entries(groups)) {
    if (!validId(id) || has(nodes, id)) throw new Error(`Invalid or conflicting group ID "${id}".`);
    if (!record(group) || typeof group.title !== "string" || Object.keys(group).some((key) => key !== "title"))
      throw new Error(`/hierarchy/groups/${id} requires a title string only.`);
  }
  const parents = value.parentById;
  const childCounts = new Map(Object.keys(groups).map((id) => [id, 0]));
  for (const [id, parent] of Object.entries(parents)) {
    if ((!has(nodes, id) && !has(groups, id)) || typeof parent !== "string" || !has(groups, parent))
      throw new Error(`Invalid hierarchy reference "${id}" -> "${String(parent)}".`);
    childCounts.set(parent, childCounts.get(parent)! + 1);
  }
  const done = new Set<string>();
  for (const id of Object.keys(groups)) {
    const path = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !done.has(current)) {
      if (path.has(current)) throw new Error(`Hierarchy cycle at "${current}".`);
      path.add(current);
      current = has(parents, current) ? (parents[current] as string) : undefined;
    }
    path.forEach((key) => done.add(key));
  }
  for (const [id, count] of childCounts) if (!count) throw new Error(`Group "${id}" must contain at least one member.`);
}

export interface HierarchyIndex {
  children: Map<string | null, string[]>;
  parent: Map<string, string>;
  order: string[];
  depth: Map<string, number>;
  leafCount: Map<string, number>;
  start: Map<string, number>;
  end: Map<string, number>;
}

export function indexHierarchy(doc: GraphDocument): HierarchyIndex {
  const groups = doc.hierarchy?.groups ?? {};
  const parent = new Map(Object.entries(doc.hierarchy?.parentById ?? {}));
  const children = new Map<string | null, string[]>([[null, []]]);
  Object.keys(groups).forEach((id) => children.set(id, []));
  for (const id of [...Object.keys(groups), ...Object.keys(doc.nodes)]) children.get(parent.get(id) ?? null)!.push(id);
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
    if (has(groups, id)) {
      stack.push({ id, level, exit: true });
      for (const child of children.get(id)!.slice().reverse()) stack.push({ id: child, level: level + 1, exit: false });
    } else {
      leafCount.set(id, 1);
      end.set(id, order.length);
    }
  }
  return { children, parent, order, depth, leafCount, start, end };
}

export function isHierarchyDescendant(index: HierarchyIndex, id: string, ancestor: string): boolean {
  const position = index.start.get(id);
  return (
    position !== undefined &&
    position >= (index.start.get(ancestor) ?? Infinity) &&
    position < (index.end.get(ancestor) ?? -1)
  );
}

export function pruneEmptyGroups(doc: GraphDocument): void {
  const hierarchy = doc.hierarchy;
  if (!hierarchy) return;
  for (const id of Object.keys(hierarchy.parentById))
    if (!has(doc.nodes, id) && !has(hierarchy.groups, id)) delete hierarchy.parentById[id];
  const counts = new Map(Object.keys(hierarchy.groups).map((id) => [id, 0]));
  Object.values(hierarchy.parentById).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  const queue = [...counts].filter(([, count]) => count === 0).map(([id]) => id);
  while (queue.length) {
    const id = queue.pop()!;
    const parent = has(hierarchy.parentById, id) ? hierarchy.parentById[id] : undefined;
    delete hierarchy.groups[id];
    delete hierarchy.parentById[id];
    if (parent !== undefined) {
      counts.set(parent, counts.get(parent)! - 1);
      if (counts.get(parent) === 0) queue.push(parent);
    }
  }
}

export type HierarchyCommand =
  | { type: "groupCreate"; id: string; title: string; memberIds: string[] }
  | { type: "groupMove"; memberIds: string[]; parentId: string | null }
  | { type: "groupRename"; id: string; title: string }
  | { type: "groupDissolve"; id: string };

export function applyHierarchyCommand(doc: GraphDocument, command: HierarchyCommand): void {
  doc.hierarchy ??= { id: "H", groups: {}, parentById: {} };
  const h = doc.hierarchy;
  const setParent = (id: string, parent: string | null) => {
    if (parent === null) delete h.parentById[id];
    else
      Object.defineProperty(h.parentById, id, { value: parent, enumerable: true, configurable: true, writable: true });
  };
  if (command.type === "groupRename" || command.type === "groupDissolve") {
    if (!has(h.groups, command.id)) throw new Error(`Group "${command.id}" does not exist.`);
    if (command.type === "groupRename") h.groups[command.id].title = command.title;
    else {
      const parent = has(h.parentById, command.id) ? h.parentById[command.id] : null;
      Object.entries(h.parentById).forEach(([id, group]) => {
        if (group === command.id) setParent(id, parent);
      });
      delete h.groups[command.id];
      delete h.parentById[command.id];
    }
  } else {
    const ids = [...new Set(command.memberIds)];
    if (!ids.length) throw new Error("Select at least one member.");
    ids.forEach((id) => {
      if (!has(doc.nodes, id) && !has(h.groups, id)) throw new Error(`Unknown member "${id}".`);
    });
    const index = indexHierarchy(doc);
    for (const id of ids)
      for (const other of ids)
        if (id !== other && isHierarchyDescendant(index, id, other))
          throw new Error("Select a group or its descendants, not both.");
    if (command.type === "groupCreate") {
      if (!validId(command.id) || has(doc.nodes, command.id) || has(h.groups, command.id))
        throw new Error("Enter a unique group ID.");
      const parent = index.parent.get(ids[0]) ?? null;
      if (ids.some((id) => (index.parent.get(id) ?? null) !== parent))
        throw new Error("New groups require members with the same parent.");
      Object.defineProperty(h.groups, command.id, {
        value: { title: command.title },
        enumerable: true,
        configurable: true,
        writable: true,
      });
      setParent(command.id, parent);
      ids.forEach((id) => setParent(id, command.id));
    } else {
      if (command.parentId !== null && !has(h.groups, command.parentId))
        throw new Error("Target group does not exist.");
      for (const id of ids)
        if (command.parentId !== null && isHierarchyDescendant(index, command.parentId, id))
          throw new Error("A group cannot be moved into itself or its descendants.");
      ids.forEach((id) => setParent(id, command.parentId));
      pruneEmptyGroups(doc);
    }
  }
}
