import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, hungarian } from '../src/engine/dispatch';
import { Router } from '../src/engine/routing';
import type { Order, RoadNetwork, ScoreWeights, Vehicle } from '../src/types';

function exhaustiveMinimum(matrix: number[][]): number {
  const count = Math.min(matrix.length, matrix[0].length);
  let best = Infinity;
  function visit(row: number, used: Set<number>, sum: number): void {
    if (used.size === count) {
      best = Math.min(best, sum);
      return;
    }
    if (row === matrix.length || matrix.length - row < count - used.size) return;
    if (matrix.length > matrix[0].length) visit(row + 1, used, sum);
    for (let col = 0; col < matrix[row].length; col++) {
      if (used.has(col)) continue;
      used.add(col);
      visit(row + 1, used, sum + matrix[row][col]);
      used.delete(col);
    }
  }
  visit(0, new Set(), 0);
  return best;
}

test('Hungarian finds the known minimum, including a case where greedy fails', () => {
  const matrix = [
    [1, 2],
    [2, 100],
  ];
  const assignment = hungarian(matrix);
  assert.deepEqual(assignment, [1, 0]);
  assert.equal(
    assignment.reduce((sum, col, row) => sum + matrix[row][col], 0),
    4,
  );
});

test('rectangular Hungarian matches exhaustive optimal solutions for scarce supply and demand', () => {
  // Cover tall, wide, square, negative-cost, tied-cost, and single-cell inputs.
  let seed = 13271;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let rows = 1; rows <= 5; rows++) {
    for (let columns = 1; columns <= 5; columns++) {
      for (let sample = 0; sample < 8; sample++) {
        const matrix = Array.from({ length: rows }, () =>
          Array.from({ length: columns }, () => Math.floor(random() * 31) - 10),
        );
        const assignment = hungarian(matrix);
        assert.equal(assignment.length, rows);
        const assigned = assignment.filter((column) => column >= 0);
        assert.equal(assigned.length, Math.min(rows, columns));
        assert.equal(new Set(assigned).size, assigned.length, 'a driver can be assigned only once');
        const cost = assignment.reduce(
          (sum, column, row) => sum + (column >= 0 ? matrix[row][column] : 0),
          0,
        );
        assert.equal(cost, exhaustiveMinimum(matrix), `${rows} orders × ${columns} drivers`);
      }
    }
  }
});

test('Hungarian supports empty sides and reports malformed matrices', () => {
  assert.deepEqual(hungarian([]), []);
  assert.deepEqual(hungarian([[], []]), [-1, -1]);
  assert.throws(() => hungarian([[1, 2], [3]]), /rectangular/);
});

function fixtures() {
  const network: RoadNetwork = {
    nodes: [0, 5, 6, 7].map((x, id) => ({ id, x: x * 125, y: 0, zoneId: 'test' })),
    edges: [5, 1, 1].map((length, id) => ({
      id,
      from: id,
      to: id + 1,
      length: length * 125,
      level: 'local',
    })),
    zones: [],
    buildings: [],
    parks: [],
    river: [],
    width: 1000,
    height: 100,
  };
  const vehicle = (id: number, nodeId: number): Vehicle => ({
    id,
    nodeId,
    x: network.nodes[nodeId].x,
    y: 0,
    edgeId: null,
    status: 'Idle',
    speed: 0,
    orderId: null,
    revenue: 0,
    completed: 0,
    idleTime: 0,
    onlineTime: 0,
    servingTime: 0,
    distanceDriven: 0,
    targetNode: null,
    route: [],
    routeIndex: 0,
    edgeProgress: 0,
    heading: 0,
  });
  const order = (id: number, pickupNode: number): Order => ({
    id,
    pickupNode,
    destinationNode: 0,
    pickupZone: 'test',
    destinationZone: 'test',
    createTime: id,
    estimatedDistance: 5,
    estimatedDuration: 500,
    fare: 15,
    waitTime: 0,
    assignedVehicle: null,
    status: 'Waiting',
    assignedTime: null,
    pickupTime: null,
    completedTime: null,
    pickupDistance: 0,
    pickupETA: 0,
  });
  const weights: ScoreWeights = { distance: 1, wait: 0, idle: 0, balance: 0, fairness: 0 };
  return { router: new Router(network), vehicle, order, weights };
}

test('global optimization can improve on the greedy policy using actual road costs', () => {
  const { router, vehicle, order, weights } = fixtures();
  const drivers = [vehicle(1, 0), vehicle(2, 2)];
  const requests = [order(1, 1), order(2, 3)];
  const greedy = dispatch('greedy', drivers, requests, router, weights);
  const optimal = dispatch('hungarian', drivers, requests, router, weights);
  assert.equal(
    greedy.reduce((sum, match) => sum + match.distance, 0),
    8,
  );
  assert.equal(
    optimal.reduce((sum, match) => sum + match.distance, 0),
    6,
  );
  assert.ok(
    drivers.every((driver) => driver.orderId === null),
    'policy evaluation must not mutate drivers',
  );
  assert.ok(
    requests.every((request) => request.status === 'Waiting'),
    'policy evaluation must not mutate orders',
  );
});

test('FIFO honors order age and score weights can prioritize a long-waiting passenger', () => {
  const { router, vehicle, order, weights } = fixtures();
  const driver = vehicle(1, 2);
  const oldest = { ...order(1, 0), createTime: 0, waitTime: 600 };
  const newest = { ...order(2, 3), createTime: 599, waitTime: 1 };
  const fifo = dispatch('fifo', [driver], [newest, oldest], router, weights);
  assert.equal(fifo[0].order.id, oldest.id);
  const proximity = dispatch('score', [driver], [newest, oldest], router, weights);
  const waiting = dispatch('score', [driver], [newest, oldest], router, { ...weights, wait: 3 });
  assert.equal(proximity[0].order.id, newest.id);
  assert.equal(waiting[0].order.id, oldest.id);
});
