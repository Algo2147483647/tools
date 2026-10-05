import type { Algorithm, Order, ScoreWeights, Vehicle } from '../types';
import type { Router } from './routing';

export interface Match {
  vehicle: Vehicle;
  order: Order;
  distance: number;
}

/**
 * Exact rectangular minimum-cost assignment using shortest augmenting paths.
 * Returns one column per original row, with -1 for unmatched rows. Transposing
 * tall matrices keeps complexity O(min(rows,cols)^2 * max(rows,cols)).
 */
export function hungarian(cost: number[][]): number[] {
  const originalRows = cost.length;
  if (originalRows === 0) return [];
  const originalCols = cost[0].length;
  if (!originalCols) return Array(originalRows).fill(-1);
  if (cost.some((row) => row.length !== originalCols))
    throw new Error('Assignment matrix must be rectangular.');
  const transpose = originalRows > originalCols;
  const rows = transpose ? originalCols : originalRows;
  const cols = transpose ? originalRows : originalCols;
  const value = (row: number, col: number) => {
    const entry = transpose ? cost[col][row] : cost[row][col];
    return Number.isFinite(entry) ? entry : 1e12;
  };
  const u = new Float64Array(rows + 1);
  const v = new Float64Array(cols + 1);
  const p = new Int32Array(cols + 1);
  const way = new Int32Array(cols + 1);
  for (let row = 1; row <= rows; row++) {
    p[0] = row;
    let col = 0;
    const min = new Float64Array(cols + 1).fill(Infinity);
    const used = new Uint8Array(cols + 1);
    do {
      used[col] = 1;
      const activeRow = p[col];
      let delta = Infinity;
      let nextCol = 0;
      for (let candidate = 1; candidate <= cols; candidate++) {
        if (used[candidate]) continue;
        const reduced = value(activeRow - 1, candidate - 1) - u[activeRow] - v[candidate];
        if (reduced < min[candidate]) {
          min[candidate] = reduced;
          way[candidate] = col;
        }
        if (min[candidate] < delta) {
          delta = min[candidate];
          nextCol = candidate;
        }
      }
      for (let candidate = 0; candidate <= cols; candidate++) {
        if (used[candidate]) {
          u[p[candidate]] += delta;
          v[candidate] -= delta;
        } else min[candidate] -= delta;
      }
      col = nextCol;
    } while (p[col] !== 0);
    do {
      const previous = way[col];
      p[col] = p[previous];
      col = previous;
    } while (col !== 0);
  }
  const assignment = Array<number>(originalRows).fill(-1);
  for (let col = 1; col <= cols; col++) {
    if (!p[col]) continue;
    if (transpose) assignment[col - 1] = p[col] - 1;
    else assignment[p[col] - 1] = col - 1;
  }
  return assignment;
}

/** Pure dispatch policy; mutating vehicle and order lifecycles belongs to the engine. */
export function dispatch(
  algorithm: Algorithm,
  vehicles: Vehicle[],
  orders: Order[],
  router: Router,
  weights: ScoreWeights,
): Match[] {
  if (!vehicles.length || !orders.length) return [];
  const oldest = [...orders].sort((a, b) => a.createTime - b.createTime || a.id - b.id);
  const distance = (vehicle: Vehicle, order: Order) =>
    router.vehicleDistance(vehicle, order.pickupNode);
  if (algorithm === 'fifo') {
    const idleFirst = [...vehicles].sort((a, b) => b.idleTime - a.idleTime || a.id - b.id);
    return oldest.slice(0, idleFirst.length).map((order, index) => ({
      vehicle: idleFirst[index],
      order,
      distance: distance(idleFirst[index], order),
    }));
  }
  if (algorithm === 'nearest') {
    const available = new Set(vehicles);
    const matches: Match[] = [];
    for (const order of oldest) {
      let winner: Vehicle | null = null;
      let closest = Infinity;
      for (const vehicle of available) {
        const cost = distance(vehicle, order);
        if (cost < closest) {
          closest = cost;
          winner = vehicle;
        }
      }
      if (!winner) break;
      matches.push({ vehicle: winner, order, distance: closest });
      available.delete(winner);
    }
    return matches;
  }
  if (algorithm === 'hungarian' || algorithm === 'batch') {
    // Orders are rows: this usually puts the shorter side first and preserves
    // exact rectangular optimization even when demand exceeds available supply.
    const matrix = oldest.map((order) => vehicles.map((vehicle) => distance(vehicle, order)));
    return hungarian(matrix).flatMap((column, row) =>
      column < 0
        ? []
        : [
            {
              vehicle: vehicles[column],
              order: oldest[row],
              distance: matrix[row][column],
            },
          ],
    );
  }
  const supplyByZone = new Map<string, number>();
  const demandByZone = new Map<string, number>();
  for (const vehicle of vehicles) {
    const zone = router.network.nodes[vehicle.nodeId].zoneId;
    supplyByZone.set(zone, (supplyByZone.get(zone) ?? 0) + 1);
  }
  for (const order of orders)
    demandByZone.set(order.pickupZone, (demandByZone.get(order.pickupZone) ?? 0) + 1);
  const maxIncome = Math.max(1, ...vehicles.map((vehicle) => vehicle.revenue));
  const pairs: (Match & { cost: number })[] = [];
  for (const order of oldest) {
    for (const vehicle of vehicles) {
      const km = distance(vehicle, order);
      let cost = km;
      if (algorithm === 'score') {
        const driverZone = router.network.nodes[vehicle.nodeId].zoneId;
        const sourceDemand = demandByZone.get(driverZone) ?? 0;
        const sourceSupply = supplyByZone.get(driverZone) ?? 1;
        const localPressure = sourceDemand / Math.max(1, sourceSupply);
        const targetPressure =
          (demandByZone.get(order.pickupZone) ?? 0) /
          Math.max(1, supplyByZone.get(order.pickupZone) ?? 0);
        // Every feature is scaled to roughly 0..1. Negative wait and idle terms
        // make longer-waiting riders and under-used drivers higher priorities.
        cost =
          weights.distance * Math.min(km / 8, 3) -
          weights.wait * Math.min(order.waitTime / 600, 2) -
          weights.idle * Math.min(vehicle.idleTime / 600, 2) +
          (weights.balance *
            ((driverZone === order.pickupZone ? 0 : localPressure) - Math.min(targetPressure, 5))) /
            5 +
          (weights.fairness * vehicle.revenue) / maxIncome;
      }
      pairs.push({ vehicle, order, distance: km, cost });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost || a.order.id - b.order.id || a.vehicle.id - b.vehicle.id);
  const usedVehicles = new Set<number>();
  const usedOrders = new Set<number>();
  const result: Match[] = [];
  for (const pair of pairs) {
    if (usedVehicles.has(pair.vehicle.id) || usedOrders.has(pair.order.id)) continue;
    result.push(pair);
    usedVehicles.add(pair.vehicle.id);
    usedOrders.add(pair.order.id);
    if (result.length === Math.min(vehicles.length, orders.length)) break;
  }
  return result;
}
