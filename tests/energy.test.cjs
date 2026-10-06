const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeDay, foodLogStatus, computeWeeklyBudget } = require('../lib/energy');
const { DEFAULT_SETTINGS } = require('../lib/types');
const { computeWeeklyReview } = require('../lib/weeklyReview');
const { computeHealthScore } = require('../lib/healthScore');
const { buildDailyCoach } = require('../lib/dailyCoach');
const { buildAdaptiveCoach } = require('../lib/adaptiveCoach');
const { buildHabitStrategy } = require('../lib/habits');

const settings = { ...DEFAULT_SETTINGS, dailyTargetKcal: 1900 };
const trend = { today: null, weeklyRate: null, direction: 'stable' };
function day(date, calories, complete, burn = 0) {
  return { date, foodLogComplete: complete, plan: 'deficit',
    meals: calories === undefined ? [] : [{ id: date, time: `${date}T05:00:00Z`, foodName: 'Nasi ayam', calories, protein_g: 120, carbs_g: 0, fat_g: 0, source: 'manual' }],
    burns: burn ? [{ id: 'activity', calories: burn, source: 'shortcuts' }] : [] };
}

test('activity cannot turn an intake surplus into available food budget', () => {
  const log = day('2026-09-01', 2200, true, 400);
  const summary = summarizeDay(log, 1900);
  assert.equal(summary.net, 1800); // informational, never the budget
  assert.equal(summary.remaining, -300);
  assert.equal(summary.onTrack, false);
  assert.equal(summarizeDay({ ...log, burns: [] }, 1900).remaining, summary.remaining);
});

test('legacy meals are partial, missing days are empty, explicit zero remains distinguishable', () => {
  assert.equal(foodLogStatus(day('2026-09-01', 1800)), 'partial');
  assert.equal(foodLogStatus(day('2026-09-02')), 'empty');
  assert.equal(foodLogStatus(day('2026-09-03', undefined, true)), 'complete');
  assert.equal(summarizeDay(day('2026-09-03', undefined, true), 1900).onTrack, false);
  assert.equal(summarizeDay(day('2026-09-04', 1800, false), 1900).onTrack, false);
});

test('weekly budget uses intake and explicitly reports incomplete coverage', () => {
  const logs = [day('2026-09-01', 2200, true, 800), day('2026-09-02', 500), day('2026-09-03')];
  const budget = computeWeeklyBudget(logs, 1900);
  assert.equal(budget.consumed, 2700);
  assert.equal(budget.remaining, 3000);
  assert.equal(budget.completedDays, 1);
  assert.equal(budget.isComplete, false);
  assert.equal(computeWeeklyBudget([], 1900).isComplete, false);
  assert.equal(computeWeeklyBudget([day('2026-09-01', 1800, true)], 1900).isComplete, true);
});

test('weekly averages exclude partial and missing days; no observations returns null', () => {
  const review = computeWeeklyReview([day('2026-09-01', 1800, true), day('2026-09-02', 300), day('2026-09-03')], [], settings, trend);
  assert.equal(review.avgCalories, 1800);
  assert.equal(review.completedDays, 1);
  assert.equal(review.totalDays, 3);
  assert.equal(review.successRate, 100);
  assert.ok(!review.recommendationFlags.includes('great-week'));
  const empty = computeWeeklyReview([day('2026-09-03')], [], settings, trend);
  assert.equal(empty.avgCalories, null);
  assert.equal(empty.avgProtein, null);
  assert.equal(empty.successRate, null);
});

test('explicit low intake is not rewarded as the best day or misclassified as over-budget', () => {
  const logs = [day('2026-09-01', 300, true), day('2026-09-02', 1850, true)];
  const review = computeWeeklyReview(logs, [], settings, trend);
  assert.equal(review.bestDay.date, '2026-09-02');
  assert.ok(review.recommendationFlags.includes('low-intake'));
  assert.ok(!review.recommendationFlags.includes('over-budget'));
  function score(log) {
    return computeHealthScore({ summary: summarizeDay(log, 1900), proteinG: 120, proteinTargetG: 120, weightTrend: trend, last7Logs: [log] });
  }
  assert.ok(score(logs[0]).calories < score(logs[1]).calories);
  assert.equal(score(day('2026-09-03')).calories, 0);
  assert.equal(score(day('2026-09-03', 1850, false)).calories, 0);
});

test('both coaches see an intake surplus despite wearable activity', () => {
  const log = day('2026-09-01', 2400, true, 1000);
  const input = { log, summary: summarizeDay(log, 1900), weeklyBudget: computeWeeklyBudget([log], 1900), weightTrend: trend, proteinToday: 120, settings };
  assert.equal(buildDailyCoach(input).status, 'recover');
  const result = buildAdaptiveCoach({ ...input, habits: buildHabitStrategy([log], settings), moment: 'neutral', now: new Date('2026-09-01T06:00:00Z') });
  assert.equal(result.status, 'recover');
  assert.ok(result.recommendations.some((item) => item.id === 'recovery'));
  assert.equal(buildDailyCoach({ ...input, weeklyBudget: computeWeeklyBudget([day('2026-09-01', 1800)], 1900), log: day('2026-09-01', 1800), summary: summarizeDay(day('2026-09-01', 1800), 1900) }).status, 'watch');
});

test('habit target insights use complete intake days, not net burn or partial meals', () => {
  const logs = Array.from({ length: 12 }, (_, index) => day(`2026-09-${String(index + 1).padStart(2, '0')}`, 2200, true, 1000));
  const insight = buildHabitStrategy(logs, settings).insights.find((item) => item.id === 'on-track-rate');
  assert.ok(insight);
  assert.ok(insight.title.startsWith('0%'));
  const partial = buildHabitStrategy(logs.map((log) => ({ ...log, foodLogComplete: false })), settings);
  assert.ok(!partial.insights.some((item) => item.id === 'on-track-rate'));
});


test('coaches flag confirmed low intake rather than recommending maintenance of a large deficit', () => {
  const log = day('2026-09-01', 300, true, 400);
  const input = { log, summary: summarizeDay(log, 1900), weeklyBudget: computeWeeklyBudget([log], 1900), weightTrend: trend, proteinToday: 120, settings };
  assert.ok(buildDailyCoach(input).recommendations.some((item) => item.id === 'check-intake'));
  const adaptive = buildAdaptiveCoach({ ...input, habits: buildHabitStrategy([log], settings), moment: 'neutral', now: new Date('2026-09-01T06:00:00Z') });
  assert.ok(adaptive.recommendations.some((item) => item.id === 'check-intake'));
  assert.ok(!adaptive.recommendations.some((item) => item.id === 'maintain'));
});
