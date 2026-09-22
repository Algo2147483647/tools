import type { FlowEdge, Point, ServiceNode, Workspace } from './model';
import { canvasSettings, edgeEndpoint } from './model';
import { reconnectEdge } from './routing';

export const CONTAINER_PADDING = 32;
export const CONTAINER_HEADER = 56;
const SIBLING_GAP = 24;

function ceilToGrid(value: number, workspace: Workspace): number {
  const settings = canvasSettings(workspace);
  return settings.snapToGrid ? Math.ceil(value / settings.gridSize) * settings.gridSize : value;
}

export interface SceneNode extends ServiceNode {
  base: ServiceNode;
  depth: number;
  expanded: boolean;
  /** The node's owning graph origin, relative to the focused graph. */
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

/** Origins are independent of visibility: collapsing never changes stored path coordinates. */
function origins(workspace: Workspace): Map<string, Point> {
  const { children } = hierarchyIndex(workspace);
  const result = new Map<string, Point>([[workspace.rootGraphId, { x: 0, y: 0 }]]);
  const pending = [workspace.rootGraphId];
  while (pending.length) {
    const graphId = pending.pop()!;
    const origin = result.get(graphId)!;
    for (const node of children.get(graphId) || []) {
      result.set(node.childGraphId, {
        x: origin.x + node.x + CONTAINER_PADDING,
        y: origin.y + node.y + CONTAINER_HEADER,
      });
      pending.push(node.childGraphId);
    }
  }
  return result;
}

function retainedSize(node: ServiceNode) {
  return {
    width: Math.max(node.width, node.expandedSize?.width || node.width),
    height: Math.max(node.height, node.expandedSize?.height || node.height),
  };
}

function displayedSize(node: ServiceNode) {
  return node.expanded ? retainedSize(node) : { width: node.width, height: node.height };
}

/** Canonical geometry uses a retained expanded footprint, even when its node is collapsed. */
export function canonicalNode(workspace: Workspace, nodeId: string, ownerGraphId: string): ServiceNode {
  const node = workspace.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error('Service node was not found.');
  const allOrigins = origins(workspace);
  const from = allOrigins.get(node.graphId) || { x: 0, y: 0 };
  const to = allOrigins.get(ownerGraphId) || { x: 0, y: 0 };
  return {
    ...node,
    ...retainedSize(node),
    x: node.x + from.x - to.x,
    y: node.y + from.y - to.y,
    type: node.expandedSize ? 'service' : node.type,
  };
}

function ancestorIds(node: ServiceNode, workspace: Workspace): Set<string> {
  const { byId, graphParents } = hierarchyIndex(workspace);
  const result = new Set<string>();
  let parentId = graphParents.get(node.graphId);
  while (parentId) {
    result.add(parentId);
    const parent = byId.get(parentId);
    parentId = parent && graphParents.get(parent.graphId);
  }
  return result;
}

/** Reconnect in each edge's owning graph; callers may edit nodes anywhere in the hierarchy. */
export function rerouteEdges(workspace: Workspace): Workspace {
  const allOrigins = origins(workspace);
  const { children } = hierarchyIndex(workspace);
  return {
    ...workspace,
    edges: workspace.edges.map((edge) => {
      const source = edgeEndpoint(workspace, edge, 'source');
      const target = edgeEndpoint(workspace, edge, 'target');
      if (!source || !target) return edge;
      const owner = allOrigins.get(edge.graphId) || { x: 0, y: 0 };
      const project = (node: ServiceNode, obstacle = false): ServiceNode => {
        const origin = allOrigins.get(node.graphId) || { x: 0, y: 0 };
        return {
          ...node,
          ...(obstacle ? displayedSize(node) : retainedSize(node)),
          x: origin.x - owner.x + node.x,
          y: origin.y - owner.y + node.y,
          type: node.expandedSize ? 'service' : node.type,
        };
      };
      const excluded = new Set([...ancestorIds(source, workspace), ...ancestorIds(target, workspace)]);
      const obstacles: ServiceNode[] = [];
      const pending = [edge.graphId];
      while (pending.length) {
        for (const node of children.get(pending.pop()!) || []) {
          if (!excluded.has(node.id)) obstacles.push(project(node, true));
          else {
            if (node.expanded && node.id !== source.id && node.id !== target.id)
              obstacles.push({ ...project(node, true), id: `header:${node.id}`, height: CONTAINER_HEADER });
            pending.push(node.childGraphId);
          }
        }
      }
      return { ...edge, points: reconnectEdge(edge, project(source), project(target), obstacles) };
    }),
  };
}

/** Flatten only visible descendants; projection never mutates the canonical edge. */
export function scene(workspace: Workspace, focusGraphId: string): Scene {
  const { byId, graphParents, children } = hierarchyIndex(workspace);
  const graphOrigins = origins(workspace);
  const focus = graphOrigins.get(focusGraphId) || { x: 0, y: 0 };
  for (const [graphId, origin] of graphOrigins)
    graphOrigins.set(graphId, { x: origin.x - focus.x, y: origin.y - focus.y });
  const nodes: SceneNode[] = [];
  const pending = [{ graphId: focusGraphId, depth: 0 }];
  while (pending.length) {
    const { graphId, depth } = pending.pop()!;
    const offset = graphOrigins.get(graphId) || { x: 0, y: 0 };
    const localNodes = children.get(graphId) || [];
    for (const node of localNodes) {
      nodes.push({
        ...node,
        ...displayedSize(node),
        x: node.x + offset.x,
        y: node.y + offset.y,
        base: node,
        depth,
        expanded: !!node.expanded,
        offset,
      });
    }
    for (let index = localNodes.length - 1; index >= 0; index--)
      if (localNodes[index].expanded)
        pending.push({ graphId: localNodes[index].childGraphId, depth: depth + 1 });
  }
  // Containers precede their contents, so SVG paint and hit order are deterministic.
  nodes.sort((a, b) => a.depth - b.depth);
  const visible = new Map(nodes.map((node) => [node.id, node]));
  const representative = (original: ServiceNode): SceneNode | undefined => {
    let node: ServiceNode | undefined = original;
    while (node) {
      const found = visible.get(node.id);
      if (found) return found;
      const parentId = graphParents.get(node.graphId);
      node = parentId ? byId.get(parentId) : undefined;
    }
    return undefined;
  };
  const edges: SceneEdge[] = [];
  // Empty paths are a valid import. Derive their canonical route without mutating the input,
  // using the same router as the first edit will persist.
  const blankRoutes = new Map(
    rerouteEdges({
      ...workspace,
      edges: workspace.edges.filter((edge) => edge.points.length === 0),
    }).edges.map((edge) => [edge.id, edge.points]),
  );
  for (const original of workspace.edges) {
    const source = edgeEndpoint(workspace, original, 'source');
    const target = edgeEndpoint(workspace, original, 'target');
    if (!source || !target) continue;
    const sourceNode = representative(source);
    const targetNode = representative(target);
    if (!sourceNode || !targetNode) continue;
    const projected = sourceNode.id !== source.id || targetNode.id !== target.id;
    if (projected && sourceNode.id === targetNode.id) continue;
    const offset = graphOrigins.get(original.graphId) || { x: 0, y: 0 };
    const excluded = new Set([...ancestorIds(sourceNode, workspace), ...ancestorIds(targetNode, workspace)]);
    const obstacles: ServiceNode[] = nodes.filter((node) => !excluded.has(node.id));
    for (const node of nodes)
      if (node.expanded && excluded.has(node.id) && node.id !== sourceNode.id && node.id !== targetNode.id)
        obstacles.push({ ...node, id: `header:${node.id}`, height: CONTAINER_HEADER });
    const rendered: FlowEdge = {
      ...original,
      source: sourceNode.key,
      target: targetNode.key,
      points: (blankRoutes.get(original.id) || original.points).map((point) => ({
        x: point.x + offset.x,
        y: point.y + offset.y,
      })),
    };
    const points = reconnectEdge(
      projected ? { ...rendered, points: [] } : rendered,
      sourceNode,
      targetNode,
      obstacles,
    );
    edges.push({
      ...rendered,
      points,
      original,
      sourceNode,
      targetNode,
      projected,
      offset,
      editable:
        !projected &&
        points.length === rendered.points.length &&
        points.every(
          (point, index) => point.x === rendered.points[index].x && point.y === rendered.points[index].y,
        ),
    });
  }
  return { nodes, edges, graphOrigins };
}

function normalizeChildren(workspace: Workspace, graphId: string): void {
  const children = workspace.nodes.filter((node) => node.graphId === graphId);
  const dx = ceilToGrid(Math.max(0, -Math.min(0, ...children.map((node) => node.x))), workspace);
  const dy = ceilToGrid(Math.max(0, -Math.min(0, ...children.map((node) => node.y))), workspace);
  if (!dx && !dy) return;
  for (const node of children) {
    node.x += dx;
    node.y += dy;
  }
  for (const edge of workspace.edges)
    if (edge.graphId === graphId)
      edge.points = edge.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

function expandToFit(workspace: Workspace, node: ServiceNode): void {
  const children = workspace.nodes.filter((child) => child.graphId === node.childGraphId);
  node.expandedSize = {
    width: ceilToGrid(
      Math.max(
        node.width,
        node.expandedSize?.width || 0,
        240,
        ...children.map((child) => child.x + displayedSize(child).width + CONTAINER_PADDING * 2),
      ),
      workspace,
    ),
    height: ceilToGrid(
      Math.max(
        node.height,
        node.expandedSize?.height || 0,
        160,
        ...children.map(
          (child) => child.y + displayedSize(child).height + CONTAINER_HEADER + CONTAINER_PADDING,
        ),
      ),
      workspace,
    ),
  };
}

/** Keep the edited node fixed, moving the least-distance right/down sibling first. */
function separateSiblings(workspace: Workspace, graphId: string, priorityId?: string): void {
  const siblings = workspace.nodes.filter((node) => node.graphId === graphId);
  siblings.sort((a, b) =>
    a.id === priorityId ? -1 : b.id === priorityId ? 1 : a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  );
  const placed: ServiceNode[] = [];
  for (const node of siblings) {
    const size = displayedSize(node);
    // Each displacement clears at least one obstacle; monotone moves cannot cycle.
    for (;;) {
      const collision = placed.find((other) => {
        const otherSize = displayedSize(other);
        return (
          node.x < other.x + otherSize.width + SIBLING_GAP &&
          node.x + size.width + SIBLING_GAP > other.x &&
          node.y < other.y + otherSize.height + SIBLING_GAP &&
          node.y + size.height + SIBLING_GAP > other.y
        );
      });
      if (!collision) break;
      const otherSize = displayedSize(collision);
      const right = ceilToGrid(collision.x + otherSize.width + SIBLING_GAP, workspace);
      const down = ceilToGrid(collision.y + otherSize.height + SIBLING_GAP, workspace);
      if (right - node.x <= down - node.y) node.x = right;
      else node.y = down;
    }
    placed.push(node);
  }
}

function relayout(workspace: Workspace, start: ServiceNode): Workspace {
  const { byId, graphParents } = hierarchyIndex(workspace);
  let node: ServiceNode | undefined = start;
  while (node) {
    if (node.graphId !== workspace.rootGraphId) normalizeChildren(workspace, node.graphId);
    separateSiblings(workspace, node.graphId, node.id);
    const parentId = graphParents.get(node.graphId);
    node = parentId ? byId.get(parentId) : undefined;
    if (node) expandToFit(workspace, node);
  }
  return rerouteEdges(workspace);
}

export function toggleExpanded(workspace: Workspace, nodeId: string): Workspace {
  const next = structuredClone(workspace);
  const node = next.nodes.find((item) => item.id === nodeId);
  if (!node) return workspace;
  node.expanded = !node.expanded;
  // Collapse deliberately keeps sibling positions and the retained canonical footprint.
  if (!node.expanded) return next;
  normalizeChildren(next, node.childGraphId);
  separateSiblings(next, node.childGraphId);
  expandToFit(next, node);
  return relayout(next, node);
}

/** x/y are graph-local. Resizing an expanded container preserves its collapsed dimensions. */
export function updateNodeGeometry(
  workspace: Workspace,
  nodeId: string,
  patch: Partial<ServiceNode>,
): Workspace {
  const next = structuredClone(workspace);
  const node = next.nodes.find((item) => item.id === nodeId);
  if (!node) return workspace;
  const { width, height, ...rest } = patch;
  Object.assign(node, rest);
  if (Object.keys(patch).length > 0 && Object.keys(patch).every((key) => key === 'fontSize')) return next;
  if (node.expanded) {
    node.expandedSize = {
      width: width ?? node.expandedSize?.width ?? node.width,
      height: height ?? node.expandedSize?.height ?? node.height,
    };
    normalizeChildren(next, node.childGraphId);
    expandToFit(next, node);
  } else {
    if (width !== undefined) node.width = width;
    if (height !== undefined) node.height = height;
  }
  if (node.type === 'terminal')
    node.width = node.height = node.expanded
      ? Math.max(node.width, node.height)
      : (width ?? height ?? Math.max(node.width, node.height));
  return relayout(next, node);
}
