import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import {
  createWorkspace,
  removeNode,
  renameNode,
  validateKey,
  validateWorkspace,
  type ServiceNode,
  type Workspace,
} from '../src/model.js';
import { MAIN_FILE, RepositoryError, WorkspaceRepository } from '../server/repository.js';
import { createAppServer } from '../server/index.js';

async function temp<T>(action: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'service-flow-test-'));
  try {
    return await action(directory);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('service-flow-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
function addNode(workspace: Workspace, key: string, graphId = workspace.rootGraphId): Workspace {
  const node: ServiceNode = {
    id: `node-${key}`,
    key,
    graphId,
    childGraphId: `inside-${key}`,
    x: 37.5,
    y: 92,
    width: 220,
    height: 110,
  };
  return {
    ...workspace,
    nodes: [...workspace.nodes, node],
    graphs: [...workspace.graphs, { id: node.childGraphId, parentNodeId: node.id }],
  };
}
function graphFixture(): Workspace {
  let workspace = addNode(addNode(createWorkspace('Integration workspace'), 'Gateway'), 'Worker');
  workspace = addNode(workspace, 'Database', 'inside-Worker');
  workspace = addNode(workspace, 'Replica', 'inside-Database');
  workspace.edges.push({
    id: 'request-flow',
    graphId: 'root',
    source: 'Gateway',
    target: 'Worker',
    weights: ['GET /jobs', 'JobCreated'],
    sourceSide: 'right',
    targetSide: 'left',
    points: [
      { x: 257.5, y: 147 },
      { x: 310, y: 147 },
      { x: 310, y: 210 },
      { x: 37.5, y: 210 },
    ],
  });
  return workspace;
}
const disk = async (directory: string) =>
  JSON.parse(await fs.readFile(path.join(directory, MAIN_FILE), 'utf8')) as Workspace;

test('creates and reopens one complete workspace with exact nested geometry and edge metadata', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    const opened = await repository.open(directory, { create: true, name: 'Integration workspace' });
    assert.equal(opened.workspace.revision, 0);
    const saved = await repository.save(directory, graphFixture());
    assert.equal(saved.workspace.revision, 1);
    assert.deepEqual((await new WorkspaceRepository().open(directory)).workspace, saved.workspace);
    assert.deepEqual(
      (await fs.readdir(directory)).sort(),
      ['Database.md', 'Gateway.md', 'Replica.md', 'Worker.md', MAIN_FILE].sort(),
    );
    assert.match(await fs.readFile(path.join(directory, 'Gateway.md'), 'utf8'), /^# Gateway/);
  }));

test('associates an existing document, preserves Unicode content on rename, and updates edge references', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const content = '# Gateway\n\nExisting notes, café, 数据.\n';
    await fs.writeFile(path.join(directory, 'Gateway.md'), content);
    let { workspace } = await repository.save(directory, graphFixture());
    assert.equal((await repository.readDocument(directory, 'Gateway')).content, content);
    workspace = (await repository.save(directory, renameNode(workspace, 'node-Gateway', 'API Gateway')))
      .workspace;
    assert.equal(workspace.edges[0].source, 'API Gateway');
    assert.equal((await repository.readDocument(directory, 'API Gateway')).content, content);
    await assert.rejects(fs.access(path.join(directory, 'Gateway.md')));
    workspace = (await repository.save(directory, renameNode(workspace, 'node-Gateway', 'api gateway')))
      .workspace;
    assert.ok((await fs.readdir(directory)).includes('api gateway.md'));
    assert.equal((await repository.readDocument(directory, 'api gateway')).content, content);
  }));

test('renaming several nodes in a single save supports name cycles without swapping document ownership', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    let { workspace } = await repository.save(directory, graphFixture());
    await repository.writeDocument(directory, 'Gateway', 'gateway notes');
    await repository.writeDocument(directory, 'Worker', 'worker notes');
    workspace = renameNode(workspace, 'node-Gateway', 'Temporary');
    workspace = renameNode(workspace, 'node-Worker', 'Gateway');
    workspace = renameNode(workspace, 'node-Gateway', 'Worker');
    workspace = (await repository.save(directory, workspace)).workspace;
    assert.equal((await repository.readDocument(directory, 'Worker')).content, 'gateway notes');
    assert.equal((await repository.readDocument(directory, 'Gateway')).content, 'worker notes');
    assert.equal(workspace.edges[0].source, 'Worker');
    assert.equal(workspace.edges[0].target, 'Gateway');
  }));

test('deleting a parent removes all descendants, nested graphs, incident edges, and matching documents', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const initial = await repository.save(directory, graphFixture());
    const { workspace } = await repository.save(directory, removeNode(initial.workspace, 'node-Worker'));
    assert.deepEqual(
      workspace.nodes.map((node) => node.key),
      ['Gateway'],
    );
    assert.equal(workspace.graphs.length, 2);
    assert.equal(workspace.edges.length, 0);
    assert.deepEqual((await fs.readdir(directory)).sort(), ['Gateway.md', MAIN_FILE].sort());
  }));

test('filename and global case-insensitive uniqueness validation covers all graph levels', () => {
  for (const key of [
    'CON',
    'con.log',
    'NUL',
    'CONIN$',
    'CONOUT$',
    'LPT9',
    'COM¹',
    'path/name',
    '..',
    'name.',
    ' leading',
    'trailing ',
    'bad:key',
    'bad\0key',
    '',
  ])
    assert.ok(validateKey(key, []), key);
  const workspace = graphFixture();
  assert.ok(validateKey('database', workspace.nodes));
  assert.throws(() => renameNode(workspace, 'node-Gateway', 'Replica'), /unique/);
  assert.equal(validateKey('Service-v2.0', workspace.nodes), null);
  assert.equal(validateKey('Gateway', workspace.nodes, 'node-Gateway'), null);
});

test('hierarchy has no fixed depth limit, rejects cycles and cross-level edges', () => {
  let workspace = createWorkspace('Deep hierarchy');
  let graphId = 'root';
  for (let index = 0; index < 700; index++) {
    workspace = addNode(workspace, `Level-${index}`, graphId);
    graphId = `inside-Level-${index}`;
  }
  assert.equal(validateWorkspace(workspace).nodes.length, 700);
  assert.equal(removeNode(workspace, 'node-Level-0').nodes.length, 0);
  const invalid = graphFixture();
  invalid.nodes[2].graphId = 'inside-Database';
  assert.throws(() => validateWorkspace(invalid), /cyclic/);
  const crossing = graphFixture();
  crossing.edges[0].target = 'Database';
  assert.throws(() => validateWorkspace(crossing), /crosses graph/);
  const diagonal = graphFixture();
  diagonal.edges[0].points = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ];
  assert.throws(() => validateWorkspace(diagonal), /orthogonal/);
});

test('colliding unrelated documents never get overwritten, and failures retain the previous graph', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const { workspace } = await repository.save(directory, graphFixture());
    await fs.writeFile(path.join(directory, 'Existing.md'), 'unrelated notes');
    await assert.rejects(
      repository.save(directory, renameNode(workspace, 'node-Gateway', 'Existing')),
      (error) => error instanceof RepositoryError && error.code === 'DOCUMENT_COLLISION',
    );
    assert.equal(await fs.readFile(path.join(directory, 'Existing.md'), 'utf8'), 'unrelated notes');
    assert.deepEqual(await disk(directory), workspace);
    await fs.mkdir(path.join(directory, 'Folder.md'));
    await assert.rejects(repository.save(directory, addNode(workspace, 'Folder')), /regular file/);
    assert.deepEqual(await disk(directory), workspace);
  }));

test('invalid schema or JSON is rejected before touching documents or initializing over the file', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await fs.writeFile(path.join(directory, MAIN_FILE), '{broken');
    await fs.writeFile(path.join(directory, 'Keep.md'), 'keep');
    await assert.rejects(repository.open(directory, { create: true }), /Cannot open/);
    assert.equal(await fs.readFile(path.join(directory, MAIN_FILE), 'utf8'), '{broken');
    assert.equal(await fs.readFile(path.join(directory, 'Keep.md'), 'utf8'), 'keep');
    await fs.writeFile(path.join(directory, MAIN_FILE), JSON.stringify(createWorkspace('Valid')));
    const invalid = graphFixture();
    invalid.nodes[0].key = '../escape';
    await assert.rejects(repository.save(directory, invalid), /Invalid workspace/);
    assert.deepEqual((await repository.open(directory)).workspace.nodes, []);
  }));

test('save failure after a partial filesystem update rolls graph and all documents back', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const { workspace } = await repository.save(directory, graphFixture());
    await repository.writeDocument(directory, 'Gateway', 'important original notes');
    const failing = new WorkspaceRepository({
      onTransactionStep(step, index) {
        if (step === 'applied' && index === 0) throw new Error('simulated disk failure');
      },
    });
    await assert.rejects(
      failing.save(directory, renameNode(workspace, 'node-Gateway', 'Renamed')),
      /simulated disk failure/,
    );
    assert.deepEqual(await disk(directory), workspace);
    assert.equal((await repository.readDocument(directory, 'Gateway')).content, 'important original notes');
    await assert.rejects(fs.access(path.join(directory, 'Renamed.md')));
    assert.ok(!(await fs.readdir(directory)).includes('.service-flow-transaction'));
    const saved = await repository.save(directory, renameNode(workspace, 'node-Gateway', 'Renamed'));
    assert.equal(saved.workspace.revision, workspace.revision + 1);
  }));

test('opening recovers an interrupted prepared transaction using its durable backups', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const { workspace } = await repository.save(directory, graphFixture());
    const transaction = path.join(directory, '.service-flow-transaction');
    await fs.mkdir(transaction);
    await fs.copyFile(path.join(directory, MAIN_FILE), path.join(transaction, 'backup-0'));
    await fs.copyFile(path.join(directory, 'Gateway.md'), path.join(transaction, 'backup-1'));
    await fs.writeFile(path.join(transaction, 'next-0'), 'unused staged graph');
    await fs.writeFile(path.join(transaction, 'next-2'), 'renamed notes');
    const journal = {
      version: 1,
      phase: 'prepared',
      entries: [
        { name: MAIN_FILE, existed: true, backup: 'backup-0', staged: 'next-0' },
        { name: 'Gateway.md', existed: true, backup: 'backup-1', staged: null },
        { name: 'Renamed.md', existed: false, backup: null, staged: 'next-2' },
      ],
    };
    await fs.writeFile(path.join(transaction, 'journal.json'), JSON.stringify(journal));
    await fs.writeFile(path.join(directory, MAIN_FILE), 'interrupted graph');
    await fs.unlink(path.join(directory, 'Gateway.md'));
    await fs.writeFile(path.join(directory, 'Renamed.md'), 'renamed notes');
    assert.deepEqual((await new WorkspaceRepository().open(directory)).workspace, workspace);
    assert.match((await repository.readDocument(directory, 'Gateway')).content, /^# Gateway/);
    assert.ok(!(await fs.readdir(directory)).includes('Renamed.md'));
    assert.ok(!(await fs.readdir(directory)).includes('.service-flow-transaction'));
  }));

test('committed journal cleanup failures do not turn a successful save into a failed save', async () =>
  temp(async (directory) => {
    const normal = new WorkspaceRepository();
    await normal.open(directory, { create: true });
    const interruptedCleanup = new WorkspaceRepository({
      onTransactionStep(step) {
        if (step === 'committed') throw new Error('simulated interruption');
      },
    });
    const { workspace } = await interruptedCleanup.save(directory, graphFixture());
    assert.equal(workspace.revision, 1);
    assert.ok((await fs.readdir(directory)).includes('.service-flow-transaction'));
    assert.deepEqual((await normal.open(directory)).workspace, workspace);
    assert.ok(!(await fs.readdir(directory)).includes('.service-flow-transaction'));
  }));

test('a failure during a case-only rename restores the original filename and contents', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const { workspace } = await repository.save(directory, graphFixture());
    await repository.writeDocument(directory, 'Gateway', 'original spelling and notes');
    const failing = new WorkspaceRepository({
      onTransactionStep(step, index) {
        if (step === 'applied' && index === 1) throw new Error('case-only rename interruption');
      },
    });
    await assert.rejects(
      failing.save(directory, renameNode(workspace, 'node-Gateway', 'gateway')),
      /interruption/,
    );
    assert.deepEqual(await disk(directory), workspace);
    const names = await fs.readdir(directory);
    assert.ok(names.includes('Gateway.md'));
    assert.ok(!names.includes('gateway.md'));
    assert.equal(
      (await repository.readDocument(directory, 'Gateway')).content,
      'original spelling and notes',
    );
  }));

test('a transaction interrupted while staging is cleaned without requiring unfinished backups', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    const { workspace } = await repository.open(directory, { create: true });
    const transaction = path.join(directory, '.service-flow-transaction');
    await fs.mkdir(transaction);
    await fs.writeFile(
      path.join(transaction, 'journal.json'),
      JSON.stringify({
        version: 1,
        phase: 'preparing',
        entries: [
          { name: MAIN_FILE, existed: true, backup: 'backup-0', staged: 'next-0' },
          { name: 'New.md', existed: false, backup: null, staged: 'next-1' },
        ],
      }),
    );
    await fs.copyFile(path.join(directory, MAIN_FILE), path.join(transaction, 'backup-0'));
    assert.deepEqual((await repository.open(directory)).workspace, workspace);
    assert.ok(!(await fs.readdir(directory)).includes('.service-flow-transaction'));
  }));

test('concurrent saves are serialized and a stale revision cannot overwrite the winner', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const proposed = graphFixture();
    const results = await Promise.allSettled([
      repository.save(directory, proposed),
      new WorkspaceRepository().save(directory, { ...proposed, name: 'Other writer' }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.code, 'REVISION_CONFLICT');
    assert.equal((await disk(directory)).revision, 1);
  }));

test('unsafe journal paths are rejected without writing outside the workspace', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const transaction = path.join(directory, '.service-flow-transaction');
    await fs.mkdir(transaction);
    await fs.writeFile(
      path.join(transaction, 'journal.json'),
      JSON.stringify({
        version: 1,
        phase: 'prepared',
        entries: [{ name: '../escape.md', existed: false, backup: null, staged: 'next-0' }],
      }),
    );
    await assert.rejects(repository.open(directory), /unsafe entries/);
    assert.equal((await disk(directory)).revision, 0);
  }));

test('document updates are persisted transactionally and unknown keys cannot access arbitrary files', async () =>
  temp(async (directory) => {
    const repository = new WorkspaceRepository();
    await repository.open(directory, { create: true });
    const { workspace } = await repository.save(directory, graphFixture());
    await repository.writeDocument(directory, 'Database', '# Database\n\nSQL notes.');
    assert.equal((await repository.readDocument(directory, 'Database')).content, '# Database\n\nSQL notes.');
    assert.equal((await disk(directory)).revision, workspace.revision);
    await assert.rejects(repository.readDocument(directory, '../outside'), /not found/);
    await assert.rejects(repository.writeDocument(directory, '../outside', 'unsafe'), /not found/);
  }));

test('HTTP API uses scoped sessions and rejects foreign origins and malformed bodies', async () =>
  temp(async (directory) => {
    const server = createAppServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const post = (route: string, value: unknown, headers: Record<string, string> = {}) =>
      fetch(base + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(value),
      });
    try {
      assert.deepEqual(await (await fetch(base + '/api/health')).json(), { ok: true });
      assert.equal(
        (
          await post(
            '/api/workspace/open',
            { path: directory, create: true },
            { Origin: 'https://example.com' },
          )
        ).status,
        403,
      );
      const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
        const request = httpRequest(
          base + '/api/health',
          { headers: { Host: 'evil.example' } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on('error', reject);
        request.end();
      });
      assert.equal(reboundStatus, 403);
      const openedResponse = await post('/api/workspace/open', { path: directory, create: true });
      assert.equal(openedResponse.status, 200);
      const opened = (await openedResponse.json()) as { token: string; workspace: Workspace };
      const expired = await post('/api/workspace/save', { token: 'invalid', workspace: graphFixture() });
      assert.equal(expired.status, 401);
      assert.equal(((await expired.json()) as { code: string }).code, 'TOKEN_EXPIRED');
      const saved = await post('/api/workspace/save', { token: opened.token, workspace: graphFixture() });
      assert.equal(saved.status, 200);
      const conflict = await post('/api/workspace/save', { token: opened.token, workspace: graphFixture() });
      assert.equal(conflict.status, 409);
      const document = await fetch(`${base}/api/document?token=${opened.token}&key=Gateway`);
      assert.equal(document.status, 200);
      assert.equal((await fetch(base + '/api/workspace/open', { method: 'POST', body: '{}' })).status, 415);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }));
