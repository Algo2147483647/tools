import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server.mjs';
import { createInitialState } from '../seed.mjs';
import { createInventoryPdf, pdfFilename } from '../pdf.mjs';

test('PDF export supports multiple pages, empty filters and long material values', async () => {
  const warehouse = createInitialState().warehouses[0];
  const original = JSON.stringify(warehouse);
  const pdf = await createInventoryPdf(warehouse);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.toString('latin1'), /\/Count [2-9]\b/);
  const empty = await createInventoryPdf(warehouse, { itemIds: [] });
  assert.match(empty.toString('latin1'), /\/Count 1\b/);
  assert.equal(JSON.stringify(warehouse), original);
  const item = { ...warehouse.items[0], name: 'Long material name H₂O C₁₂H₂₂O₁₁ '.repeat(4), type: 'Category / Subcategory / '.repeat(4), unit: 'unusually-long-measurement-unit', amount: 1e12, stock: 1e12 };
  const long = await createInventoryPdf({ ...warehouse, items: [item] });
  assert.match(long.toString('latin1'), /\/Count 1\b/);
  assert.equal(pdfFilename({ name: 'A / "B"', period: warehouse.period }), `a-b-${warehouse.period.start.slice(0, 10)}.pdf`);
});

test('PDF endpoint validates snapshots and selected IDs without reading or modifying storage', async (t) => {
  const server = createServer({ dataFile: 'Z:/nonexistent/pdf-test.json', onError: (error) => { throw error; } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/export/pdf`;
  const warehouse = createInitialState().warehouses[0];
  const payload = { warehouse, itemIds: [warehouse.items[2].id], filters: { type: '', query: 'Water', shortageOnly: false } };
  const post = (body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const response = await post(payload);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition'), /^attachment; filename=".+\.pdf"$/);
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  for (const itemIds of [['missing'], [warehouse.items[0].id, warehouse.items[0].id], null]) {
    assert.equal((await post({ ...payload, itemIds })).status, 400);
  }
  assert.equal((await post({ ...payload, warehouse: { ...warehouse, period: { ...warehouse.period, end: warehouse.period.start } } })).status, 400);
  assert.equal((await post({ ...payload, filters: { ...payload.filters, shortageOnly: 'yes' } })).status, 400);
  assert.equal((await post(payload, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await fetch(url)).status, 405);
});
