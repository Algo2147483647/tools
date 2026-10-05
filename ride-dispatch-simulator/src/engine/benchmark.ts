import { ALGORITHMS } from '../types';
import type { Algorithm, Metrics, ScoreWeights } from '../types';
import { createCity } from './city';
import { SimulationEngine } from './simulation';

export interface BenchmarkResult {
  algorithm: Algorithm;
  name: string;
  metrics: Metrics;
  /** Duration in simulation seconds, excluding scenario construction. */
  duration: number;
  seed: number;
}

export interface BenchmarkOptions {
  seed: number;
  supply: number;
  demand: number;
  /** Run length in simulation seconds. The dashboard uses 1,800 (30 minutes). */
  duration: number;
  startHour: number;
  batchInterval: number;
  weights: ScoreWeights;
  reposition: boolean;
}

/**
 * Replay an identical seeded scenario for every policy. Each engine owns separate
 * random streams for demand and supply, so an assignment cannot change future
 * requests. Use the worker in the browser to keep matching off the UI thread.
 */
export function runBenchmark(
  options: BenchmarkOptions,
  onResult?: (result: BenchmarkResult, completed: number, total: number) => void,
): BenchmarkResult[] {
  if (!Number.isFinite(options.duration) || options.duration <= 0 || options.duration > 86_400) {
    throw new Error('Benchmark duration must be between 0 and 86,400 simulation seconds.');
  }
  const network = createCity();
  const results: BenchmarkResult[] = [];
  for (const algorithm of ALGORITHMS) {
    const engine = new SimulationEngine(network, {
      seed: options.seed,
      supply: options.supply,
      demand: options.demand,
      algorithm: algorithm.id,
      startHour: options.startHour,
      batchInterval: options.batchInterval,
      weights: { ...options.weights },
      reposition: options.reposition,
    });
    engine.setRunning(true);
    let elapsed = 0;
    while (elapsed < options.duration) {
      const dt = Math.min(1, options.duration - elapsed);
      engine.step(dt);
      elapsed += dt;
    }
    engine.setRunning(false);
    const result: BenchmarkResult = {
      algorithm: algorithm.id,
      name: algorithm.name,
      metrics: { ...engine.state.metrics },
      duration: options.duration,
      seed: options.seed,
    };
    results.push(result);
    onResult?.(result, results.length, ALGORITHMS.length);
  }
  return results;
}
