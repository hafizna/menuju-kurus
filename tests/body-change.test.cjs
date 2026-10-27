const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { bodyChange, bodyChanges } = require('../lib/body');

const reading = (value) => ({ value, source: 'manual', recordedAt: '2026-10-01T05:00:00Z', heightCm: 170 });
const snap = (date, fields) => ({ date, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, reading(v)])) });
const today = '2026-10-27';
const snapshots = [
  snap('2026-08-01', { weightKg: 84, waistCm: 96 }),
  snap('2026-10-06', { weightKg: 80, waistCm: 92 }),
  snap('2026-10-20', { weightKg: 79.4 }),
  snap('2026-10-27', { weightKg: 78.2, waistCm: 89, hipCm: 99 }),
];

test('since the start compares the first reading with the latest and reports the real number of days', () => {
  const change = bodyChange(snapshots, 'weightKg', null, today);
  assert.deepEqual(change, { field: 'weightKg', from: { date: '2026-08-01', value: 84 }, to: { date: '2026-10-27', value: 78.2 }, delta: -5.8, days: 87 });
  assert.equal(bodyChange(snapshots, 'waistCm', null, today).delta, -7);
});

test('a 30 day window starts at the earliest reading inside it, never an older one', () => {
  const change = bodyChange(snapshots, 'weightKg', 30, today);
  assert.equal(change.from.date, '2026-10-06');
  assert.equal(change.delta, -1.8);
  assert.equal(change.days, 21);
});

test('one reading, or one reading inside the window, is not a change of zero', () => {
  assert.equal(bodyChange(snapshots, 'hipCm', null, today), null);
  assert.equal(bodyChange(snapshots, 'thighCm', null, today), null);
  assert.equal(bodyChange(snapshots, 'waistCm', 30, today).from.date, '2026-10-06');
  const sparse = [snap('2026-08-01', { weightKg: 84 }), snap('2026-10-27', { weightKg: 80 })];
  assert.equal(bodyChange(sparse, 'weightKg', 30, today), null);
  assert.equal(bodyChange([], 'weightKg', null, today), null);
});

test('input order does not matter and a rise is positive', () => {
  const shuffled = [snapshots[2], snapshots[0], snapshots[3], snapshots[1]];
  assert.deepEqual(bodyChange(shuffled, 'weightKg', null, today), bodyChange(snapshots, 'weightKg', null, today));
  const gain = bodyChange([snap('2026-10-01', { weightKg: 70 }), snap('2026-10-20', { weightKg: 71.35 })], 'weightKg', null, today);
  assert.equal(gain.delta, 1.35);
});

test('the summary lists which measurements still lack a second reading', () => {
  const { changes, missing } = bodyChanges(snapshots, null, today);
  assert.deepEqual(changes.map((change) => change.field), ['weightKg', 'waistCm']);
  assert.deepEqual(missing, ['hipCm', 'thighCm', 'bodyFatPercent']);
});
