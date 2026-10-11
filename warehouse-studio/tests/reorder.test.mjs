import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderItems, EditHistory } from '../public/model.js';

const items = ['a', 'b', 'c', 'd'].map((id, stock) => ({ id, stock }));
const ids = (list) => list.map((item) => item.id);

test('moving up and down inserts at the requested side without changing quantities', () => {
  assert.deepEqual(ids(reorderItems(items, 'a', 'c', 'after')), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids(reorderItems(items, 'a', 'c', 'before')), ['b', 'a', 'c', 'd']);
  assert.deepEqual(ids(reorderItems(items, 'd', 'b', 'before')), ['a', 'd', 'b', 'c']);
  assert.deepEqual(ids(reorderItems(items, 'd', 'b', 'after')), ['a', 'b', 'd', 'c']);
  assert.deepEqual(ids(items), ['a', 'b', 'c', 'd']);
  for (const item of reorderItems(items, 'a', 'd', 'after')) assert.equal(item, items.find((entry) => entry.id === item.id));
});

test('first/last boundaries and filtered targets retain every hidden item in relative order', () => {
  assert.deepEqual(ids(reorderItems(items, 'd', 'a', 'before')), ['d', 'a', 'b', 'c']);
  assert.deepEqual(ids(reorderItems(items, 'a', 'd', 'after')), ['b', 'c', 'd', 'a']);
  // Only a and d are visible; b and c must stay in their original relative order.
  const moved = reorderItems(items, 'd', 'a', 'before');
  assert.deepEqual(ids(moved.filter((item) => ['b', 'c'].includes(item.id))), ['b', 'c']);
});

test('same position, missing targets and invalid placements produce no edit', () => {
  for (const args of [['a', 'a'], ['a', 'b', 'before'], ['b', 'a', 'after'], ['missing', 'b'], ['a', 'missing'], ['a', 'b', 'invalid']]) {
    assert.equal(reorderItems(items, ...args), items);
  }
});

test('reordering is reversible, JSON-serializable, and isolated to its warehouse', () => {
  const warehouses = [{ id: 'first', items }, { id: 'second', items: [{ id: 'a', stock: 99 }] }];
  const history = new EditHistory();
  history.reset(warehouses);
  const next = [{ ...warehouses[0], items: reorderItems(items, 'a', 'd', 'after') }, warehouses[1]];
  history.record(next, { warehouseId: 'first', itemId: 'a', reorder: true });
  assert.deepEqual(ids(JSON.parse(JSON.stringify(next))[0].items), ['b', 'c', 'd', 'a']);
  assert.deepEqual(history.undo().value, warehouses);
  assert.deepEqual(history.redo().value, next);
  assert.deepEqual(next[1], warehouses[1]);
});
