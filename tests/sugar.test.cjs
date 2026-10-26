const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { daySugar, weekSugar, parseSugarInput, SUGAR_REFERENCE_G } = require('../lib/sugar');
const { buildAdaptiveCoach } = require('../lib/adaptiveCoach');
const { summarizeDay, computeWeeklyBudget } = require('../lib/energy');
const { buildHabitStrategy } = require('../lib/habits');
const { DEFAULT_SETTINGS } = require('../lib/types');

const meal = (sugar_g) => ({ id: 'x', time: '2026-09-01T03:00:00.000Z', foodName: 'x', calories: 100, protein_g: 0, carbs_g: 0, fat_g: 0, source: 'manual', ...(sugar_g === undefined ? {} : { sugar_g }) });

test('a day total counts only known sugar and reports when it is incomplete', () => {
  assert.deepEqual(daySugar([]), { grams: 0, knownMeals: 0, totalMeals: 0, complete: false });
  const mixed = daySugar([meal(25), meal(undefined), meal(0)]);
  assert.equal(mixed.grams, 25);
  assert.equal(mixed.knownMeals, 2);
  assert.equal(mixed.complete, false);
  assert.equal(daySugar([meal(25), meal(0)]).complete, true);
});

test('the weekly average skips days with unknown sugar and empty days instead of counting them as zero', () => {
  const none = weekSugar([{ meals: [] }, { meals: [meal(undefined)] }]);
  assert.deepEqual(none, { avgG: null, daysWithData: 0, daysOver: 0 });
  const week = weekSugar([
    { meals: [meal(30), meal(30)] }, // 60 g, over
    { meals: [meal(20)] },           // 20 g
    { meals: [meal(40), meal(undefined)] }, // partial, skipped
    { meals: [] },
  ]);
  assert.equal(week.avgG, 40);
  assert.equal(week.daysWithData, 2);
  assert.equal(week.daysOver, 1);
});

test('API sugar input stays unknown unless it is a real number, and is capped', () => {
  for (const unknown of [undefined, null, '', 'abc', NaN, Infinity]) assert.equal(parseSugarInput(unknown), undefined);
  assert.equal(parseSugarInput(0), 0);
  assert.equal(parseSugarInput('25.6'), 26);
  assert.equal(parseSugarInput(-5), 0);
  assert.equal(parseSugarInput(9999), 300);
});

const settings = { ...DEFAULT_SETTINGS, dailyTargetKcal: 1900 };
const log = { date: '2026-09-01', meals: [], burns: [], foodLogComplete: false };
const trend = { today: 80, weeklyRate: null, direction: 'flat', avg7: 80, avg14: 80, change: 0 };
function coach(sugarWeek) {
  return buildAdaptiveCoach({
    log, summary: summarizeDay(log, 1900), weeklyBudget: computeWeeklyBudget([log], 1900), weightTrend: trend,
    proteinToday: 120, settings, habits: buildHabitStrategy([log], settings), moment: 'neutral', sugarWeek,
    now: new Date('2026-09-01T06:00:00Z'),
  });
}

test('the sugar tip needs enough days, a real average above the reference, and stays non-judgmental', () => {
  const ids = (week) => coach(week).recommendations.map((item) => item.id);
  assert.ok(!ids(undefined).includes('sugar'));
  assert.ok(!ids({ avgG: null, daysWithData: 0, daysOver: 0 }).includes('sugar'));
  assert.ok(!ids({ avgG: 80, daysWithData: 2, daysOver: 2 }).includes('sugar'), 'two days is too little');
  assert.ok(!ids({ avgG: SUGAR_REFERENCE_G, daysWithData: 5, daysOver: 0 }).includes('sugar'), 'at the reference is fine');
  const tip = coach({ avgG: 70, daysWithData: 4, daysOver: 3 }).recommendations.find((item) => item.id === 'sugar');
  assert.ok(tip);
  assert.ok(tip.evidence.includes('70 g'));
  assert.ok(/bukan larangan/i.test(tip.detail));
});
