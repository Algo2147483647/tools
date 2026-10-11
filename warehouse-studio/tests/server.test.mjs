import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createServer, validateState } from '../server.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

function request(server, method = 'GET', pathname = '/api/state', body, extraHeaders = {}) {
  const content = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: server.address().port, method, path: pathname,
      headers: {
        ...(content === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(content) }),
        ...extraHeaders,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        resolve({ status: response.statusCode, headers: response.headers, data, text });
      });
    });
    req.on('error', reject);
    req.end(content);
  });
}

async function listen(options) {
  const server = createServer({ onError: () => {}, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

async function close(server) {
  if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'warehouse-api-'));
  const dataFile = path.join(dir, 'data', 'inventory.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir);
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>Warehouse test</title>');
  const server = await listen({ dataFile, publicDir });
  const servers = [server];
  t.after(async () => {
    await Promise.all(servers.map(close));
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, dataFile, publicDir, server, servers };
}

test('first load initializes valid JSON; an acknowledged edit survives restart', async (t) => {
  const context = await fixture(t);
  const first = await request(context.server);
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], 'no-store');
  validateState(first.data);
  assert.deepEqual(JSON.parse(await readFile(context.dataFile, 'utf8')), first.data);
  const edited = clone(first.data);
  edited.warehouses[0].name = 'Persistence test warehouse';
  edited.warehouses[0].period = { start: '2026-10-11T08:00', end: '2026-10-13T20:00' };
  edited.warehouses[0].items.push({ id: 'test-item', name: 'Test water', type: 'Life supplies', unit: 'L', stock: 5.5, mode: 'rate', amount: 2.5, rateUnit: 'day', note: 'Fractional stock' });
  const saved = await request(context.server, 'PUT', '/api/state', edited);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.revision, first.data.revision + 1);
  assert.equal(saved.data.warehouses[0].name, edited.warehouses[0].name);
  assert.deepEqual(JSON.parse(await readFile(context.dataFile, 'utf8')), saved.data);
  assert.deepEqual((await readdir(path.dirname(context.dataFile))).sort(), ['inventory.json']);
  await close(context.server);
  const restarted = await listen({ dataFile: context.dataFile, publicDir: context.publicDir });
  context.servers.push(restarted);
  assert.deepEqual((await request(restarted)).data, saved.data);
});

test('editing one warehouse preserves the other warehouses and their periods', async (t) => {
  const { server } = await fixture(t);
  const original = (await request(server)).data;
  const edited = clone(original);
  if (edited.warehouses.length === 1) {
    const second = clone(edited.warehouses[0]);
    second.id = 'second-warehouse';
    edited.warehouses.push(second);
  }
  const others = clone(edited.warehouses.slice(1));
  edited.warehouses[0].period = { start: '2026-11-01T10:30', end: '2026-11-04T04:15' };
  edited.warehouses[0].items = [{ id: 'only-here', name: 'Water', type: 'Supplies', unit: 'L', stock: 9, amount: 2, mode: 'rate', rateUnit: 'day', note: '' }];
  const saved = await request(server, 'PUT', '/api/state', edited);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.warehouses.slice(1), others);
  assert.deepEqual((await request(server)).data.warehouses.slice(1), others);
});

test('simultaneous writers sharing a revision produce one save and one conflict', async (t) => {
  const { server, dataFile, publicDir, servers } = await fixture(t);
  const peer = await listen({ dataFile, publicDir });
  servers.push(peer);
  const first = (await request(server)).data;
  const left = clone(first);
  const right = clone(first);
  left.warehouses[0].name = 'Window A';
  right.warehouses[0].name = 'Window B';
  const results = await Promise.all([
    request(server, 'PUT', '/api/state', left),
    request(peer, 'PUT', '/api/state', right),
  ]);
  assert.deepEqual(results.map((value) => value.status).sort(), [200, 409]);
  const winner = results.find((value) => value.status === 200).data;
  const conflict = results.find((value) => value.status === 409).data;
  assert.equal(conflict.code, 'REVISION_CONFLICT');
  assert.equal(conflict.currentRevision, winner.revision);
  assert.deepEqual((await request(peer)).data, winner);
  assert.deepEqual(JSON.parse(await readFile(dataFile, 'utf8')), winner);
});

test('invalid edits are rejected without changing persisted data', async (t) => {
  const { server, dataFile } = await fixture(t);
  const first = (await request(server)).data;
  const baseline = await readFile(dataFile, 'utf8');
  const item = { id: 'validation-test', name: 'Water', type: 'Supplies', unit: 'L', stock: 9, amount: 2, mode: 'rate', rateUnit: 'day', note: '' };
  const cases = [
    ['negative stock', (state) => { state.warehouses[0].items = [{ ...item, stock: -1 }]; }],
    ['string quantity', (state) => { state.warehouses[0].items = [{ ...item, amount: '2' }]; }],
    ['nonfinite quantity', (state) => { state.warehouses[0].items = [{ ...item, amount: null }]; }],
    ['unsafe quantity', (state) => { state.warehouses[0].items = [{ ...item, amount: 1e100 }]; }],
    ['duplicate item', (state) => { state.warehouses[0].items = [item, item]; }],
    ['duplicate warehouse', (state) => { state.warehouses.push(clone(state.warehouses[0])); }],
    ['invalid calendar day', (state) => { state.warehouses[0].period.start = '2026-02-30T00:00'; }],
    ['invalid leap day', (state) => { state.warehouses[0].period.start = '2025-02-29T00:00'; }],
    ['year zero', (state) => { state.warehouses[0].period = { start: '0000-01-01T00:00', end: '0000-01-02T00:00' }; }],
    ['invalid hour', (state) => { state.warehouses[0].period.start = '2026-10-11T24:00'; }],
    ['reversed dates', (state) => { state.warehouses[0].period.start = state.warehouses[0].period.end; }],
    ['overlong period', (state) => { state.warehouses[0].period = { start: '1900-01-01T00:00', end: '2026-01-01T00:00' }; }],
    ['empty warehouses', (state) => { state.warehouses = []; }],
    ['unsafe revision', (state) => { state.revision = Number.MAX_SAFE_INTEGER + 1; }],
    ['unknown property', (state) => { state.unexpected = true; }],
    ['unknown mode', (state) => { state.warehouses[0].items = [{ ...item, mode: 'mystery' }]; }],
    ['unknown rate unit', (state) => { state.warehouses[0].items = [{ ...item, rateUnit: 'month' }]; }],
  ];
  for (const [name, mutate] of cases) {
    const edited = clone(first);
    mutate(edited);
    const result = await request(server, 'PUT', '/api/state', edited);
    assert.equal(result.status, 400, name);
    assert.equal(result.data.code, 'VALIDATION_ERROR', name);
    assert.equal(await readFile(dataFile, 'utf8'), baseline, name);
  }
  assert.equal((await request(server, 'PUT', '/api/state', '{')).status, 400);
  assert.equal((await request(server, 'PUT', '/api/state', first, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal(await readFile(dataFile, 'utf8'), baseline);
});

test('a corrupt or incompatible JSON file is preserved on both reads and writes', async (t) => {
  const { server, dataFile } = await fixture(t);
  const valid = (await request(server)).data;
  for (const corrupt of ['{"warehouses": [broken', JSON.stringify({ ...valid, version: 2 })]) {
    await writeFile(dataFile, corrupt);
    for (const result of [await request(server), await request(server, 'PUT', '/api/state', valid)]) {
      assert.equal(result.status, 500);
      assert.equal(result.data.code, 'INVALID_DATA_FILE');
    }
    assert.equal(await readFile(dataFile, 'utf8'), corrupt);
  }
});

test('storage failures return errors and do not acknowledge a save', async (t) => {
  const { server, dataFile } = await fixture(t);
  const valid = (await request(server)).data;
  await rm(dataFile);
  await mkdir(dataFile);
  const result = await request(server, 'PUT', '/api/state', valid);
  assert.equal(result.status, 500);
  assert.equal(result.data.code, 'STORAGE_ERROR');
  assert.deepEqual(await readdir(dataFile), []);
});

test('loopback Host and same-origin write checks protect local state', async (t) => {
  const { server, dataFile } = await fixture(t);
  const initial = (await request(server)).data;
  const baseline = await readFile(dataFile, 'utf8');
  const port = server.address().port;
  assert.equal((await request(server, 'GET', '/api/state', undefined, { Host: `evil.example:${port}` })).status, 403);
  assert.equal((await request(server, 'GET', '/api/state', undefined, { Host: '127.0.0.1:1' })).status, 403);
  assert.equal((await request(server, 'PUT', '/api/state', initial, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(server, 'PUT', '/api/state', initial, { Origin: 'null' })).status, 403);
  assert.equal((await request(server, 'PUT', '/api/state', initial, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(await readFile(dataFile, 'utf8'), baseline);
  assert.equal((await request(server, 'PUT', '/api/state', initial, { Origin: `http://127.0.0.1:${port}` })).status, 200);
});

test('static serving uses an allowlist and never publishes data or source files', async (t) => {
  const { server } = await fixture(t);
  assert.equal((await request(server, 'GET', '/')).status, 200);
  assert.equal((await request(server, 'HEAD', '/')).text, '');
  for (const location of ['/data/inventory.json', '/server.mjs', '/seed.mjs', '/package.json', '/../data/inventory.json', '/%2e%2e/data/inventory.json']) {
    assert.equal((await request(server, 'GET', location)).status, 404, location);
  }
  assert.equal((await request(server, 'DELETE')).status, 405);
});
