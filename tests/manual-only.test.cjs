const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { DEFAULT_SETTINGS } = require('../lib/types');
const { lastNDateKeys } = require('../lib/dates');
const { computeWeightTrend } = require('../lib/weight');
const { computeFitnessIntelligence } = require('../lib/fitnessIntelligence');
const { summarizeDay } = require('../lib/energy');

// A user with no iPhone, Apple Watch, or smart scale records everything by
// hand. These cover the logic that must not quietly depend on an integration.
const tz = DEFAULT_SETTINGS.timezone;
const manualWeights = (days, start = 80) => lastNDateKeys(days, tz).map((date, i) => ({
  id: `w${i}`, date, weightKg: Math.round((start - i * 0.05) * 100) / 100, heightCm: 170, createdAt: `${date}T05:00:00Z`, source: 'manual',
}));
const intelligence = (changes, weights) => {
  const settings = { ...DEFAULT_SETTINGS, vo2Max: null, restingHeartRate: null, ...changes };
  return computeFitnessIntelligence(settings, computeWeightTrend(weights, tz), weights);
};
const integrationWords = /apple|watch|shortcut|wearable|jam tangan pintar|sinkron/i;

test('manual weigh-ins alone are enough for the weight-loss score', () => {
  const result = intelligence({ fitnessGoal: 'weight_loss' }, manualWeights(14));
  assert.equal(result.baselineReady, true);
  assert.notEqual(result.score, null);
  assert.equal(result.vo2Max, null);
  assert.equal(result.restingHeartRate, null);
});

test('with no data at all nothing throws and the guidance names no integration', () => {
  for (const fitnessGoal of ['weight_loss', 'very_lean', 'athletic', 'muscle_gain']) {
    const result = intelligence({ fitnessGoal }, []);
    assert.equal(result.score, null, fitnessGoal);
    const text = [result.recap, ...result.priorities, ...result.baselineReasons].join(' ');
    assert.doesNotMatch(text, integrationWords, `${fitnessGoal}: ${text}`);
  }
});

test('the athletic baseline says a watch is not needed and accepts a hand-counted pulse', () => {
  const empty = intelligence({ fitnessGoal: 'athletic', cardioMinutesWeekly: 90 }, []);
  assert.equal(empty.baselineReady, false);
  assert.match(empty.baselineReasons.join(' '), /tanpa jam tangan/);
  assert.match(empty.baselineReasons.join(' '), /Profil/);
  const typed = intelligence({ fitnessGoal: 'athletic', cardioMinutesWeekly: 90, restingHeartRate: 62 }, []);
  assert.equal(typed.baselineReady, true);
  assert.equal(typed.restingHeartRate, 62);
});

test('manual activity counts in the day summary without any synced entry', () => {
  const day = {
    date: '2026-10-26', foodLogComplete: true,
    meals: [{ id: 'm', foodName: 'Makan', calories: 1700, protein_g: 100, carbs_g: 0, fat_g: 0, time: '2026-10-26T05:00:00Z', source: 'manual' }],
    burns: [{ id: 'b', time: '2026-10-26T10:00:00Z', calories: 120, label: 'Jalan kaki', durationMin: 40, source: 'manual' }],
  };
  const summary = summarizeDay(day, 1800);
  assert.equal(summary.caloriesOut, 120);
  assert.equal(summary.remaining, 100, 'activity must not add to the food budget');
});
