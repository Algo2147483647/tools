import type { ElkNode } from 'elkjs/lib/elk-api';
import { canvasSettings, edgeEndpoint, snapCoordinate, type ServiceNode, type Workspace } from './model';
import { rerouteEdges } from './hierarchy';
import { graphDepths } from './graphActions';

export type LayoutEngine = (graph: ElkNode) => Promise<ElkNode>;

/** Lay out each owning graph in its all-collapsed frame, independent of display expansion. */
export async function autoLayout(
  workspace: Workspace,
  graphId: string,
  layout: LayoutEngine,
): Promise<Workspace> {
  if (!workspace.graphs.some((graph) => graph.id === graphId)) throw new Error('Graph was not found.');
  const next = structuredClone(workspace);
  const ids = new Set(graphDepths(next, graphId).keys());
  const targets = new Set([
    graphId,
    ...next.nodes.filter((node) => ids.has(node.id)).map((node) => node.childGraphId),
  ]);
  const nodes = new Map(next.nodes.map((node) => [node.id, node]));
  const parents = new Map(next.graphs.map((graph) => [graph.id, graph.parentNodeId]));
  const settings = canvasSettings(next);
  const spacing = Math.max(72, settings.snapToGrid ? settings.gridSize * 2 : 0);
  const representative = (node: ServiceNode | undefined, owner: string): ServiceNode | undefined => {
    while (node && node.graphId !== owner) node = nodes.get(parents.get(node.graphId) ?? '');
    return node;
  };
  for (const owner of targets) {
    const peers = next.nodes
      .filter((node) => node.graphId === owner)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!peers.length) continue;
    const links = next.edges.flatMap((edge) => {
      const source = edgeEndpoint(next, edge, 'source');
      const target = edgeEndpoint(next, edge, 'target');
      const from = representative(source, owner);
      const to = representative(target, owner);
      if (!from || !to || (from.id === to.id && source?.id !== target?.id)) return [];
      return [{ id: `edge:${edge.id}`, sources: [`node:${from.id}`], targets: [`node:${to.id}`] }];
    });
    const result = await layout({
      id: `graph:${owner}`,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.spacing.nodeNode': String(spacing),
        'elk.spacing.componentComponent': String(spacing + 24),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing + 48),
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.randomSeed': '1',
        'elk.padding': '[top=40,left=40,bottom=40,right=40]',
      },
      children: peers.map((node) => ({ id: `node:${node.id}`, width: node.width, height: node.height })),
      edges: links,
    });
    if (result.children?.length !== peers.length)
      throw new Error('The layout engine returned an incomplete graph.');
    const seen = new Set<string>();
    for (const placed of result.children) {
      const node = nodes.get(placed.id.slice('node:'.length));
      if (
        !node ||
        node.graphId !== owner ||
        seen.has(node.id) ||
        !Number.isFinite(placed.x) ||
        !Number.isFinite(placed.y)
      )
        throw new Error('The layout engine returned invalid coordinates.');
      seen.add(node.id);
      node.x = snapCoordinate(placed.x!, settings);
      node.y = snapCoordinate(placed.y!, settings);
    }
  }
  const affected = new Set(
    next.edges
      .filter(
        (edge) =>
          ids.has(edgeEndpoint(next, edge, 'source')!.id) || ids.has(edgeEndpoint(next, edge, 'target')!.id),
      )
      .map((edge) => edge.id),
  );
  next.edges = next.edges.map((edge) =>
    affected.has(edge.id) ? { ...edge, points: [], routing: 'auto' } : edge,
  );
  const routed = rerouteEdges(next);
  next.edges = next.edges.map((edge, index) => (affected.has(edge.id) ? routed.edges[index] : edge));
  return next;
}
