const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { DEFAULT_SETTINGS } = require('../lib/types');
const { lastNDateKeys } = require('../lib/dates');
const { computeWeeklyReview } = require('../lib/weeklyReview');
const { templateWeeklySummary } = require('../lib/weeklySummaryAi');
const { weeklySummaryContext, weeklySummaryIsStale } = require('../lib/weeklySummary');
const { computeFitnessIntelligence } = require('../lib/fitnessIntelligence');
const { createWeeklyFocus } = require('../lib/weeklyFocus');

const settings = { ...DEFAULT_SETTINGS, dailyTargetKcal: 2000 };
const trend = { weeklyRate: null, direction: 'unknown', today: null, avg7: null, avg14: null, change: null };
function log(date, calories, complete = true) {
  return { date, foodLogComplete: complete, meals: calories === null ? [] : [{ id: date, foodName: 'Contoh', calories, protein_g: 100, carbs_g: 20, fat_g: 20, time: `${date}T06:00:00Z`, source: 'manual' }], burns: [] };
}
test('weekly review counts under, within, over and incomplete days separately', () => {
  const logs = [log('2026-10-20', 1200), log('2026-10-21', 1800), log('2026-10-22', 2200), log('2026-10-23', 200, false), log('2026-10-24', null, false)];
  const review = computeWeeklyReview(logs, [], settings, trend);
  assert.deepEqual([review.belowRangeDays, review.withinRangeDays, review.aboveRangeDays, review.incompleteDays], [1, 1, 1, 2]);
  assert.equal(review.periodStart, '2026-10-20');
  assert.equal(review.periodEnd, '2026-10-24');
  assert.equal(review.avgCalories, 1733);
});
test('low intake and 40 percent summaries never infer majority above target or recommend smaller portions', () => {
  const logs = [1200, 1200, 1200, 1800, 1800].map((calories, index) => log(`2026-10-${20 + index}`, calories));
  const { input } = weeklySummaryContext(logs, [], settings, trend);
  assert.equal(input.successRate, 40);
  const summary = templateWeeklySummary(input);
  assert.match(summary.summary, /3 hari di bawah rentang feedback/);
  assert.match(summary.summary, /40% hari lengkap/);
  assert.doesNotMatch(summary.summary, /separuh lebih|sebagian besar hari di atas/);
  assert.ok(summary.recommendations.some((text) => text.includes('jangan memperbesar defisit')));
  assert.ok(!summary.recommendations.some((text) => text.includes('sering lebih dari target')));
});
test('summary fingerprint tracks edits, target and date rollover, not just rounded averages', () => {
  const logs = [log('2026-10-20', 1800), log('2026-10-21', 1800)];
  const first = weeklySummaryContext(logs, [], settings, trend);
  const stored = { fingerprint: first.fingerprint, periodStart: first.periodStart, periodEnd: first.periodEnd };
  assert.equal(weeklySummaryIsStale(stored, first), false);
  const changed = structuredClone(logs); changed[0].meals[0].calories += 0.1;
  assert.equal(weeklySummaryIsStale(stored, weeklySummaryContext(changed, [], settings, trend)), true);
  changed[0].foodLogComplete = false;
  assert.equal(weeklySummaryIsStale(stored, weeklySummaryContext(changed, [], settings, trend)), true);
  assert.equal(weeklySummaryIsStale(stored, weeklySummaryContext(logs, [], { ...settings, dailyTargetKcal: 2100 }, trend)), true);
  assert.equal(weeklySummaryIsStale(stored, weeklySummaryContext(logs.slice(1), [], settings, trend)), true);
});
test('missing fitness baseline remains null; measurements in both recent windows unlock scoring', () => {
  const empty = computeFitnessIntelligence(settings, trend, []);
  assert.equal(empty.score, null); assert.equal(empty.scoreLabel, 'baseline');
  assert.ok(empty.baselineReasons.length > 0);
  const dates = lastNDateKeys(14, settings.timezone);
  const weights = [dates[1], dates[5], dates[8], dates[12]].map((date, index) => ({ date, weightKg: 70 - index * 0.1 }));
  const ready = computeFitnessIntelligence(settings, { ...trend, weeklyRate: -0.3, direction: 'down' }, weights);
  assert.equal(ready.baselineReady, true); assert.equal(typeof ready.score, 'number');
  assert.equal(computeFitnessIntelligence(settings, { ...trend, weeklyRate: -0.3 }, weights.slice(2)).score, null);
});
test('athletic baseline uses fitness observations rather than requiring weight-loss data', () => {
  const base = { ...settings, fitnessGoal: 'athletic' };
  assert.equal(computeFitnessIntelligence(base, trend, []).score, null);
  assert.equal(computeFitnessIntelligence({ ...base, vo2Max: 40, cardioMinutesWeekly: 90 }, trend, []).baselineReady, true);
});
test('weekly focus dates roll across months', () => {
  assert.deepEqual(createWeeklyFocus('logging', '2026-10-28'), { id: 'logging', selectedOn: '2026-10-28', reviewOn: '2026-11-04', completedOn: null });
});

// Route regressions use real handlers with per-worker synthetic storage.
const store = new Map();
const redisPath = require.resolve('../lib/redis');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: {
  redis: { async get(key) { return structuredClone(store.get(key) ?? null); }, async set(key, value) { store.set(key, structuredClone(value)); return 'OK'; } },
  keys: { settings: (user) => `mk:${user}:settings`, day: (user, date) => `mk:${user}:day:${date}`, weight: (user) => `mk:${user}:weight`, body: (user) => `mk:${user}:body`, weeklySummary: (user) => `mk:${user}:weeklySummary` },
} };
const focusRoute = require('../app/api/weekly-focus/route');
const summaryRoute = require('../app/api/weekly-summary/route');
function request(url, method = 'GET', body, user = 'u1') {
  return new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => { store.clear(); delete process.env.DEEPSEEK_API_KEY; });
test('weekly focus requires auth, validates choices, persists across reads and isolates users', async () => {
  assert.equal((await focusRoute.GET(request('/api/weekly-focus', 'GET', undefined, null))).status, 401);
  assert.equal((await focusRoute.POST(request('/api/weekly-focus', 'POST', { action: 'select', id: 'arbitrary' }))).status, 400);
  const selected = await (await focusRoute.POST(request('/api/weekly-focus', 'POST', { action: 'select', id: 'logging' }))).json();
  assert.equal(selected.focus.id, 'logging');
  assert.equal((await (await focusRoute.GET(request('/api/weekly-focus'))).json()).focus.id, 'logging');
  assert.equal((await (await focusRoute.GET(request('/api/weekly-focus', 'GET', undefined, 'u2'))).json()).focus, null);
  assert.equal((await focusRoute.POST(request('/api/weekly-focus', 'POST', { action: 'complete', id: 'protein' }))).status, 409);
  const completed = await (await focusRoute.POST(request('/api/weekly-focus', 'POST', { action: 'complete', id: 'logging' }))).json();
  assert.equal(completed.focus.completedOn, completed.today);
});
test('stored summaries become stale after food edits and reads never silently regenerate them', async () => {
  const dates = lastNDateKeys(7, settings.timezone);
  store.set('mk:u1:settings', settings);
  store.set(`mk:u1:day:${dates[0]}`, log(dates[0], 1800));
  const generated = await (await summaryRoute.POST(request('/api/weekly-summary', 'POST'))).json();
  assert.equal(generated.summary.source, 'template'); assert.equal(generated.stale, false);
  assert.equal(generated.summary.periodStart, dates[0]); assert.equal(generated.summary.periodEnd, dates[6]);
  store.set(`mk:u1:day:${dates[0]}`, log(dates[0], 1200));
  const read = await (await summaryRoute.GET(request('/api/weekly-summary'))).json();
  assert.equal(read.stale, true);
  assert.equal(read.summary.fingerprint, generated.summary.fingerprint);
  assert.equal((await (await summaryRoute.GET(request('/api/weekly-summary', 'GET', undefined, 'u2'))).json()).summary, null);
  const updated = await (await summaryRoute.POST(request('/api/weekly-summary', 'POST'))).json();
  assert.equal(updated.stale, false); assert.notEqual(updated.summary.fingerprint, generated.summary.fingerprint);
});
test('invalid AI output is rejected and cannot replace a saved summary', async () => {
  const saved = await (await summaryRoute.POST(request('/api/weekly-summary', 'POST'))).json();
  const provider = require('../lib/deepseekClient');
  const original = provider.generateDeepseekJson;
  const originalConsoleError = console.error;
  process.env.DEEPSEEK_API_KEY = 'synthetic-provider-key';
  provider.generateDeepseekJson = async () => ({ summary: '', recommendations: [] });
  console.error = () => {};
  try {
    const response = await summaryRoute.POST(request('/api/weekly-summary', 'POST'));
    assert.equal(response.status, 502);
    const current = await (await summaryRoute.GET(request('/api/weekly-summary'))).json();
    assert.deepEqual(current.summary, saved.summary);
  } finally {
    provider.generateDeepseekJson = original;
    console.error = originalConsoleError;
    delete process.env.DEEPSEEK_API_KEY;
  }
});
