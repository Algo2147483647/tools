import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAppServer } from '../server.mjs';

test('static server serves modules and restricts access to public files', async (t) => {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(origin);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /type="module" src="\.\/src\/app.js"/);
  const worker = await fetch(origin + '/src/analysis-worker.js');
  assert.match(worker.headers.get('content-type'), /javascript/);
  assert.match(await worker.text(), /analyzeDocument/);
  const head = await fetch(origin + '/styles.css', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + '/package.json')).status, 404);
  assert.equal((await fetch(origin + '/%2e%2e%2fpackage.json')).status, 400);
  assert.equal((await fetch(origin + '/%')).status, 400);
  assert.equal((await fetch(origin, { method: 'POST', body: '{}' })).status, 405);
});
