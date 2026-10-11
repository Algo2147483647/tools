import test from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory } from '../public/model.js';

test('continuous field edits undo together; redo restores the complete value', () => {
  const history = new EditHistory();
  history.reset([{ id: 'a', stock: 0 }]);
  for (const stock of [1, 12, 120]) history.record([{ id: 'a', stock }], { group: 'a:stock', warehouseId: 'a', label: 'Edit stock' });
  assert.deepEqual(history.undo(), { value: [{ id: 'a', stock: 0 }], context: { warehouseId: 'a', label: 'Edit stock' } });
  assert.equal(history.canUndo, false);
  assert.deepEqual(history.redo().value, [{ id: 'a', stock: 120 }]);
});

test('revisiting a field starts a separate edit, and a new branch clears redo', () => {
  const history = new EditHistory();
  history.reset({ stock: 0 });
  history.record({ stock: 1 }, { group: 'stock' });
  history.breakGroup();
  history.record({ stock: 2 }, { group: 'stock' });
  assert.deepEqual(history.undo().value, { stock: 1 });
  history.record({ stock: 3 }, { group: 'stock' });
  assert.equal(history.canRedo, false);
  assert.deepEqual(history.undo().value, { stock: 1 });
  assert.deepEqual(history.undo().value, { stock: 0 });
});

test('warehouse deletion is reversible without losing items or other warehouses', () => {
  const history = new EditHistory();
  const initial = [{ id: 'a', items: [{ id: 'x', stock: 24 }] }, { id: 'b', items: [] }];
  history.reset(initial);
  history.record([initial[1]], { warehouseId: 'a', label: 'Delete warehouse' });
  initial[0].items[0].stock = 999;
  const restored = history.undo();
  assert.equal(restored.value[0].items[0].stock, 24);
  assert.equal(restored.context.warehouseId, 'a');
  restored.value[0].items[0].stock = 555;
  assert.deepEqual(history.redo().value, [{ id: 'b', items: [] }]);
  assert.equal(history.undo().value[0].items[0].stock, 24);
});

test('no-op changes add no history, and loading a new file clears both stacks', () => {
  const history = new EditHistory();
  history.reset({ stock: 0 });
  assert.equal(history.record({ stock: 0 }), false);
  assert.equal(history.canUndo, false);
  history.record({ stock: 2 });
  history.undo();
  history.reset({ stock: 42 });
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.equal(history.undo(), null);
});

test('history bounds retain the most recent usable undo', () => {
  const history = new EditHistory({ limit: 2 });
  history.reset(0);
  for (let i = 1; i <= 4; i++) history.record(i);
  assert.equal(history.undo().value, 3);
  assert.equal(history.undo().value, 2);
  assert.equal(history.undo(), null);
  const bounded = new EditHistory({ maxBytes: 1 });
  bounded.reset('initial');
  bounded.record('first'); bounded.record('second');
  assert.equal(bounded.undo().value, 'first');
});
