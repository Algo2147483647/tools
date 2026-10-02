import type { GraphDocument } from '../graph/types';
import { validateWorkspace, type Workspace } from './model';

/** A portable analysis snapshot; the service workspace stays authoritative. */
export function serviceWorkspaceToGraph(input: Workspace): GraphDocument {
  const workspace = validateWorkspace(input);
  const parents = new Map(workspace.graphs.map(graph => [graph.id, graph.parentNodeId]));
  const nodesById = new Map(workspace.nodes.map(node => [node.id, node]));
  // Service filenames may contain commas; Graph Studio keys may not.
  const key = (id: string) => `service:${encodeURIComponent(id)}`;
  const graph: GraphDocument = {
    format: 'graph-studio', version: 2, title: workspace.name,
    metadata: { serviceArchitecture: structuredClone(workspace) },
    nodes: Object.fromEntries(workspace.nodes.map(node => [key(node.id), {
      title: node.key, type: node.type === 'terminal' ? 'Terminal' : 'Service',
      serviceId: node.id, document: `${node.key}.md`,
      container: nodesById.get(parents.get(node.graphId) || '')?.key ?? null,
    }])),
    edges: [],
  };
  // v2 permits cycles but intentionally rejects self-loops and duplicate pairs.
  // Give each flow its own identity in the analysis graph: A → flow → B.
  // This preserves parallel flows and retries without weakening the v2 contract.
  for (const edge of workspace.edges) {
    const flowKey = `flow:${encodeURIComponent(edge.id)}`;
    graph.nodes[flowKey] = {
      title: edge.weights.join(' · ') || `${edge.source} → ${edge.target}`,
      type: 'Data flow', sourceService: edge.source, targetService: edge.target,
      weights: [...edge.weights], serviceFlow: structuredClone(edge),
    };
    graph.edges.push(
      { id: `${flowKey}:source`, source: key(edge.sourceNodeId!), target: flowKey, value: 'sends' },
      { id: `${flowKey}:target`, source: flowKey, target: key(edge.targetNodeId!), value: 'delivers to' },
    );
  }
  for (const node of workspace.nodes) {
    const parent = parents.get(node.graphId);
    if (parent) graph.edges.push({ id: `contains:${encodeURIComponent(node.id)}`, source: key(parent), target: key(node.id), value: 'contains' });
  }
  return graph;
}
