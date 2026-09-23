import type { FlowEdge, Point, ServiceNode, Workspace } from './model';
import { canvasSettings, edgeEndpoint } from './model';
import { reconnectEdge } from './routing';

export const CONTAINER_PADDING = 32;
export const CONTAINER_HEADER = 56;

export interface SceneNode extends ServiceNode {
  base: ServiceNode;
  depth: number;
  expanded: boolean;
  /** Display origin of the owning graph, relative to the focused graph. */
  offset: Point;
}
export interface SceneEdge extends FlowEdge {
  original: FlowEdge;
  sourceNode: SceneNode;
  targetNode: SceneNode;
  projected: boolean;
  offset: Point;
  editable: boolean;
}
export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  graphOrigins: Map<string, Point>;
}

function hierarchyIndex(workspace: Workspace) {
  const byId = new Map(workspace.nodes.map((node) => [node.id, node]));
  const graphParents = new Map(workspace.graphs.map((graph) => [graph.id, graph.parentNodeId]));
  const children = new Map<string, ServiceNode[]>();
  for (const node of workspace.nodes) {
    const list = children.get(node.graphId) || [];
    list.push(node);
    children.set(node.graphId, list);
  }
  return { byId, graphParents, children };
}
type Hierarchy = ReturnType<typeof hierarchyIndex>;

/** Canonical origins never depend on expansion, content bounds, or display reflow. */
function origins(workspace: Workspace, index = hierarchyIndex(workspace)): Map<string, Point> {
  const result = new Map<string, Point>([[workspace.rootGraphId, { x: 0, y: 0 }]]);
  const pending = [workspace.rootGraphId];
  while (pending.length) {
    const graphId = pending.pop()!;
    const origin = result.get(graphId)!;
    for (const node of index.children.get(graphId) || []) {
      result.set(node.childGraphId, {
        x: origin.x + node.x + CONTAINER_PADDING,
        y: origin.y + node.y + CONTAINER_HEADER,
      });
      pending.push(node.childGraphId);
    }
  }
  return result;
}

function projectCanonical(node: ServiceNode, ownerGraphId: string, allOrigins: Map<string, Point>) {
  const from = allOrigins.get(node.graphId)!;
  const to = allOrigins.get(ownerGraphId)!;
  return { ...node, x: node.x + from.x - to.x, y: node.y + from.y - to.y };
}

/** Stored routes attach to the all-collapsed geometry in their owning graph. */
export function canonicalNode(workspace: Workspace, nodeId: string, ownerGraphId: string): ServiceNode {
  const node = workspace.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error('Service node was not found.');
  return projectCanonical(node, ownerGraphId, origins(workspace));
}

export function rerouteEdges(workspace: Workspace): Workspace {
  const allOrigins = origins(workspace);
  return {
    ...workspace,
    edges: workspace.edges.map((edge) => {
      const source = edgeEndpoint(workspace, edge, 'source');
      const target = edgeEndpoint(workspace, edge, 'target');
      if (!source || !target) return edge;
      return {
        ...edge,
        points: reconnectEdge(
          edge,
          projectCanonical(source, edge.graphId, allOrigins),
          projectCanonical(target, edge.graphId, allOrigins),
        ),
      };
    }),
  };
}

type Bounds = { left: number; top: number; right: number; bottom: number };
type DisplayNode = ServiceNode & { base: ServiceNode; childOrigin: Point };
type GraphLayout = { nodes: DisplayNode[]; bounds: Bounds };

/** Insert the additional space occupied by expanded nodes into the baseline layout.
 * This is a coordinate transform, not a collision solver: no node is clamped or
 * repeatedly pushed away during a drag, and baseline overlaps remain untouched. */
function expansionOffsets(nodes: DisplayNode[], workspace: Workspace) {
  if (!nodes.some((node) => node.expanded)) return;
  const settings = canvasSettings(workspace);
  const outward = (value: number) =>
    settings.snapToGrid
      ? Math.sign(value) * Math.ceil(Math.abs(value) / settings.gridSize) * settings.gridSize
      : value;
  // Solve ordered spacing constraints using the greatest necessary displacement.
  // Parallel rows share clearance instead of adding their growth repeatedly.
  // Unrelated rows/columns and intentional baseline overlaps remain undisturbed.
  const overlaps = (a: number, sizeA: number, b: number, sizeB: number) => a < b + sizeB && b < a + sizeA;
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height';
    const cross = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'height' : 'width';
    const ordered = [...nodes].sort((a, b) => a.base[axis] - b.base[axis] || a.id.localeCompare(b.id));
    for (let i = 0; i < ordered.length; i++) {
      const node = ordered[i];
      let shift = 0;
      for (const other of ordered.slice(0, i)) {
        const gap = node.base[axis] - other.base[axis] - other.base[size];
        if (gap < 0 || !overlaps(node[cross], node[crossSize], other[cross], other[crossSize])) continue;
        const growth = other[axis] + other[size] - other.base[axis] - other.base[size];
        const before = Math.max(0, node.base[axis] - node[axis]);
        shift = Math.max(shift, growth + before);
      }
      shift = outward(Math.max(0, shift));
      node[axis] += shift;
      node.childOrigin[axis] += shift;
    }
  }
}

function flatten(focusGraphId: string, layouts: Map<string, GraphLayout>) {
  const nodes: SceneNode[] = [];
  const graphOrigins = new Map<string, Point>([[focusGraphId, { x: 0, y: 0 }]]);
  const pending = [{ graphId: focusGraphId, depth: 0 }];
  while (pending.length) {
    const { graphId, depth } = pending.pop()!;
    const offset = graphOrigins.get(graphId)!;
    const local = layouts.get(graphId)?.nodes || [];
    for (const node of local) {
      nodes.push({
        ...node,
        x: node.x + offset.x,
        y: node.y + offset.y,
        depth,
        offset,
        expanded: !!node.expanded,
      });
      if (node.expanded) {
        graphOrigins.set(node.childGraphId, {
          x: offset.x + node.childOrigin.x,
          y: offset.y + node.childOrigin.y,
        });
        pending.push({ graphId: node.childGraphId, depth: depth + 1 });
      }
    }
  }
  nodes.sort((a, b) => a.depth - b.depth);
  return { nodes, graphOrigins };
}

function renderEdges(
  workspace: Workspace,
  visible: ReturnType<typeof flatten>,
  index: Hierarchy,
  allOrigins: Map<string, Point>,
  edges = workspace.edges,
): SceneEdge[] {
  const byId = new Map(visible.nodes.map((node) => [node.id, node]));
  const representative = (original: ServiceNode): SceneNode | undefined => {
    let node: ServiceNode | undefined = original;
    while (node) {
      const found = byId.get(node.id);
      if (found) return found;
      const parentId = index.graphParents.get(node.graphId);
      node = parentId ? index.byId.get(parentId) : undefined;
    }
    return undefined;
  };
  const result: SceneEdge[] = [];
  for (const original of edges) {
    const source = edgeEndpoint(workspace, original, 'source');
    const target = edgeEndpoint(workspace, original, 'target');
    if (!source || !target) continue;
    const sourceNode = representative(source),
      targetNode = representative(target);
    if (!sourceNode || !targetNode) continue;
    const projected = sourceNode.id !== source.id || targetNode.id !== target.id;
    if (projected && sourceNode.id === targetNode.id) continue;
    const offset = visible.graphOrigins.get(original.graphId) || { x: 0, y: 0 };
    const canonical = original.points.length
      ? original.points
      : reconnectEdge(
          original,
          projectCanonical(source, original.graphId, allOrigins),
          projectCanonical(target, original.graphId, allOrigins),
        );
    const rendered = {
      ...original,
      source: sourceNode.key,
      target: targetNode.key,
      points: canonical.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
    };
    result.push({
      ...rendered,
      points: reconnectEdge(projected ? { ...rendered, points: [] } : rendered, sourceNode, targetNode),
      original,
      sourceNode,
      targetNode,
      projected,
      offset,
      editable: !projected,
    });
  }
  return result;
}

/** All expanded sizes, offsets, and endpoint adaptations are disposable presentation data. */
export function scene(workspace: Workspace, focusGraphId: string): Scene {
  const index = hierarchyIndex(workspace);
  const allOrigins = origins(workspace, index);
  const order: string[] = [];
  const pending = [workspace.rootGraphId];
  while (pending.length) {
    const graphId = pending.pop()!;
    order.push(graphId);
    for (const node of index.children.get(graphId) || []) pending.push(node.childGraphId);
  }
  const ownedEdges = new Map<string, FlowEdge[]>();
  for (const edge of workspace.edges) {
    const list = ownedEdges.get(edge.graphId) || [];
    list.push(edge);
    ownedEdges.set(edge.graphId, list);
  }
  const layouts = new Map<string, GraphLayout>();
  for (const graphId of order.reverse()) {
    const nodes = (index.children.get(graphId) || []).map((base): DisplayNode => {
      const bounds = layouts.get(base.childGraphId)!.bounds;
      const childOrigin = { x: base.x + CONTAINER_PADDING, y: base.y + CONTAINER_HEADER };
      if (!base.expanded) return { ...base, base, childOrigin };
      const empty = !index.children.get(base.childGraphId)?.length;
      return {
        ...base,
        base,
        childOrigin,
        type: 'service',
        x: base.x + bounds.left,
        y: base.y + bounds.top,
        width: Math.max(empty ? 240 : 160, bounds.right - bounds.left + 2 * CONTAINER_PADDING),
        height: Math.max(
          empty ? 144 : CONTAINER_HEADER + CONTAINER_PADDING,
          bounds.bottom - bounds.top + CONTAINER_HEADER + CONTAINER_PADDING,
        ),
      };
    });
    expansionOffsets(nodes, workspace);
    const bounds: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const include = (x: number, y: number) => {
      bounds.left = Math.min(bounds.left, x);
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x);
      bounds.bottom = Math.max(bounds.bottom, y);
    };
    for (const node of nodes) {
      include(node.x, node.y);
      include(node.x + node.width, node.y + node.height);
    }
    layouts.set(graphId, { nodes, bounds });
    if (ownedEdges.has(graphId)) {
      const visible = flatten(graphId, layouts);
      for (const edge of renderEdges(workspace, visible, index, allOrigins, ownedEdges.get(graphId)))
        for (const point of edge.points) include(point.x, point.y);
    }
    if (!nodes.length) Object.assign(bounds, { left: 0, top: 0, right: 0, bottom: 0 });
  }
  const visible = flatten(focusGraphId, layouts);
  return { ...visible, edges: renderEdges(workspace, visible, index, allOrigins) };
}

/** Convert an explicit displayed path edit back to its invariant owning-graph coordinates. */
export function canonicalEdgePoints(workspace: Workspace, edge: SceneEdge, points: Point[]): Point[] {
  const local = points.map((point) => ({ x: point.x - edge.offset.x, y: point.y - edge.offset.y }));
  return reconnectEdge(
    { ...edge.original, points: local, routing: 'manual' },
    canonicalNode(workspace, edge.sourceNode.id, edge.graphId),
    canonicalNode(workspace, edge.targetNode.id, edge.graphId),
  );
}

/** Reconnect only canonical routes. Rendering owns all container fitting and reflow. */
export function relayoutWorkspace(workspace: Workspace): Workspace {
  return rerouteEdges(workspace);
}

export function toggleExpanded(workspace: Workspace, nodeId: string): Workspace {
  return {
    ...workspace,
    nodes: workspace.nodes.map((node) => (node.id === nodeId ? { ...node, expanded: !node.expanded } : node)),
  };
}

export interface NodeGeometryUpdate {
  id: string;
  patch: Partial<ServiceNode>;
}
export function updateNodeGeometry(
  workspace: Workspace,
  nodeId: string,
  patch: Partial<ServiceNode>,
): Workspace {
  return updateNodesGeometry(workspace, [{ id: nodeId, patch }]);
}

/** Only the edited nodes change. Manual overlap is valid; descendants move with their ancestor. */
export function updateNodesGeometry(workspace: Workspace, updates: NodeGeometryUpdate[]): Workspace {
  const next = structuredClone(workspace);
  const { byId, graphParents } = hierarchyIndex(next);
  const movingIds = new Set(
    updates.filter(({ patch }) => patch.x !== undefined || patch.y !== undefined).map(({ id }) => id),
  );
  let geometryChanged = false;
  for (const { id, patch } of updates) {
    const node = byId.get(id);
    if (!node) continue;
    const { width, height, expandedSize: _ignored, ...rest } = patch;
    let parentId = graphParents.get(node.graphId);
    while (parentId) {
      if (movingIds.has(parentId)) {
        delete rest.x;
        delete rest.y;
        break;
      }
      parentId = graphParents.get(byId.get(parentId)!.graphId);
    }
    Object.assign(node, rest);
    if (!node.expanded) {
      if (width !== undefined) node.width = width;
      if (height !== undefined) node.height = height;
    }
    if (node.type === 'terminal')
      node.width = node.height = node.expanded
        ? Math.max(node.width, node.height)
        : (width ?? height ?? Math.max(node.width, node.height));
    geometryChanged ||= Object.keys(patch).some((key) => ['x', 'y', 'width', 'height', 'type'].includes(key));
  }
  return geometryChanged ? rerouteEdges(next) : next;
}

/** Every edge contributes once to each endpoint's ancestor subtree, including internal flows. */
export function nodeDegrees(workspace: Workspace): Map<string, { incoming: number; outgoing: number }> {
  const result = new Map(workspace.nodes.map((node) => [node.id, { incoming: 0, outgoing: 0 }]));
  const { byId, graphParents } = hierarchyIndex(workspace);
  const count = (start: ServiceNode | undefined, direction: 'incoming' | 'outgoing') => {
    let node = start;
    while (node) {
      result.get(node.id)![direction]++;
      const parentId = graphParents.get(node.graphId);
      node = parentId ? byId.get(parentId) : undefined;
    }
  };
  for (const edge of workspace.edges) {
    count(edgeEndpoint(workspace, edge, 'source'), 'outgoing');
    count(edgeEndpoint(workspace, edge, 'target'), 'incoming');
  }
  return result;
}
