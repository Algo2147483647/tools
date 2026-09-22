import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspace, edgeGraphId, type FlowEdge, type ServiceNode, type Workspace } from '../src/model';
import { addBend, anchor, isOrthogonal, routeEdge } from '../src/routing';
import {
  canonicalNode,
  CONTAINER_HEADER,
  CONTAINER_PADDING,
  rerouteEdges,
  scene,
  toggleExpanded,
  updateNodeGeometry,
} from '../src/hierarchy';

function addNode(workspace: Workspace, key: string, graphId = 'root', x = 0, y = 0): ServiceNode {
  const node: ServiceNode = {
    id: `node-${key}`,
    key,
    graphId,
    x,
    y,
    width: 160,
    height: 80,
    childGraphId: `inside-${key}`,
  };
  workspace.nodes.push(node);
  workspace.graphs.push({ id: node.childGraphId, parentNodeId: node.id });
  return node;
}

function addEdge(workspace: Workspace, source: ServiceNode, target: ServiceNode): FlowEdge {
  const edge: FlowEdge = {
    id: `flow-${source.key}-${target.key}`,
    source: source.key,
    target: target.key,
    sourceNodeId: source.id,
    targetNodeId: target.id,
    graphId: edgeGraphId(workspace, source, target),
    sourceSide: 'right',
    targetSide: 'left',
    weights: ['event'],
    points: [],
  };
  workspace.edges.push(edge);
  return edge;
}

function fixture() {
  const workspace = createWorkspace('Inline hierarchy');
  const parent = addNode(workspace, 'Parent', 'root', 80, 80);
  const sibling = addNode(workspace, 'Sibling', 'root', 300, 100);
  const child = addNode(workspace, 'Child', parent.childGraphId, 10, 20);
  const deep = addNode(workspace, 'Deep', child.childGraphId, 20, 30);
  return { workspace, parent, sibling, child, deep };
}

function assertSeparate(a: ServiceNode, b: ServiceNode) {
  assert.ok(
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
    `${a.key} and ${b.key} must not overlap`,
  );
}

test('inline expansion contains children and moves the nearest overlapping sibling', () => {
  const { workspace, parent, sibling, child } = fixture();
  const expanded = toggleExpanded(workspace, parent.id);
  const rendered = scene(expanded, 'root');
  const box = rendered.nodes.find((node) => node.id === parent.id)!;
  const inside = rendered.nodes.find((node) => node.id === child.id)!;
  const neighbor = rendered.nodes.find((node) => node.id === sibling.id)!;
  assert.equal(box.x, parent.x);
  assert.equal(box.y, parent.y);
  assert.equal(inside.x, parent.x + CONTAINER_PADDING + child.x);
  assert.equal(inside.y, parent.y + CONTAINER_HEADER + child.y);
  assert.ok(inside.x + inside.width <= box.x + box.width - CONTAINER_PADDING);
  assert.ok(inside.y + inside.height <= box.y + box.height - CONTAINER_PADDING);
  assertSeparate(box, neighbor);
  assert.equal(neighbor.y, sibling.y, 'the shorter horizontal displacement is chosen');
  assert.deepEqual(
    workspace.nodes.find((node) => node.id === sibling.id),
    sibling,
  );
});

test('deep expansion propagates growth through ancestors and preserves collapse/reopen geometry', () => {
  const { workspace, parent, child, sibling } = fixture();
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  const rendered = scene(expanded, 'root');
  const box = rendered.nodes.find((node) => node.id === parent.id)!;
  const nested = rendered.nodes.find((node) => node.id === child.id)!;
  assert.ok(nested.x + nested.width <= box.x + box.width - CONTAINER_PADDING);
  assert.ok(nested.y + nested.height <= box.y + box.height - CONTAINER_PADDING);
  assertSeparate(
    box,
    rendered.nodes.find((node) => node.id === sibling.id)!,
  );
  const collapsed = toggleExpanded(expanded, parent.id);
  assert.equal(scene(collapsed, 'root').nodes.length, 2);
  assert.deepEqual(collapsed.edges, expanded.edges);
  assert.deepEqual(toggleExpanded(collapsed, parent.id), expanded);
});

test('cross-level edges use real endpoints while expanded and stable ancestor projections when collapsed', () => {
  const { workspace, parent, child, sibling, deep } = fixture();
  addEdge(workspace, sibling, deep);
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  const edge = scene(expanded, 'root').edges[0];
  assert.equal(edge.sourceNode.id, sibling.id);
  assert.equal(edge.targetNode.id, deep.id);
  assert.equal(edge.projected, false);
  assert.equal(edge.editable, true);
  assert.deepEqual(edge.points[0], anchor(edge.sourceNode, edge.sourceSide));
  assert.deepEqual(edge.points.at(-1), anchor(edge.targetNode, edge.targetSide));
  assert.ok(isOrthogonal(edge.points));
  const collapsed = toggleExpanded(expanded, parent.id);
  const projected = scene(collapsed, 'root').edges[0];
  assert.equal(projected.targetNode.id, parent.id);
  assert.equal(projected.target, parent.key);
  assert.equal(projected.original.target, deep.key);
  assert.equal(projected.projected, true);
  assert.equal(projected.editable, false);
  assert.deepEqual(projected.points.at(-1), anchor(projected.targetNode, projected.targetSide));
  assert.deepEqual(collapsed.edges, expanded.edges, 'projection is view-only');
  assert.deepEqual(scene(toggleExpanded(collapsed, parent.id), 'root').edges[0].points, edge.points);
});

test('internal edges collapse away while actual self-loops remain distinct', () => {
  const { workspace, parent, child, deep } = fixture();
  addEdge(workspace, parent, deep);
  addEdge(workspace, child, deep);
  addEdge(workspace, parent, parent);
  addEdge(workspace, deep, deep);
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  assert.equal(scene(expanded, 'root').edges.length, 4);
  const collapsed = scene(toggleExpanded(expanded, parent.id), 'root');
  assert.equal(collapsed.edges.length, 1);
  assert.equal(collapsed.edges[0].original.source, parent.key);
  assert.equal(collapsed.edges[0].original.target, parent.key);
  assert.ok(isOrthogonal(collapsed.edges[0].points));
});

test('focused subgraphs render local coordinates and hide unrelated outside flows', () => {
  const { workspace, parent, child, sibling, deep } = fixture();
  addEdge(workspace, sibling, deep);
  addEdge(workspace, child, deep);
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  const focused = scene(expanded, parent.childGraphId);
  assert.equal(focused.nodes.find((node) => node.id === child.id)!.x, child.x);
  assert.deepEqual(focused.graphOrigins.get(parent.childGraphId), { x: 0, y: 0 });
  assert.equal(focused.edges.length, 1);
  assert.equal(focused.edges[0].original.source, child.key);
});

test('negative legacy child positions normalize together without losing manual local routes', () => {
  const workspace = createWorkspace('Legacy layout');
  const parent = addNode(workspace, 'Parent');
  const first = addNode(workspace, 'First', parent.childGraphId, -200, -100);
  const second = addNode(workspace, 'Second', parent.childGraphId, 40, 20);
  const edge = addEdge(workspace, first, second);
  edge.points = routeEdge(first, second);
  const before = structuredClone(edge.points);
  const normalized = toggleExpanded(workspace, parent.id);
  const a = normalized.nodes.find((node) => node.id === first.id)!;
  const b = normalized.nodes.find((node) => node.id === second.id)!;
  assert.deepEqual([a.x, a.y, b.x, b.y], [0, 0, 240, 120]);
  assert.deepEqual(
    normalized.edges[0].points,
    before.map((point) => ({ x: point.x + 200, y: point.y + 100 })),
  );
});

test('moving nested nodes grows ancestors and reconnects cross-level edge anchors', () => {
  const { workspace, parent, child, deep, sibling } = fixture();
  addEdge(workspace, sibling, deep);
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  const moved = updateNodeGeometry(expanded, deep.id, { x: 340, y: 240 });
  const rendered = scene(moved, 'root');
  for (const id of [parent.id, child.id]) {
    assert.ok(
      moved.nodes.find((node) => node.id === id)!.expandedSize!.width >
        expanded.nodes.find((node) => node.id === id)!.expandedSize!.width,
    );
  }
  const edge = rendered.edges[0];
  assert.deepEqual(edge.points.at(-1), anchor(edge.targetNode, 'left'));
  assert.ok(isOrthogonal(edge.points));
  assert.equal(moved.nodes.find((node) => node.id === deep.id)!.x, 340);
});

test('expanded resizing preserves collapsed shape and respects child containment', () => {
  const { workspace, parent } = fixture();
  const expanded = toggleExpanded(workspace, parent.id);
  const larger = updateNodeGeometry(expanded, parent.id, { width: 800, height: 500 });
  const node = larger.nodes.find((item) => item.id === parent.id)!;
  assert.deepEqual([node.width, node.height], [160, 80]);
  assert.deepEqual(node.expandedSize, { width: 800, height: 500 });
  const smaller = updateNodeGeometry(larger, parent.id, { width: 1, height: 1 });
  const box = scene(smaller, 'root').nodes.find((item) => item.id === parent.id)!;
  assert.ok(box.width >= 240 && box.height >= 168);
  assert.deepEqual(
    [
      scene(toggleExpanded(smaller, parent.id), 'root').nodes[0].width,
      scene(toggleExpanded(smaller, parent.id), 'root').nodes[0].height,
    ],
    [160, 80],
  );
});

test('terminal collapsed footprint remains square while expanded container may be rectangular', () => {
  const { workspace, parent } = fixture();
  const terminal = updateNodeGeometry(workspace, parent.id, { type: 'terminal' });
  const expanded = toggleExpanded(terminal, parent.id);
  const resized = updateNodeGeometry(expanded, parent.id, { width: 600, height: 300 });
  const container = scene(resized, 'root').nodes.find((node) => node.id === parent.id)!;
  assert.equal(container.expanded, true);
  assert.deepEqual([container.width, container.height], [600, 300]);
  assert.deepEqual([container.base.width, container.base.height], [160, 160]);
  const collapsed = scene(toggleExpanded(resized, parent.id), 'root').nodes.find(
    (node) => node.id === parent.id,
  )!;
  assert.deepEqual([collapsed.width, collapsed.height], [160, 160]);
  const shrunk = updateNodeGeometry(toggleExpanded(resized, parent.id), parent.id, { width: 100 });
  assert.deepEqual([shrunk.nodes[0].width, shrunk.nodes[0].height], [100, 100]);
  const fromHeight = updateNodeGeometry(shrunk, parent.id, { height: 80 });
  assert.deepEqual([fromHeight.nodes[0].width, fromHeight.nodes[0].height], [80, 80]);
});

test('font changes preserve existing sibling overlaps and manual routes', () => {
  const workspace = createWorkspace('Existing overlaps');
  const source = addNode(workspace, 'Source');
  const target = addNode(workspace, 'Target', 'root', 80, 20);
  const edge = addEdge(workspace, source, target);
  edge.points = routeEdge(source, target);
  const changed = updateNodeGeometry(workspace, source.id, { fontSize: 28 });
  assert.equal(changed.nodes[0].fontSize, 28);
  assert.deepEqual(changed.nodes[1], target);
  assert.deepEqual(changed.edges, workspace.edges);
});

test('collapsed sibling obstacles use their visible box instead of retained expanded blank space', () => {
  const workspace = createWorkspace('Collapsed obstacle');
  const source = addNode(workspace, 'Source', 'root', 0, 260);
  const target = addNode(workspace, 'Target', 'root', 800, 260);
  const obstacle = addNode(workspace, 'Obstacle', 'root', 250, 100);
  obstacle.expandedSize = { width: 400, height: 500 };
  obstacle.expanded = false;
  const edge = addEdge(workspace, source, target);
  edge.points = routeEdge(source, target);
  const saved = rerouteEdges(workspace);
  assert.deepEqual(saved.edges[0].points, edge.points);
  assert.deepEqual(scene(saved, 'root').edges[0].points, edge.points);
});

test('canonical origins and retained container sizes stay unchanged on collapse', () => {
  const { workspace, parent, child, deep } = fixture();
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  const canonical = canonicalNode(expanded, deep.id, 'root');
  const parentBox = canonicalNode(expanded, parent.id, 'root');
  const collapsed = toggleExpanded(expanded, parent.id);
  assert.deepEqual(canonicalNode(collapsed, deep.id, 'root'), canonical);
  const after = canonicalNode(collapsed, parent.id, 'root');
  assert.deepEqual(
    [after.x, after.y, after.width, after.height],
    [parentBox.x, parentBox.y, parentBox.width, parentBox.height],
  );
});

test('display-only collapsed endpoint adjustment locks route editing until its footprint is restored', () => {
  const { workspace, parent, sibling } = fixture();
  addEdge(workspace, parent, sibling);
  const expanded = toggleExpanded(workspace, parent.id);
  const before = scene(expanded, 'root').edges[0];
  assert.equal(before.editable, true);
  const collapsed = toggleExpanded(expanded, parent.id);
  const adjusted = scene(collapsed, 'root').edges[0];
  assert.equal(adjusted.projected, false);
  assert.equal(adjusted.editable, false);
  assert.deepEqual(collapsed.edges[0].points, expanded.edges[0].points);
  const restored = scene(toggleExpanded(collapsed, parent.id), 'root').edges[0];
  assert.equal(restored.editable, true);
  assert.deepEqual(restored.points, before.points);
});

test('unchanged obstacle-free manual geometry survives routing and JSON round trips exactly', () => {
  const workspace = createWorkspace('Manual flow');
  const source = addNode(workspace, 'Source', 'root', 0, 0);
  const target = addNode(workspace, 'Target', 'root', 600, 0);
  const edge = addEdge(workspace, source, target);
  edge.points = [
    { x: 160, y: 40 },
    { x: 200, y: 40 },
    { x: 200, y: 180 },
    { x: 550, y: 180 },
    { x: 550, y: 40 },
    { x: 600, y: 40 },
  ];
  const saved = JSON.parse(JSON.stringify(rerouteEdges(workspace))) as Workspace;
  assert.deepEqual(saved.edges[0].points, edge.points);
  assert.deepEqual(scene(saved, 'root').edges[0].points, edge.points);
  const moved = updateNodeGeometry(saved, source.id, { x: -100 });
  assert.equal(moved.nodes[0].x, -100, 'top-level negative coordinates are valid');
});

test('empty imported paths derive an editable canonical route and persist the first path edit', () => {
  const workspace = createWorkspace('Implicit route');
  const source = addNode(workspace, 'Source');
  const target = addNode(workspace, 'Target', 'root', 600, 0);
  addEdge(workspace, source, target);
  const displayed = scene(workspace, 'root').edges[0];
  assert.ok(displayed.points.length >= 2);
  assert.equal(displayed.editable, true);
  assert.deepEqual(displayed.original.points, []);
  assert.deepEqual(workspace.edges[0].points, [], 'rendering preserves the imported document');
  const edited = addBend(displayed.points, 0);
  const saved = rerouteEdges({
    ...workspace,
    edges: workspace.edges.map((edge) => ({ ...edge, points: edited })),
  });
  assert.deepEqual(saved.edges[0].points, edited);
  assert.deepEqual(scene(JSON.parse(JSON.stringify(saved)), 'root').edges[0].points, edited);
});

test('automatic expansion and sibling displacement round outward to the enabled grid', () => {
  const { workspace, parent, child, sibling } = fixture();
  workspace.canvas!.snapToGrid = true;
  workspace.canvas!.gridSize = 40;
  parent.x = parent.y = 80;
  sibling.x = 280;
  sibling.y = 80;
  child.x = child.y = 40;
  const expanded = toggleExpanded(workspace, parent.id);
  const box = scene(expanded, 'root').nodes.find((node) => node.id === parent.id)!;
  const neighbor = expanded.nodes.find((node) => node.id === sibling.id)!;
  assert.equal(box.width % 40, 0);
  assert.equal(box.height % 40, 0);
  assert.equal(neighbor.x % 40, 0);
  assert.equal(neighbor.y % 40, 0);
  assertSeparate(box, neighbor);
});

test('scene traversal does not impose a fixed nesting depth or use recursive calls', () => {
  const workspace = createWorkspace('Deep hierarchy');
  let graphId = 'root';
  for (let depth = 0; depth < 1500; depth++) {
    const node = addNode(workspace, `Node-${depth}`, graphId);
    node.expanded = true;
    node.expandedSize = { width: 240, height: 160 };
    graphId = node.childGraphId;
  }
  const rendered = scene(workspace, 'root');
  assert.equal(rendered.nodes.length, 1500);
  assert.equal(rendered.nodes.at(-1)!.depth, 1499);
  assert.equal(rendered.nodes.at(-1)!.x, 1499 * CONTAINER_PADDING);
});
