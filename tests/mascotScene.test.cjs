const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { resolveMascotScene, buildMascotScenes } = require('../lib/mascotScene');
const { SUGAR_REFERENCE_G } = require('../lib/sugar');

const emptySugar = { grams: 0, knownMeals: 0, totalMeals: 0, complete: false };
const base = {
  localHour: 12,
  mealCount: 0,
  caloriesIn: 0,
  calorieTarget: 1850,
  proteinToday: 0,
  proteinTarget: 135,
  sugar: emptySugar,
  foodLogComplete: false,
};
const scene = (changes = {}) => resolveMascotScene({ ...base, ...changes });

test('night sleep uses the viewer hour and remains visible when the daily log is empty', () => {
  for (const localHour of [0, 0.25, 4.99, 22, 23.99]) {
    assert.equal(scene({ localHour }).mood, 'neutral');
  }
  for (const [localHour, mood] of [[5, 'exercise'], [12, 'work'], [21.99, 'happy']]) {
    assert.equal(scene({ localHour }).mood, mood);
  }
});

test('night rest has priority over nutrition reminders and a completed log', () => {
  assert.equal(scene({
    localHour: 23, mealCount: 3, caloriesIn: 1850, proteinToday: 20,
    sugar: { grams: 80, knownMeals: 3, totalMeals: 3, complete: true },
    foodLogComplete: true,
  }).mood, 'neutral');
});

test('an empty day never becomes a protein warning or celebration', () => {
  for (const [localHour, mood] of [[6, 'exercise'], [12, 'work'], [16, 'work'], [21, 'happy']]) {
    assert.equal(scene({ localHour, foodLogComplete: true }).mood, mood);
  }
});

test('one meal and an early unfinished log stay welcoming', () => {
  assert.equal(scene({ mealCount: 1, caloriesIn: 1500 }).mood, 'work');
  assert.equal(scene({ mealCount: 2, caloriesIn: 700 }).mood, 'work');
});

test('a substantial protein gap can prompt a snack after two meals and 60% recorded intake', () => {
  assert.equal(scene({ mealCount: 2, caloriesIn: 1110, proteinToday: 80 }).mood, 'protein');
  assert.equal(scene({ mealCount: 2, caloriesIn: 1109, proteinToday: 80 }).mood, 'work');
});

test('late afternoon or a closed log supplies context after at least two meals', () => {
  assert.equal(scene({ localHour: 16, mealCount: 2, caloriesIn: 700, proteinToday: 60 }).mood, 'protein');
  assert.equal(scene({ localHour: 15.99, mealCount: 2, caloriesIn: 700, proteinToday: 60 }).mood, 'work');
  assert.equal(scene({ mealCount: 2, caloriesIn: 700, proteinToday: 60, foodLogComplete: true }).mood, 'protein');
});

test('the protein reminder needs both a 25 g gap and a quarter of the target', () => {
  const context = { mealCount: 2, caloriesIn: 1200, proteinTarget: 100 };
  assert.equal(scene({ ...context, proteinToday: 75 }).mood, 'protein');
  assert.equal(scene({ ...context, proteinToday: 76 }).mood, 'work');
  assert.equal(scene({ ...context, proteinTarget: 200, proteinToday: 160 }).mood, 'work');
  assert.equal(scene({ ...context, proteinTarget: 200, proteinToday: 150 }).mood, 'protein');
});

test('met protein targets and invalid nutrition values do not trigger a protein scene', () => {
  const context = { mealCount: 3, caloriesIn: 1850 };
  for (const changes of [
    { proteinToday: 135 }, { proteinToday: 160 }, { proteinTarget: 0 },
    { proteinTarget: NaN }, { proteinToday: NaN }, { proteinToday: -1 },
  ]) assert.equal(scene({ ...context, ...changes }).mood, 'work');
});

test('unknown added sugar is not treated as zero or a high intake', () => {
  assert.equal(scene({ mealCount: 2, proteinToday: 135, sugar: { ...emptySugar, totalMeals: 2 } }).mood, 'work');
  assert.equal(scene({ mealCount: 2, proteinToday: 135, sugar: { ...emptySugar, grams: 80, totalMeals: 2 } }).mood, 'work');
});

test('a known sugar subtotal above the reference can show the ice cream scene even with incomplete data', () => {
  const result = scene({ mealCount: 2, sugar: { grams: 65, knownMeals: 1, totalMeals: 2, complete: false } });
  assert.equal(result.mood, 'sugar');
  assert.match(result.badge, /65 g/);
  assert.match(result.caption, /dari catatan hari ini/);
});

test('the sugar reference boundary is inclusive and does not trigger a reminder', () => {
  assert.equal(scene({ mealCount: 1, sugar: { grams: SUGAR_REFERENCE_G, knownMeals: 1, totalMeals: 1, complete: true } }).mood, 'work');
  assert.equal(scene({ mealCount: 1, sugar: { grams: SUGAR_REFERENCE_G + 1, knownMeals: 1, totalMeals: 1, complete: true } }).mood, 'sugar');
});

test('known high sugar takes precedence over protein and completion', () => {
  assert.equal(scene({
    mealCount: 3, caloriesIn: 1850, foodLogComplete: true,
    sugar: { grams: 65, knownMeals: 3, totalMeals: 3, complete: true },
  }).mood, 'sugar');
});

test('a completed recorded day can celebrate when no nutrition reminder applies', () => {
  const result = scene({ mealCount: 3, caloriesIn: 1850, proteinToday: 135, foodLogComplete: true });
  assert.equal(result.mood, 'cheer');
  assert.match(result.badge, /lengkap/);
});

test('an invalid local hour never invents a night or late-afternoon context', () => {
  for (const localHour of [NaN, Infinity, -1, 24]) {
    assert.equal(scene({ localHour, mealCount: 2, caloriesIn: 500 }).mood, 'happy');
  }
});

test('the mascot follows its local morning, workday, and rest routine at exact boundaries', () => {
  for (const [localHour, mood] of [
    [4.99, 'neutral'], [5, 'exercise'], [6.99, 'exercise'],
    [7, 'hustle'], [8.99, 'hustle'], [9, 'work'], [16.99, 'work'],
    [17, 'happy'], [21.99, 'happy'], [22, 'neutral'],
  ]) assert.equal(scene({ localHour }).mood, mood, `hour ${localHour}`);
  assert.equal(scene({ localHour: 17 }).badge, 'Kukang santai sore');
  assert.equal(scene({ localHour: 19 }).badge, 'Kukang santai malam');
});

test('food context and completion can replace the daytime routine', () => {
  for (const localHour of [5, 7, 9, 17]) {
    const context = { localHour, mealCount: 3, caloriesIn: 1850 };
    assert.equal(scene({ ...context }).mood, 'protein');
    assert.equal(scene({ ...context, proteinToday: 135, foodLogComplete: true }).mood, 'cheer');
    assert.equal(scene({
      ...context,
      sugar: { grams: 65, knownMeals: 1, totalMeals: 3, complete: false },
      foodLogComplete: true,
    }).mood, 'sugar');
  }
});

test('a sequence lets nutrition reminders give way to ordinary poses', () => {
  const input = {
    ...base, localHour: 12, mealCount: 3, caloriesIn: 1850,
    sugar: { grams: 65, knownMeals: 1, totalMeals: 3, complete: false },
  };
  const scenes = buildMascotScenes(input);
  assert.equal(scenes[0].mood, 'sugar');
  assert.ok(scenes.slice(1).some(({ mood }) => mood === 'work'));
  assert.ok(scenes.slice(1).some(({ mood }) => mood === 'thinking'));
  assert.ok(!scenes.slice(1).some(({ mood }) => mood === 'protein'), 'avoid stacking reminders');
});

test('night variation stays restful even if the food log could trigger a reminder', () => {
  for (const localHour of [0, 4.99, 22, 23.99]) {
    const scenes = buildMascotScenes({
      ...base, localHour, mealCount: 3, caloriesIn: 1850, foodLogComplete: true,
      sugar: { grams: 90, knownMeals: 3, totalMeals: 3, complete: true },
    });
    assert.equal(scenes[0].mood, 'neutral');
    assert.ok(scenes.some(({ mood }) => mood === 'full'));
    assert.ok(scenes.every(({ mood }) => ['neutral', 'full'].includes(mood)));
  }
});

test('routine sequences offer varied existing poses without labeling an empty day', () => {
  const seen = new Set();
  for (const localHour of [5, 7, 9, 12, 17, 20]) {
    const scenes = buildMascotScenes({ ...base, localHour });
    assert.ok(scenes.length >= 2, `a single pose would stay rigid at ${localHour}`);
    for (const scene of scenes) {
      seen.add(scene.mood);
      assert.ok(scene.badge.length > 0 && scene.caption.length > 0);
      assert.ok(!['protein', 'sugar', 'worried', 'cheer'].includes(scene.mood));
    }
  }
  for (const mood of ['happy', 'thinking', 'dance', 'full', 'exercise', 'hustle', 'work']) {
    assert.ok(seen.has(mood), `${mood} should have a place in the routine`);
  }
});

test('a completed log celebrates briefly before returning to its normal routine', () => {
  const scenes = buildMascotScenes({ ...base, localHour: 7, mealCount: 3, proteinToday: 135, foodLogComplete: true });
  assert.equal(scenes[0].mood, 'cheer');
  assert.ok(scenes.slice(1).some(({ mood }) => mood === 'hustle'));
  assert.ok(scenes.slice(1).some(({ mood }) => mood === 'thinking'));
});

test('the lunchtime rest option is a pause, not an assertion about eating', () => {
  for (const localHour of [12, 13.99]) {
    const rest = buildMascotScenes({ ...base, localHour }).find(({ mood }) => mood === 'full');
    assert.ok(rest);
    assert.match(rest.caption, /jeda/);
    assert.doesNotMatch(rest.caption, /kenyang|sudah makan/i);
  }
  assert.ok(!buildMascotScenes({ ...base, localHour: 14 }).some(({ mood }) => mood === 'full'));
});

test('scene lists are deterministic, do not mutate inputs, and contain one entry per mood', () => {
  const input = { ...base, localHour: 18, mealCount: 3, caloriesIn: 1500 };
  const before = JSON.stringify(input);
  const first = buildMascotScenes(input);
  assert.deepEqual(buildMascotScenes(input), first);
  assert.equal(JSON.stringify(input), before);
  assert.equal(new Set(first.map(({ mood }) => mood)).size, first.length);
  assert.equal(resolveMascotScene(input).mood, first[0].mood);
});
