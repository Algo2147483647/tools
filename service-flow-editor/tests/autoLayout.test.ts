import test from 'node:test';
import assert from 'node:assert/strict';
import ELK from 'elkjs/lib/elk.bundled.js';
import { autoLayout } from '../src/autoLayout';
import {
  createWorkspace,
  defaultCanvasSettings,
  edgeGraphId,
  validateWorkspace,
  type Workspace,
} from '../src/model';
import { rerouteEdges } from '../src/hierarchy';
import { isOrthogonal } from '../src/routing';

function fixture() {
  const w = createWorkspace('Layout verification');
  function node(id: string, graphId = 'root') {
    const n = {
      id,
      key: id,
      graphId,
      childGraphId: `${id}-inside`,
      x: 20,
      y: 20,
      width: 180,
      height: 96,
      expanded: id === 'Service',
    };
    w.nodes.push(n);
    w.graphs.push({ id: n.childGraphId, parentNodeId: id });
    return n;
  }
  const a = node('Client'),
    b = node('Service'),
    c = node('Database'),
    spare = node('Isolated');
  const child = node('Handler', b.childGraphId),
    leaf = node('Worker', child.childGraphId);
  const sibling = node('Validator', b.childGraphId);
  const pairs = [
    [a, child],
    [child, c],
    [c, a],
    [b, b],
    [child, sibling],
    [leaf, sibling],
  ];
  for (const [source, target] of pairs)
    w.edges.push({
      id: `flow-${w.edges.length}`,
      source: source.key,
      target: target.key,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      sourceSide: 'right',
      targetSide: 'left',
      graphId: edgeGraphId(w, source, target),
      weights: ['Request'],
      points: [],
      routing: 'auto',
    });
  return rerouteEdges(w);
}
function noOverlaps(w: Workspace) {
  for (const a of w.nodes)
    for (const b of w.nodes) {
      if (a.id >= b.id || a.graphId !== b.graphId) continue;
      assert.ok(
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
        `${a.key} overlaps ${b.key}`,
      );
    }
}
const elk = new ELK();
const layout = (graph: Parameters<typeof elk.layout>[0]) => elk.layout(graph);

test('layered layout handles cycles, self loops, disconnected nodes and cross-level flows without changing identities', async () => {
  const original = fixture(),
    untouched = structuredClone(original);
  const result = await autoLayout(original, 'root', layout);
  assert.deepEqual(original, untouched);
  validateWorkspace(result);
  noOverlaps(result);
  assert.deepEqual(result.graphs, original.graphs);
  assert.deepEqual(
    result.nodes.map(({ x, y, ...node }) => node),
    original.nodes.map(({ x, y, ...node }) => node),
  );
  for (const edge of result.edges) {
    const prior = original.edges.find((e) => e.id === edge.id)!;
    assert.equal(edge.sourceNodeId, prior.sourceNodeId);
    assert.equal(edge.targetNodeId, prior.targetNodeId);
    assert.deepEqual(edge.weights, prior.weights);
    assert.ok(isOrthogonal(edge.points));
  }
  const collapsed = structuredClone(original);
  collapsed.nodes.forEach((node) => {
    node.expanded = false;
  });
  const again = await autoLayout(collapsed, 'root', layout);
  assert.deepEqual(
    again.nodes.map((n) => [n.id, n.x, n.y]),
    result.nodes.map((n) => [n.id, n.x, n.y]),
  );
});

test('nested layout keeps outside geometry and flows unchanged and snaps to the configured grid', async () => {
  const original = fixture();
  original.canvas = { ...defaultCanvasSettings, snapToGrid: true, gridStyle: 'none', gridSize: 128 };
  const result = await autoLayout(original, 'Service-inside', layout);
  noOverlaps({ ...result, nodes: result.nodes.filter((n) => n.graphId !== 'root') });
  assert.deepEqual(
    result.nodes.filter((n) => n.graphId === 'root'),
    original.nodes.filter((n) => n.graphId === 'root'),
  );
  for (const n of result.nodes.filter((n) => n.graphId !== 'root')) {
    assert.equal(n.x % 128, 0);
    assert.equal(n.y % 128, 0);
  }
  assert.deepEqual(
    result.edges.find((e) => e.source === 'Service'),
    original.edges.find((e) => e.source === 'Service'),
  );
  validateWorkspace(result);
});

test('layout failure never mutates the working graph', async () => {
  const original = fixture(),
    untouched = structuredClone(original);
  await assert.rejects(
    autoLayout(original, 'root', async () => {
      throw new Error('Failed');
    }),
    /Failed/,
  );
  assert.deepEqual(original, untouched);
  await assert.rejects(
    autoLayout(original, 'root', async (graph) => ({ ...graph, children: [] })),
    /incomplete/,
  );
});
