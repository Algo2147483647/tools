import { edgeEndpoint, edgeGraphId, type Workspace } from './model';
import { canonicalNode, rerouteEdges } from './hierarchy';

export function graphDepths(workspace: Workspace, graphId: string): Map<string, number> {
  const children = new Map<string, typeof workspace.nodes>();
  for (const node of workspace.nodes)
    children.set(node.graphId, [...(children.get(node.graphId) ?? []), node]);
  const depths = new Map<string, number>();
  const pending = [{ id: graphId, depth: 1 }];
  while (pending.length) {
    const graph = pending.pop()!;
    for (const node of children.get(graph.id) ?? []) {
      depths.set(node.id, graph.depth);
      pending.push({ id: node.childGraphId, depth: graph.depth + 1 });
    }
  }
  return depths;
}

/** Reveal exactly this many internal levels below the focused graph in one undo step. */
export function expandToDepth(workspace: Workspace, graphId: string, depth: number): Workspace {
  const depths = graphDepths(workspace, graphId);
  const populated = new Set(workspace.nodes.map((node) => node.graphId));
  return {
    ...workspace,
    nodes: workspace.nodes.map((node) =>
      depths.has(node.id)
        ? { ...node, expanded: depths.get(node.id)! <= depth && populated.has(node.childGraphId) }
        : node,
    ),
  };
}

export function moveDestinations(workspace: Workspace, nodeId: string) {
  const node = workspace.nodes.find((node) => node.id === nodeId);
  if (!node) return [];
  const descendants = graphDepths(workspace, node.childGraphId);
  return workspace.graphs.filter(
    (graph) =>
      graph.id !== node.graphId &&
      graph.parentNodeId !== nodeId &&
      (!graph.parentNodeId || !descendants.has(graph.parentNodeId)),
  );
}

/** Keep identities/documents/subtrees intact; re-own and reconnect routes after a structural move. */
export function moveToGraph(workspace: Workspace, nodeId: string, graphId: string): Workspace {
  if (!moveDestinations(workspace, nodeId).some((graph) => graph.id === graphId))
    throw new Error('Choose a different graph outside this service and its descendants.');
  const peers = workspace.nodes.filter((node) => node.graphId === graphId);
  const next = structuredClone(workspace);
  const node = next.nodes.find((node) => node.id === nodeId)!;
  node.graphId = graphId;
  node.x = peers.length ? Math.max(...peers.map((peer) => peer.x + peer.width)) + 64 : 0;
  node.y = peers.length ? Math.min(...peers.map((peer) => peer.y)) : 0;
  next.edges = next.edges.map((edge) => {
    const source = edgeEndpoint(next, edge, 'source')!,
      target = edgeEndpoint(next, edge, 'target')!;
    const owner = edgeGraphId(next, source, target);
    if (owner === edge.graphId) return edge;
    // Translate manual points between the old graph coordinate frames, then reattach.
    const old = canonicalNode(workspace, source.id, edge.graphId);
    const projected = canonicalNode(workspace, source.id, owner);
    return {
      ...edge,
      graphId: owner,
      points: edge.points.map((point) => ({
        x: point.x + projected.x - old.x,
        y: point.y + projected.y - old.y,
      })),
    };
  });
  return rerouteEdges(next);
}

export type TraceKind = 'focus' | 'upstream' | 'downstream' | 'both';
export interface FlowTrace {
  nodes: Map<string, TraceKind>;
  edges: Map<string, TraceKind>;
}
export function traceFlows(workspace: Workspace, nodeId: string): FlowTrace {
  const node = workspace.nodes.find((node) => node.id === nodeId);
  const result: FlowTrace = { nodes: new Map(), edges: new Map() };
  if (!node) return result;
  const seeds = new Set([nodeId, ...graphDepths(workspace, node.childGraphId).keys()]);
  const incoming = new Map<string, { node: string; edge: string }[]>();
  const outgoing = new Map<string, { node: string; edge: string }[]>();
  for (const edge of workspace.edges) {
    const source = edgeEndpoint(workspace, edge, 'source')!,
      target = edgeEndpoint(workspace, edge, 'target')!;
    incoming.set(target.id, [...(incoming.get(target.id) ?? []), { node: source.id, edge: edge.id }]);
    outgoing.set(source.id, [...(outgoing.get(source.id) ?? []), { node: target.id, edge: edge.id }]);
  }
  const mark = (map: Map<string, TraceKind>, id: string, kind: TraceKind) => {
    const previous = map.get(id);
    if (previous !== 'focus') map.set(id, previous && previous !== kind ? 'both' : kind);
  };
  for (const id of seeds) result.nodes.set(id, 'focus');
  for (const [links, kind] of [
    [incoming, 'upstream'],
    [outgoing, 'downstream'],
  ] as const) {
    const seen = new Set(seeds),
      pending = [...seeds];
    while (pending.length)
      for (const link of links.get(pending.pop()!) ?? []) {
        mark(result.edges, link.edge, kind);
        mark(result.nodes, link.node, kind);
        if (!seen.has(link.node)) {
          seen.add(link.node);
          pending.push(link.node);
        }
      }
  }
  // Ancestors carry the highlight when a real endpoint is hidden, without traversing their own edges.
  const nodes = new Map(workspace.nodes.map((node) => [node.id, node]));
  const parents = new Map(workspace.graphs.map((graph) => [graph.id, graph.parentNodeId]));
  const direct = new Set(result.nodes.keys());
  for (const [id, kind] of [...result.nodes]) {
    let parent = parents.get(nodes.get(id)!.graphId);
    while (parent) {
      if (!direct.has(parent)) mark(result.nodes, parent, kind);
      parent = parents.get(nodes.get(parent)!.graphId);
    }
  }
  return result;
}
