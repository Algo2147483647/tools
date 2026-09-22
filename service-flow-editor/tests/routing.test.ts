import assert from 'node:assert/strict';
import test from 'node:test';
import type { FlowEdge, ServiceNode, Side } from '../src/model';
import {
  addBend,
  anchor,
  isOrthogonal,
  hasRouteCrossings,
  moveSegment,
  reconnectEdge,
  roundedPath,
  routeEdge,
  simplifyPoints,
} from '../src/routing';

const sides: Side[] = ['left', 'right', 'top', 'bottom'];
const node = (id: string, x = 0, y = 0): ServiceNode => ({
  id,
  key: id,
  graphId: 'root',
  x,
  y,
  width: 160,
  height: 80,
  childGraphId: `inside-${id}`,
});
const source = node('source');
const target = node('target', 400, 200);
const edge = (points = routeEdge(source, target)): FlowEdge => ({
  id: 'flow',
  graphId: 'root',
  source: source.key,
  target: target.key,
  weights: ['event'],
  sourceSide: 'right',
  targetSide: 'left',
  points,
});

function assertPort(points: { x: number; y: number }[], endpoint: ServiceNode, side: Side): void {
  assert.deepEqual(points[0], anchor(endpoint, side));
  const first = points[0];
  const second = points[1];
  assert.ok(second, 'A port must have an outward segment');
  if (side === 'right') assert.ok(second.x > first.x && second.y === first.y);
  if (side === 'left') assert.ok(second.x < first.x && second.y === first.y);
  if (side === 'top') assert.ok(second.y < first.y && second.x === first.x);
  if (side === 'bottom') assert.ok(second.y > first.y && second.x === first.x);
}

test('anchor follows every side of a node', () => {
  assert.deepEqual(anchor(source, 'left'), { x: 0, y: 40 });
  assert.deepEqual(anchor(source, 'right'), { x: 160, y: 40 });
  assert.deepEqual(anchor(source, 'top'), { x: 80, y: 0 });
  assert.deepEqual(anchor(source, 'bottom'), { x: 80, y: 80 });
});

test('all port combinations produce anchored orthogonal routes, including overlaps and self loops', () => {
  const targets = [
    target,
    node('aligned', 400, 0),
    node('above', 0, -200),
    node('overlap', 40, 20),
    node('same-place'),
    source,
  ];
  for (const destination of targets) {
    for (const fromSide of sides)
      for (const toSide of sides) {
        const points = routeEdge(source, destination, fromSide, toSide);
        assert.ok(isOrthogonal(points), `${destination.id}: ${fromSide} -> ${toSide}`);
        assertPort(points, source, fromSide);
        assertPort([...points].reverse(), destination, toSide);
        assert.ok(points.length >= 2);
      }
  }
});

test('unmoved endpoints retain the complete stored manual geometry and return a copy', () => {
  const manual = edge([
    { x: 160, y: 40 },
    { x: 190, y: 40 },
    { x: 190, y: 100 },
    { x: 290, y: 100 },
    { x: 290, y: 240 },
    { x: 400, y: 240 },
  ]);
  const result = reconnectEdge(manual, source, target);
  assert.deepEqual(result, manual.points);
  assert.notEqual(result, manual.points);
  assert.notEqual(result[0], manual.points[0]);
});

function assertAvoids(points: { x: number; y: number }[], obstacles: ServiceNode[]): void {
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    for (const box of obstacles) {
      const crosses =
        a.x === b.x
          ? a.x > box.x &&
            a.x < box.x + box.width &&
            Math.max(a.y, b.y) > box.y &&
            Math.min(a.y, b.y) < box.y + box.height
          : a.y > box.y &&
            a.y < box.y + box.height &&
            Math.max(a.x, b.x) > box.x &&
            Math.min(a.x, b.x) < box.x + box.width;
      assert.equal(crosses, false, `Route crosses ${box.id}: ${JSON.stringify([a, b])}`);
    }
  }
}

test('routes avoid unrelated nodes and expanded containers for every port combination', () => {
  const destination = node('destination', 1100, 100);
  const obstacles = [{ ...node('container', 320, -100), width: 460, height: 450 }, node('other', 850, -220)];
  for (const fromSide of sides)
    for (const toSide of sides) {
      const points = routeEdge(source, destination, fromSide, toSide, obstacles);
      assert.ok(isOrthogonal(points));
      assertPort(points, source, fromSide);
      assertPort([...points].reverse(), destination, toSide);
      assertAvoids(points, obstacles);
    }
});

test('short port stubs avoid nearby obstacles instead of crossing their interiors', () => {
  const destination = node('destination', 600, 0);
  const obstacles = [node('near-source', 176, 0), node('near-target', 424, 0)];
  const points = routeEdge(source, destination, 'right', 'left', obstacles);
  assert.ok(isOrthogonal(points));
  assertPort(points, source, 'right');
  assertPort([...points].reverse(), destination, 'left');
  assertAvoids(points, obstacles);
});

test('ancestor and descendant endpoints route through their container while avoiding siblings', () => {
  const container = { ...node('container'), width: 800, height: 500 };
  const child = node('child', 120, 160);
  const sibling = { ...node('sibling', 400, 100), height: 240 };
  for (const [from, to] of [
    [container, child],
    [child, container],
  ]) {
    for (const fromSide of sides)
      for (const toSide of sides) {
        const points = routeEdge(from, to, fromSide, toSide, [container, sibling]);
        assert.ok(isOrthogonal(points));
        assertPort(points, from, fromSide);
        assertPort([...points].reverse(), to, toSide);
        assertAvoids(points, [sibling]);
        assert.ok(points.length < 20, 'Containment should not cause repeated detours');
      }
  }
});

test('manual geometry survives clear obstacles and reroutes when an expansion blocks it', () => {
  const destination = node('destination', 700, 0);
  const original = { ...edge(), target: destination.key, points: routeEdge(source, destination) };
  const obstacle = { ...node('expanded', 300, -60), width: 220, height: 200 };
  assert.deepEqual(reconnectEdge(original, source, destination, [node('clear', 300, 300)]), original.points);
  const changed = reconnectEdge(original, source, destination, [obstacle]);
  assert.notDeepEqual(changed, original.points);
  assert.ok(isOrthogonal(changed));
  assertPort(changed, source, 'right');
  assertPort([...changed].reverse(), destination, 'left');
  assertAvoids(changed, [obstacle]);
});

test('moving and resizing endpoints retains orthogonal connections and interior manual bends', () => {
  const manual = edge([
    { x: 160, y: 40 },
    { x: 210, y: 40 },
    { x: 210, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 240 },
    { x: 400, y: 240 },
  ]);
  const movedSource = { ...source, y: 10, width: 180 };
  const movedTarget = { ...target, y: 250, height: 100 };
  const result = reconnectEdge(manual, movedSource, movedTarget);
  assert.ok(isOrthogonal(result));
  assertPort(result, movedSource, 'right');
  assertPort([...result].reverse(), movedTarget, 'left');
  assert.ok(result.some((point) => point.x === 210 && point.y === 100));
  assert.ok(result.some((point) => point.x === 300 && point.y === 100));
});

test('moving nodes beyond old bends still produces usable outward ports', () => {
  for (const fromSide of sides)
    for (const toSide of sides) {
      const original = {
        ...edge(),
        sourceSide: fromSide,
        targetSide: toSide,
        points: routeEdge(source, target, fromSide, toSide),
      };
      for (const dx of [-500, 250, 600]) {
        const moved = { ...source, x: dx, y: 180, width: 210, height: 125 };
        const points = reconnectEdge(original, moved, target);
        assert.ok(isOrthogonal(points));
        assertPort(points, moved, fromSide);
        assertPort([...points].reverse(), target, toSide);
      }
    }
});

test('automatic routes do not accumulate old bends during repeated moves in every direction', () => {
  for (const fromSide of sides)
    for (const toSide of sides) {
      let previous = { ...edge(), sourceSide: fromSide, targetSide: toSide, routing: 'auto' as const };
      for (const [x, y] of [
        [0, 0],
        [650, -200],
        [-450, 600],
        [750, 600],
        [0, 0],
        [350, -200],
      ]) {
        const moved = { ...source, x, y };
        const points = reconnectEdge(previous, moved, target);
        assertPort(points, moved, fromSide);
        assertPort([...points].reverse(), target, toSide);
        assert.ok(isOrthogonal(points));
        assert.equal(hasRouteCrossings(points), false);
        assertAvoids(points, [moved, target]);
        assert.deepEqual(points, routeEdge(moved, target, fromSide, toSide));
        previous = { ...previous, points };
      }
    }
});

test('rigid group translation moves every manual bend and self-loop point together', () => {
  for (const destination of [target, source]) {
    const original = {
      ...edge(routeEdge(source, destination)),
      target: destination.key,
      routing: 'manual' as const,
    };
    const shifted = reconnectEdge(
      original,
      { ...source, x: 620, y: -230 },
      { ...destination, x: destination.x + 620, y: destination.y - 230 },
    );
    assert.deepEqual(
      shifted,
      original.points.map((point) => ({ x: point.x + 620, y: point.y - 230 })),
    );
  }
});

test('reattachment repairs crossed legacy paths and avoids routing back through an endpoint', () => {
  const crossed = edge([
    { x: 160, y: 40 },
    { x: 240, y: 40 },
    { x: 240, y: 300 },
    { x: 100, y: 300 },
    { x: 100, y: 100 },
    { x: 350, y: 100 },
    { x: 350, y: 240 },
    { x: 400, y: 240 },
  ]);
  assert.equal(hasRouteCrossings(crossed.points), true);
  for (const x of [0, 80, 650, -400]) {
    const moved = { ...source, x };
    const points = reconnectEdge(crossed, moved, target);
    assert.equal(hasRouteCrossings(points), false);
    assertPort(points, moved, 'right');
    assertPort([...points].reverse(), target, 'left');
    assertAvoids(points, [moved, target]);
    crossed.points = points;
  }
});

test('parallel segment editing preserves both anchors, including terminal segments', () => {
  const fixtures = [
    routeEdge(source, target),
    [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 300 },
    ],
  ];
  for (const original of fixtures)
    for (let index = 0; index < original.length - 1; index++) {
      const changed = moveSegment(original, index, 130);
      assert.ok(isOrthogonal(changed));
      assert.deepEqual(changed[0], original[0]);
      assert.deepEqual(changed[changed.length - 1], original[original.length - 1]);
    }
});

test('a manual segment can approach an endpoint without being pinned to the automatic clearance', () => {
  const points = [
    { x: 160, y: 40 },
    { x: 308, y: 40 },
    { x: 308, y: 240 },
    { x: 340, y: 240 },
  ];
  const moved = moveSegment(points, 1, 332);
  assert.equal(moved[1].x, 332);
  assert.equal(moved[2].x, 332);
  assert.deepEqual(moved.at(-1), points.at(-1));
  assert.ok(isOrthogonal(moved));
});

test('addBend inserts a movable orthogonal dogleg without changing endpoints', () => {
  const original = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
  ];
  const changed = addBend(original, 0);
  assert.equal(changed.length, 6);
  assert.ok(isOrthogonal(changed));
  assert.deepEqual(changed[0], original[0]);
  assert.deepEqual(changed[changed.length - 1], original[1]);
  assert.ok(changed.some((point) => point.y === 40));
  const moved = moveSegment(changed, 2, 80);
  assert.ok(moved.some((point) => point.y === 80));
  assert.ok(isOrthogonal(moved));
});

test('dragging segments cannot reverse a node attachment', () => {
  for (const fromSide of sides)
    for (const toSide of sides) {
      const original = routeEdge(source, target, fromSide, toSide);
      for (let index = 0; index < original.length - 1; index++)
        for (const coordinate of [-500, 900]) {
          const changed = moveSegment(original, index, coordinate);
          assert.ok(isOrthogonal(changed));
          assertPort(changed, source, fromSide);
          assertPort([...changed].reverse(), target, toSide);
        }
    }
});

test('simplification removes duplicate and collinear points without mutating input', () => {
  const original = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
  ];
  assert.deepEqual(simplifyPoints(original), [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
  ]);
  assert.equal(original.length, 5);
});

test('rounded SVG paths use a quadratic corner with radius limited by segment length', () => {
  assert.equal(
    roundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]),
    'M 0 0 L 88 0 Q 100 0 100 12 L 100 100',
  );
  assert.equal(
    roundedPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
    ]),
    'M 0 0 L 8 0 Q 10 0 10 2 L 10 4',
  );
  assert.equal(roundedPath([]), '');
});
