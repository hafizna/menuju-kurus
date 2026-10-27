const test = require('node:test');
const assert = require('node:assert/strict');
const { LOADER_MOODS, pickLoaderMood } = require('../lib/loaderScene');

test('the waiting screen offers a few different activities', () => {
  assert.deepEqual([...LOADER_MOODS], ['juggle', 'header', 'hustle']);
});

test('the first waiting screen can show any of them', () => {
  assert.equal(pickLoaderMood(null, () => 0), 'juggle');
  assert.equal(pickLoaderMood(null, () => 0.5), 'header');
  assert.equal(pickLoaderMood(null, () => 0.99), 'hustle');
});

test('the next waiting screen never repeats the previous activity', () => {
  for (const previous of LOADER_MOODS) {
    for (const roll of [0, 0.2, 0.34, 0.5, 0.66, 0.99]) {
      const next = pickLoaderMood(previous, () => roll);
      assert.notEqual(next, previous, `roll ${roll} repeated ${previous}`);
      assert.ok(LOADER_MOODS.includes(next));
    }
  }
});

test('every other activity stays reachable', () => {
  for (const previous of LOADER_MOODS) {
    const reachable = new Set([0, 0.99].map((roll) => pickLoaderMood(previous, () => roll)));
    assert.equal(reachable.size, LOADER_MOODS.length - 1, `from ${previous}`);
  }
});

test('a broken random source still gives a valid activity', () => {
  for (const bad of [NaN, Infinity, -1, 2]) {
    assert.ok(LOADER_MOODS.includes(pickLoaderMood('juggle', () => bad)), `random ${bad}`);
  }
});
