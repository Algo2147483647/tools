import test from 'node:test';
import assert from 'node:assert/strict';
import ELK from 'elkjs/lib/elk.bundled.js';
import { autoLayout } from '../../src/serviceArchitecture/autoLayout';
import {
  createWorkspace,
  defaultCanvasSettings,
  edgeGraphId,
  validateWorkspace,
  type Workspace,
} from '../../src/serviceArchitecture/model';
import { canonicalNode, rerouteEdges, scene } from '../../src/serviceArchitecture/hierarchy';
import { anchor, isOrthogonal } from '../../src/serviceArchitecture/routing';

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
    [b, leaf],
    [leaf, b],
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
    assert.deepEqual(
      edge.points[0],
      anchor(canonicalNode(result, edge.sourceNodeId!, edge.graphId), edge.sourceSide),
    );
    assert.deepEqual(
      edge.points.at(-1),
      anchor(canonicalNode(result, edge.targetNodeId!, edge.graphId), edge.targetSide),
    );
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
  assert.deepEqual(again.edges, result.edges, 'ports must not depend on display expansion');
  assert.deepEqual(
    (await autoLayout(result, 'root', layout)).edges,
    result.edges,
    'repeated layout must be stable',
  );
});

test('auto layout replaces old port choices and saved and displayed routes avoid sibling nodes', async () => {
  const original = fixture();
  original.nodes = original.nodes.filter((node) => ['Client', 'Service', 'Database'].includes(node.id));
  original.nodes.forEach((node) => {
    node.expanded = false;
  });
  original.graphs = original.graphs.filter(
    (graph) => !graph.parentNodeId || original.nodes.some((node) => node.id === graph.parentNodeId),
  );
  original.edges = [
    {
      ...original.edges[0],
      graphId: 'root',
      source: 'Client',
      sourceNodeId: 'Client',
      target: 'Database',
      targetNodeId: 'Database',
      sourceSide: 'left',
      targetSide: 'right',
      routing: 'manual',
    },
  ];
  const result = await autoLayout(original, 'root', async (graph) => ({
    ...graph,
    children: graph.children!.map((node) => ({
      ...node,
      x: node.id === 'node:Client' ? 0 : node.id === 'node:Service' ? 180 : 600,
      y: 0,
    })),
  }));
  const edge = result.edges[0];
  assert.notEqual(edge.sourceSide, 'left');
  assert.notEqual(edge.targetSide, 'right');
  assert.equal(edge.routing, 'auto');
  assert.equal(original.edges[0].sourceSide, 'left', 'the input stays untouched for undo');
  const blocker = result.nodes.find((node) => node.id === 'Service')!;
  for (const points of [edge.points, scene(result, 'root').edges[0].points]) {
    assert.ok(isOrthogonal(points));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const crosses =
        a.x === b.x
          ? a.x > blocker.x &&
            a.x < blocker.x + blocker.width &&
            Math.max(a.y, b.y) > blocker.y &&
            Math.min(a.y, b.y) < blocker.y + blocker.height
          : a.y > blocker.y &&
            a.y < blocker.y + blocker.height &&
            Math.max(a.x, b.x) > blocker.x &&
            Math.min(a.x, b.x) < blocker.x + blocker.width;
      assert.equal(crosses, false, 'a route must not cut through the intervening service');
    }
  }
  validateWorkspace(result);
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
