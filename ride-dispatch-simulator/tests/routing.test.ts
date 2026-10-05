import test from 'node:test';
import assert from 'node:assert/strict';
import { createCity } from '../src/engine/city';
import { Router, KM_PER_UNIT } from '../src/engine/routing';

test('city road graph connects all intersections and includes ten demand zones', () => {
  const city = createCity();
  assert.equal(city.zones.length, 10);
  assert.ok(city.nodes.length > 100, 'city needs enough intersections for meaningful routing');
  assert.deepEqual(
    new Set(city.edges.map((edge) => edge.level)),
    new Set(['arterial', 'secondary', 'local']),
  );
  const adjacency = city.nodes.map(() => [] as number[]);
  const pairs = new Set<string>();
  const edgeIds = new Set<number>();
  for (const edge of city.edges) {
    assert.ok(city.nodes[edge.from] && city.nodes[edge.to], 'every road endpoint must exist');
    assert.notEqual(edge.from, edge.to, 'roads cannot loop to their own intersection');
    assert.ok(edge.length > 0 && Number.isFinite(edge.length));
    const pair = [edge.from, edge.to].sort((a, b) => a - b).join(':');
    assert.ok(!pairs.has(pair), `duplicate undirected road ${pair}`);
    assert.ok(!edgeIds.has(edge.id), `duplicate edge id ${edge.id}`);
    pairs.add(pair);
    edgeIds.add(edge.id);
    adjacency[edge.from].push(edge.to);
    adjacency[edge.to].push(edge.from);
  }
  const visited = new Set<number>([0]);
  const queue = [0];
  for (let index = 0; index < queue.length; index++) {
    for (const next of adjacency[queue[index]]) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  assert.equal(visited.size, city.nodes.length, 'every district must be reachable');
});

test('planned routes use real edges and agree with road distance in both directions', () => {
  const city = createCity();
  const router = new Router(city);
  const pairs = [
    [0, city.nodes.length - 1],
    [7, 33],
    [20, Math.floor(city.nodes.length / 2)],
  ];
  for (const [from, to] of pairs) {
    const route = router.route(from, to);
    assert.equal(route[0], from);
    assert.equal(route.at(-1), to);
    let roadDistance = 0;
    for (let index = 1; index < route.length; index++) {
      const edge = router.edgeBetween(route[index - 1], route[index]);
      assert.ok(edge, 'a route must never jump across unconnected intersections');
      roadDistance += edge.length * KM_PER_UNIT;
    }
    assert.ok(Math.abs(roadDistance - router.distance(from, to)) < 1e-8);
    assert.ok(Math.abs(router.distance(from, to) - router.distance(to, from)) < 1e-8);
    const a = city.nodes[from];
    const b = city.nodes[to];
    assert.ok(roadDistance + 1e-8 >= Math.hypot(a.x - b.x, a.y - b.y) * KM_PER_UNIT);
  }
  assert.deepEqual(router.route(2, 2), [2]);
  assert.equal(router.distance(2, 2), 0);
});
