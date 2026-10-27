const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { roundMeasure, formatMeasure } = require('../lib/format');

test('float32 noise from Apple Health is shown with at most two decimals and no trailing zeros', () => {
  assert.equal(formatMeasure(30.70000076293946), '30.7');
  assert.equal(formatMeasure(30.700000762939453), '30.7');
  assert.equal(formatMeasure(90.50000190734863), '90.5');
  assert.equal(formatMeasure(44.20000076293945), '44.2');
  assert.equal(formatMeasure(93), '93');
  assert.equal(formatMeasure(90.526), '90.53');
  assert.equal(formatMeasure(90.524), '90.52');
  assert.equal(formatMeasure(0.1 + 0.2), '0.3');
});

test('rounding is half-up for positive values, keeps negatives symmetric and never prints negative zero', () => {
  assert.equal(roundMeasure(1.005), 1.01);
  assert.equal(formatMeasure(-2.9000001), '-2.9');
  assert.equal(formatMeasure(-0.001), '0');
  assert.equal(formatMeasure(0), '0');
});

test('values that are not finite numbers pass through instead of becoming zero', () => {
  assert.ok(Number.isNaN(roundMeasure(NaN)));
  assert.equal(roundMeasure(Infinity), Infinity);
  assert.equal(formatMeasure(Infinity), 'Infinity');
});

test('the precision can be changed for callers that need it', () => {
  assert.equal(formatMeasure(12.3456, 1), '12.3');
  assert.equal(formatMeasure(12.3456, 3), '12.346');
});
