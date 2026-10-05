import test from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmark } from '../src/engine/benchmark';
import type { BenchmarkOptions } from '../src/engine/benchmark';
import { ALGORITHMS } from '../src/types';

const options: BenchmarkOptions = {
  seed: 418,
  supply: 50,
  demand: 2,
  duration: 90,
  startHour: 8,
  batchInterval: 5,
  weights: { distance: 1, wait: 1, idle: 1, balance: 1, fairness: 1 },
  reposition: false,
};

test('benchmark replays the same demand volume, reports six policies, and is reproducible', () => {
  const progress: number[] = [];
  const first = runBenchmark(options, (result, completed, total) => {
    assert.equal(total, ALGORITHMS.length);
    assert.equal(result.seed, options.seed);
    progress.push(completed);
  });
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    first.map((result) => result.algorithm),
    ALGORITHMS.map((algorithm) => algorithm.id),
  );
  assert.equal(new Set(first.map((result) => result.metrics.created)).size, 1);
  assert.ok(first[0].metrics.created > 30, 'the experiment must generate new demand');
  for (const result of first) {
    assert.equal(result.duration, options.duration);
    for (const [key, value] of Object.entries(result.metrics)) {
      assert.ok(Number.isFinite(value), `${result.algorithm}.${key} should be finite`);
    }
  }
  assert.deepEqual(runBenchmark(options), first);
});

test('benchmark rejects nonfinite or unbounded duration before starting work', () => {
  for (const duration of [0, -1, NaN, Infinity, 86_401]) {
    assert.throws(() => runBenchmark({ ...options, duration }), /duration/);
  }
});
