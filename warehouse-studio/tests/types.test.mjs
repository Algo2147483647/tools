import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesType, typeFilterState } from '../public/model.js';

const items = [
  'Medical', 'Medical / Hygiene', 'Medical / Hygiene / Dental',
  'Medical / Hygiene / Dental', 'Medical / Dressings', 'Medical Supplies / Hygiene',
  'Cooking / Hygiene', ' Medical/Hygiene / Skin ',
].map((type) => ({ type }));

test('parent filters include descendants with exact segment boundaries', () => {
  assert.equal(items.filter((item) => matchesType(item.type, 'Medical')).length, 6);
  assert.equal(items.filter((item) => matchesType(item.type, 'Medical / Hygiene')).length, 4);
  assert.equal(items.filter((item) => matchesType(item.type, 'Medical / Hygiene / Dental')).length, 2);
  assert.equal(items.filter((item) => matchesType(item.type, '')).length, 8);
  assert.equal(matchesType('Medical Supplies / Hygiene', 'Medical'), false);
  assert.equal(matchesType('Medical / Hygiene', 'Medical / Hygiene / Dental'), false);
  assert.equal(matchesType('Cooking / Hygiene', 'Medical / Hygiene'), false);
});

test('cascading options count complete branches and expose only their children', () => {
  const root = typeFilterState(items);
  assert.equal(root.levels.length, 1);
  assert.deepEqual(root.levels[0].options.map(({ label, count }) => [label, count]), [
    ['Cooking', 1], ['Medical', 6], ['Medical Supplies', 1],
  ]);
  const selected = typeFilterState(items, 'Medical/Hygiene');
  assert.equal(selected.selected, 'Medical / Hygiene');
  assert.deepEqual(selected.levels.map(({ value, count }) => [value, count]), [
    ['Medical', 8], ['Medical / Hygiene', 6], ['Medical / Hygiene', 4],
  ]);
  assert.deepEqual(selected.levels[2].options.map(({ label, count }) => [label, count]), [['Dental', 2], ['Skin', 1]]);
  assert.equal(typeFilterState(items, 'Medical / Hygiene / Dental').levels.length, 3);
});

test('missing branches fall back to the closest remaining ancestor', () => {
  const removedDental = items.filter(({ type }) => !type.endsWith('Dental'));
  assert.equal(typeFilterState(removedDental, 'Medical / Hygiene / Dental').selected, 'Medical / Hygiene');
  assert.equal(typeFilterState([{ type: 'Medical / Dressings' }], 'Medical / Hygiene').selected, 'Medical');
  assert.equal(typeFilterState([{ type: 'Cooking' }], 'Medical / Hygiene').selected, '');
  assert.deepEqual(typeFilterState([]), { selected: '', levels: [{ parent: '', count: 0, value: '', options: [] }] });
});
