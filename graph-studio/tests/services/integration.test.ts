import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serviceWorkspaceToGraph } from '../../src/serviceArchitecture/graphExport';
import { validateWorkspace, renameNode } from '../../src/serviceArchitecture/model';
import { normalizeDagInput } from '../../src/graph/normalize';
import { discoverWorkspace } from '../../src/workspace/discovery';
import { buildStageData } from '../../src/layout/stage-layout';

async function example() {
  return validateWorkspace(JSON.parse(await readFile(new URL('../../examples/commerce-platform/workspace.json', import.meta.url), 'utf8')));
}

test('service export is a valid Graph Studio document preserving every nested node, flow and canonical route', async () => {
  const workspace = await example();
  const before = structuredClone(workspace);
  const graph = normalizeDagInput(serviceWorkspaceToGraph(workspace));
  assert.equal(Object.keys(graph.nodes).length, workspace.nodes.length + workspace.edges.length);
  assert.equal(graph.edges.length, workspace.edges.length * 2 + workspace.nodes.filter(node => node.graphId !== workspace.rootGraphId).length);
  assert.deepEqual(graph.metadata?.serviceArchitecture, before);
  assert.ok(Object.values(graph.nodes).some(node => node.container === 'Event Publisher'));
  for (const edge of workspace.edges) {
    const flowKey = `flow:${encodeURIComponent(edge.id)}`;
    const exported = graph.nodes[flowKey];
    assert.deepEqual(exported.weights, edge.weights);
    assert.deepEqual(exported.serviceFlow, edge);
    const source = graph.edges.find(item => item.id === `${flowKey}:source`)!;
    const target = graph.edges.find(item => item.id === `${flowKey}:target`)!;
    assert.equal(graph.nodes[source.source].serviceId, edge.sourceNodeId);
    assert.equal(graph.nodes[target.target].serviceId, edge.targetNodeId);
  }
  assert.deepEqual(workspace, before);
  assert.deepEqual(normalizeDagInput(JSON.parse(JSON.stringify(graph))).metadata, graph.metadata);
  for (const layoutMode of ['level', 'sugiyama', 'dagre'] as const) {
    const stage = buildStageData({ dag: graph, selection: { type: 'full' }, layoutMode })!;
    assert.equal(stage.nodes.length, Object.keys(graph.nodes).length, layoutMode);
    assert.equal(stage.edges.length, graph.edges.length, layoutMode);
    assert.ok(stage.edges.every(edge => !/NaN|Infinity/.test(edge.path)), layoutMode);
  }
});

test('parallel service flows keep separate identities, weights and paths in the analysis graph', async () => {
  const workspace = await example();
  workspace.edges.push({ ...structuredClone(workspace.edges[0]), id: 'parallel, flow', weights: ['another interface'] });
  const graph = normalizeDagInput(serviceWorkspaceToGraph(workspace));
  const flows = Object.values(graph.nodes).filter(node => node.type === 'Data flow');
  assert.equal(flows.length, workspace.edges.length);
  assert.deepEqual(graph.nodes['flow:parallel%2C%20flow'].weights, ['another interface']);
});

test('legal service names containing commas remain portable graph titles without breaking key validation', async () => {
  const workspace = await example();
  const node = workspace.nodes[0];
  const renamed = renameNode(workspace, node.id, 'Gateway, public');
  const graph = normalizeDagInput(serviceWorkspaceToGraph(renamed));
  const exported = Object.values(graph.nodes).find(item => item.serviceId === node.id)!;
  assert.equal(exported.title, 'Gateway, public');
  assert.equal(exported.document, 'Gateway, public.md');
});

test('folder discovery recognizes an existing service workspace and keeps generic graphs available beside it', async () => {
  const workspace = await example();
  const graph = serviceWorkspaceToGraph(workspace);
  const files = new Map([
    ['workspace.json', { path: 'workspace.json', handle: null, file: new File([JSON.stringify(workspace)], 'workspace.json') }],
    ['overview.graph.json', { path: 'overview.graph.json', handle: null, file: new File([JSON.stringify(graph)], 'overview.graph.json') }],
  ]);
  const found = await discoverWorkspace({ name: 'Architecture', handle: null, files });
  assert.equal(found.serviceArchitecturePath, 'workspace.json');
  assert.equal(found.graphs.length, 1);
  assert.equal(found.activePath, 'overview.graph.json');
  assert.ok(found.notices.some(notice => notice.includes('service architecture')));
});
