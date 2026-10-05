import type { RoadEdge, RoadNetwork, Vehicle } from '../types';

/** A synthetic city coordinate unit represents eight metres. */
export const KM_PER_UNIT = 0.008;
export const ROAD_SPEEDS = { arterial: 48, secondary: 34, local: 24 } as const;

type Link = { node: number; distance: number; edge: RoadEdge };
type Tree = { distances: Float64Array; previous: Int32Array };

/** Undirected road routing. One Dijkstra tree is cached per source intersection. */
export class Router {
  readonly adjacency: Link[][];
  private trees = new Map<number, Tree>();
  private edges = new Map<string, RoadEdge>();

  constructor(readonly network: RoadNetwork) {
    this.adjacency = network.nodes.map(() => []);
    for (const edge of network.edges) {
      const distance = edge.length * KM_PER_UNIT;
      this.adjacency[edge.from].push({ node: edge.to, distance, edge });
      this.adjacency[edge.to].push({ node: edge.from, distance, edge });
      this.edges.set(`${edge.from}:${edge.to}`, edge);
      this.edges.set(`${edge.to}:${edge.from}`, edge);
    }
  }

  edgeBetween(from: number, to: number): RoadEdge | undefined {
    return this.edges.get(`${from}:${to}`);
  }

  private tree(source: number): Tree {
    const cached = this.trees.get(source);
    if (cached) return cached;
    const count = this.network.nodes.length;
    const distances = new Float64Array(count).fill(Infinity);
    const previous = new Int32Array(count).fill(-1);
    const visited = new Uint8Array(count);
    distances[source] = 0;
    // City graphs are deliberately small (~400 nodes); dense Dijkstra avoids
    // per-edge heap allocations, and its result is reused by every algorithm.
    for (let iteration = 0; iteration < count; iteration++) {
      let nearest = -1;
      let best = Infinity;
      for (let node = 0; node < count; node++) {
        if (!visited[node] && distances[node] < best) {
          best = distances[node];
          nearest = node;
        }
      }
      if (nearest < 0) break;
      visited[nearest] = 1;
      for (const link of this.adjacency[nearest]) {
        const candidate = best + link.distance;
        if (candidate < distances[link.node]) {
          distances[link.node] = candidate;
          previous[link.node] = nearest;
        }
      }
    }
    const result = { distances, previous };
    this.trees.set(source, result);
    return result;
  }

  distance(from: number, to: number): number {
    return this.tree(from).distances[to];
  }

  route(from: number, to: number): number[] {
    if (from === to) return [from];
    const tree = this.tree(from);
    if (!Number.isFinite(tree.distances[to])) return [];
    const path = [to];
    let current = to;
    while (current !== from) {
      current = tree.previous[current];
      if (current < 0) return [];
      path.push(current);
    }
    return path.reverse();
  }

  /** Drivers finish their current road segment before turning onto a new route. */
  vehicleDistance(vehicle: Vehicle, destination: number): number {
    if (vehicle.edgeId !== null && vehicle.route[vehicle.routeIndex + 1] !== undefined) {
      const next = vehicle.route[vehicle.routeIndex + 1];
      const edge = this.edgeBetween(vehicle.nodeId, next);
      return (
        (edge ? edge.length * KM_PER_UNIT * (1 - vehicle.edgeProgress) : 0) +
        this.distance(next, destination)
      );
    }
    return this.distance(vehicle.nodeId, destination);
  }

  setTarget(vehicle: Vehicle, target: number): void {
    const next = vehicle.route[vehicle.routeIndex + 1];
    if (vehicle.edgeId !== null && next !== undefined) {
      const remainder = this.route(next, target);
      vehicle.route = [vehicle.nodeId, ...remainder];
      vehicle.routeIndex = 0;
      // edgeId/progress/position are deliberately preserved: no teleportation.
    } else {
      vehicle.route = this.route(vehicle.nodeId, target);
      vehicle.routeIndex = 0;
      vehicle.edgeProgress = 0;
      vehicle.edgeId = null;
    }
    vehicle.targetNode = target;
  }
}
