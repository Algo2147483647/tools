import test from 'node:test';
import assert from 'node:assert/strict';
import { stepQuantity } from '../public/model.js';

test('quantity arrows change by one and preserve fractional quantities', () => {
  assert.equal(stepQuantity(0, 1), 1);
  assert.equal(stepQuantity(4000, -1), 3999);
  assert.equal(stepQuantity(0.15, 1), 1.15);
  assert.equal(stepQuantity(1.15, -1), 0.15);
});

test('quantity arrows clamp to the allowed range without accepting invalid drafts', () => {
  assert.equal(stepQuantity(0, -1), 0);
  assert.equal(stepQuantity(0.15, -1), 0);
  assert.equal(stepQuantity(1e12, 1), 1e12);
  assert.equal(stepQuantity(1e12 - 0.5, 1), 1e12);
  for (const value of [NaN, Infinity, -1, 1e12 + 1, '', null]) assert.equal(stepQuantity(value, 1), null);
  assert.equal(stepQuantity(1, 0), null);
});
