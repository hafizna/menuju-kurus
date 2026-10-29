const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { recapDay, describeCalories, describeProtein } = require('../lib/dayRecap');
const { summarizeDay } = require('../lib/energy');

const targets = { kcal: 1800, protein: 120 };
const meal = (calories, protein_g, extra = {}) => ({ id: `${calories}-${protein_g}`, time: '2026-09-01T05:00:00Z', foodName: 'Makan', calories, protein_g, carbs_g: 0, fat_g: 0, source: 'photo', ...extra });
const day = (meals, burns = [], foodLogComplete) => ({ date: '2026-09-01', foodLogComplete, meals, burns });

test('a day with no food has empty rings and no verdict', () => {
  const recap = recapDay(day([]), targets);
  assert.equal(recap.kcalState, 'empty');
  assert.equal(recap.proteinState, 'empty');
  assert.equal(recap.kcalFill, 0);
  assert.equal(recap.status, 'empty');
  assert.deepEqual(describeCalories(recap), { headline: 'Belum ada makanan', detail: '' });
  assert.deepEqual(describeProtein(recap), { headline: 'Belum ada makanan', detail: '' });
});

test('calories are placed in the same bands as the weekly review', () => {
  const state = (kcal) => recapDay(day([meal(kcal, 50)]), targets).kcalState;
  assert.equal(state(1000), 'below');
  assert.equal(state(1439), 'below');
  assert.equal(state(1440), 'within', '80% of the target is inside the range');
  assert.equal(state(1800), 'within', 'exactly the target is inside the range');
  assert.equal(state(1801), 'over');
  // Whatever the weekly review calls on-track for a closed day is "within" here.
  for (const kcal of [1300, 1440, 1700, 1800, 1900]) {
    const closed = day([meal(kcal, 50)], [], true);
    assert.equal(summarizeDay(closed, 1800).onTrack, recapDay(closed, targets).kcalState === 'within', `${kcal} kcal`);
  }
});

test('the words say how far from the target, in the app\'s own vocabulary', () => {
  const words = (kcal) => describeCalories(recapDay(day([meal(kcal, 50)]), targets));
  assert.deepEqual(words(1950), { headline: 'Di atas target', detail: 'lebih 150 kcal' });
  assert.deepEqual(words(1500), { headline: 'Dalam rentang', detail: 'sisa 300 kcal' });
  assert.deepEqual(words(1800), { headline: 'Dalam rentang', detail: 'pas dengan target' });
  assert.deepEqual(words(1000), { headline: 'Di bawah rentang', detail: 'kurang 800 kcal dari target' });
  assert.deepEqual(describeCalories(recapDay(day([meal(2900, 50)]), { kcal: 1800, protein: 120 })), { headline: 'Di atas target', detail: 'lebih 1.100 kcal' }, 'thousands use the Indonesian separator');
});

test('going past the target is a second lap over the first, so how far over can be seen', () => {
  const overflow = (kcal) => recapDay(day([meal(kcal, 50)]), targets).kcalOverflow;
  assert.equal(overflow(900), 0);
  assert.equal(overflow(1800), 0, 'reaching the target is not going over it');
  assert.ok(Math.abs(overflow(1950) - 150 / 1800) < 1e-9);
  assert.ok(Math.abs(overflow(2700) - 0.5) < 1e-9);
  assert.equal(overflow(3600), 1, 'one extra lap at most');
  assert.equal(overflow(9000), 1);
  assert.equal(recapDay(day([meal(1950, 50)]), targets).kcalFill, 1, 'the first lap is full when the second begins');
  assert.equal(recapDay(day([]), targets).kcalOverflow, 0);
});

test('protein is summed over the meals and compared with its own target', () => {
  const short = recapDay(day([meal(500, 30), meal(400, 55)]), targets);
  assert.equal(short.proteinG, 85);
  assert.equal(short.proteinState, 'short');
  assert.equal(short.proteinGap, 35);
  assert.deepEqual(describeProtein(short), { headline: 'Belum sampai target', detail: 'kurang 35 g' });
  assert.ok(Math.abs(short.proteinFill - 85 / 120) < 1e-9);

  const met = recapDay(day([meal(900, 70), meal(700, 60)]), targets);
  assert.equal(met.proteinState, 'met');
  assert.deepEqual(describeProtein(met), { headline: 'Target tercapai', detail: 'lebih 10 g' });
  assert.equal(met.proteinFill, 1, 'a ring never draws past full');
  assert.deepEqual(describeProtein(recapDay(day([meal(900, 120)]), targets)), { headline: 'Target tercapai', detail: '' });
});

test('the rings never draw past full and a food day with no protein still counts as short', () => {
  assert.equal(recapDay(day([meal(3000, 0)]), targets).kcalFill, 1);
  const none = recapDay(day([meal(300, 0)]), targets);
  assert.equal(none.proteinState, 'short');
  assert.equal(none.proteinFill, 0);
});

test('activity is reported but never changes the food rings', () => {
  const burn = { id: 'b', time: '2026-09-01T06:00:00Z', calories: 400, label: 'Lari', source: 'manual' };
  const without = recapDay(day([meal(2200, 60)]), targets);
  const withBurn = recapDay(day([meal(2200, 60)], [burn, burn]), targets);
  assert.equal(withBurn.caloriesOut, 800);
  assert.equal(withBurn.activityCount, 2);
  assert.equal(withBurn.kcalState, without.kcalState);
  assert.equal(withBurn.kcalGap, without.kcalGap);
});

test('the day status follows the confirmation, not the amount eaten', () => {
  assert.equal(recapDay(day([meal(900, 50)]), targets).status, 'partial');
  assert.equal(recapDay(day([meal(900, 50)], [], true), targets).status, 'complete');
});

test('hand-written meals without protein are counted so the figure can be flagged', () => {
  const recap = recapDay(day([
    meal(300, 0, { source: 'manual' }),
    meal(200, 12, { source: 'manual' }),
    meal(250, 0, { source: 'manual', breakdown: { described: 'kopi' } }),
    meal(250, 0, { source: 'photo' }),
  ]), targets);
  assert.equal(recap.proteinUnknown, 1, 'only a plain manual meal with no protein is flagged');
});

test('a missing target does not divide by zero', () => {
  const recap = recapDay(day([meal(500, 20)]), { kcal: 0, protein: 0 });
  assert.equal(recap.kcalFill, 0);
  assert.equal(recap.kcalOverflow, 0);
  assert.equal(recap.proteinFill, 0);
  assert.equal(recap.kcalState, 'within');
  assert.equal(recap.proteinState, 'met');
  assert.ok(Number.isFinite(recap.kcalGap));
});
