import type { CompoundProjection } from "../graph/compoundProjection";

export type PortSide = "WEST" | "EAST" | "SOUTH";

export interface BoundaryPort {
  id: string;
  edgeId: string;
  oppositeId: string;
  outgoing: boolean;
  side: PortSide;
  order: number;
}

export interface LocalSegment {
  id: string;
  scopeId: string;
  source: string;
  target: string;
  /** Only the segment in the lowest common ancestor carries the label. */
  label: string;
}

export interface CompoundScope {
  id: string;
  itemId: string | null;
  parentId: string | null;
  children: string[];
  ports: BoundaryPort[];
  segments: LocalSegment[];
}

export interface CompoundLocalGraph {
  rootId: string;
  sceneIds: Map<string, string>;
  scopes: Map<string, CompoundScope>;
  /** Parent scopes precede their children; reverse this for bottom-up layout. */
  order: string[];
  /** Segments are in original source-to-target order, including feedback edges. */
  routes: Map<string, LocalSegment[]>;
}

/** Split edges at containment boundaries. No synthetic objects enter the document or projection. */
export function buildCompoundLocalGraph(projection: CompoundProjection): CompoundLocalGraph {
  const rootId = "scene-root";
  const items = [...projection.items].sort((a, b) => a.depth - b.depth || compareIds(a.id, b.id));
  const sceneIds = new Map(items.map((item, i) => [item.id, `item-${i}`]));
  const scopes = new Map<string, CompoundScope>();
  scopes.set(rootId, {
    id: rootId,
    itemId: null,
    parentId: null,
    children: [],
    ports: [],
    segments: [],
  });
  const parents = new Map<string, string>();
  for (const item of items) {
    const id = sceneIds.get(item.id)!;
    const parentId = item.parentId ? sceneIds.get(item.parentId)! : rootId;
    parents.set(id, parentId);
    scopes.get(parentId)!.children.push(id);
    if (item.kind === "group" && !item.collapsed)
      scopes.set(id, { id, itemId: item.id, parentId, children: [], ports: [], segments: [] });
  }
  const routes = new Map<string, LocalSegment[]>();
  const chain = (id: string) => {
    const result: string[] = [];
    let parent = parents.get(id);
    while (parent) {
      result.push(parent);
      parent = scopes.get(parent)!.parentId ?? undefined;
    }
    return result;
  };
  const edges = [...projection.edges].sort(
    (a, b) =>
      compareIds(a.source, b.source) ||
      compareIds(a.target, b.target) ||
      compareIds(a.originalEdgeIds[0], b.originalEdgeIds[0]),
  );
  edges.forEach((edge, edgeIndex) => {
    const sourceId = sceneIds.get(edge.source)!;
    const targetId = sceneIds.get(edge.target)!;
    const sourceChain = chain(sourceId);
    const targetChain = chain(targetId);
    const targetAncestors = new Set(targetChain);
    const common = sourceChain.find((id) => targetAncestors.has(id))!;
    let segmentIndex = 0;
    const segment = (scopeId: string, source: string, target: string, label = ""): LocalSegment => {
      const value = { id: `segment-${edgeIndex}-${segmentIndex++}`, scopeId, source, target, label };
      scopes.get(scopeId)!.segments.push(value);
      return value;
    };
    const ascend = (path: string[], endpoint: string, outgoing: boolean, oppositeId: string) => {
      const segments: LocalSegment[] = [];
      let current = endpoint;
      for (const scopeId of path) {
        if (scopeId === common) break;
        const scope = scopes.get(scopeId)!;
        const portId = `port-${edgeIndex}-${outgoing ? "out" : "in"}-${scopeId}`;
        // North-facing ports would run through the container header. Inputs use the side gutter.
        const side = outgoing ? "EAST" : "WEST";
        scope.ports.push({ id: portId, edgeId: edge.id, oppositeId, outgoing, side, order: scope.ports.length });
        segments.push(outgoing ? segment(scopeId, current, portId) : segment(scopeId, portId, current));
        current = portId;
      }
      return { endpoint: current, segments };
    };
    const source = ascend(sourceChain, sourceId, true, edge.target);
    const target = ascend(targetChain, targetId, false, edge.source);
    routes.set(edge.id, [
      ...source.segments,
      segment(common, source.endpoint, target.endpoint, edge.label),
      ...target.segments.reverse(),
    ]);
  });
  return { rootId, sceneIds, scopes, order: [...scopes.keys()], routes };
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
