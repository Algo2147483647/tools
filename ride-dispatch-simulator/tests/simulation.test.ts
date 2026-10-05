import test from 'node:test';
import assert from 'node:assert/strict';
import { createCity } from '../src/engine/city';
import { SimulationEngine } from '../src/engine/simulation';
import { KM_PER_UNIT } from '../src/engine/routing';
import type { Order, SimulationConfig, Vehicle } from '../src/types';

const city = createCity();
const engine = (config: Partial<SimulationConfig> = {}) =>
  new SimulationEngine(city, { seed: 2718, supply: 200, demand: 1, reposition: false, ...config });

const demandSignature = (orders: Order[]) =>
  orders.map((order) => ({
    id: order.id,
    createTime: order.createTime,
    pickupNode: order.pickupNode,
    destinationNode: order.destinationNode,
    pickupZone: order.pickupZone,
    destinationZone: order.destinationZone,
    fare: order.fare,
  }));
const supplySignature = (vehicles: Vehicle[]) =>
  vehicles.map((vehicle) => ({
    id: vehicle.id,
    x: vehicle.x,
    y: vehicle.y,
    nodeId: vehicle.nodeId,
  }));
const advance = (simulation: SimulationEngine, seconds: number) => {
  simulation.setRunning(true);
  for (let elapsed = 0; elapsed < seconds; elapsed++) simulation.step(1);
};

test('default scenario, pause, speed-independent clock, and reset preserve their contracts', () => {
  const simulation = engine();
  assert.equal(simulation.state.vehicles.length, 200);
  assert.equal(simulation.state.orders.length, 30);
  assert.equal(simulation.state.time, 0);
  const initialSupply = supplySignature(simulation.state.vehicles);
  const initialDemand = demandSignature(simulation.state.orders);
  simulation.step(10);
  assert.equal(simulation.state.time, 0, 'a paused simulation must not advance');
  simulation.setRunning(true);
  simulation.step(0.25);
  simulation.step(1.75);
  assert.equal(simulation.state.time, 2);
  simulation.setRunning(false);
  simulation.step(20);
  assert.equal(simulation.state.time, 2);
  simulation.reset();
  assert.equal(simulation.state.time, 0);
  assert.deepEqual(supplySignature(simulation.state.vehicles), initialSupply);
  assert.deepEqual(demandSignature(simulation.state.orders), initialDemand);
});

test('different policies receive identical initial drivers and future demand', () => {
  const nearest = engine({ algorithm: 'nearest', supply: 50, demand: 3 });
  const optimized = engine({ algorithm: 'hungarian', supply: 50, demand: 3 });
  assert.deepEqual(
    supplySignature(nearest.state.vehicles),
    supplySignature(optimized.state.vehicles),
  );
  advance(nearest, 180);
  advance(optimized, 180);
  assert.ok(
    nearest.state.orders.length > 100,
    'the comparison must include newly generated demand',
  );
  assert.deepEqual(demandSignature(nearest.state.orders), demandSignature(optimized.state.orders));
  assert.equal(nearest.state.metrics.created, optimized.state.metrics.created);
});

test('vehicles move continuously on actual road segments while receiving assignments', () => {
  const simulation = engine();
  simulation.setRunning(true);
  let movingSamples = 0;
  for (let frame = 0; frame < 100; frame++) {
    const before = supplySignature(simulation.state.vehicles);
    simulation.step(0.2);
    for (let index = 0; index < simulation.state.vehicles.length; index++) {
      const vehicle = simulation.state.vehicles[index];
      const moved = Math.hypot(vehicle.x - before[index].x, vehicle.y - before[index].y);
      // A generous 80 km/h bound catches teleportation at route reassignment.
      assert.ok(moved <= (80 / 3600 / KM_PER_UNIT) * 0.2 + 1e-7, `driver ${vehicle.id} teleported`);
      if (moved > 1e-6) movingSamples++;
      if (vehicle.edgeId === null) continue;
      const edge = city.edges.find((candidate) => candidate.id === vehicle.edgeId);
      assert.ok(edge);
      const from = city.nodes[edge.from];
      const to = city.nodes[edge.to];
      const span = Math.hypot(to.x - from.x, to.y - from.y);
      const perpendicular =
        Math.abs((vehicle.x - from.x) * (to.y - from.y) - (vehicle.y - from.y) * (to.x - from.x)) /
        span;
      assert.ok(perpendicular < 1e-6, `driver ${vehicle.id} left its road`);
      assert.ok(Math.hypot(vehicle.x - from.x, vehicle.y - from.y) <= span + 1e-6);
      assert.ok(Math.hypot(vehicle.x - to.x, vehicle.y - to.y) <= span + 1e-6);
    }
  }
  assert.ok(movingSamples > 100, 'vehicles should visibly animate while serving requests');
});

test('batch matching waits for its interval and a policy switch applies immediately', () => {
  const batch = engine({ algorithm: 'batch', batchInterval: 5 });
  advance(batch, 4);
  assert.equal(batch.state.orders.filter((order) => order.assignedTime !== null).length, 0);
  batch.step(1);
  assert.ok(batch.state.orders.some((order) => order.assignedTime !== null));
  const switched = engine({ algorithm: 'batch', batchInterval: 10 });
  advance(switched, 1);
  switched.setConfig({ algorithm: 'nearest' });
  switched.step(1);
  assert.ok(switched.state.orders.some((order) => order.assignedTime !== null));
  assert.equal(switched.state.time, 2, 'switching policy must not reset the scenario');
});

test('stopping repositioning preserves idle priority for drivers who have not received a fare', () => {
  const simulation = engine({ supply: 1000, demand: 0.5, reposition: true });
  advance(simulation, 60);
  const repositioning = simulation.state.vehicles.filter(
    (vehicle) => vehicle.status === 'Repositioning',
  );
  assert.ok(repositioning.length > 0);
  const idleBefore = new Map(repositioning.map((vehicle) => [vehicle.id, vehicle.idleTime]));
  simulation.setConfig({ reposition: false });
  for (const vehicle of repositioning) {
    assert.equal(vehicle.status, 'Idle');
    assert.equal(
      vehicle.idleTime,
      idleBefore.get(vehicle.id),
      'ending an empty repositioning journey is not a new fare',
    );
  }
});

test('supply resizing works through 1,000 drivers and scenario time changes reset coherently', () => {
  const simulation = engine({ supply: 50 });
  for (const supply of [1000, 100, 500]) {
    simulation.setConfig({ supply });
    assert.equal(
      simulation.state.vehicles.filter((vehicle) => vehicle.status !== 'Offline').length,
      supply,
    );
    assert.equal(simulation.state.metrics.activeDrivers, supply);
  }
  advance(simulation, 3);
  simulation.seekHour(19);
  assert.equal(simulation.state.config.startHour, 19);
  assert.equal(simulation.state.time, 0);
  assert.equal(simulation.state.orders.length, 30);
  assert.equal(simulation.state.metrics.activeDrivers, 500);
});

test('1,000 drivers and over 100 concurrent orders retain valid assignments under load', () => {
  const simulation = engine({ supply: 1000, demand: 5, algorithm: 'hungarian', reposition: true });
  advance(simulation, 120);
  assert.equal(simulation.state.metrics.activeDrivers, 1000);
  const activeOrders = simulation.state.orders.filter(
    (order) => order.status !== 'Completed' && order.status !== 'Cancelled',
  );
  assert.ok(activeOrders.length > 100);
  const assignedIds = activeOrders.flatMap((order) =>
    order.assignedVehicle === null ? [] : [order.assignedVehicle],
  );
  assert.equal(new Set(assignedIds).size, assignedIds.length);
  for (const vehicle of simulation.state.vehicles) {
    assert.ok(Number.isFinite(vehicle.x) && Number.isFinite(vehicle.y));
    assert.ok(vehicle.edgeProgress >= 0 && vehicle.edgeProgress <= 1);
  }
  for (const value of Object.values(simulation.state.metrics)) assert.ok(Number.isFinite(value));
});

test('full trips settle revenue once and maintain consistent order/driver ownership', () => {
  const simulation = engine({ supply: 200, demand: 0.5 });
  advance(simulation, 1800);
  const completed = simulation.state.orders.filter((order) => order.status === 'Completed');
  assert.ok(completed.length > 0, 'a sustained run must finish real routed trips');
  assert.equal(simulation.state.metrics.completed, completed.length);
  assert.ok(simulation.state.metrics.revenue > 0);
  const earned = simulation.state.vehicles.reduce((sum, vehicle) => sum + vehicle.revenue, 0);
  const fares = completed.reduce((sum, order) => sum + order.fare, 0);
  assert.ok(Math.abs(earned - fares) < 1e-5, 'completed fares must be credited exactly once');
  assert.ok(Math.abs(simulation.state.metrics.revenue - earned) < 1e-5);
  for (const order of completed) {
    assert.ok(
      order.assignedTime !== null && order.pickupTime !== null && order.completedTime !== null,
    );
    assert.ok(order.createTime <= order.assignedTime);
    assert.ok(order.assignedTime <= order.pickupTime);
    assert.ok(order.pickupTime <= order.completedTime);
  }
  const activeAssignments = new Set<number>();
  for (const vehicle of simulation.state.vehicles) {
    assert.ok(vehicle.onlineTime >= vehicle.servingTime);
    assert.ok(vehicle.distanceDriven >= 0 && Number.isFinite(vehicle.distanceDriven));
    if (vehicle.orderId === null) continue;
    assert.ok(!activeAssignments.has(vehicle.orderId), 'an order must have only one driver');
    activeAssignments.add(vehicle.orderId);
    const order = simulation.state.orders.find((candidate) => candidate.id === vehicle.orderId);
    assert.ok(order);
    assert.equal(order.assignedVehicle, vehicle.id);
    assert.ok(['Assigned', 'PickingUp', 'Serving'].includes(order.status));
  }
});
