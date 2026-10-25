const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { normalizeFoodAnalysis, buildFoodPrompt, LOCAL_PORTION_REFERENCE } = require('../lib/gemini');
const { adjustMeal, NO_ADJUST, stapleOf } = require('../lib/mealMath');

const raw = {
  foodName: ' Nasi campur ', portionNote: '1 piring', confidence: 'high', kcalLow: 450, kcalHigh: 750,
  components: [
    { name: 'Nasi putih', role: 'staple', grams: 200, calories: 260, protein_g: 5, carbs_g: 57, fat_g: 1 },
    { name: 'Nasi uduk', role: 'staple', grams: 50, calories: 70, protein_g: 1, carbs_g: 14, fat_g: 1 },
    { name: 'Balado', role: 'oil_sauce', grams: 30, calories: 100, protein_g: 1, carbs_g: 6, fat_g: 8 },
    { name: 'Telur dadar', role: 'other', grams: 60, calories: 120, protein_g: 8, carbs_g: 1, fat_g: 9 },
    { name: 'Hantu', role: 'other', grams: 5, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  ],
};

test('analysis totals equal the components, extra staples are demoted, empty ones dropped', () => {
  const a = normalizeFoodAnalysis(raw);
  assert.equal(a.foodName, 'Nasi campur');
  assert.equal(a.components.length, 4);
  assert.equal(a.components.filter((c) => c.role === 'staple').length, 1);
  assert.equal(a.calories, 260 + 70 + 100 + 120);
  assert.equal(a.protein_g, 15);
  assert.ok(a.kcalLow <= a.calories && a.calories <= a.kcalHigh);
});

test('a missing or contradictory range falls back to a band skewed upward', () => {
  for (const bad of [{ kcalLow: undefined, kcalHigh: undefined }, { kcalLow: 900, kcalHigh: 1000 }, { kcalLow: 0, kcalHigh: 0 }]) {
    const a = normalizeFoodAnalysis({ ...raw, ...bad });
    assert.equal(a.kcalLow, Math.round(a.calories * 0.8));
    assert.equal(a.kcalHigh, Math.round(a.calories * 1.3));
  }
});

test('a response without components still yields a usable single-line meal', () => {
  const a = normalizeFoodAnalysis({ foodName: 'Kopi', calories: 150.4, protein_g: 3, carbs_g: 20, fat_g: 5 });
  assert.equal(a.components.length, 0);
  assert.equal(a.calories, 150);
  assert.equal(adjustMeal(a, NO_ADJUST).calories, 150);
});

test('concrete corrections change only what they refer to', () => {
  const a = normalizeFoodAnalysis(raw);
  const base = adjustMeal(a, NO_ADJUST);
  assert.equal(base.calories, a.calories);
  assert.equal(stapleOf(a).grams, 200);
  // +100 g rice: +130 kcal (the staple is 1.3 kcal/g), nothing else moves.
  assert.equal(adjustMeal(a, { ...NO_ADJUST, stapleDeltaG: 100 }).calories, a.calories + 130);
  assert.equal(adjustMeal(a, { ...NO_ADJUST, stapleDeltaG: -400 }).calories, a.calories - 260);
  // Oil only scales the oil/sauce component.
  assert.equal(adjustMeal(a, { ...NO_ADJUST, oil: 'less' }).calories, a.calories - 50);
  assert.equal(adjustMeal(a, { ...NO_ADJUST, oil: 'more' }).calories, a.calories + 60);
  // Fraction eaten scales everything, including the range.
  const half = adjustMeal(a, { ...NO_ADJUST, eaten: 0.5 });
  assert.equal(half.calories, Math.round(a.calories / 2));
  assert.equal(half.low, Math.round(a.kcalLow / 2));
});

test('the photo prompt carries the local portion references and the output contract', () => {
  const prompt = buildFoodPrompt();
  assert.ok(prompt.includes(LOCAL_PORTION_REFERENCE));
  for (const needle of ['nasi putih 1 centong', 'terong balado', 'oil_sauce', 'kcalLow', 'ONE staple']) {
    assert.ok(prompt.includes(needle), needle + ' missing from prompt');
  }
});
