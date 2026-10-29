const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { buildHomeHero } = require('../lib/homeHero');
const { buildMascotScenes } = require('../lib/mascotScene');

const base = { localHour: 12, mealCount: 0, foodLogComplete: false, firstRun: false };
const hero = (changes = {}) => buildHomeHero({ ...base, ...changes });

test('a completed log is acknowledged at any hour', () => {
  for (const localHour of [0, 9, 14, 20, 23]) {
    assert.equal(hero({ localHour, mealCount: 3, foodLogComplete: true }).headline, 'Catatanmu sudah lengkap.');
  }
});

test('a first run gets a welcome until the first meal, even late at night', () => {
  for (const localHour of [6, 14, 20, 23]) {
    assert.equal(hero({ localHour, firstRun: true }).headline, 'Yuk, catat makan pertamamu hari ini.');
  }
});

test('a returning user with an empty day is not told the day is already going', () => {
  assert.equal(hero({ localHour: 8 }).headline, 'Yuk, catat makan pertamamu hari ini.');
  assert.equal(hero({ localHour: 14 }).headline, 'Yuk, catat makan pertamamu hari ini.');
  assert.equal(hero({ localHour: 19 }).headline, 'Belum ada catatan hari ini.');
});

test('a partly logged day follows the time of day', () => {
  assert.equal(hero({ localHour: 10, mealCount: 1 }).headline, 'Sudah makan apa saja hari ini?');
  assert.equal(hero({ localHour: 17, mealCount: 1 }).headline, 'Sudah makan apa saja hari ini?');
  assert.equal(hero({ localHour: 18, mealCount: 1 }).headline, 'Ada yang belum dicatat hari ini?');
  assert.equal(hero({ localHour: 21, mealCount: 1 }).headline, 'Ada yang belum dicatat hari ini?');
});

test('the rest window matches the mascot night, with or without meals', () => {
  for (const localHour of [22, 23, 0, 4]) {
    assert.equal(hero({ localHour }).headline, 'Waktunya istirahat.');
    assert.equal(hero({ localHour, mealCount: 2 }).headline, 'Waktunya istirahat.');
    assert.equal(buildMascotScenes({
      localHour, mealCount: 0, caloriesIn: 0, calorieTarget: 1850, proteinToday: 0, proteinTarget: 135,
      sugar: { grams: 0, knownMeals: 0, totalMeals: 0, complete: false }, foodLogComplete: false,
    })[0].mood, 'neutral');
  }
  assert.notEqual(hero({ localHour: 5 }).headline, 'Waktunya istirahat.');
  assert.notEqual(hero({ localHour: 21, mealCount: 1 }).headline, 'Waktunya istirahat.');
});

test('an invalid hour falls back to daytime copy instead of inventing a night', () => {
  for (const localHour of [NaN, Infinity, -1, 24]) {
    assert.equal(hero({ localHour, mealCount: 1 }).headline, 'Sudah makan apa saja hari ini?');
    assert.equal(hero({ localHour }).headline, 'Yuk, catat makan pertamamu hari ini.');
  }
});

test('no hero or scene copy tells the viewer to postpone logging', () => {
  const postpone = /dilanjutkan|saat ada jeda|saat kamu siap|nanti lagi/i;
  for (const localHour of [0, 5, 8, 12, 17, 19, 23]) {
    for (const mealCount of [0, 2]) {
      for (const foodLogComplete of [false, true]) {
        for (const firstRun of [false, true]) {
          const copy = hero({ localHour, mealCount, foodLogComplete, firstRun });
          assert.ok(copy.headline && copy.support);
          assert.doesNotMatch(`${copy.headline} ${copy.support}`, postpone);
        }
      }
      const scenes = buildMascotScenes({
        localHour, mealCount, caloriesIn: 700, calorieTarget: 1850, proteinToday: 40, proteinTarget: 135,
        sugar: { grams: 0, knownMeals: 0, totalMeals: 0, complete: false }, foodLogComplete: false,
      });
      for (const scene of scenes) assert.doesNotMatch(`${scene.badge} ${scene.caption}`, postpone, `${scene.mood} at ${localHour}`);
    }
  }
});
