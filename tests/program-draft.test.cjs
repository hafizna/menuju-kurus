const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS } = require('../lib/types');
const { programDraftError } = require('../lib/programDraft');
const { computeProgramRecommendation } = require('../lib/programCalories');

test('profile preview rejects values the server would clamp before applying', () => {
  const profile = { ...DEFAULT_SETTINGS, age: 30, biologicalSex: 'male', heightCm: 170, activityLevel: 'light' };
  assert.equal(programDraftError(profile), null);
  assert.equal(computeProgramRecommendation(profile).complete, true);
  for (const change of [{ heightCm: 300 }, { age: 17 }, { age: 30.5 }, { weightKg: NaN }, { goalWeightKg: 0 }, { timezone: 'Invalid/Zone' }]) {
    assert.equal(typeof programDraftError({ ...profile, ...change }), 'string');
  }
  assert.equal(programDraftError({ ...profile, heightCm: 230 }), null);
  assert.equal(programDraftError({ ...profile, heightCm: 120, age: 100 }), null);
});

test('incomplete optional profile remains saveable but cannot produce a recommendation', () => {
  assert.equal(programDraftError(DEFAULT_SETTINGS), null);
  assert.equal(computeProgramRecommendation(DEFAULT_SETTINGS).complete, false);
});
