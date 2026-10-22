import test from 'node:test';
import assert from 'node:assert/strict';
import { endAfterDuration, durationHours, requirements, shiftDays } from '../public/model.js';
import { validateState } from '../server.mjs';
import { createInitialState } from '../seed.mjs';

test('seconds, minutes and hours calculate equivalent demand and supply', () => {
  const period = { start: '2026-10-11T23:59:45', end: '2026-10-12T00:01:15' };
  assert.equal(durationHours(period), 90 / 3600);
  for (const [rateUnit, amount] of [['second', 2], ['minute', 120], ['hour', 7200]]) {
    const r = requirements({ stock: 10, mode: 'rate', amount, rateUnit, supplyMode: 'rate', supplyAmount: amount / 2, supplyRateUnit: rateUnit }, period);
    assert.equal(r.required, 180);
    assert.equal(r.supplied, 90);
    assert.equal(r.shortage, 80);
  }
});

test('duration conversions preserve seconds, boundaries and valid calendar dates', () => {
  for (const [unit, value] of [['second', 90], ['minute', 1.5], ['hour', .025]]) {
    assert.equal(endAfterDuration('2026-10-11T23:59:45', value, unit), '2026-10-12T00:01:15');
  }
  assert.equal(endAfterDuration('2026-10-11T00:00', 1, 'second'), '2026-10-11T00:00:01');
  assert.equal(shiftDays('2026-10-11T00:00:15', 1), '2026-10-12T00:00:15');
  for (const [amount, unit] of [[0, 'second'], [.1, 'second'], [36601, 'day'], [1, 'unknown']]) assert.equal(endAfterDuration('2026-10-11T00:00', amount, unit), null);
  assert.equal(endAfterDuration('9999-12-31T23:59:59', 1, 'second'), null);
  assert.equal(durationHours({start:'2026-10-11T00:00:60',end:'2026-10-12T00:00'}), null);
});

test('JSON accepts new units and second precision while retaining legacy dates', () => {
  const state = createInitialState();
  validateState(state);
  state.warehouses[0].period = { start: '2026-10-11T00:00', end: '2026-10-11T00:00:01', durationUnit: 'second' };
  Object.assign(state.warehouses[0].items[0], {rateUnit:'second', supplyMode:'rate', supplyAmount:1, supplyRateUnit:'minute'});
  validateState(state);
  state.warehouses[0].period.durationUnit = 'unknown';
  assert.throws(()=>validateState(state));
});
