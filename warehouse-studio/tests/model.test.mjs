import assert from 'node:assert/strict';
import { durationHours, requirements, formatNumber, shiftDays, endAfterDays, stockVisualization } from '../public/model.js';
import { createInitialState } from '../seed.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const period = { start: '2026-10-11T09:00', end: '2026-10-18T09:00' };
const water = { stock: 10, mode: 'rate', amount: 2, rateUnit: 'day' };

test('partial days use exact hours, including minutes', () => {
  const shortPeriod = { start: '2026-10-11T09:15', end: '2026-10-11T21:45' };
  assert.equal(durationHours(shortPeriod), 12.5);
  assert.equal(requirements({ ...water, amount: 24 }, shortPeriod).required, 12.5);
});

test('day, week and hour rates produce equivalent seven-day requirements', () => {
  for (const [amount, rateUnit] of [[2, 'day'], [14, 'week'], [1 / 12, 'hour']]) {
    assert.deepEqual(requirements({ ...water, amount, rateUnit }, period), {
      required: 14, supplied: 0, available: 10, shortage: 4, remaining: -4, coverageHours: 120, configured: true,
    });
  }
});

test('fixed items are independent of valid selected duration, including zero demand', () => {
  const item = { stock: 3, mode: 'fixed', amount: 2 };
  const expected = { required: 2, supplied: 0, available: 3, shortage: 0, remaining: 1, coverageHours: null, configured: true };
  assert.deepEqual(requirements(item, period), expected);
  assert.deepEqual(requirements(item, { ...period, end: '2026-10-11T10:00' }), expected);
  assert.deepEqual(requirements({ ...item, amount: 0 }, period), {
    required: 0, supplied: 0, available: 3, shortage: 0, remaining: 3, coverageHours: null, configured: true,
  });
});

test('zero or missing rates are unconfigured, not an invented zero requirement', () => {
  for (const item of [{ ...water, amount: 0 }, { ...water, amount: undefined }, { ...water, rateUnit: 'month' }]) {
    assert.deepEqual(requirements(item, period), {
      required: null, supplied: 0, available: 10, shortage: null, remaining: null, coverageHours: null, configured: false,
    });
  }
});

test('empty, reversed, malformed, non-calendar and out-of-range periods are invalid', () => {
  const badPeriods = [
    null, {}, { ...period, end: period.start }, { start: period.end, end: period.start },
    { ...period, start: '2026-02-29T09:00' }, { ...period, start: '2026-04-31T09:00' },
    { ...period, start: '2026-13-01T09:00' }, { ...period, start: '2026-01-00T09:00' },
    { ...period, start: '2026-10-11T24:00' }, { ...period, start: '2026-10-11T09:60' },
    { ...period, start: '2026-10-11T09:00:00' }, { ...period, start: '2026-10-11T09:00Z' },
    { ...period, start: '2026-1-11T09:00' }, { ...period, start: '0000-01-01T00:00' },
  ];
  for (const badPeriod of badPeriods) {
    assert.equal(durationHours(badPeriod), null);
    for (const mode of ['rate', 'fixed']) {
      const result = requirements({ ...water, mode }, badPeriod);
      assert.equal(result.required, null);
      assert.equal(result.shortage, null);
      assert.equal(result.remaining, null);
    }
  }
});

test('leap days and early years are interpreted as real calendar years', () => {
  assert.equal(durationHours({ start: '2024-02-28T12:00', end: '2024-03-01T12:00' }), 48);
  assert.equal(durationHours({ start: '2000-02-29T00:00', end: '2000-03-01T00:00' }), 24);
  assert.equal(durationHours({ start: '1900-02-29T00:00', end: '1900-03-01T00:00' }), null);
  assert.equal(durationHours({ start: '0001-01-01T00:00', end: '0001-01-02T00:00' }), 24);
});

test('daylight-saving boundaries retain selected wall-clock durations', () => {
  assert.equal(durationHours({ start: '2026-03-08T00:00', end: '2026-03-09T00:00' }), 24);
  assert.equal(durationHours({ start: '2026-11-01T00:00', end: '2026-11-02T00:00' }), 24);
});

test('floating point arithmetic does not cause spurious shortages', () => {
  const result = requirements({ ...water, stock: 0.3, amount: 0.1, rateUnit: 'hour' }, {
    start: '2026-10-11T00:00', end: '2026-10-11T03:00',
  });
  assert.equal(result.required, 0.3);
  assert.equal(result.shortage, 0);
  assert.equal(result.remaining, 0);
  assert.equal(result.coverageHours, 3);
  assert.equal(requirements({ ...water, stock: 0.299, amount: 0.1, rateUnit: 'hour' }, {
    start: '2026-10-11T00:00', end: '2026-10-11T03:00',
  }).shortage, 0.001);
});

test('invalid or overflowing quantities never leak NaN or Infinity', () => {
  for (const amount of [NaN, Infinity, -1, '2']) {
    assert.equal(requirements({ ...water, amount }, period).required, null);
  }
  assert.equal(requirements({ ...water, amount: Number.MAX_VALUE }, period).required, null);
  const invalidStock = requirements({ ...water, stock: NaN }, period);
  assert.equal(invalidStock.required, 14);
  assert.equal(invalidStock.shortage, null);
  assert.equal(invalidStock.remaining, null);
  assert.equal(invalidStock.coverageHours, null);
});

test('number formatting preserves zero, uses grouping and marks missing values', () => {
  assert.equal(formatNumber(1234.1234567), '1,234.123457');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(-0), '0');
  for (const value of [null, undefined, NaN, Infinity, '12']) assert.equal(formatNumber(value), '—');
});

test('day shifting preserves clock time and correctly crosses month, leap and year boundaries', () => {
  assert.equal(shiftDays('2026-10-11T09:15', 7), '2026-10-18T09:15');
  assert.equal(shiftDays('2024-02-28T23:30', 1), '2024-02-29T23:30');
  assert.equal(shiftDays('2024-03-01T23:30', -1), '2024-02-29T23:30');
  assert.equal(shiftDays('2026-12-31T00:00', 1), '2027-01-01T00:00');
  assert.equal(shiftDays('0099-12-31T00:00', 1), '0100-01-01T00:00');
  assert.equal(shiftDays('2026-10-11T09:15', 0), '2026-10-11T09:15');
  assert.equal(shiftDays('2026-02-29T09:15', 1), null);
  assert.equal(shiftDays('2026-10-11T09:15', 0.5), null);
  assert.equal(shiftDays('9999-12-31T09:15', 1), null);
  assert.equal(shiftDays('0001-01-01T09:15', -1), null);
  assert.equal(shiftDays('2026-10-11T09:15', Infinity), null);
});

test('custom durations accept arbitrary days and round fractional days to the nearest minute', () => {
  assert.equal(endAfterDays('2026-10-11T09:15', 45), '2026-11-25T09:15');
  assert.equal(endAfterDays('2026-10-11T09:15', 2.5), '2026-10-13T21:15');
  assert.equal(endAfterDays('2026-10-11T09:15', 1 / 1440), '2026-10-11T09:16');
  assert.equal(endAfterDays('2024-02-28T23:30', 1.5), '2024-03-01T11:30');
  assert.equal(endAfterDays('2026-12-31T23:30', 0.1), '2027-01-01T01:54');
  assert.equal(endAfterDays('2026-10-11T00:00', 1.234), '2026-10-12T05:37');
  for (const days of [0, -1, NaN, Infinity, 36601, 0.00001]) assert.equal(endAfterDays('2026-10-11T09:15', days), null);
  assert.equal(endAfterDays('2026-02-29T00:00', 1), null);
  assert.equal(endAfterDays('9999-12-31T00:00', 1), null);
  assert.equal(endAfterDays('0001-01-01T00:00', 36600), '0101-03-18T00:00');
});

test('reference catalogs calculate immediately and distinguish consumption from reserves', () => {
  const reference = createInitialState();
  const twoWeeks = { ...period, end: '2026-10-25T09:00' };
  for (const warehouse of reference.warehouses) {
    for (const item of warehouse.items) {
      const short = requirements(item, period);
      const long = requirements(item, twoWeeks);
      assert.equal(short.configured, true, `${warehouse.name}: ${item.name}`);
      assert.ok(Number.isFinite(short.required));
      if (item.mode === 'rate') {
        assert.ok(item.amount > 0);
        assert.ok(Math.abs(long.required - short.required * 2) < 1e-8);
      } else assert.equal(long.required, short.required);
      if (item.type === 'Medical / Medicines' || item.name === 'Vitamins') assert.equal(item.mode, 'fixed');
    }
  }
  const backpack = reference.warehouses.find((warehouse) => warehouse.id === 'backpack');
  const water = backpack.items.find((item) => item.name === 'Drinking Water H₂O');
  const tent = backpack.items.find((item) => item.name === 'Tent');
  assert.equal(requirements(water, period).required, 28000);
  assert.equal(requirements(water, twoWeeks).required, 56000);
  assert.equal(requirements(tent, twoWeeks).required, 1);
});

test('stock bars distinguish shortage, covered demand, and surplus on the same scale', () => {
  assert.deepEqual(stockVisualization(25, 100), { covered: 25, missing: 75, surplus: 0, target: 100, balance: -75, status: 'shortage' });
  assert.deepEqual(stockVisualization(200, 100), { covered: 50, missing: 0, surplus: 50, target: 50, balance: 100, status: 'surplus' });
  assert.deepEqual(stockVisualization(100, 100), { covered: 100, missing: 0, surplus: 0, target: 100, balance: 0, status: 'ready' });
  assert.equal(stockVisualization(0, 100).missing, 100);
  assert.equal(stockVisualization(0, 0).status, 'empty');
  assert.equal(stockVisualization(25, 0).surplus, 100);
  for (const invalid of [null, undefined, NaN, Infinity, -1]) assert.equal(stockVisualization(10, invalid), null);
  for (const [stock, required] of [[0.1, 0.3], [1e12, 1e-9], [1e-9, 1e12]]) {
    const bar = stockVisualization(stock, required);
    for (const key of ['covered', 'missing', 'surplus', 'target']) assert.ok(Number.isFinite(bar[key]) && bar[key] >= 0 && bar[key] <= 100);
    assert.ok(Math.abs(bar.covered + bar.missing + bar.surplus - 100) < 1e-10);
  }
});

test('planned supply covers demand without mutating current stock', () => {
  const item = { ...water, supplyMode: 'rate', supplyAmount: 1, supplyRateUnit: 'day' };
  const result = requirements(item, period);
  assert.equal(result.supplied, 7);
  assert.equal(result.available, 17);
  assert.equal(result.required, 14);
  assert.equal(result.remaining, 3);
  assert.equal(result.shortage, 0);
  assert.equal(item.stock, 10);
  assert.equal(stockVisualization(result.available, result.required).balance, 3);
  assert.equal(requirements({ ...item, supplyAmount: 0.5 }, period).shortage, 0.5);
  assert.equal(requirements({ ...item, supplyMode: 'fixed', supplyAmount: 4 }, period).remaining, 0);
});

test('supply rates use fractional intervals and fixed supply stays constant', () => {
  const shortPeriod = { start: '2026-10-11T00:00', end: '2026-10-13T12:00' };
  for (const [supplyAmount, supplyRateUnit] of [[24, 'day'], [1, 'hour'], [168, 'week']]) {
    const item = { ...water, supplyMode: 'rate', supplyAmount, supplyRateUnit };
    assert.equal(requirements(item, shortPeriod).supplied, 60);
    assert.equal(requirements({ ...item, supplyMode: 'fixed' }, shortPeriod).supplied, supplyAmount);
  }
  const zero = requirements({ ...water, supplyMode: 'rate', supplyAmount: 0, supplyRateUnit: 'day' }, period);
  assert.equal(zero.supplied, 0);
  assert.equal(zero.shortage, 4);
  assert.equal(requirements({ ...water, stock: 0.1, amount: 0.3, mode: 'fixed', supplyMode: 'fixed', supplyAmount: 0.2, supplyRateUnit: 'day' }, period).remaining, 0);
});

test('invalid supply and intervals never report a covered inventory', () => {
  const item = { ...water, supplyMode: 'rate', supplyAmount: 1, supplyRateUnit: 'day' };
  for (const invalid of [
    { supplyAmount: -1 }, { supplyAmount: NaN }, { supplyAmount: Infinity }, { supplyAmount: '1' },
    { supplyMode: 'mystery' }, { supplyRateUnit: 'month' }, { supplyAmount: Number.MAX_VALUE },
  ]) {
    const result = requirements({ ...item, ...invalid }, period);
    assert.equal(result.supplied, null);
    assert.equal(result.available, null);
    assert.equal(result.remaining, null);
    assert.equal(result.shortage, null);
  }
  const invalidPeriod = requirements(item, { ...period, end: period.start });
  assert.equal(invalidPeriod.supplied, null);
  assert.equal(invalidPeriod.available, null);
  assert.equal(invalidPeriod.shortage, null);
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}
if (failures) process.exitCode = 1;
else console.log(`${tests.length} calculation tests passed.`);
