const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const {
  ACTIVITY_KINDS, ACTIVITY_DURATIONS, MAX_ACTIVITY_MINUTES,
  activityKind, describeActivity, estimateActivityKcal, validDurationMin,
} = require('../lib/activity');

test('every kind has a distinct id, a label, and a plausible MET value', () => {
  assert.equal(new Set(ACTIVITY_KINDS.map(({ id }) => id)).size, ACTIVITY_KINDS.length);
  for (const kind of ACTIVITY_KINDS) {
    assert.ok(kind.label && kind.emoji);
    assert.ok(kind.met > 1 && kind.met < 12, `${kind.id} MET ${kind.met}`);
    assert.equal(activityKind(kind.id), kind);
  }
  assert.equal(activityKind('nope'), undefined);
});

test('the estimate counts energy above rest, rounded to 5 kcal', () => {
  // (3.5 - 1) x 70 kg x 0.5 h = 87.5 -> 90
  assert.equal(estimateActivityKcal('walk', 30, 70), 90);
  // (8 - 1) x 80 kg x 1 h = 560
  assert.equal(estimateActivityKcal('run', 60, 80), 560);
  for (const kind of ACTIVITY_KINDS) {
    for (const minutes of ACTIVITY_DURATIONS) assert.equal(estimateActivityKcal(kind.id, minutes, 75) % 5, 0);
  }
});

test('a heavier body and a longer session never lower the estimate', () => {
  for (const kind of ACTIVITY_KINDS) {
    assert.ok(estimateActivityKcal(kind.id, 45, 90) >= estimateActivityKcal(kind.id, 45, 60));
    assert.ok(estimateActivityKcal(kind.id, 60, 70) >= estimateActivityKcal(kind.id, 30, 70));
  }
  assert.ok(estimateActivityKcal('run', 30, 70) > estimateActivityKcal('walk', 30, 70));
});

test('an unusable weight falls back instead of producing nonsense', () => {
  const fallback = estimateActivityKcal('walk', 30, 70);
  for (const weight of [NaN, 0, -10, 10, 400, Infinity]) assert.equal(estimateActivityKcal('walk', 30, weight), fallback);
});

test('unknown kinds and bad durations give no estimate, and a short session is never zero', () => {
  assert.equal(estimateActivityKcal('nope', 30, 70), null);
  for (const minutes of [0, -1, 1.5, NaN, MAX_ACTIVITY_MINUTES + 1]) assert.equal(estimateActivityKcal('walk', minutes, 70), null);
  assert.equal(estimateActivityKcal('yoga', 1, 25), 5);
});

test('duration validation accepts whole minutes in range only', () => {
  for (const ok of [1, 30, MAX_ACTIVITY_MINUTES]) assert.equal(validDurationMin(ok), true);
  for (const bad of [0, -1, 1.5, MAX_ACTIVITY_MINUTES + 1, '30', null, undefined, NaN]) assert.equal(validDurationMin(bad), false);
});

test('the list label shows minutes only when they are known', () => {
  assert.equal(describeActivity('Jalan kaki', 30), 'Jalan kaki · 30 mnt');
  assert.equal(describeActivity('Aktivitas'), 'Aktivitas');
  assert.equal(describeActivity('Aktivitas', 0), 'Aktivitas');
});
