import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkspace,
  edgeGraphId,
  removeNode,
  type FlowEdge,
  type ServiceNode,
  type Workspace,
} from '../src/model';
import { addBend, anchor, isOrthogonal, routeEdge } from '../src/routing';
import {
  canonicalNode,
  canonicalEdgePoints,
  CONTAINER_HEADER,
  CONTAINER_PADDING,
  rerouteEdges,
  relayoutWorkspace,
  nodeDegrees,
  scene,
  toggleExpanded,
  updateNodeGeometry,
  updateNodesGeometry,
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

test('repeated nested expansion changes only flags, never baseline nodes, routes, or sibling coordinates', () => {
  const { workspace, parent, child, sibling, deep } = fixture();
  addEdge(workspace, sibling, deep);
  addEdge(workspace, child, deep);
  const original = rerouteEdges(workspace);
  const geometry = (w: Workspace) => w.nodes.map(({ expanded: _flag, ...node }) => node);
  let current = original;
  for (let round = 0; round < 20; round++) {
    for (const id of [parent.id, child.id, parent.id, parent.id, child.id, parent.id]) {
      current = toggleExpanded(current, id);
      const copy = structuredClone(current);
      scene(current, 'root');
      scene(current, parent.childGraphId);
      assert.deepEqual(current, copy, 'rendering is pure');
      assert.deepEqual(geometry(current), geometry(original));
      assert.deepEqual(current.edges, original.edges);
    }
  }
  assert.deepEqual(
    scene(current, 'root').nodes.map((node) => [node.x, node.y]),
    original.nodes.filter((node) => node.graphId === 'root').map((node) => [node.x, node.y]),
  );
  assert.deepEqual(scene(JSON.parse(JSON.stringify(current)), 'root'), scene(current, 'root'));
});

test('moving and resizing allow overlap without moving any other saved or collapsed display node', () => {
  const { workspace, parent, sibling, child } = fixture();
  let moved = updateNodeGeometry(workspace, sibling.id, { x: parent.x, y: parent.y });
  moved = updateNodeGeometry(moved, sibling.id, { width: 500, height: 500 });
  assert.deepEqual(
    moved.nodes.find((node) => node.id === parent.id),
    parent,
  );
  assert.deepEqual(
    moved.nodes.find((node) => node.id === child.id),
    child,
  );
  const rendered = scene(moved, 'root');
  assert.deepEqual(
    rendered.nodes.map((node) => [node.x, node.y]),
    [
      [parent.x, parent.y],
      [parent.x, parent.y],
    ],
  );
  const expanded = toggleExpanded(moved, parent.id);
  assert.deepEqual(
    expanded.nodes.find((node) => node.id === sibling.id),
    moved.nodes[1],
  );
  const overlapping = scene(expanded, 'root').nodes.find((node) => node.id === sibling.id)!;
  assert.deepEqual(
    [overlapping.x, overlapping.y],
    [parent.x, parent.y],
    'manual overlap is still allowed during expansion',
  );
});

test('editing a displaced node updates only its baseline, and collapsing restores that edited baseline', () => {
  const { workspace, parent, sibling } = fixture();
  const expanded = toggleExpanded(workspace, parent.id);
  const displayed = scene(expanded, 'root').nodes.find((node) => node.id === sibling.id)!;
  assert.notEqual(displayed.x, sibling.x);
  const towardContainer = updateNodeGeometry(expanded, sibling.id, { x: sibling.x - 30 });
  const movedDisplay = scene(towardContainer, 'root').nodes.find((node) => node.id === sibling.id)!;
  assert.equal(movedDisplay.x - displayed.x, -30, 'display movement is not clamped by a collision solver');
  const moved = updateNodeGeometry(expanded, sibling.id, {
    x: displayed.base.x + 45,
    y: displayed.base.y + 80,
  });
  assert.deepEqual(moved.nodes[0], expanded.nodes[0]);
  const collapsed = scene(toggleExpanded(moved, parent.id), 'root').nodes.find(
    (node) => node.id === sibling.id,
  )!;
  assert.deepEqual([collapsed.x, collapsed.y], [sibling.x + 45, sibling.y + 80]);
});

test('displayed cross-level path edits save collapsed anchors without baking in expanded dimensions', () => {
  const { workspace, parent, child, sibling, deep } = fixture();
  addEdge(workspace, sibling, deep);
  const expanded = toggleExpanded(toggleExpanded(rerouteEdges(workspace), parent.id), child.id);
  const displayed = scene(expanded, 'root').edges[0];
  const points = canonicalEdgePoints(expanded, displayed, addBend(displayed.points, 1));
  assert.ok(isOrthogonal(points));
  assert.deepEqual(points[0], anchor(canonicalNode(expanded, sibling.id, 'root'), 'right'));
  assert.deepEqual(points.at(-1), anchor(canonicalNode(expanded, deep.id, 'root'), 'left'));
  const edited = { ...expanded, edges: [{ ...expanded.edges[0], points }] };
  const closed = toggleExpanded(edited, parent.id);
  assert.deepEqual(closed.edges, edited.edges);
  assert.deepEqual(
    scene(toggleExpanded(closed, parent.id), 'root').edges[0].points,
    scene(edited, 'root').edges[0].points,
  );
});

test('inline expansion contains children and inserts display space for following siblings', () => {
  const { workspace, parent, sibling, child } = fixture();
  const expanded = toggleExpanded(workspace, parent.id);
  const rendered = scene(expanded, 'root');
  const box = rendered.nodes.find((node) => node.id === parent.id)!;
  const inside = rendered.nodes.find((node) => node.id === child.id)!;
  const neighbor = rendered.nodes.find((node) => node.id === sibling.id)!;
  assert.equal(box.x, parent.x + child.x);
  assert.equal(box.y, parent.y + child.y);
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
  assert.equal(focused.nodes.find((node) => node.id === child.id)!.x, child.x + deep.x);
  assert.deepEqual(focused.graphOrigins.get(parent.childGraphId), { x: 0, y: 0 });
  assert.equal(focused.edges.length, 1);
  assert.equal(focused.edges[0].original.source, child.key);
});

test('negative child coordinates and local routes remain unchanged on expansion', () => {
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
  assert.deepEqual([a.x, a.y, b.x, b.y], [-200, -100, 40, 20]);
  assert.deepEqual(normalized.edges[0].points, before);
});

test('moving the only nested node moves its tight wrapping ancestors and reconnects cross-level anchors', () => {
  const { workspace, parent, child, deep, sibling } = fixture();
  addEdge(workspace, sibling, deep);
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  const before = scene(expanded, 'root').nodes.find((node) => node.id === deep.id)!;
  const moved = updateNodeGeometry(expanded, deep.id, { x: 340, y: 240 });
  const rendered = scene(moved, 'root');
  for (const id of [parent.id, child.id])
    assert.deepEqual(
      moved.nodes.find((node) => node.id === id),
      expanded.nodes.find((node) => node.id === id),
    );
  const after = rendered.nodes.find((node) => node.id === deep.id)!;
  assert.deepEqual([after.x - before.x, after.y - before.y], [340 - deep.x, 240 - deep.y]);
  const edge = rendered.edges[0];
  assert.deepEqual(edge.points.at(-1), anchor(edge.targetNode, 'left'));
  assert.ok(isOrthogonal(edge.points));
  assert.equal(moved.nodes.find((node) => node.id === deep.id)!.x, 340);
});

test('expanded dimensions stay content-derived and ignore manual resize patches', () => {
  const { workspace, parent } = fixture();
  const expanded = toggleExpanded(workspace, parent.id);
  const larger = updateNodeGeometry(expanded, parent.id, { width: 800, height: 500 });
  const node = larger.nodes.find((item) => item.id === parent.id)!;
  assert.deepEqual([node.width, node.height], [160, 80]);
  assert.equal(node.expandedSize, undefined);
  const smaller = updateNodeGeometry(larger, parent.id, { width: 1, height: 1 });
  const box = scene(smaller, 'root').nodes.find((item) => item.id === parent.id)!;
  assert.deepEqual([box.width, box.height], [224, 168]);
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
  assert.deepEqual([container.width, container.height], [224, 168]);
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

test('canonical origins and collapsed dimensions stay unchanged on collapse', () => {
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

test('visible true endpoint routes remain editable in both display states', () => {
  const { workspace, parent, sibling } = fixture();
  addEdge(workspace, parent, sibling);
  const expanded = toggleExpanded(workspace, parent.id);
  const before = scene(expanded, 'root').edges[0];
  assert.equal(before.editable, true);
  const collapsed = toggleExpanded(expanded, parent.id);
  const adjusted = scene(collapsed, 'root').edges[0];
  assert.equal(adjusted.projected, false);
  assert.equal(adjusted.editable, true);
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

test('expansion sibling offsets round outward without modifying saved grid coordinates', () => {
  const { workspace, parent, child, sibling } = fixture();
  workspace.canvas!.snapToGrid = true;
  workspace.canvas!.gridSize = 40;
  parent.x = parent.y = 80;
  sibling.x = 280;
  sibling.y = 80;
  child.x = child.y = 40;
  const expanded = toggleExpanded(workspace, parent.id);
  const box = scene(expanded, 'root').nodes.find((node) => node.id === parent.id)!;
  const neighbor = scene(expanded, 'root').nodes.find((node) => node.id === sibling.id)!;
  assert.equal(neighbor.x % 40, 0);
  assert.equal(neighbor.y % 40, 0);
  assertSeparate(box, neighbor);
  assert.deepEqual(
    expanded.nodes.find((node) => node.id === sibling.id),
    sibling,
  );
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

test('large legacy size caches and margins do not affect tight display bounds or saved coordinates', () => {
  const workspace = createWorkspace('Oversized expansion');
  const parent = addNode(workspace, 'Parent', 'root', 100, 200);
  const child = addNode(workspace, 'Child', parent.childGraphId, 1200, 900);
  parent.expanded = true;
  parent.expandedSize = { width: 5000, height: 4000 };
  const before = scene(workspace, 'root').nodes.find((node) => node.id === child.id)!;
  const fitted = relayoutWorkspace(workspace);
  const after = scene(fitted, 'root').nodes.find((node) => node.id === child.id)!;
  assert.deepEqual([after.x, after.y], [before.x, before.y]);
  assert.deepEqual(fitted.nodes, workspace.nodes);
  const box = scene(fitted, 'root').nodes.find((node) => node.id === parent.id)!;
  assert.deepEqual([box.width, box.height], [224, 168]);
  assert.deepEqual(relayoutWorkspace(fitted), fitted, 'fitting is idempotent');
});

test('collapse, child resize and deletion shrink expanded bounds', () => {
  const { workspace, parent, child, deep } = fixture();
  deep.width = 500;
  deep.height = 400;
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  const collapsed = toggleExpanded(expanded, child.id);
  const size = (w: Workspace) => {
    const box = scene(w, 'root').nodes.find((node) => node.id === parent.id)!;
    return { width: box.width, height: box.height };
  };
  assert.ok(size(collapsed).width < size(expanded).width);
  assert.ok(size(collapsed).height < size(expanded).height);
  const resized = updateNodeGeometry(collapsed, child.id, { width: 80, height: 40 });
  assert.deepEqual(size(resized), { width: 160, height: 128 });
  const withFar = structuredClone(resized);
  const far = addNode(withFar, 'Far', parent.childGraphId, 1000, 800);
  const wide = relayoutWorkspace(withFar);
  assert.ok(size(wide).width > 1000);
  const removed = relayoutWorkspace(removeNode(wide, far.id));
  assert.deepEqual(size(removed), { width: 160, height: 128 });
  const empty = relayoutWorkspace(removeNode(removed, child.id));
  assert.deepEqual(size(empty), { width: 240, height: 144 });
});

test('batch movement is rigid and selected descendants are not moved twice', () => {
  const workspace = createWorkspace('Group drag');
  const parent = addNode(workspace, 'Parent');
  const child = addNode(workspace, 'Child', parent.childGraphId);
  const sibling = addNode(workspace, 'Sibling', 'root', 500, 0);
  const expanded = toggleExpanded(workspace, parent.id);
  const before = scene(expanded, 'root');
  const moved = updateNodesGeometry(expanded, [
    { id: parent.id, patch: { x: 100, y: 150 } },
    { id: sibling.id, patch: { x: 600, y: 150 } },
    { id: child.id, patch: { x: 100, y: 150 } },
  ]);
  const after = scene(moved, 'root');
  for (const node of before.nodes) {
    const current = after.nodes.find((item) => item.id === node.id)!;
    assert.deepEqual([current.x - node.x, current.y - node.y], [100, 150]);
  }
  assert.deepEqual([moved.nodes[1].x, moved.nodes[1].y], [0, 0]);
});

test('moving every child together moves its tight container without cancelling the drag', () => {
  const workspace = createWorkspace('Internal group drag');
  const parent = addNode(workspace, 'Parent');
  const first = addNode(workspace, 'First', parent.childGraphId);
  const second = addNode(workspace, 'Second', parent.childGraphId, 300, 0);
  const expanded = toggleExpanded(workspace, parent.id);
  const before = scene(expanded, 'root');
  const moved = updateNodesGeometry(expanded, [
    { id: first.id, patch: { x: 100, y: 150 } },
    { id: second.id, patch: { x: 400, y: 150 } },
  ]);
  const after = scene(moved, 'root');
  for (const node of before.nodes) {
    const current = after.nodes.find((item) => item.id === node.id)!;
    assert.deepEqual([current.x - node.x, current.y - node.y], [100, 150]);
  }
  assert.deepEqual(moved.nodes[0].expandedSize, expanded.nodes[0].expandedSize);
});

test('degree totals include all descendants and count each internal edge once per direction', () => {
  const { workspace, parent, child, deep, sibling } = fixture();
  addEdge(workspace, sibling, deep);
  addEdge(workspace, deep, child);
  addEdge(workspace, child, parent);
  addEdge(workspace, deep, deep);
  addEdge(workspace, parent, sibling);
  const counts = nodeDegrees(workspace);
  assert.deepEqual(counts.get(parent.id), { incoming: 4, outgoing: 4 });
  assert.deepEqual(counts.get(child.id), { incoming: 3, outgoing: 3 });
  assert.deepEqual(counts.get(deep.id), { incoming: 2, outgoing: 2 });
  assert.deepEqual(counts.get(sibling.id), { incoming: 1, outgoing: 1 });
  const expanded = toggleExpanded(toggleExpanded(workspace, parent.id), child.id);
  assert.deepEqual(nodeDegrees(expanded), counts, 'counts do not depend on visibility');
});

test('tight containers include internal self-loops and preserve manual route margins', () => {
  const workspace = createWorkspace('Contained routes');
  const parent = addNode(workspace, 'Parent', 'root', 200, 200);
  const child = addNode(workspace, 'Child', parent.childGraphId);
  addEdge(workspace, child, child);
  const expanded = toggleExpanded(workspace, parent.id);
  const rendered = scene(expanded, 'root');
  const box = rendered.nodes.find((node) => node.id === parent.id)!;
  assert.ok(rendered.edges[0].points.length > 2);
  for (const point of rendered.edges[0].points) {
    assert.ok(point.x >= box.x + CONTAINER_PADDING && point.x <= box.x + box.width - CONTAINER_PADDING);
    assert.ok(point.y >= box.y + CONTAINER_HEADER && point.y <= box.y + box.height - CONTAINER_PADDING);
  }
  assert.deepEqual(scene(relayoutWorkspace(expanded), 'root').edges[0].points, rendered.edges[0].points);
  const manual = structuredClone(expanded);
  manual.edges[0].points = addBend(manual.edges[0].points, 1);
  const fitted = relayoutWorkspace(manual);
  const fittedScene = scene(fitted, 'root');
  const fittedBox = fittedScene.nodes.find((node) => node.id === parent.id)!;
  for (const point of fittedScene.edges[0].points) {
    assert.ok(point.x >= fittedBox.x && point.x <= fittedBox.x + fittedBox.width);
    assert.ok(point.y >= fittedBox.y && point.y <= fittedBox.y + fittedBox.height);
  }
});
