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
  });
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
