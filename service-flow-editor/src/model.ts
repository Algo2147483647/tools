export interface Point {
  x: number;
  y: number;
}
export type Side = 'left' | 'right' | 'top' | 'bottom';
export type NodeType = 'service' | 'terminal';
export interface CanvasSettings {
  gridSize: number;
  gridStyle: 'dots' | 'lines';
  snapToGrid: boolean;
  nodeFontSize: number;
}
export const defaultCanvasSettings: CanvasSettings = {
  gridSize: 24,
  gridStyle: 'dots',
  snapToGrid: false,
  nodeFontSize: 20,
};
export function canvasSettings(workspace: Workspace): CanvasSettings {
  return { ...defaultCanvasSettings, ...workspace.canvas };
}
export function snapCoordinate(value: number, settings: CanvasSettings): number {
  return settings.snapToGrid ? Math.round(value / settings.gridSize) * settings.gridSize : Math.round(value);
}
export interface ServiceNode {
  id: string;
  key: string;
  graphId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  childGraphId: string;
  type?: NodeType;
  fontSize?: number;
  expanded?: boolean;
  expandedSize?: { width: number; height: number };
}
export interface Graph {
  id: string;
  parentNodeId: string | null;
}
export interface FlowEdge {
  id: string;
  graphId: string;
  source: string;
  target: string;
  /** Required in schema v2; optional in TypeScript for legacy v1 inputs. */
  sourceNodeId?: string;
  targetNodeId?: string;
  weights: string[];
  sourceSide: Side;
  targetSide: Side;
  points: Point[];
}
export interface Workspace {
  version: 1 | 2;
  name: string;
  rootGraphId: string;
  graphs: Graph[];
  nodes: ServiceNode[];
  edges: FlowEdge[];
  revision: number;
  canvas?: CanvasSettings;
}

const sides = new Set<Side>(['left', 'right', 'top', 'bottom']);
const fold = (value: string) => value.toLocaleLowerCase('en-US');

export function createWorkspace(name: string): Workspace {
  return {
    version: 2,
    name: name.trim() || 'Untitled workspace',
    rootGraphId: 'root',
    graphs: [{ id: 'root', parentNodeId: null }],
    nodes: [],
    edges: [],
    revision: 0,
    canvas: { ...defaultCanvasSettings },
  };
}

export function validateKey(key: string, nodes: ServiceNode[], excludeId?: string): string | null {
  if (typeof key !== 'string' || !key.trim()) return 'Service key is required.';
  if (key !== key.trim()) return 'Service keys cannot begin or end with whitespace.';
  if (key.length > 200) return 'Service keys must be at most 200 characters.';
  if (/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(key) || /[. ]$/.test(key) || key === '.' || key === '..') {
    return 'Service keys must be valid filenames: no path separators, control characters, or <>:"|?*, and no trailing dot.';
  }
  if (/^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(key))
    return 'This service key is a reserved Windows filename.';
  if (nodes.some((node) => node.id !== excludeId && fold(node.key) === fold(key)))
    return 'Service keys must be unique across every level (case insensitive).';
  return null;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid workspace: ${message}`);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 500;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Resolve stable endpoint identities, with key lookup only for legacy edges. */
export function edgeEndpoint(
  workspace: Workspace,
  edge: FlowEdge,
  endpoint: 'source' | 'target',
): ServiceNode | undefined {
  const id = endpoint === 'source' ? edge.sourceNodeId : edge.targetNodeId;
  return id === undefined
    ? workspace.nodes.find((node) => node.key === edge[endpoint])
    : workspace.nodes.find((node) => node.id === id);
}

function commonGraphId(
  graphMap: Map<string, Graph>,
  nodeMap: Map<string, ServiceNode>,
  source: ServiceNode,
  target: ServiceNode,
): string {
  const ancestors = (graphId: string): string[] => {
    const result: string[] = [];
    const visited = new Set<string>();
    let current: string | undefined = graphId;
    while (current !== undefined) {
      assert(!visited.has(current), 'cyclic graph hierarchy.');
      visited.add(current);
      const graph = graphMap.get(current);
      assert(graph, `missing graph ${current}.`);
      result.push(current);
      if (graph.parentNodeId === null) break;
      const parent = nodeMap.get(graph.parentNodeId);
      assert(parent, `orphan graph ${current}.`);
      current = parent.graphId;
    }
    return result;
  };
  const sourceAncestors = new Set(ancestors(source.graphId));
  const common = ancestors(target.graphId).find((graphId) => sourceAncestors.has(graphId));
  assert(common, 'edge endpoints must belong to the same hierarchy.');
  return common;
}

/** Every flow is owned by the lowest common containing graph of its endpoints. */
export function edgeGraphId(workspace: Workspace, source: ServiceNode, target: ServiceNode): string {
  return commonGraphId(
    new Map(workspace.graphs.map((graph) => [graph.id, graph])),
    new Map(workspace.nodes.map((node) => [node.id, node])),
    source,
    target,
  );
}

/** Validate the entire graph iteratively, with no fixed nesting-depth limit. */
export function validateWorkspace(data: unknown): Workspace {
  assert(record(data), 'expected a JSON object.');
  assert(data.version === 1 || data.version === 2, 'unsupported schema version.');
  assert(typeof data.name === 'string' && data.name.trim().length > 0, 'name is required.');
  assert(
    Number.isSafeInteger(data.revision) && (data.revision as number) >= 0,
    'revision must be a non-negative integer.',
  );
  assert(identifier(data.rootGraphId), 'rootGraphId is required.');
  if (data.canvas !== undefined) {
    const settings = data.canvas;
    assert(record(settings), 'canvas settings must be an object.');
    assert(
      Number.isInteger(settings.gridSize) &&
        (settings.gridSize as number) >= 8 &&
        (settings.gridSize as number) <= 128,
      'gridSize must be an integer from 8 to 128.',
    );
    assert(settings.gridStyle === 'dots' || settings.gridStyle === 'lines', 'invalid gridStyle.');
    assert(typeof settings.snapToGrid === 'boolean', 'snapToGrid must be a boolean.');
    assert(
      finite(settings.nodeFontSize) && settings.nodeFontSize >= 12 && settings.nodeFontSize <= 48,
      'nodeFontSize must be between 12 and 48.',
    );
  }
  assert(
    Array.isArray(data.graphs) && Array.isArray(data.nodes) && Array.isArray(data.edges),
    'graphs, nodes, and edges must be arrays.',
  );
  const graphMap = new Map<string, Graph>();
  const nodeMap = new Map<string, ServiceNode>();
  const keyMap = new Map<string, ServiceNode>();
  for (const value of data.graphs) {
    assert(
      record(value) &&
        identifier(value.id) &&
        (value.parentNodeId === null || identifier(value.parentNodeId)),
      'invalid graph.',
    );
    assert(!graphMap.has(value.id), `duplicate graph id ${value.id}.`);
    graphMap.set(value.id, value as unknown as Graph);
  }
  const root = graphMap.get(data.rootGraphId);
  assert(root?.parentNodeId === null, 'root graph is missing or has a parent.');
  for (const value of data.nodes) {
    assert(
      record(value) &&
        identifier(value.id) &&
        typeof value.key === 'string' &&
        identifier(value.graphId) &&
        identifier(value.childGraphId),
      'invalid service node.',
    );
    assert(!nodeMap.has(value.id), `duplicate node id ${value.id}.`);
    const error = validateKey(value.key, []);
    assert(!error, error || 'invalid key.');
    assert(!keyMap.has(fold(value.key)), `duplicate service key ${value.key}.`);
    assert(
      finite(value.x) &&
        finite(value.y) &&
        finite(value.width) &&
        finite(value.height) &&
        value.width > 0 &&
        value.height > 0,
      `invalid geometry for ${value.key}.`,
    );
    assert(graphMap.has(value.graphId), `missing graph for ${value.key}.`);
    assert(
      value.type === undefined || value.type === 'service' || value.type === 'terminal',
      `invalid node type for ${value.key}.`,
    );
    assert(
      value.type !== 'terminal' || value.width === value.height,
      `source / sink ${value.key} must have equal width and height.`,
    );
    assert(
      value.fontSize === undefined ||
        (finite(value.fontSize) && value.fontSize >= 12 && value.fontSize <= 48),
      `invalid font size for ${value.key}.`,
    );
    assert(
      value.expanded === undefined || typeof value.expanded === 'boolean',
      `invalid expanded state for ${value.key}.`,
    );
    assert(
      value.expanded !== true || value.expandedSize !== undefined,
      `expanded size is required for expanded node ${value.key}.`,
    );
    if (value.expandedSize !== undefined) {
      const size = value.expandedSize;
      assert(
        record(size) && finite(size.width) && finite(size.height) && size.width > 0 && size.height > 0,
        `invalid expanded size for ${value.key}.`,
      );
    }
    const child = graphMap.get(value.childGraphId);
    assert(
      child && child.id !== data.rootGraphId && child.parentNodeId === value.id,
      `invalid child graph for ${value.key}.`,
    );
    nodeMap.set(value.id, value as unknown as ServiceNode);
    keyMap.set(fold(value.key), value as unknown as ServiceNode);
  }
  const children = new Map<string, string[]>();
  for (const graph of graphMap.values()) {
    if (graph.id === data.rootGraphId) continue;
    const parent = graph.parentNodeId ? nodeMap.get(graph.parentNodeId) : undefined;
    assert(parent && parent.childGraphId === graph.id, `orphan graph ${graph.id}.`);
    const list = children.get(parent.graphId) || [];
    list.push(graph.id);
    children.set(parent.graphId, list);
  }
  const visited = new Set<string>();
  const pending = [data.rootGraphId];
  while (pending.length) {
    const current = pending.pop()!;
    assert(!visited.has(current), 'cyclic graph hierarchy.');
    visited.add(current);
    pending.push(...(children.get(current) || []));
  }
  assert(visited.size === graphMap.size, 'unreachable or cyclic graph hierarchy.');
  const edgeIds = new Set<string>();
  const migratedEdges: FlowEdge[] = [];
  for (const value of data.edges) {
    assert(
      record(value) &&
        identifier(value.id) &&
        identifier(value.graphId) &&
        typeof value.source === 'string' &&
        typeof value.target === 'string',
      'invalid edge.',
    );
    assert(!edgeIds.has(value.id), `duplicate edge id ${value.id}.`);
    edgeIds.add(value.id);
    if (data.version === 2) {
      assert(
        identifier(value.sourceNodeId) && identifier(value.targetNodeId),
        `stable endpoint IDs are required on edge ${value.id}.`,
      );
    }
    const source =
      data.version === 2 ? nodeMap.get(value.sourceNodeId as string) : keyMap.get(fold(value.source));
    const target =
      data.version === 2 ? nodeMap.get(value.targetNodeId as string) : keyMap.get(fold(value.target));
    assert(
      source && target && source.key === value.source && target.key === value.target,
      `missing endpoint or mismatched endpoint key on edge ${value.id}.`,
    );
    if (data.version === 1) {
      assert(
        source.graphId === value.graphId && target.graphId === value.graphId,
        `legacy edge ${value.id} crosses graph boundaries.`,
      );
    } else {
      assert(
        value.graphId === commonGraphId(graphMap, nodeMap, source, target),
        `edge ${value.id} must belong to the lowest common containing graph of its endpoints.`,
      );
    }
    assert(
      Array.isArray(value.weights) && value.weights.every((weight) => typeof weight === 'string'),
      `weights on ${value.id} must be a string array.`,
    );
    assert(
      sides.has(value.sourceSide as Side) && sides.has(value.targetSide as Side),
      `invalid attachment side on ${value.id}.`,
    );
    assert(
      Array.isArray(value.points) && (value.points.length === 0 || value.points.length >= 2),
      `invalid path on ${value.id}.`,
    );
    let previous: Point | undefined;
    for (const point of value.points) {
      assert(record(point) && finite(point.x) && finite(point.y), `invalid path point on ${value.id}.`);
      assert(
        !previous || Math.abs(previous.x - point.x) < 0.000001 || Math.abs(previous.y - point.y) < 0.000001,
        `edge ${value.id} must use orthogonal segments.`,
      );
      previous = point as unknown as Point;
    }
    migratedEdges.push({
      ...(value as unknown as FlowEdge),
      sourceNodeId: source.id,
      targetNodeId: target.id,
    });
  }
  return structuredClone({ ...data, version: 2, edges: migratedEdges }) as unknown as Workspace;
}

export function renameNode(workspace: Workspace, nodeId: string, key: string): Workspace {
  const node = workspace.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error('Service node was not found.');
  const error = validateKey(key, workspace.nodes, nodeId);
  if (error) throw new Error(error);
  return {
    ...workspace,
    nodes: workspace.nodes.map((item) => (item.id === nodeId ? { ...item, key } : item)),
    edges: workspace.edges.map((edge) => ({
      ...edge,
      source: (edge.sourceNodeId === undefined ? edge.source === node.key : edge.sourceNodeId === nodeId)
        ? key
        : edge.source,
      target: (edge.targetNodeId === undefined ? edge.target === node.key : edge.targetNodeId === nodeId)
        ? key
        : edge.target,
    })),
  };
}

export function removeNode(workspace: Workspace, nodeId: string): Workspace {
  const target = workspace.nodes.find((node) => node.id === nodeId);
  if (!target) return workspace;
  const graphNodes = new Map<string, ServiceNode[]>();
  for (const node of workspace.nodes) {
    const list = graphNodes.get(node.graphId) || [];
    list.push(node);
    graphNodes.set(node.graphId, list);
  }
  const removedNodes = new Set<string>();
  const removedGraphs = new Set<string>();
  const removedKeys = new Set<string>();
  const pending = [target];
  while (pending.length) {
    const current = pending.pop()!;
    if (removedNodes.has(current.id)) continue;
    removedNodes.add(current.id);
    removedKeys.add(current.key);
    removedGraphs.add(current.childGraphId);
    pending.push(...(graphNodes.get(current.childGraphId) || []));
  }
  return {
    ...workspace,
    nodes: workspace.nodes.filter((node) => !removedNodes.has(node.id)),
    graphs: workspace.graphs.filter((graph) => !removedGraphs.has(graph.id)),
    edges: workspace.edges.filter(
      (edge) =>
        !removedGraphs.has(edge.graphId) &&
        !removedNodes.has(edge.sourceNodeId || '') &&
        !removedNodes.has(edge.targetNodeId || '') &&
        !removedKeys.has(edge.source) &&
        !removedKeys.has(edge.target),
    ),
  };
}
