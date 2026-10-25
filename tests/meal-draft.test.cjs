const { test } = require('node:test');
const assert = require('node:assert/strict');
const { emptyMealDraft, formatMealTime, mealDraftKey, hasMealDraft, serializeMealDraft, readMealDraft, mealTimeIso, recentMealChoices, priorMealDraft } = require('../lib/mealDraft');
const { adjustMeal } = require('../lib/mealMath');

const analysis = {
  foodName: 'Nasi telur', portionNote: '1 piring', confidence: 'medium',
  calories: 477, protein_g: 17, carbs_g: 59, fat_g: 17, kcalLow: 400, kcalHigh: 600,
  components: [
    { name: 'Nasi', role: 'staple', grams: 200, calories: 261, protein_g: 5, carbs_g: 57, fat_g: 1 },
    { name: 'Telur', role: 'other', grams: 80, calories: 123, protein_g: 12, carbs_g: 2, fat_g: 6 },
    { name: 'Minyak', role: 'oil_sauce', grams: 10, calories: 93, protein_g: 0, carbs_g: 0, fat_g: 10 },
  ],
};
test('history formats legacy wall-clock times, uses account timezone for ISO, and safely handles invalid values', () => {
  assert.equal(formatMealTime('12:00', 'Asia/Jakarta'), '12:00');
  assert.equal(formatMealTime('18:00', 'America/New_York'), '18:00', 'legacy wall-clock time must not shift with timezone');
  assert.match(formatMealTime('2026-10-26T05:00:00Z', 'Asia/Jakarta'), /^12[.:]00$/);
  assert.match(formatMealTime('2026-10-26T05:00:00Z', 'America/New_York'), /^01[.:]00$/);
  for (const value of ['', 'invalid time', '25:99']) assert.equal(formatMealTime(value, 'Asia/Jakarta'), 'Jam belum tersedia');
  assert.equal(formatMealTime('2026-10-26T05:00:00Z', 'invalid/timezone'), 'Jam belum tersedia');
});
test('corrected components and totals agree for rice, oil and eaten fraction together', () => {
  const source = structuredClone(analysis);
  const result = adjustMeal(analysis, { stapleDeltaG: -50, oil: 'less', eaten: 0.75 });
  for (const field of ['calories', 'protein_g', 'carbs_g', 'fat_g']) {
    assert.equal(result[field], result.components.reduce((sum, c) => sum + c[field], 0), field);
  }
  assert.equal(result.components[0].grams, 113);
  assert.equal(result.components[1].grams, 60);
  assert.equal(result.components[2].calories, 35);
  assert.ok(result.low <= result.calories && result.calories <= result.high);
  assert.deepEqual(analysis, source, 'adjusting never mutates the saved analysis');
});

test('draft roundtrip restores analysis, corrections, manual fields, and excludes photos', () => {
  const draft = { ...emptyMealDraft('12:00'), result: analysis, name: 'Nasi + telur',
    adjust: { stapleDeltaG: 50, oil: 'less', eaten: 0.5 }, kcalEdit: '310',
    manualOpen: true, manual: { name: 'Kopi', kcal: '120', protein: '2', time: '11:10' },
    photo: 'data:image/secret', preview: 'blob:private-photo', file: { bytes: 'secret' },
  };
  const serialized = serializeMealDraft(draft);
  const restored = readMealDraft(serialized);
  assert.ok(hasMealDraft(restored));
  assert.deepEqual(restored.result, analysis);
  assert.deepEqual(restored.adjust, draft.adjust);
  assert.deepEqual(restored.manual, draft.manual);
  assert.equal(restored.kcalEdit, '310');
  assert.ok(!serialized.includes('secret') && !serialized.includes('blob:'));
  assert.equal(hasMealDraft(emptyMealDraft('12:00')), false);
});

test('draft storage keys isolate users and calendar dates, malformed storage is ignored', () => {
  assert.notEqual(mealDraftKey('u1', '2026-10-26'), mealDraftKey('u2', '2026-10-26'));
  assert.notEqual(mealDraftKey('u1', '2026-10-26'), mealDraftKey('u1', '2026-10-27'));
  assert.equal(readMealDraft('{bad-json'), null);
  assert.equal(readMealDraft('{}'), null);
  const draft = emptyMealDraft('12:00');
  assert.equal(readMealDraft(JSON.stringify({ ...draft, adjust: { ...draft.adjust, eaten: 4 } })), null);
  assert.equal(readMealDraft(JSON.stringify({ ...draft, result: { ...analysis, components: [{}] } })), null);
});

test('meal times use account timezone, reject future times and never migrate a previous day draft', () => {
  const now = new Date('2026-10-26T06:00:00Z'); // 13:00 in Jakarta
  assert.equal(mealTimeIso('12:30', '2026-10-26', 'Asia/Jakarta', now), '2026-10-26T05:30:00.000Z');
  assert.equal(mealTimeIso('14:00', '2026-10-26', 'Asia/Jakarta', now), null);
  assert.equal(mealTimeIso('12:00', '2026-10-25', 'Asia/Jakarta', now), null);
  assert.equal(mealTimeIso('25:00', '2026-10-26', 'Asia/Jakarta', now), null);
  assert.equal(mealTimeIso('12:90', '2026-10-26', 'Asia/Jakarta', now), null);
  assert.equal(mealTimeIso('12:00', '2026-10-25', 'Asia/Jakarta', now, true), '2026-10-25T05:00:00.000Z');
  assert.equal(mealTimeIso('12:00', '2026-10-27', 'Asia/Jakarta', now, true), null, 'explicit review cannot allow a future day');
  assert.equal(mealTimeIso('12:00', '2026-10-24', 'Asia/Jakarta', now, true), null, 'past saves obey the server 36-hour window');
});

test('prior draft discovery only offers meaningful past drafts for the authenticated user', () => {
  const draft = (name) => serializeMealDraft({ ...emptyMealDraft('12:00'), manualOpen: true, manual: { name, kcal: '300', protein: '', time: '12:00' } });
  const entries = new Map([
    [mealDraftKey('u2', '2026-10-25'), draft('Private other account')],
    [mealDraftKey('u1', '2026-10-24'), draft('Earlier')],
    [mealDraftKey('u1', '2026-10-25'), draft('Latest unsaved')],
    [mealDraftKey('u1', '2026-10-26'), draft('Today')],
    [mealDraftKey('u1', '2026-10-27'), draft('Future')],
  ]);
  const storage = { length: entries.size, key: (i) => [...entries.keys()][i] ?? null, getItem: (key) => entries.get(key) ?? null };
  assert.equal(priorMealDraft(storage, 'u1', '2026-10-26').date, '2026-10-25');
  assert.equal(priorMealDraft(storage, 'u1', '2026-10-26').draft.manual.name, 'Latest unsaved');
  assert.equal(priorMealDraft(storage, 'u3', '2026-10-26'), null);
});

test('three quick choices prefer latest meals and deduplicate habitual names', () => {
  const entry = (id, foodName, time) => ({ id, foodName, time, calories: 300, protein_g: 15, carbs_g: 30, fat_g: 12, source: 'manual' });
  const habit = (name, key) => ({ name, key, count: 3, averageCalories: 400, averageProteinG: 20, averageCarbsG: 40, averageFatG: 12 });
  const choices = recentMealChoices([entry('old', 'Nasi telur', '2026-10-26T03:00:00Z'), entry('new', 'Kopi', '2026-10-26T05:00:00Z')], [habit('  KOPI ', 'dup'), habit('Ayam', 'new'), habit('Tempe', 'fourth')]);
  assert.deepEqual(choices.map((c) => c.name), ['Kopi', 'Nasi telur', 'Ayam']);
  assert.equal(choices[2].detail, 'Rata-rata 3 catatan');
});
