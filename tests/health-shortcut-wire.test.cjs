const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { NextRequest } = require('next/server');

// Decode the shipped plist independently of scripts/health-shortcut.py. This
// deliberately does not import the generator, its validator, or its decoder.
// Field types follow Apple's exported Dictionary/HTTP action representation:
// 0 Text, 1 Dictionary, 2 Array, 3 Number, 4 Boolean. In particular a dictionary
// inside an array has TWO WFDictionaryFieldValue envelopes, and a Boolean uses
// WFNumberSubstitutableState with Value 0 or 1.
const parsed = spawnSync(process.env.PYTHON || 'python', ['-c',
  'import json,plistlib,sys; print(json.dumps(plistlib.load(open(sys.argv[1], "rb"))))',
  path.resolve(__dirname, '../public/shortcuts/slothly-health-sync.unsigned.plist'),
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.equal(parsed.status, 0, 'Python 3 plistlib must parse the shipped unsigned Shortcut');
const workflow = JSON.parse(parsed.stdout);
const postActions = workflow.WFWorkflowActions
  .filter((action) => action.WFWorkflowActionIdentifier === 'is.workflow.actions.downloadurl')
  .map((action) => action.WFWorkflowActionParameters)
  .filter((parameters) => parameters.WFHTTPMethod === 'POST');

const endpoint = 'https://slothly.example/api/health-sync';
// Fixed, synthetic credentials. Never read a developer's account configuration.
const token = `slothly.u3.${'x'.repeat(43)}`;
const variables = {
  Endpoint: endpoint,
  Token: token,
  weightKgValue: 90.2,
  weightKgDate: '2026-09-01T18:30:00Z',
  bodyFatPercentValue: 30.3,
  bodyFatPercentDate: '2026-09-01T06:00:00Z',
};

function decodeText(state) {
  if (typeof state === 'string') return state;
  assert.equal(state?.WFSerializationType, 'WFTextTokenString', 'Text fields must use an exported text-token state');
  const { string, attachmentsByRange = {} } = state.Value;
  assert.equal(typeof string, 'string');
  let result = string;
  const ranges = Object.entries(attachmentsByRange).map(([range, reference]) => {
    const match = /^\{(\d+), 1\}$/.exec(range);
    assert.ok(match, 'A variable must have a one-character UTF-16 attachment range');
    assert.equal(reference.Type, 'Variable', 'HTTP fields must reference a named variable');
    assert.ok(Object.hasOwn(variables, reference.VariableName), 'HTTP variable must have an independent test substitution');
    return { offset: Number(match[1]), value: variables[reference.VariableName] };
  }).sort((a, b) => b.offset - a.offset);
  for (const { offset, value } of ranges) {
    assert.equal(result.slice(offset, offset + 1), '\ufffc', 'Variable attachment must replace its text-token placeholder');
    result = result.slice(0, offset) + String(value) + result.slice(offset + 1);
  }
  assert.ok(!result.includes('\ufffc'), 'Every text attachment must be substituted');
  return result;
}

function decodeNumber(state) {
  const value = typeof state === 'number' ? state :
    state?.WFSerializationType === 'WFNumberSubstitutableState' ? state.Value : decodeText(state);
  assert.ok(typeof value === 'number' || (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)),
    'Number rows must contain a numeric value, not a dictionary or Boolean state');
  const result = Number(value);
  assert.ok(Number.isFinite(result), 'Number rows must produce finite JSON numbers');
  return result;
}

function decodeItem(item) {
  switch (item.WFItemType) {
    case 0: return decodeText(item.WFValue);
    case 1:
      assert.equal(item.WFValue?.WFSerializationType, 'WFDictionaryFieldValue', 'Nested dictionaries need their outer exported field-value envelope');
      return decodeDictionary(item.WFValue.Value);
    case 2:
      assert.equal(item.WFValue?.WFSerializationType, 'WFArrayParameterState');
      assert.ok(Array.isArray(item.WFValue.Value), 'An Array row must contain its typed item list');
      return item.WFValue.Value.map(decodeItem);
    case 3: return decodeNumber(item.WFValue);
    case 4:
      assert.equal(item.WFValue?.WFSerializationType, 'WFNumberSubstitutableState', 'Boolean rows use a numeric substitutable state');
      assert.ok(item.WFValue.Value === 0 || item.WFValue.Value === 1, 'Boolean numeric state must be 0 or 1');
      return item.WFValue.Value === 1;
    default: assert.fail('Unexpected Apple Dictionary item type in the shipped HTTP action');
  }
}

function decodeDictionary(state) {
  assert.equal(state?.WFSerializationType, 'WFDictionaryFieldValue', 'Dictionary must retain its exported serialization state');
  const items = state.Value?.WFDictionaryFieldValueItems;
  assert.ok(Array.isArray(items), 'Dictionary must contain WFDictionaryFieldValueItems at the correct envelope depth');
  const entries = items.map((item) => [decodeText(item.WFKey), decodeItem(item)]);
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, 'Dictionary keys must be unique');
  return Object.fromEntries(entries);
}

const requests = postActions.map((parameters) => ({
  url: decodeText(parameters.WFURL),
  headers: decodeDictionary(parameters.WFHTTPHeaders),
  body: decodeDictionary(parameters.WFJSONValues),
  bodyType: parameters.WFHTTPBodyType,
}));

// Import the actual API implementation with a private, in-memory Redis boundary.
// The requests still traverse credential lookup, input validation, timestamp
// conversion, atomic writes, and health-sync receipt recording in production code.
const store = new Map();
const keys = {
  day: (user, date) => `mk:${user}:day:${date}`,
  settings: (user) => `mk:${user}:settings`,
  body: (user) => `mk:${user}:body`,
  weight: (user) => `mk:${user}:weight`,
  healthConnection: (user) => `mk:${user}:healthConnection`,
  healthSyncStatus: (user) => `mk:${user}:healthSyncStatus`,
};
const redisPath = require.resolve('../lib/redis');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: {
  keys,
  redis: {
    async get(key) { return structuredClone(store.get(key) ?? null); },
    async set(key, value) { store.set(key, structuredClone(value)); return 'OK'; },
    async eval(script, evalKeys, args) {
      for (let index = 0; index < evalKeys.length; index++) {
        if (!isDeepStrictEqual(store.get(evalKeys[index]) ?? null, JSON.parse(args[index]))) return 0;
      }
      for (let index = 0; index < evalKeys.length; index++) {
        store.set(evalKeys[index], JSON.parse(args[evalKeys.length + index]));
      }
      return 1;
    },
  },
} };
const sync = require('../app/api/health-sync/route');

beforeEach(() => {
  store.clear();
  process.env.USER3_INVITE_CODE = 'synthetic-shortcut-wire-invite';
  store.set(keys.healthConnection('u3'), {
    tokenHash: createHash('sha256').update(token).digest('hex'),
    createdAt: '2026-08-01T00:00:00.000Z', revokedAt: null,
  });
  store.set(keys.settings('u3'), { timezone: 'Asia/Jakarta' });
});

async function send(request) {
  assert.equal(request.url, endpoint, 'Shortcut URL must substitute the configured endpoint');
  assert.equal(request.bodyType, 'JSON');
  // Use Boolean assertions so a failure cannot print an Authorization value.
  assert.ok(request.headers.Authorization === `Bearer ${token}`, 'Shortcut must substitute its configured Bearer credential');
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.equal(request.headers.Accept, 'application/json');
  assert.equal(request.body.provider, 'apple_health');
  return sync.POST(new NextRequest(request.url, {
    method: 'POST', headers: request.headers, body: JSON.stringify(request.body),
  }));
}

test('compiled Shortcut connection test sends a true JSON Boolean and only records a successful test', async () => {
  assert.equal(requests.length, 4, 'Shipped Shortcut must contain connection, both-metric, weight-only, and fat-only POSTs');
  const candidates = requests.filter((request) => Object.hasOwn(request.body, 'test'));
  assert.equal(candidates.length, 1);
  const request = candidates[0];
  assert.equal(request.body.test, true, 'Apple Dictionary Boolean must decode to true, not a number or string');
  assert.equal(request.body.samples, undefined);
  const response = await send(request);
  assert.equal(response.status, 200, 'Real API must accept the compiled connection-test payload');
  const body = await response.json();
  assert.equal(body.status, 'tested');
  assert.equal(body.tested, true);
  const state = store.get(keys.healthSyncStatus('u3'));
  assert.ok(state.lastTestAt);
  assert.equal(state.lastSync, null, 'Testing a connection must not claim Health data was received');
  assert.equal(store.has(keys.weight('u3')), false);
  assert.equal(store.has(keys.body('u3')), false);
});

for (const metrics of [['weightKg', 'bodyFatPercent'], ['weightKg'], ['bodyFatPercent']]) {
  test(`compiled Shortcut ${metrics.join(' + ')} payload is accepted with numeric values and independent original dates`, async () => {
    const candidates = requests.filter((request) => Array.isArray(request.body.samples) &&
      isDeepStrictEqual(request.body.samples.map((sample) => sample.metric), metrics));
    assert.equal(candidates.length, 1, 'Each measurement availability branch must have exactly one compiled HTTP request');
    const request = candidates[0];
    assert.equal(request.body.test, undefined);
    for (const sample of request.body.samples) {
      assert.equal(typeof sample.value, 'number', 'Apple Number rows must produce JSON numbers');
      assert.equal(sample.value, variables[`${sample.metric}Value`]);
      assert.equal(sample.measuredAt, variables[`${sample.metric}Date`]);
    }
    const response = await send(request);
    assert.equal(response.status, 200, 'Real API must accept the decoded compiled measurement payload');
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.received, metrics.length);
    assert.equal(body.ignored, 0);
    const weights = store.get(keys.weight('u3'));
    if (metrics.includes('weightKg')) {
      assert.equal(weights.length, 1);
      assert.equal(weights[0].weightKg, 90.2);
      assert.equal(weights[0].date, '2026-09-02', 'Weight uses its original timestamp in the account timezone');
      assert.equal(weights[0].createdAt, '2026-09-01T18:30:00.000Z');
      assert.equal(weights[0].source, 'shortcuts');
    } else assert.equal(weights, undefined);
    const checkIns = store.get(keys.body('u3'));
    if (metrics.includes('bodyFatPercent')) {
      const fat = checkIns.find((entry) => entry.date === '2026-09-01')?.bodyFatPercent;
      assert.equal(fat?.value, 30.3);
      assert.equal(fat?.recordedAt, '2026-09-01T06:00:00.000Z', 'Body fat retains its own timestamp instead of taking the weight timestamp');
    } else assert.ok(!checkIns?.some((entry) => entry.bodyFatPercent));
    const receipt = store.get(keys.healthSyncStatus('u3')).lastSync;
    assert.equal(receipt.provider, 'apple_health');
    assert.deepEqual(receipt.fields, [...metrics].sort());
    assert.deepEqual(receipt.dates, metrics.length === 2 ? ['2026-09-01', '2026-09-02'] :
      metrics[0] === 'weightKg' ? ['2026-09-02'] : ['2026-09-01']);
    assert.ok([...store.keys()].every((key) => key.startsWith('mk:u3:')), 'Compiled request must write only to its credential owner');
    assert.ok(!JSON.stringify([...store.values()]).includes(token), 'No raw connection credential may be persisted');
  });
}
