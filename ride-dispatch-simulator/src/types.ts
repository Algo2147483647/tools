export type Point = { x: number; y: number };
export type Algorithm = 'nearest' | 'fifo' | 'greedy' | 'hungarian' | 'batch' | 'score';
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
export const ALGORITHMS: { id: Algorithm; name: string; label: string; description: string }[] = [
  {
    id: 'nearest',
    name: 'Nearest Driver',
    label: 'Nearest Driver',
    description: 'Assign each new request to the closest available driver by road distance.',
  },
  {
    id: 'fifo',
    name: 'FIFO',
    label: 'First In, First Out',
    description: 'Serve the oldest request first, choosing the driver with the longest idle time.',
  },
  {
    id: 'greedy',
    name: 'Global Greedy',
    label: 'Global Greedy',
    description:
      'Repeatedly select the lowest pickup cost across all available driver–order pairs.',
  },
  {
    id: 'hungarian',
    name: 'Hungarian',
    label: 'Hungarian Optimization',
    description: 'Solve the full rectangular assignment matrix to minimize total pickup distance.',
  },
  {
    id: 'batch',
    name: 'Batch Matching',
    label: 'Batch Optimization',
    description: 'Accumulate requests for a configurable interval, then solve optimal assignments.',
  },
  {
    id: 'score',
    name: 'Score Based',
    label: 'Multi-objective Scoring',
    description:
      'Balance pickup distance, passenger wait, driver idle time, local supply, and income fairness.',
  },
];
