import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import { decodeSimulationFrame, mergeBenchmark, mergeFrame } from '../src/stores/frames';
import { ReconnectingSocket, reconnectDelay } from '../src/services/socket';
import { observedPath, samplePath } from '../src/map/interpolation';
import type {
  BenchmarkJob,
  MetricSnapshot,
  RoadNetwork,
  SimulationState,
  Vehicle,
} from '../src/types';

const network = {
  nodes: [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 100, y: 0 },
    { id: 2, x: 100, y: 100 },
    { id: 3, x: 200, y: 100 },
  ],
} as RoadNetwork;
const vehicle = (x: number, y: number, route: number[], routeIndex = 0) =>
  ({ id: 1, x, y, route, routeIndex, heading: 0 }) as Vehicle;

test('late benchmark restoration cannot replace streamed progress or terminal results', () => {
  const live = { benchmarkId: 'job', status: 'running', completed: 3 } as BenchmarkJob;
  assert.equal(mergeBenchmark(live, { ...live, completed: 1 }), live);
  const complete = { ...live, status: 'completed', completed: 6 };
  assert.equal(mergeBenchmark(complete, { ...live, completed: 6 }), complete);
  const next = { ...live, benchmarkId: 'new-job', completed: 0 };
  assert.equal(mergeBenchmark(complete, next), next);
});

test('telemetry rejects stale / duplicated sequences and preserves omitted history', () => {
  const history = [{ time: 15 }] as MetricSnapshot[];
  const state = { time: 15, history } as SimulationState;
  assert.equal(mergeFrame({ sequence: 9, state }, 8, { ...state, time: 12 }), null);
  assert.equal(mergeFrame({ sequence: 9, state }, 9, state), null);
  const incoming = { ...state, time: 16, history: undefined };
  const next = mergeFrame({ sequence: 9, state }, 10, incoming)!;
  assert.equal(next.state.time, 16);
  assert.equal(next.state.history, history);
  assert.deepEqual(mergeFrame(next, 11, { ...state, history: [] })!.state.history, []);
});

test('engine failure frames preserve authoritative paused state and expose the server message', () => {
  const state = { time: 45, running: false, history: [] } as unknown as SimulationState;
  const raw = {
    type: 'error',
    simulationId: 'city',
    sequence: 15,
    state,
    message: 'Simulation stopped after an engine error',
  };
  const frame = decodeSimulationFrame(raw, 'city')!;
  assert.equal(frame.error, raw.message);
  assert.equal(
    mergeFrame({ sequence: 14, state: { ...state, running: true } }, frame.sequence, frame.state)!
      .state.running,
    false,
  );
  assert.equal(decodeSimulationFrame(raw, 'different-session'), null);
  assert.equal(decodeSimulationFrame({ ...raw, state: null }, 'city'), null);
});

test('a fresh reconnect snapshot can restore a lower checkpoint sequence without accepting later stale frames', () => {
  const state = { time: 200, history: [] } as unknown as SimulationState;
  const previous = { sequence: 500, state };
  const restored = { ...state, time: 180, running: false };
  assert.equal(mergeFrame(previous, 470, restored), null);
  const accepted = mergeFrame(previous, 470, restored, true)!;
  assert.equal(accepted.sequence, 470);
  assert.equal(accepted.state.running, false);
  assert.equal(accepted.state.time, 180);
  assert.equal(mergeFrame(accepted, 469, state), null);
  assert.equal(mergeFrame(accepted, 471, restored)?.sequence, 471);
});

test('turn interpolation follows the observed road junction instead of cutting the corner', () => {
  const route = observedPath(vehicle(80, 0, [0, 1, 2]), vehicle(100, 20, [0, 1, 2], 1), network);
  assert.deepEqual(samplePath(route, 0.5), { x: 100, y: 0, heading: 0 });
  const later = samplePath(route, 0.75);
  assert.equal(later.x, 100);
  assert.equal(later.y, 10);
  assert.equal(later.heading, Math.PI / 2);
});

test('pickup-to-trip observations join only at their shared junction', () => {
  const route = observedPath(vehicle(80, 0, [0, 1]), vehicle(100, 20, [1, 2]), network);
  assert.equal(route.length, 40);
  assert.equal(samplePath(route, 0.5).x, 100);
  assert.equal(samplePath(route, 0.5).y, 0);
});

test('interpolation does not extrapolate beyond telemetry and snaps unknown transitions', () => {
  const route = observedPath(vehicle(80, 0, [0, 1, 2]), vehicle(100, 20, [0, 1, 2], 1), network);
  assert.equal(samplePath(route, 50).y, 20);
  assert.equal(samplePath(route, -50).x, 80);
  const reset = observedPath(undefined, vehicle(50, 50, [0, 1]), network);
  assert.equal(reset.length, 0);
  const missing = observedPath(vehicle(80, 0, [0, 1]), vehicle(150, 100, [2, 3]), network);
  assert.equal(missing.length, 0);
  assert.equal(samplePath(missing, 0).x, 150);
});

test('reconnect backoff is bounded and grows exponentially', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 30].map(reconnectDelay),
    [500, 1000, 2000, 4000, 8000, 15000, 15000],
  );
});

test('socket becomes live only after accepted data, reconnects, and stops after disposal', async () => {
  const sockets: {
    onopen: WebSocket['onopen'];
    onmessage: WebSocket['onmessage'];
    onclose: WebSocket['onclose'];
    onerror: WebSocket['onerror'];
    close(): void;
  }[] = [];
  const states: string[] = [];
  const reconnections: boolean[] = [];
  const transport = new ReconnectingSocket(
    'ws://test',
    (data, reconnected) => {
      if (!(data as { valid?: boolean }).valid) return false;
      reconnections.push(reconnected);
      return true;
    },
    (status) => states.push(status),
    () => {
      const fake = {
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        close() {},
      } as (typeof sockets)[number];
      sockets.push(fake);
      return fake;
    },
  );
  const message = (index: number, data: string) =>
    sockets[index].onmessage?.call(
      sockets[index] as unknown as WebSocket,
      { data } as MessageEvent,
    );
  message(0, 'not-json');
  message(0, '{"valid":false}');
  assert.deepEqual(states, ['connecting']);
  message(0, '{"valid":true}');
  assert.equal(states.at(-1), 'connected');
  sockets[0].onclose?.call(sockets[0] as unknown as WebSocket, {} as CloseEvent);
  assert.equal(states.at(-1), 'reconnecting');
  await new Promise((resolve) => setTimeout(resolve, 530));
  assert.equal(sockets.length, 2);
  message(0, '{"valid":true}'); // obsolete socket cannot update state
  message(1, '{"valid":true}');
  assert.deepEqual(reconnections, [false, true]);
  transport.close();
  message(1, '{"valid":true}');
  assert.deepEqual(reconnections, [false, true]);
});

test('browser source boundary excludes simulation engines, workers and polling', async () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const sources: string[] = [];
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (/\.tsx?$/.test(entry.name)) sources.push(await readFile(absolute, 'utf8'));
    }
  }
  await visit(root);
  const source = sources.join('\n');
  assert.doesNotMatch(source, /from ['"][^'"]*\/engine\//);
  assert.doesNotMatch(source, /new Worker\(|setInterval\(|class SimulationEngine|zoneDemandWeight/);
});
