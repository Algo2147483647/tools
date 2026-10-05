import type {
  DemandZone,
  DispatchEvent,
  Metrics,
  Order,
  RoadNetwork,
  ScoreWeights,
  SimulationConfig,
  SimulationState,
  Vehicle,
} from '../types';
import { dispatch } from './dispatch';
import { KM_PER_UNIT, ROAD_SPEEDS, Router } from './routing';

export const DEFAULT_CONFIG: SimulationConfig = {
  seed: 71429,
  supply: 200,
  demand: 1,
  algorithm: 'nearest',
  batchInterval: 5,
  weights: { distance: 0.45, wait: 0.25, idle: 0.12, balance: 0.1, fairness: 0.08 },
  startHour: 8,
  reposition: true,
};

const MAX_WAIT_SECONDS = 600;
const TERMINAL_RETENTION = 500;
const routerCache = new WeakMap<RoadNetwork, Router>();

function randomStream(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Time-of-day spatial density used by both the generator and map heat layer. */
export function zoneDemandWeight(zone: DemandZone, hour: number): number {
  const time = ((hour % 24) + 24) % 24;
  const morning = time >= 7 && time < 10;
  const evening = time >= 16 && time < 20;
  const night = time >= 21 || time < 5;
  let multiplier = 1;
  if (zone.kind === 'residential') multiplier = morning ? 2.8 : evening ? 0.65 : night ? 0.4 : 0.85;
  if (zone.kind === 'cbd') multiplier = morning ? 0.7 : evening ? 3 : night ? 0.3 : 1.6;
  if (zone.kind === 'commercial') multiplier = morning ? 0.8 : evening ? 1.6 : night ? 0.5 : 1.5;
  if (zone.kind === 'airport') multiplier = night ? 1.2 : 1.75;
  if (zone.kind === 'station') multiplier = morning || evening ? 1.9 : 1.2;
  if (zone.kind === 'nightlife') multiplier = night ? 4.5 : evening ? 1.3 : 0.35;
  if (zone.kind === 'suburb') multiplier = morning ? 1.7 : night ? 0.45 : 0.7;
  return zone.weight * multiplier;
}

function emptyMetrics(): Metrics {
  return {
    activeDrivers: 0,
    waitingOrders: 0,
    ordersPerMin: 0,
    avgPickupETA: 0,
    avgWait: 0,
    avgPickupDistance: 0,
    completionRate: 0,
    utilization: 0,
    cancellationRate: 0,
    revenue: 0,
    supply: 0,
    demand: 0,
    ratio: 0,
    completed: 0,
    cancelled: 0,
    created: 0,
    incomeVariance: 0,
    idle: 0,
    pickup: 0,
    serving: 0,
    repositioning: 0,
  };
}

/**
 * Mutable, UI-independent deterministic simulation. time is elapsed seconds;
 * the city clock is startHour * 3600 + time. Distance is km, speed km/h,
 * duration seconds, currency USD, and KPI rates are percentages (0..100).
 */
export class SimulationEngine {
  readonly router: Router;
  state!: SimulationState;
  private demandRandom!: () => number;
  private vehicleRandom!: () => number;
  private nextArrival = 0;
  private nextDispatch = 0;
  private nextMetric = 1;
  private nextHistory = 5;
  private nextReposition = 30;
  private nextOrderId = 1;
  private nextEventId = 1;
  private created = 0;
  private completed = 0;
  private cancelled = 0;
  private totalRevenue = 0;
  private pickupCount = 0;
  private assignmentCount = 0;
  private pickupWaitSum = 0;
  private pickupDistanceSum = 0;
  private pickupETASum = 0;
  private occupiedSeconds = 0;
  private onlineSeconds = 0;
  private createdTimes: number[] = [];
  private ordersById = new Map<number, Order>();
  private nodesByZone = new Map<string, number[]>();
  private retired = new Set<number>();

  constructor(
    readonly network: RoadNetwork,
    config: Partial<SimulationConfig> = {},
  ) {
    if (!network.nodes.length || !network.zones.length)
      throw new Error('Simulation requires a connected city with demand zones.');
    const existingRouter = routerCache.get(network);
    this.router = existingRouter ?? new Router(network);
    if (!existingRouter) routerCache.set(network, this.router);
    for (const node of network.nodes) {
      const collection = this.nodesByZone.get(node.zoneId) ?? [];
      collection.push(node.id);
      this.nodesByZone.set(node.zoneId, collection);
    }
    this.reset(config);
  }

  reset(config: Partial<SimulationConfig> = {}): void {
    const previousConfig = this.state?.config ?? DEFAULT_CONFIG;
    const merged = this.normalizeConfig({
      ...previousConfig,
      ...config,
      weights: { ...previousConfig.weights, ...config.weights },
    });
    this.state = {
      time: 0,
      running: false,
      vehicles: [],
      orders: [],
      events: [],
      candidates: [],
      metrics: emptyMetrics(),
      history: [],
      config: merged,
    };
    this.demandRandom = randomStream(merged.seed ^ 0xa341316c);
    this.vehicleRandom = randomStream(merged.seed ^ 0xc8013ea4);
    this.nextOrderId = 1;
    this.nextEventId = 1;
    this.created = this.completed = this.cancelled = this.totalRevenue = 0;
    this.pickupCount =
      this.assignmentCount =
      this.pickupWaitSum =
      this.pickupDistanceSum =
      this.pickupETASum =
        0;
    this.occupiedSeconds = this.onlineSeconds = 0;
    this.createdTimes = [];
    this.ordersById.clear();
    this.retired.clear();
    this.nextDispatch = merged.algorithm === 'batch' ? merged.batchInterval : 0;
    this.nextMetric = 1;
    this.nextHistory = 5;
    this.nextReposition = 30;
    for (let id = 1; id <= merged.supply; id++) this.state.vehicles.push(this.createVehicle(id));
    for (let index = 0; index < 30; index++) this.createOrder(0);
    this.nextArrival = this.interarrival();
    this.event('system', 'City initialized · 30 requests ready');
    this.updateMetrics();
    this.state.history.push({ ...this.state.metrics, time: 0 });
  }

  setRunning(running: boolean): void {
    this.state.running = running;
  }

  /** Selecting a new hour restarts the seeded scenario at that city-clock hour. */
  seekHour(hour: number): void {
    const running = this.state.running;
    this.reset({ startHour: clamp(hour, 0, 23.999) });
    this.state.running = running;
  }

  setConfig(config: Partial<SimulationConfig>): void {
    const previous = this.state.config;
    const next = this.normalizeConfig({
      ...previous,
      ...config,
      weights: { ...previous.weights, ...config.weights },
    });
    this.state.config = next;
    if (previous.demand !== next.demand) {
      this.nextArrival =
        this.state.time +
        (Math.max(0, this.nextArrival - this.state.time) * previous.demand) / next.demand;
    }
    if (previous.algorithm !== next.algorithm || previous.batchInterval !== next.batchInterval) {
      this.nextDispatch = this.state.time + (next.algorithm === 'batch' ? next.batchInterval : 0);
      this.event(
        'system',
        `Dispatch engine changed · ${next.algorithm === 'batch' ? `batch every ${next.batchInterval}s` : next.algorithm}`,
      );
    }
    if (previous.supply !== next.supply) this.adjustSupply(next.supply);
    if (previous.reposition && !next.reposition) {
      for (const vehicle of this.state.vehicles)
        if (vehicle.status === 'Repositioning') this.releaseVehicle(vehicle);
    }
    this.updateMetrics();
  }

  step(seconds: number): void {
    if (!this.state.running || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = seconds;
    while (remaining > 1e-9) {
      const dt = Math.min(1, remaining);
      this.tick(dt);
      remaining -= dt;
    }
  }

  private normalizeConfig(config: SimulationConfig): SimulationConfig {
    const weights = Object.fromEntries(
      Object.entries(config.weights).map(([key, value]) => [
        key,
        clamp(Number.isFinite(value) ? value : 0, 0, 10),
      ]),
    ) as unknown as ScoreWeights;
    return {
      ...config,
      seed: Number.isFinite(config.seed) ? config.seed >>> 0 : DEFAULT_CONFIG.seed,
      supply: Math.round(clamp(Number.isFinite(config.supply) ? config.supply : 200, 50, 1000)),
      demand: clamp(Number.isFinite(config.demand) ? config.demand : 1, 0.5, 5),
      batchInterval: clamp(Number.isFinite(config.batchInterval) ? config.batchInterval : 5, 1, 30),
      startHour: clamp(Number.isFinite(config.startHour) ? config.startHour : 8, 0, 23.999),
      weights,
    };
  }

  private tick(dt: number): void {
    this.state.time += dt;
    while (this.nextArrival <= this.state.time + 1e-9) {
      this.createOrder(this.nextArrival);
      this.nextArrival += this.interarrival();
    }
    for (const order of this.state.orders) {
      if (
        order.status === 'Waiting' ||
        order.status === 'Assigned' ||
        order.status === 'PickingUp'
      ) {
        order.waitTime = this.state.time - order.createTime;
        if (order.waitTime > MAX_WAIT_SECONDS) this.cancelOrder(order);
      }
    }
    for (const vehicle of this.state.vehicles) {
      if (vehicle.status === 'Offline') continue;
      vehicle.onlineTime += dt;
      this.onlineSeconds += dt;
      if (vehicle.status === 'Serving') this.occupiedSeconds += dt;
      if (vehicle.status === 'Serving') vehicle.servingTime += dt;
      if (vehicle.status === 'Idle' || vehicle.status === 'Repositioning') vehicle.idleTime += dt;
      this.moveVehicle(vehicle, dt);
    }
    if (this.state.time + 1e-9 >= this.nextDispatch) {
      this.dispatchOrders();
      this.nextDispatch =
        this.state.time +
        (this.state.config.algorithm === 'batch' ? this.state.config.batchInterval : 1);
    }
    if (this.state.time >= this.nextReposition) {
      if (this.state.config.reposition) this.repositionVehicles();
      this.nextReposition = this.state.time + 30;
    }
    if (this.state.time + 1e-9 >= this.nextMetric) {
      this.updateMetrics();
      this.state.candidates = this.state.candidates
        .filter((candidate) => candidate.expiresAt > this.state.time)
        .slice(-180);
      this.pruneOrders();
      this.nextMetric = this.state.time + 1;
    }
    if (this.state.time + 1e-9 >= this.nextHistory) {
      this.state.history.push({ ...this.state.metrics, time: this.state.time });
      if (this.state.history.length > 180) this.state.history.shift();
      this.nextHistory = this.state.time + 5;
    }
  }

  private interarrival(): number {
    // Inverse-transform Poisson arrivals; only demand RNG advances here and
    // in createOrder, never during routing/dispatch/repositioning decisions.
    return (-Math.log(Math.max(1e-12, 1 - this.demandRandom())) * 3) / this.state.config.demand;
  }

  private pickZone(weights: number[]): DemandZone {
    let sample = this.demandRandom() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < weights.length; index++) {
      sample -= weights[index];
      if (sample <= 0) return this.network.zones[index];
    }
    return this.network.zones[this.network.zones.length - 1];
  }

  private pickNode(zone: DemandZone): number {
    const nodes = this.nodesByZone.get(zone.id) ?? this.network.nodes.map((node) => node.id);
    return nodes[Math.min(nodes.length - 1, Math.floor(this.demandRandom() * nodes.length))];
  }

  private createOrder(time: number): void {
    const hour = (this.state.config.startHour + time / 3600) % 24;
    const morning = hour >= 7 && hour < 10;
    const evening = hour >= 16 && hour < 20;
    const night = hour >= 21 || hour < 5;
    const pickupZone = this.pickZone(
      this.network.zones.map((zone) => zoneDemandWeight(zone, hour)),
    );
    const destinationZone = this.pickZone(
      this.network.zones.map((zone) => {
        let weight = zone.weight;
        if (morning) weight *= zone.kind === 'cbd' ? 4 : zone.kind === 'commercial' ? 2 : 0.65;
        if (evening || night)
          weight *= zone.kind === 'residential' || zone.kind === 'suburb' ? 3.5 : 0.7;
        if (zone.kind === 'airport') weight *= 1.3;
        if (zone.id === pickupZone.id) weight *= 0.12;
        return weight;
      }),
    );
    const pickupNode = this.pickNode(pickupZone);
    let destinationNode = this.pickNode(destinationZone);
    if (destinationNode === pickupNode)
      destinationNode = (destinationNode + 1) % this.network.nodes.length;
    const km = this.router.distance(pickupNode, destinationNode);
    const duration = (km / 30) * 3600;
    const order: Order = {
      id: this.nextOrderId++,
      createTime: time,
      pickupNode,
      destinationNode,
      pickupZone: pickupZone.id,
      destinationZone: this.network.nodes[destinationNode].zoneId,
      estimatedDistance: km,
      estimatedDuration: duration,
      fare: Math.round((3.4 + km * 1.8 + (duration / 60) * 0.22) * 100) / 100,
      waitTime: 0,
      assignedVehicle: null,
      status: 'Waiting',
      assignedTime: null,
      pickupTime: null,
      completedTime: null,
      pickupDistance: 0,
      pickupETA: 0,
    };
    this.state.orders.push(order);
    this.ordersById.set(order.id, order);
    this.created++;
    this.createdTimes.push(time);
    this.event('created', `Order #${String(order.id).padStart(4, '0')} · ${pickupZone.name}`, time);
  }

  private createVehicle(id: number): Vehicle {
    const nodeId = Math.floor(this.vehicleRandom() * this.network.nodes.length);
    const node = this.network.nodes[nodeId];
    const neighbors = this.router.adjacency[nodeId];
    const next = neighbors[Math.floor(this.vehicleRandom() * neighbors.length)];
    const progress = this.vehicleRandom() * 0.95;
    const destination = this.network.nodes[next.node];
    return {
      id,
      nodeId,
      x: node.x + (destination.x - node.x) * progress,
      y: node.y + (destination.y - node.y) * progress,
      edgeId: next.edge.id,
      status: 'Idle',
      speed: ROAD_SPEEDS[next.edge.level],
      orderId: null,
      revenue: 0,
      completed: 0,
      idleTime: 0,
      onlineTime: 0,
      servingTime: 0,
      distanceDriven: 0,
      targetNode: next.node,
      route: [nodeId, next.node],
      routeIndex: 0,
      edgeProgress: progress,
      heading: Math.atan2(destination.y - node.y, destination.x - node.x),
    };
  }

  private dispatchOrders(): void {
    const available = this.state.vehicles.filter(
      (vehicle) =>
        (vehicle.status === 'Idle' || vehicle.status === 'Repositioning') &&
        !this.retired.has(vehicle.id),
    );
    const waiting = this.state.orders.filter((order) => order.status === 'Waiting');
    if (!available.length || !waiting.length) return;
    const matches = dispatch(
      this.state.config.algorithm,
      available,
      waiting,
      this.router,
      this.state.config.weights,
    );
    // Sample explanation lines; the solver always evaluates its full inputs.
    for (const order of waiting.slice(0, 5)) {
      const nearby = available
        .map((vehicle) => ({ vehicle, km: this.router.vehicleDistance(vehicle, order.pickupNode) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 3);
      for (const { vehicle } of nearby)
        this.state.candidates.push({
          vehicleId: vehicle.id,
          orderId: order.id,
          selected: false,
          expiresAt: this.state.time + 15,
        });
    }
    for (const match of matches) {
      const { vehicle, order, distance } = match;
      order.status = 'Assigned';
      order.assignedVehicle = vehicle.id;
      order.assignedTime = this.state.time;
      order.pickupDistance = distance;
      vehicle.orderId = order.id;
      vehicle.status = 'Pickup';
      vehicle.idleTime = 0;
      this.router.setTarget(vehicle, order.pickupNode);
      order.pickupETA = this.estimateRouteSeconds(vehicle);
      this.assignmentCount++;
      this.pickupDistanceSum += distance;
      this.pickupETASum += order.pickupETA;
      this.state.candidates.push({
        vehicleId: vehicle.id,
        orderId: order.id,
        selected: true,
        expiresAt: this.state.time + 18,
      });
      this.event(
        'assigned',
        `Driver #${String(vehicle.id).padStart(3, '0')} → Order #${String(order.id).padStart(4, '0')}`,
      );
      if (vehicle.route.length <= 1) this.arrive(vehicle);
    }
    if (this.state.candidates.length > 180)
      this.state.candidates = this.state.candidates.slice(-180);
  }

  private trafficFactor(): number {
    const hour = (this.state.config.startHour + this.state.time / 3600) % 24;
    return (hour >= 7 && hour < 10) || (hour >= 16 && hour < 20) ? 0.78 : 0.96;
  }

  private estimateRouteSeconds(vehicle: Vehicle): number {
    let seconds = 0;
    for (let index = vehicle.routeIndex; index < vehicle.route.length - 1; index++) {
      const edge = this.router.edgeBetween(vehicle.route[index], vehicle.route[index + 1]);
      if (!edge) continue;
      const portion = index === vehicle.routeIndex ? 1 - vehicle.edgeProgress : 1;
      seconds +=
        ((edge.length * KM_PER_UNIT * portion) / (ROAD_SPEEDS[edge.level] * this.trafficFactor())) *
        3600;
    }
    return seconds;
  }

  private moveVehicle(vehicle: Vehicle, dt: number): void {
    if (vehicle.status === 'Pickup') {
      const order = this.ordersById.get(vehicle.orderId!);
      if (order?.status === 'Assigned') order.status = 'PickingUp';
    }
    let remaining = dt;
    let segments = 0;
    while (remaining > 1e-9 && segments++ < 20) {
      let nextId = vehicle.route[vehicle.routeIndex + 1];
      if (nextId === undefined) {
        this.arrive(vehicle);
        if (vehicle.status === 'Offline') return;
        if (vehicle.status === 'Idle' && vehicle.route[vehicle.routeIndex + 1] === undefined)
          this.cruise(vehicle);
        nextId = vehicle.route[vehicle.routeIndex + 1];
        if (nextId === undefined) {
          vehicle.speed = 0;
          break;
        }
      }
      const from = this.network.nodes[vehicle.nodeId];
      const next = this.network.nodes[nextId];
      const edge = this.router.edgeBetween(from.id, nextId);
      if (!edge) {
        vehicle.route = [vehicle.nodeId];
        vehicle.edgeId = null;
        vehicle.speed = 0;
        break;
      }
      vehicle.edgeId = edge.id;
      vehicle.speed = ROAD_SPEEDS[edge.level] * this.trafficFactor();
      const km = edge.length * KM_PER_UNIT;
      const kmRemaining = km * (1 - vehicle.edgeProgress);
      const secondsToEnd = (kmRemaining / vehicle.speed) * 3600;
      const consumed = Math.min(remaining, secondsToEnd);
      const travelled = (consumed * vehicle.speed) / 3600;
      vehicle.distanceDriven += travelled;
      vehicle.edgeProgress = Math.min(1, vehicle.edgeProgress + travelled / Math.max(km, 1e-9));
      vehicle.x = from.x + (next.x - from.x) * vehicle.edgeProgress;
      vehicle.y = from.y + (next.y - from.y) * vehicle.edgeProgress;
      vehicle.heading = Math.atan2(next.y - from.y, next.x - from.x);
      remaining -= consumed;
      if (vehicle.edgeProgress >= 1 - 1e-9) {
        vehicle.nodeId = nextId;
        vehicle.routeIndex++;
        vehicle.edgeProgress = 0;
        vehicle.edgeId = null;
        vehicle.x = next.x;
        vehicle.y = next.y;
        if (vehicle.routeIndex >= vehicle.route.length - 1) this.arrive(vehicle);
      } else break;
    }
  }

  private arrive(vehicle: Vehicle): void {
    if (vehicle.route[vehicle.routeIndex + 1] !== undefined) return;
    const order = vehicle.orderId === null ? undefined : this.ordersById.get(vehicle.orderId);
    if (vehicle.status === 'Pickup' && order) {
      order.status = 'Serving';
      order.pickupTime = this.state.time;
      order.waitTime = this.state.time - order.createTime;
      vehicle.status = 'Serving';
      this.pickupCount++;
      this.pickupWaitSum += order.waitTime;
      this.router.setTarget(vehicle, order.destinationNode);
      this.event('pickup', `Pickup complete · Order #${String(order.id).padStart(4, '0')}`);
    } else if (vehicle.status === 'Serving' && order) {
      order.status = 'Completed';
      order.completedTime = this.state.time;
      vehicle.revenue += order.fare;
      vehicle.completed++;
      this.completed++;
      this.totalRevenue += order.fare;
      this.event(
        'completed',
        `Trip #${String(order.id).padStart(4, '0')} completed · $${order.fare.toFixed(2)}`,
      );
      this.releaseVehicle(vehicle);
    } else if (vehicle.status === 'Repositioning') {
      this.releaseVehicle(vehicle);
    }
  }

  private cruise(vehicle: Vehicle): void {
    if (this.retired.has(vehicle.id)) {
      this.releaseVehicle(vehicle);
      return;
    }
    const neighbors = this.router.adjacency[vehicle.nodeId];
    const previous = vehicle.route[vehicle.routeIndex - 1];
    const choices = neighbors.filter((link) => link.node !== previous);
    const pool = choices.length ? choices : neighbors;
    const next = pool[Math.floor(this.vehicleRandom() * pool.length)];
    if (!next) return;
    vehicle.route = [vehicle.nodeId, next.node];
    vehicle.routeIndex = 0;
    vehicle.edgeProgress = 0;
    vehicle.targetNode = next.node;
  }

  private releaseVehicle(vehicle: Vehicle): void {
    const keepIdleStreak = vehicle.status === 'Repositioning' && !this.retired.has(vehicle.id);
    vehicle.orderId = null;
    if (!keepIdleStreak) vehicle.idleTime = 0;
    vehicle.status = this.retired.has(vehicle.id) ? 'Offline' : 'Idle';
    const next = vehicle.route[vehicle.routeIndex + 1];
    if (vehicle.edgeId !== null && next !== undefined) {
      vehicle.route = [vehicle.nodeId, next];
      vehicle.routeIndex = 0;
      vehicle.targetNode = next;
    } else {
      vehicle.route = [vehicle.nodeId];
      vehicle.routeIndex = 0;
      vehicle.edgeProgress = 0;
      vehicle.targetNode = null;
      vehicle.edgeId = null;
    }
    if (vehicle.status === 'Offline') vehicle.speed = 0;
  }

  private cancelOrder(order: Order): void {
    order.status = 'Cancelled';
    order.completedTime = this.state.time;
    this.cancelled++;
    if (order.assignedVehicle !== null) {
      const vehicle = this.state.vehicles.find(
        (candidate) => candidate.id === order.assignedVehicle,
      );
      if (vehicle?.orderId === order.id) this.releaseVehicle(vehicle);
    }
    this.event(
      'cancelled',
      `Order #${String(order.id).padStart(4, '0')} cancelled · wait exceeded 10 min`,
    );
  }

  private repositionVehicles(): void {
    const hour = (this.state.config.startHour + this.state.time / 3600) % 24;
    const idle = this.state.vehicles.filter(
      (vehicle) =>
        vehicle.status === 'Idle' && vehicle.idleTime > 45 && !this.retired.has(vehicle.id),
    );
    const supply = new Map<string, number>();
    for (const vehicle of this.state.vehicles) {
      if (vehicle.status !== 'Idle' && vehicle.status !== 'Repositioning') continue;
      const zoneId = this.network.nodes[vehicle.targetNode ?? vehicle.nodeId].zoneId;
      supply.set(zoneId, (supply.get(zoneId) ?? 0) + 1);
    }
    const demand = new Map<string, number>();
    for (const order of this.state.orders)
      if (order.status === 'Waiting')
        demand.set(order.pickupZone, (demand.get(order.pickupZone) ?? 0) + 1);
    // Move a bounded share each cycle; drivers are still eligible for dispatch.
    for (const vehicle of idle.slice(
      0,
      Math.max(1, Math.round(this.state.vehicles.length * 0.035)),
    )) {
      const source = this.network.nodes[vehicle.nodeId].zoneId;
      let best: DemandZone | null = null;
      let bestScore = -Infinity;
      for (const zone of this.network.zones) {
        if (zone.id === source) continue;
        const score =
          (zoneDemandWeight(zone, hour) + (demand.get(zone.id) ?? 0) * 2) /
          (1 + (supply.get(zone.id) ?? 0));
        if (score > bestScore) {
          best = zone;
          bestScore = score;
        }
      }
      if (!best) continue;
      const nodes = this.nodesByZone.get(best.id);
      if (!nodes?.length) continue;
      const destination = nodes[Math.floor(this.vehicleRandom() * nodes.length)];
      vehicle.status = 'Repositioning';
      this.router.setTarget(vehicle, destination);
      supply.set(best.id, (supply.get(best.id) ?? 0) + 1);
      supply.set(source, Math.max(0, (supply.get(source) ?? 0) - 1));
    }
  }

  private adjustSupply(target: number): void {
    this.retired.clear();
    for (const vehicle of this.state.vehicles) {
      if (vehicle.id > target) {
        this.retired.add(vehicle.id);
        if (vehicle.status === 'Idle' || vehicle.status === 'Repositioning')
          this.releaseVehicle(vehicle);
      } else if (vehicle.status === 'Offline') {
        vehicle.status = 'Idle';
        vehicle.idleTime = 0;
      }
    }
    while (this.state.vehicles.length < target)
      this.state.vehicles.push(this.createVehicle(this.state.vehicles.length + 1));
    this.event(
      'system',
      `Fleet target ${target} · busy drivers finish their trips before going offline`,
    );
  }

  private updateMetrics(): void {
    const vehicles = this.state.vehicles;
    const active = vehicles.filter((vehicle) => vehicle.status !== 'Offline');
    const waiting = this.state.orders.filter((order) => order.status === 'Waiting');
    const unpicked = this.state.orders.filter(
      (order) =>
        order.status === 'Waiting' || order.status === 'Assigned' || order.status === 'PickingUp',
    );
    const idle = active.filter((vehicle) => vehicle.status === 'Idle').length;
    const repositioning = active.filter((vehicle) => vehicle.status === 'Repositioning').length;
    this.createdTimes = this.createdTimes.filter((time) => time > this.state.time - 60);
    const meanIncome =
      vehicles.reduce((sum, vehicle) => sum + vehicle.revenue, 0) / Math.max(1, vehicles.length);
    const incomeVariance =
      vehicles.reduce((sum, vehicle) => sum + (vehicle.revenue - meanIncome) ** 2, 0) /
      Math.max(1, vehicles.length);
    this.state.metrics = {
      activeDrivers: active.length,
      waitingOrders: waiting.length,
      ordersPerMin: this.createdTimes.length,
      avgPickupETA: this.pickupETASum / Math.max(1, this.assignmentCount),
      avgWait: this.pickupCount
        ? this.pickupWaitSum / this.pickupCount
        : unpicked.reduce((sum, order) => sum + order.waitTime, 0) / Math.max(1, unpicked.length),
      avgPickupDistance: this.pickupDistanceSum / Math.max(1, this.assignmentCount),
      completionRate: (this.completed / Math.max(1, this.created)) * 100,
      utilization: (this.occupiedSeconds / Math.max(1, this.onlineSeconds)) * 100,
      cancellationRate: (this.cancelled / Math.max(1, this.created)) * 100,
      revenue: this.totalRevenue,
      supply: idle + repositioning,
      demand: unpicked.length,
      ratio: (idle + repositioning) / Math.max(1, unpicked.length),
      completed: this.completed,
      cancelled: this.cancelled,
      created: this.created,
      incomeVariance,
      idle,
      repositioning,
      pickup: active.filter((vehicle) => vehicle.status === 'Pickup').length,
      serving: active.filter((vehicle) => vehicle.status === 'Serving').length,
    };
  }

  private pruneOrders(): void {
    const terminal = this.state.orders.filter(
      (order) => order.status === 'Completed' || order.status === 'Cancelled',
    );
    if (terminal.length <= TERMINAL_RETENTION) return;
    const remove = new Set(
      terminal.slice(0, terminal.length - TERMINAL_RETENTION).map((order) => order.id),
    );
    this.state.orders = this.state.orders.filter((order) => !remove.has(order.id));
    for (const id of remove) this.ordersById.delete(id);
  }

  private event(kind: DispatchEvent['kind'], message: string, time = this.state.time): void {
    this.state.events.unshift({ id: this.nextEventId++, time, kind, message });
    if (this.state.events.length > 80) this.state.events.length = 80;
  }
}
