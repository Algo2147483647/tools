import { runBenchmark } from './benchmark';
import type { BenchmarkOptions, BenchmarkResult } from './benchmark';

export type BenchmarkRequest = { type: 'run'; options: BenchmarkOptions };
export type BenchmarkMessage =
  | { type: 'progress'; completed: number; total: number; result: BenchmarkResult }
  | { type: 'complete'; results: BenchmarkResult[] }
  | { type: 'error'; message: string };

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<BenchmarkRequest>) => {
  if (event.data.type !== 'run') return;
  try {
    const results = runBenchmark(event.data.options, (result, completed, total) => {
      worker.postMessage({ type: 'progress', result, completed, total } satisfies BenchmarkMessage);
    });
    worker.postMessage({ type: 'complete', results } satisfies BenchmarkMessage);
  } catch (error) {
    worker.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Benchmark execution failed.',
    } satisfies BenchmarkMessage);
  }
};
