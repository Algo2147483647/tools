import test from 'node:test';
import assert from 'node:assert/strict';
import { AutosaveController, type SaveResult } from '../src/autosave.ts';

interface Document {
  revision: number;
  label: string;
}
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
};

test('edits made during a save are serialized with the acknowledged revision', async () => {
  const requests: Document[] = [];
  const first = deferred<SaveResult<Document>>();
  const second = deferred<SaveResult<Document>>();
  const controller = new AutosaveController<Document>((document) => {
    requests.push(document);
    return requests.length === 1 ? first.promise : second.promise;
  }, 60_000);
  controller.load({ revision: 7, label: 'original' });
  controller.change((document) => ({ ...document, label: 'first' }));
  const flushed = controller.flush();
  controller.change((document) => ({ ...document, label: 'second' }));
  assert.equal(requests.length, 1);
  first.resolve({ workspace: { revision: 8, label: 'first' }, savedAt: 'first-save' });
  await Promise.resolve();
  assert.deepEqual(requests, [
    { revision: 7, label: 'first' },
    { revision: 8, label: 'second' },
  ]);
  assert.equal(controller.getSnapshot().workspace?.label, 'second');
  assert.equal(controller.getSnapshot().status, 'saving');
  second.resolve({ workspace: { revision: 9, label: 'second' }, savedAt: 'second-save' });
  await flushed;
  assert.deepEqual(controller.getSnapshot(), {
    workspace: { revision: 9, label: 'second' },
    status: 'saved',
    error: null,
    savedAt: 'second-save',
    canUndo: true,
    canRedo: false,
    presentation: false,
  });
});

test('presentation isolates edits, undo, flush and restores the original history without writes', async () => {
  const requests: Document[] = [];
  const controller = new AutosaveController<Document>(async (workspace) => {
    requests.push(workspace);
    return { workspace: { ...workspace, revision: workspace.revision + 1 }, savedAt: 'saved' };
  }, 1);
  controller.load({ revision: 0, label: 'initial' });
  controller.change((workspace) => ({ ...workspace, label: 'real edit' }));
  assert.throws(() => controller.enterPresentation(), /pending edits/);
  await controller.flush();
  const original = controller.getSnapshot();
  controller.enterPresentation();
  controller.change((workspace) => ({ ...workspace, label: 'temporary' }));
  controller.undo();
  controller.redo();
  await controller.flush();
  controller.retry();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requests.length, 1);
  assert.equal(controller.getSnapshot().workspace!.label, 'temporary');
  assert.throws(() => controller.load(null), /Exit presentation/);
  controller.exitPresentation();
  assert.deepEqual(controller.getSnapshot(), original);
  controller.undo();
  await controller.flush();
  assert.equal(requests.at(-1)!.label, 'initial');
});

test('failure retains every edit, refuses replacement, and requires explicit retry', async () => {
  let attempts = 0;
  const failure = deferred<SaveResult<Document>>();
  const controller = new AutosaveController<Document>(async (document) => {
    attempts++;
    if (attempts === 1) return failure.promise;
    return { workspace: { ...document, revision: document.revision + 1 }, savedAt: 'retry-save' };
  }, 1);
  controller.load({ revision: 2, label: 'original' });
  controller.change((document) => ({ ...document, label: 'before failure' }));
  const flushed = controller.flush();
  controller.change((document) => ({ ...document, label: 'during failure' }));
  failure.reject(new Error('Disk is full.'));
  await assert.rejects(flushed, /Disk is full/);
  controller.change((document) => ({ ...document, label: 'after failure' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(attempts, 1);
  assert.equal(controller.getSnapshot().workspace?.label, 'after failure');
  assert.equal(controller.getSnapshot().status, 'error');
  assert.throws(() => controller.load({ revision: 0, label: 'replacement' }), /Save the current/);
  await assert.rejects(controller.flush(), /Disk is full/);
  assert.equal(attempts, 1);
  controller.retry();
  await controller.flush();
  assert.equal(attempts, 2);
  assert.equal(controller.getSnapshot().workspace?.label, 'after failure');
  assert.equal(controller.getSnapshot().workspace?.revision, 3);
  assert.equal(controller.getSnapshot().status, 'saved');
});

test('concurrent flush calls share one write and a clean replacement is allowed', async () => {
  const response = deferred<SaveResult<Document>>();
  let writes = 0;
  const controller = new AutosaveController<Document>(() => {
    writes++;
    return response.promise;
  }, 60_000);
  controller.load({ revision: 0, label: 'first' });
  controller.change((document) => ({ ...document, label: 'changed' }));
  const first = controller.flush();
  const second = controller.flush();
  assert.equal(first, second);
  assert.equal(writes, 1);
  assert.throws(() => controller.load(null), /Save the current/);
  response.resolve({ workspace: { revision: 1, label: 'changed' }, savedAt: 'saved' });
  await Promise.all([first, second]);
  controller.load(null);
  assert.equal(controller.getSnapshot().status, 'idle');
});

test('debounce persists the latest edit without manual flush', async () => {
  const completed = deferred<void>();
  const sent: Document[] = [];
  const controller = new AutosaveController<Document>(async (document) => {
    sent.push(document);
    completed.resolve();
    return { workspace: { ...document, revision: 1 }, savedAt: 'saved' };
  }, 5);
  controller.load({ revision: 0, label: 'original' });
  controller.change((document) => ({ ...document, label: 'one' }));
  controller.change((document) => ({ ...document, label: 'two' }));
  await completed.promise;
  await controller.flush();
  assert.deepEqual(sent, [{ revision: 0, label: 'two' }]);
});

test('undo during an in-flight save preserves acknowledged revisions and redo history', async () => {
  const first = deferred<SaveResult<Document>>();
  const requests: Document[] = [];
  const controller = new AutosaveController<Document>(async (document) => {
    requests.push(document);
    if (requests.length === 1) return first.promise;
    return { workspace: { ...document, revision: document.revision + 1 }, savedAt: 'saved' };
  }, 60_000);
  controller.load({ revision: 10, label: 'original' });
  controller.change((value) => ({ ...value, label: 'edited' }));
  const flushing = controller.flush();
  controller.undo();
  assert.equal(controller.getSnapshot().workspace!.label, 'original');
  assert.equal(controller.getSnapshot().canRedo, true);
  first.resolve({ workspace: { revision: 11, label: 'edited' }, savedAt: 'first' });
  await flushing;
  assert.deepEqual(requests, [
    { revision: 10, label: 'edited' },
    { revision: 11, label: 'original' },
  ]);
  controller.redo();
  await controller.flush();
  assert.deepEqual(controller.getSnapshot().workspace, { revision: 13, label: 'edited' });
  controller.undo();
  controller.change((value) => ({ ...value, label: 'new branch' }));
  assert.equal(controller.getSnapshot().canRedo, false);
  await controller.flush();
});

test('drag and field groups create one undo step while migrations and revision-only changes do not', async () => {
  const controller = new AutosaveController<Document>(
    async (document) => ({
      workspace: { ...document, revision: document.revision + 1 },
      savedAt: 'saved',
    }),
    60_000,
  );
  controller.load({ revision: 0, label: 'original' });
  controller.change((value) => ({ ...value, label: 'normalized' }), { recordHistory: false });
  assert.equal(controller.getSnapshot().canUndo, false);
  controller.change((value) => ({ ...value, revision: 99 }));
  assert.equal(controller.getSnapshot().workspace!.revision, 0);
  controller.beginHistoryGroup();
  for (const label of ['x=1', 'x=2', 'x=3']) controller.change((value) => ({ ...value, label }));
  controller.endHistoryGroup();
  controller.undo();
  assert.equal(controller.getSnapshot().workspace!.label, 'normalized');
  assert.equal(controller.getSnapshot().canUndo, false);
  controller.redo();
  controller.change((value) => ({ ...value, label: 'a' }), { historyKey: 'weights:edge-1' });
  controller.change((value) => ({ ...value, label: 'abc' }), { historyKey: 'weights:edge-1' });
  controller.undo();
  assert.equal(controller.getSnapshot().workspace!.label, 'x=3');
  controller.undo();
  assert.equal(controller.getSnapshot().workspace!.label, 'normalized');
  await controller.flush();
  controller.load({ revision: 0, label: 'other workspace' });
  assert.equal(controller.getSnapshot().canUndo, false);
  assert.equal(controller.getSnapshot().canRedo, false);
});

test('undo and redo keep failed saves recoverable until retry succeeds', async () => {
  let fail = true;
  const controller = new AutosaveController<Document>(async (document) => {
    if (fail) throw new Error('Read-only workspace');
    return { workspace: { ...document, revision: document.revision + 1 }, savedAt: 'saved' };
  }, 60_000);
  controller.load({ revision: 4, label: 'original' });
  controller.change((value) => ({ ...value, label: 'edited' }));
  await assert.rejects(controller.flush(), /Read-only/);
  controller.undo();
  assert.equal(controller.getSnapshot().status, 'error');
  assert.equal(controller.getSnapshot().workspace!.label, 'original');
  controller.redo();
  assert.equal(controller.getSnapshot().workspace!.label, 'edited');
  fail = false;
  controller.retry();
  await controller.flush();
  assert.equal(controller.getSnapshot().workspace!.revision, 5);
  assert.equal(controller.getSnapshot().canUndo, true);
});

test('a drag that returns to its initial geometry creates no undo step', async () => {
  const controller = new AutosaveController<Document>(
    async (document) => ({
      workspace: { ...document, revision: document.revision + 1 },
      savedAt: 'saved',
    }),
    60_000,
  );
  controller.load({ revision: 0, label: 'same position' });
  controller.beginHistoryGroup();
  controller.change((value) => ({ ...value, label: 'moved' }));
  controller.change((value) => ({ ...value, label: 'same position' }));
  controller.endHistoryGroup();
  assert.equal(controller.getSnapshot().canUndo, false);
  await controller.flush();
});
