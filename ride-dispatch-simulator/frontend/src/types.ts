export type Point = { x: number; y: number };
export type Algorithm = string;
export interface AlgorithmMetadata {
  id: string;
  name: string;
  label: string;
  description: string;
}
export type VehicleStatus = 'Idle' | 'Pickup' | 'Serving' | 'Repositioning' | 'Offline';
export type OrderStatus =
  'Waiting' | 'Assigned' | 'PickingUp' | 'Serving' | 'Completed' | 'Cancelled';
export interface RoadNode extends Point {
  id: number;
  zoneId: string;
}
export interface RoadEdge {
  id: number;
  from: number;
  to: number;
  length: number;
  level: 'arterial' | 'secondary' | 'local';
  name?: string;
}
export interface DemandZone extends Point {
  id: string;
  name: string;
  kind: 'cbd' | 'residential' | 'commercial' | 'airport' | 'station' | 'nightlife' | 'suburb';
  radius: number;
  weight: number;
  color: string;
}
export interface Building {
  points: Point[];
  height: number;
  kind?: string;
}
export interface RoadNetwork {
  nodes: RoadNode[];
  edges: RoadEdge[];
  zones: DemandZone[];
  buildings: Building[];
  parks: { name: string; points: Point[] }[];
  river: Point[];
  width: number;
  height: number;
}
export interface Vehicle extends Point {
  id: number;
  nodeId: number;
  edgeId: number | null;
  status: VehicleStatus;
  speed: number;
  orderId: number | null;
  revenue: number;
  completed: number;
  idleTime: number;
  onlineTime: number;
  servingTime: number;
  distanceDriven: number;
  targetNode: number | null;
  route: number[];
  routeIndex: number;
  edgeProgress: number;
  heading: number;
  utilization: number;
}
export interface Order {
  id: number;
  createTime: number;
  pickupNode: number;
  destinationNode: number;
  pickupZone: string;
  destinationZone: string;
  estimatedDistance: number;
  estimatedDuration: number;
  fare: number;
  waitTime: number;
  assignedVehicle: number | null;
  status: OrderStatus;
  assignedTime: number | null;
  pickupTime: number | null;
  completedTime: number | null;
  pickupDistance: number;
  pickupETA: number;
  remainingPickupETA: number;
}
export interface DispatchCandidate {
  vehicleId: number;
  orderId: number;
  selected: boolean;
  expiresAt: number;
}
export interface DispatchEvent {
  id: number;
  time: number;
  kind: 'created' | 'assigned' | 'pickup' | 'completed' | 'cancelled' | 'system';
  message: string;
}
export interface Metrics {
  market: 'Surplus' | 'Balanced' | 'Shortage';
  activeDrivers: number;
  waitingOrders: number;
  ordersPerMin: number;
  avgPickupETA: number;
  avgWait: number;
  avgPickupDistance: number;
  completionRate: number;
  utilization: number;
  cancellationRate: number;
  revenue: number;
  supply: number;
  demand: number;
  ratio: number;
  completed: number;
  cancelled: number;
  created: number;
  incomeVariance: number;
  idle: number;
  pickup: number;
  serving: number;
  repositioning: number;
}
export interface MetricSnapshot extends Metrics {
  time: number;
}
export interface ScoreWeights {
  distance: number;
  wait: number;
  idle: number;
  balance: number;
  fairness: number;
}
export interface SimulationConfig {
  seed: number;
  supply: number;
  demand: number;
  algorithm: Algorithm;
  batchInterval: number;
  weights: ScoreWeights;
  startHour: number;
  reposition: boolean;
  simulationSpeed: 1 | 2 | 5 | 10;
  secondsPerRealSecond: number;
  supplyDistribution: 'uniform' | 'demand_weighted' | 'random_cluster';
}
export interface SimulationState {
  time: number;
  running: boolean;
  vehicles: Vehicle[];
  orders: Order[];
  events: DispatchEvent[];
  candidates: DispatchCandidate[];
  metrics: Metrics;
  history: MetricSnapshot[];
  config: SimulationConfig;
  zoneStats: ZoneStats[];
}
export interface LayerOptions {
  drivers: boolean;
  orders: boolean;
  demand: boolean;
  supply: boolean;
  roads: boolean;
  dispatch: boolean;
  routes: boolean;
  zones: boolean;
}
export type MapSelection =
  | { type: 'vehicle'; id: number }
  | { type: 'order'; id: number }
  | { type: 'zone'; id: string }
  | null;
export type ViewMode = 'city' | 'demand' | 'supply';
export interface MapHandle {
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
  focusZone(id: string): void;
}

export interface ZoneStats {
  id: string;
  demandWeight: number;
  openOrders: number;
  idleDrivers: number;
  availableDrivers: number;
}
export interface SimulationEnvelope {
  simulationId: string;
  network?: RoadNetwork;
  state: SimulationState;
  sequence: number;
  error?: string;
}
export interface BenchmarkResult {
  algorithm: string;
  name: string;
  metrics: Metrics;
  duration: number;
  seed: number;
}
export interface BenchmarkJob {
  benchmarkId: string;
  status: string;
  results: BenchmarkResult[];
  completed: number;
  total: number;
  error?: string;
  config: SimulationConfig;
  duration: number;
}
