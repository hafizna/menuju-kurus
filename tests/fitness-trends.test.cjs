const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS } = require('../lib/types');
const {
  TREND_POLICY, buildSeriesTrend, buildCompositionTrend, buildFitnessTrends, describeFitnessTrends,
} = require('../lib/fitnessTrends');
const { computeFitnessIntelligence } = require('../lib/fitnessIntelligence');
const { textAiProvider, generateTextJson } = require('../lib/textAi');
const { generateFitnessSummary } = require('../lib/fitnessSummaryAi');
const { generateWeeklySummary, templateWeeklySummary } = require('../lib/weeklySummaryAi');
const { weeklySummaryContext } = require('../lib/weeklySummary');

const TODAY = '2026-10-26';
// 2026-10-13..10-26 is the recent composition window; 09-29..10-12 the baseline.
const RECENT = ['2026-10-14', '2026-10-17', '2026-10-21'];
const BASELINE = ['2026-10-02', '2026-10-06', '2026-10-10'];
const reading = (value) => ({ value, source: 'shortcuts', recordedAt: '2026-10-01T00:00:00Z', heightCm: 170 });
const snapshot = (date, weight, fatKg) => ({
  date, weightKg: reading(weight), bodyFatPercent: reading((fatKg / weight) * 100),
});
const windowOf = (dates, weight, fatKg) => dates.map((date) => snapshot(date, weight, fatKg));
const scenario = (recent) => buildCompositionTrend([...windowOf(BASELINE, 80, 20), ...windowOf(RECENT, recent[0], recent[1])], TODAY);

test('series trends need enough samples in both windows and report the delta only then', () => {
  const policy = TREND_POLICY.restingHeartRate;
  const recent = ['2026-10-22', '2026-10-24', '2026-10-26'].map((date) => ({ date, value: 64 }));
  const baseline = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, '0')}`, value: 58 }));
  const ready = buildSeriesTrend([...baseline, ...recent], TODAY, policy);
  assert.equal(ready.ready, true); assert.equal(ready.delta, 6);
  assert.deepEqual([ready.recent.samples, ready.baseline.samples, ready.stale], [3, 7, false]);
  const thin = buildSeriesTrend([...baseline.slice(0, 2), ...recent], TODAY, policy);
  assert.equal(thin.ready, false); assert.equal(thin.delta, null); assert.match(thin.needs, /ada 2/);
  const empty = buildSeriesTrend(undefined, TODAY, policy);
  assert.deepEqual([empty.latest, empty.ageDays, empty.ready, empty.stale], [null, null, false, false]);
});

test('old readings are marked stale with their age, and future dates or bad values are ignored', () => {
  const trend = buildSeriesTrend([
    { date: '2026-08-01', value: 41 }, { date: '2026-11-30', value: 99 }, { date: '2026-09-01', value: Number.NaN },
  ], TODAY, TREND_POLICY.vo2Max);
  assert.deepEqual(trend.latest, { date: '2026-08-01', value: 41 });
  assert.equal(trend.ageDays, 86); assert.equal(trend.stale, true);
});

test('composition needs paired weight and body-fat days in both windows', () => {
  const weightOnly = BASELINE.map((date) => ({ date, weightKg: reading(80) }));
  const trend = buildCompositionTrend([...weightOnly, ...windowOf(RECENT, 79, 19)], TODAY);
  assert.equal(trend.ready, false); assert.equal(trend.change, null); assert.equal(trend.pattern, null);
  assert.equal(trend.statement, null); assert.match(trend.needs, /ada 3 dan 0/);
  // A day with only one of the two readings never counts as a pair.
  const partial = buildCompositionTrend([...windowOf(BASELINE, 80, 20), ...windowOf(RECENT.slice(0, 2), 79, 19), { date: RECENT[2], weightKg: reading(79) }], TODAY);
  assert.equal(partial.recent.pairs, 2); assert.equal(partial.ready, false);
});

test('composition separates fat mass from fat-free mass and names the pattern', () => {
  const cases = [
    [[79, 18.96], 'fat_loss'],
    [[79, 20.54], 'fat_free_loss_high'],
    [[79, 19.4], 'mixed_loss'],
    [[81, 20.8], 'gain_mostly_fat'],
    [[81, 20.2], 'gain_mostly_fat_free'],
    [[80, 19.5], 'recomposition_signal'],
    [[80.1, 20.1], 'stable'],
  ];
  for (const [recent, pattern] of cases) {
    const trend = scenario(recent);
    assert.equal(trend.ready, true); assert.equal(trend.pattern, pattern, JSON.stringify(recent));
    assert.match(trend.statement, /estimasi timbangan/);
    assert.match(trend.statement, /tren, bukan satu angka/);
  }
  const fat = scenario([79, 18.96]);
  assert.deepEqual(fat.baseline, { pairs: 3, weightKg: 80, bodyFatPercent: 25, fatMassKg: 20, fatFreeMassKg: 60 });
  assert.equal(fat.change.weightKg, -1); assert.equal(fat.change.fatMassKg, -1.04);
  assert.equal(fat.confidence, 'low');
});

test('composition confidence rises only with more paired days in both windows', () => {
  const more = ['2026-10-13', '2026-10-15', '2026-10-17', '2026-10-19', '2026-10-21'];
  const base = ['2026-09-30', '2026-10-02', '2026-10-04', '2026-10-06', '2026-10-08'];
  assert.equal(buildCompositionTrend([...windowOf(base, 80, 20), ...windowOf(more, 79, 19)], TODAY).confidence, 'medium');
  assert.equal(buildCompositionTrend([...windowOf(base, 80, 20), ...windowOf(more.slice(0, 3), 79, 19)], TODAY).confidence, 'low');
});

test('reasoning flags resting heart rate above baseline without a diagnosis, and composition loss in fat-free mass', () => {
  const history = { restingHeartRate: [
    ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, '0')}`, value: 58, recordedAt: '2026-10-01T00:00:00Z' })),
    ...['2026-10-22', '2026-10-24', '2026-10-26'].map((date) => ({ date, value: 65, recordedAt: `${date}T01:00:00Z` })),
  ] };
  const trends = buildFitnessTrends({ snapshots: [...windowOf(BASELINE, 80, 20), ...windowOf(RECENT, 79, 20.54)], history, today: TODAY });
  const { signals, priorities } = describeFitnessTrends(trends, 'weight_loss');
  assert.ok(signals.some((line) => /lebih tinggi 7\.0 bpm/.test(line) && /bukan diagnosis/.test(line)));
  assert.ok(priorities.some((line) => /massa bebas lemak/.test(line)));
  assert.ok(priorities.some((line) => /Detak istirahat lebih tinggi/.test(line)));
  assert.ok(signals.length <= 5);
  // The fat-gain advice is for muscle gain only.
  const gain = buildFitnessTrends({ snapshots: [...windowOf(BASELINE, 80, 20), ...windowOf(RECENT, 81, 20.8)], history: {}, today: TODAY });
  assert.equal(describeFitnessTrends(gain, 'weight_loss').priorities.length, 0);
  assert.equal(describeFitnessTrends(gain, 'muscle_gain').priorities.length, 1);
});

test('stale readings are reported with their age instead of being treated as current', () => {
  const trends = buildFitnessTrends({
    snapshots: [], today: TODAY,
    history: { vo2Max: [{ date: '2026-08-20', value: 39, recordedAt: '2026-08-20T01:00:00Z' }], restingHeartRate: [{ date: '2026-10-01', value: 60, recordedAt: '2026-10-01T01:00:00Z' }] },
  });
  const { signals } = describeFitnessTrends(trends, 'athletic');
  assert.ok(signals.some((line) => /VO₂ max terakhir 39.*67 hari lalu/.test(line)));
  assert.ok(signals.some((line) => /Detak istirahat terakhir 60 bpm tercatat 25 hari lalu/.test(line)));
});

test('fitness intelligence carries trends, puts observed priorities first, and stays unchanged without history', () => {
  const settings = { ...DEFAULT_SETTINGS, fitnessGoal: 'weight_loss' };
  const trend = { weeklyRate: -0.3, direction: 'down', today: null, avg7: null, avg14: null, change: null };
  const plain = computeFitnessIntelligence(settings, trend, []);
  assert.deepEqual([plain.composition, plain.restingHeartRateTrend, plain.vo2MaxTrend, plain.signals], [null, null, null, []]);
  const trends = buildFitnessTrends({ snapshots: [...windowOf(BASELINE, 80, 20), ...windowOf(RECENT, 79, 20.54)], history: {}, today: TODAY });
  const result = computeFitnessIntelligence(settings, trend, [], undefined, {}, trends);
  assert.equal(result.composition.pattern, 'fat_free_loss_high');
  assert.match(result.priorities[0], /massa bebas lemak/);
  assert.equal(result.priorities.length <= 3, true);
  assert.equal(result.signals.length, 1);
  assert.equal(result.score, plain.score, 'Trends explain the data and never change the score');
});

test('text AI prefers free Gemini, falls back to DeepSeek, and has no provider without keys', () => {
  const clear = () => { delete process.env.GEMINI_API_KEY; delete process.env.DEEPSEEK_API_KEY; delete process.env.TEXT_AI_PROVIDER; };
  clear();
  assert.equal(textAiProvider(), null);
  process.env.DEEPSEEK_API_KEY = 'd'; assert.equal(textAiProvider(), 'deepseek');
  process.env.GEMINI_API_KEY = 'g'; assert.equal(textAiProvider(), 'gemini');
  process.env.TEXT_AI_PROVIDER = 'deepseek'; assert.equal(textAiProvider(), 'deepseek');
  process.env.TEXT_AI_PROVIDER = 'gemini'; delete process.env.GEMINI_API_KEY; assert.equal(textAiProvider(), 'deepseek');
  clear();
});

const realFetch = global.fetch;
let calls;
beforeEach(() => {
  delete process.env.GEMINI_API_KEY; delete process.env.DEEPSEEK_API_KEY; delete process.env.TEXT_AI_PROVIDER;
  calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, text: async () => '', json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Ringkasan uji', recommendations: ['Satu', 'Dua', 'Tiga'] }) }] } }] }) };
  };
});
afterEach(() => { global.fetch = realFetch; delete process.env.GEMINI_API_KEY; delete process.env.DEEPSEEK_API_KEY; });

test('summaries use Gemini with a system instruction and response schema when only a Gemini key exists', async () => {
  process.env.GEMINI_API_KEY = 'synthetic-gemini-key';
  const settings = { ...DEFAULT_SETTINGS };
  const trends = buildFitnessTrends({ snapshots: [...windowOf(BASELINE, 80, 20), ...windowOf(RECENT, 79, 20.54)], history: {}, today: TODAY });
  const intelligence = computeFitnessIntelligence(settings, { weeklyRate: -0.3, direction: 'down', today: null, avg7: null, avg14: null, change: null }, [], undefined, {}, trends);
  const result = await generateFitnessSummary(intelligence);
  assert.deepEqual([result.source, result.summary, result.recommendations], ['ai', 'Ringkasan uji', ['Satu', 'Dua', 'Tiga']]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.match(calls[0].body.system_instruction.parts[0].text, /BUKAN otot saja/);
  assert.equal(calls[0].body.generationConfig.responseSchema.required.includes('recommendations'), true);
  const sent = JSON.parse(calls[0].body.contents[0].parts[0].text.replace(/^Data:\n/, ''));
  assert.equal(sent.composition.pattern, 'fat_free_loss_high');
  assert.equal(sent.signals.length, 1);
});

test('no provider key means a free template summary and no network call', async () => {
  const intelligence = computeFitnessIntelligence({ ...DEFAULT_SETTINGS }, { weeklyRate: null, direction: 'unknown', today: null, avg7: null, avg14: null, change: null }, []);
  const result = await generateFitnessSummary(intelligence);
  assert.equal(result.source, 'template'); assert.equal(calls.length, 0);
  await assert.rejects(generateTextJson({ systemPrompt: 's', userContent: 'u', jsonShapeHint: '{}', responseSchema: {}, emptyResponseMessage: 'x' }), /No text AI provider/);
});

test('weekly summary input carries the same observations and the template mentions the first one', async () => {
  const settings = { ...DEFAULT_SETTINGS, dailyTargetKcal: 2000 };
  const trend = { weeklyRate: null, direction: 'unknown', today: null, avg7: null, avg14: null, change: null };
  const logs = [1800, 1900].map((calories, i) => ({ date: `2026-10-2${i}`, foodLogComplete: true, meals: [{ id: String(i), foodName: 'x', calories, protein_g: 100, carbs_g: 1, fat_g: 1, time: '2026-10-20T06:00:00Z', source: 'manual' }], burns: [] }));
  const without = weeklySummaryContext(logs, [], settings, trend);
  const withSignals = weeklySummaryContext(logs, [], settings, trend, ['Detak istirahat naik.']);
  assert.equal('signals' in without.input, false);
  assert.deepEqual(withSignals.input.signals, ['Detak istirahat naik.']);
  assert.notEqual(without.fingerprint, withSignals.fingerprint, 'New observations make a saved summary stale');
  assert.match(templateWeeklySummary(withSignals.input).summary, /Detak istirahat naik\./);
  process.env.GEMINI_API_KEY = 'synthetic-gemini-key';
  const result = await generateWeeklySummary(withSignals.input);
  assert.equal(result.source, 'ai'); assert.equal(calls.length, 1);
  assert.match(calls[0].body.system_instruction.parts[0].text, /signals/);
});
