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

// Two unmodified action rows from an actual Apple-exported Shortcut. The input
// parameter name is action-specific: Split Text and Combine Text use `text`,
// even though Choose from List and many other actions use `WFInput`.
// Source (MIT): https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/golden-shortcuts/xml/51cc4e26d1044893a0c3f2f3630cf2d2.xml
//
// MIT License
// Copyright (c) 2026 Federico Viticci / MacStories
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
const exportedTextActionsXml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><array>
  <dict>
    <key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.text.split</string>
    <key>WFWorkflowActionParameters</key><dict>
      <key>Show-text</key><true/>
      <key>UUID</key><string>E7C4458C-4167-416C-BF22-45C83B3FCA40</string>
      <key>text</key><dict><key>Value</key><dict>
        <key>OutputName</key><string>Text</string>
        <key>OutputUUID</key><string>6E47EB56-D943-4EF3-91DD-D365C159A63A</string>
        <key>Type</key><string>ActionOutput</string>
      </dict><key>WFSerializationType</key><string>WFTextTokenAttachment</string></dict>
    </dict>
  </dict>
  <dict>
    <key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.text.combine</string>
    <key>WFWorkflowActionParameters</key><dict>
      <key>Show-text</key><true/>
      <key>UUID</key><string>B20DF477-4CE2-4DDE-9F33-1F79F41EA3B0</string>
      <key>text</key><dict><key>Value</key><dict>
        <key>Type</key><string>Variable</string>
        <key>VariableName</key><string>Emoji</string>
      </dict><key>WFSerializationType</key><string>WFTextTokenAttachment</string></dict>
    </dict>
  </dict>
</array></plist>`;
const parsedTextFixture = spawnSync(process.env.PYTHON || 'python', ['-c',
  'import json,plistlib,sys; print(json.dumps(plistlib.loads(sys.stdin.buffer.read())))',
], { input: exportedTextActionsXml, encoding: 'utf8', maxBuffer: 1024 * 1024 });
assert.equal(parsedTextFixture.status, 0, 'Python plistlib must parse the independently retained Apple export');
const exportedTextActions = JSON.parse(parsedTextFixture.stdout);
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
  vo2MaxValue: 37.8,
  vo2MaxDate: '2026-08-25T23:45:00-04:00',
  restingHeartRateValue: 63,
  restingHeartRateDate: '2026-09-03T01:10:00+07:00',
};
const metricOrder = ['weightKg', 'bodyFatPercent', 'vo2Max', 'restingHeartRate'];
const expectedReadings = {
  weightKg: { date: '2026-09-02', recordedAt: '2026-09-01T18:30:00.000Z' },
  bodyFatPercent: { date: '2026-09-01', recordedAt: '2026-09-01T06:00:00.000Z' },
  vo2Max: { date: '2026-08-26', recordedAt: '2026-08-26T03:45:00.000Z' },
  restingHeartRate: { date: '2026-09-03', recordedAt: '2026-09-02T18:10:00.000Z' },
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
const writtenKeys = new Set();
const keys = {
  day: (user, date) => `mk:${user}:day:${date}`,
  settings: (user) => `mk:${user}:settings`,
  body: (user) => `mk:${user}:body`,
  weight: (user) => `mk:${user}:weight`,
  healthConnection: (user) => `mk:${user}:healthConnection`,
  healthSyncStatus: (user) => `mk:${user}:healthSyncStatus`,
  fitnessMeasurements: (user) => `mk:${user}:fitnessMeasurements`,
};
const redisPath = require.resolve('../lib/redis');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: {
  keys,
  redis: {
    async get(key) { return structuredClone(store.get(key) ?? null); },
    async set(key, value) { writtenKeys.add(key); store.set(key, structuredClone(value)); return 'OK'; },
    async eval(script, evalKeys, args) {
      for (let index = 0; index < evalKeys.length; index++) {
        if (!isDeepStrictEqual(store.get(evalKeys[index]) ?? null, JSON.parse(args[index]))) return 0;
      }
      for (let index = 0; index < evalKeys.length; index++) {
        writtenKeys.add(evalKeys[index]);
        store.set(evalKeys[index], JSON.parse(args[evalKeys.length + index]));
      }
      return 1;
    },
  },
} };
const sync = require('../app/api/health-sync/route');
const profile = { timezone: 'Asia/Jakarta', heightCm: 172, vo2Max: 41, restingHeartRate: 70, dailyCalorieGoal: 2000 };
const otherFitness = { vo2Max: { value: 48, date: '2026-08-10', recordedAt: '2026-08-10T00:00:00.000Z', source: 'apple_health' } };

beforeEach(() => {
  store.clear();
  writtenKeys.clear();
  process.env.USER3_INVITE_CODE = 'synthetic-shortcut-wire-invite';
  store.set(keys.healthConnection('u3'), {
    tokenHash: createHash('sha256').update(token).digest('hex'),
    createdAt: '2026-08-01T00:00:00.000Z', revokedAt: null,
  });
  store.set(keys.settings('u3'), structuredClone(profile));
  store.set(keys.fitnessMeasurements('u4'), structuredClone(otherFitness));
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

function assertPickerChain(actions) {
  const byId = new Map(actions.map((action, index) => [action.WFWorkflowActionParameters.UUID, { action, index }]));
  function outputSource(state, consumer) {
    assert.equal(state?.WFSerializationType, 'WFTextTokenAttachment', 'Picker inputs must retain the exported text-token attachment envelope');
    assert.equal(state.Value?.Type, 'ActionOutput', 'Each picker step must reference the preceding action output explicitly');
    const source = byId.get(state.Value.OutputUUID);
    assert.ok(source, 'Picker output reference must target an existing action');
    assert.ok(source.index < actions.indexOf(consumer), 'Picker output reference must target a preceding action');
    return source.action;
  }
  const choices = actions.filter((action) => action.WFWorkflowActionIdentifier === 'is.workflow.actions.choosefromlist');
  assert.equal(choices.length, 1);
  const chooseAction = choices[0];
  const choice = chooseAction.WFWorkflowActionParameters;
  assert.equal(choice.WFChooseFromListActionSelectMultiple, true, 'The user must be able to select only the permitted Health types');
  const split = outputSource(choice.WFInput, chooseAction);
  assert.equal(split.WFWorkflowActionIdentifier, 'is.workflow.actions.text.split', 'Choose from List must receive Split Text output, not one multiline item');
  const splitParameters = split.WFWorkflowActionParameters;
  assert.equal(Object.hasOwn(splitParameters, 'WFInput'), false, 'Split Text cannot use the generic WFInput parameter');
  assert.equal(splitParameters.WFTextSeparator, 'New Lines');
  const sourceText = outputSource(splitParameters.text, split);
  assert.equal(sourceText.WFWorkflowActionIdentifier, 'is.workflow.actions.gettext');
  assert.equal(sourceText.WFWorkflowActionParameters.WFTextActionText, 'Berat badan\nLemak tubuh\nVO2 max\nDenyut istirahat', 'Split Text must receive exactly the four metric choices');
  const combinedActions = actions.filter((action) => action.WFWorkflowActionIdentifier === 'is.workflow.actions.text.combine');
  assert.equal(combinedActions.length, 1);
  const combined = combinedActions[0];
  const combinedParameters = combined.WFWorkflowActionParameters;
  assert.equal(Object.hasOwn(combinedParameters, 'WFInput'), false, 'Combine Text cannot use the generic WFInput parameter');
  assert.equal(combinedParameters.WFTextSeparator, 'New Lines');
  assert.equal(outputSource(combinedParameters.text, combined), chooseAction, 'Combine Text must receive the selected list, not the original choices or an intervening action');
  return { choice, chooseAction, split, combined };
}

test('actual exported Split Text and Combine Text rows use the text input attachment parameter', () => {
  assert.deepEqual(exportedTextActions.map((action) => action.WFWorkflowActionIdentifier), [
    'is.workflow.actions.text.split', 'is.workflow.actions.text.combine',
  ]);
  for (const action of exportedTextActions) {
    const parameters = action.WFWorkflowActionParameters;
    assert.equal(parameters.text.WFSerializationType, 'WFTextTokenAttachment');
    assert.equal(Object.hasOwn(parameters, 'WFInput'), false, 'The fixture must retain the observed input name rather than a generator assumption');
  }
  assert.equal(exportedTextActions[0].WFWorkflowActionParameters.text.Value.OutputUUID, '6E47EB56-D943-4EF3-91DD-D365C159A63A');
  assert.equal(exportedTextActions[1].WFWorkflowActionParameters.text.Value.VariableName, 'Emoji');
});

test('picker chain rejects v3 WFInput-only text actions and disconnected action output references', () => {
  assertPickerChain(workflow.WFWorkflowActions);
  for (const identifier of ['is.workflow.actions.text.split', 'is.workflow.actions.text.combine']) {
    const regressed = structuredClone(workflow.WFWorkflowActions);
    const parameters = regressed.find((action) => action.WFWorkflowActionIdentifier === identifier).WFWorkflowActionParameters;
    parameters.WFInput = parameters.text;
    delete parameters.text;
    assert.throws(() => assertPickerChain(regressed), /cannot use the generic WFInput/, 'The previous v3 input-field bug must fail independently of the Python simulator');
  }
  for (const identifier of ['is.workflow.actions.choosefromlist', 'is.workflow.actions.text.combine']) {
    const disconnected = structuredClone(workflow.WFWorkflowActions);
    const { split } = assertPickerChain(disconnected);
    const wrongSource = split.WFWorkflowActionParameters.text;
    const parameters = disconnected.find((action) => action.WFWorkflowActionIdentifier === identifier).WFWorkflowActionParameters;
    parameters[identifier.endsWith('choosefromlist') ? 'WFInput' : 'text'] = structuredClone(wrongSource);
    assert.throws(() => assertPickerChain(disconnected), /must receive/, 'A syntactically valid attachment must still point to the correct picker step');
  }
});

test('weight query uses the exported Weight picker type without a date filter', () => {
  // Observed Type row, not the SDK-derived Body Mass label guess:
  // https://github.com/suliveevil/My-Siri-Shortcuts/blob/352a5007e518835fb285acd18a70198dc1cff4f3/assets/backup/%E8%BA%AB%E4%BD%93%E6%8C%87%E6%95%B0%E8%AE%A1%E7%AE%97%E5%99%A8.txt
  // Source action UUID FDBE497C-0493-4D21-85A0-5AFFA621CF9B.
  const queries = workflow.WFWorkflowActions.filter((action) => action.WFWorkflowActionIdentifier === 'is.workflow.actions.filter.health.quantity');
  const weight = queries.filter((action) => action.WFWorkflowActionParameters.WFContentItemFilter.Value.WFActionParameterFilterTemplates.some((row) => row.Property === 'Type' && row.Values.Enumeration.Value === 'Weight'));
  assert.equal(weight.length, 1, 'Weight must use its observed picker label, not the guessed Body Mass label');
  const parameters = weight[0].WFWorkflowActionParameters;
  const rows = parameters.WFContentItemFilter.Value.WFActionParameterFilterTemplates;
  assert.equal(rows.length, 1, 'A date filter must not hide an older available weight sample');
  assert.equal(rows[0].Bounded, true);
  assert.equal(rows[0].Removable, false);
  assert.equal(rows[0].Operator, 4);
  assert.equal(rows[0].Values.Enumeration.WFSerializationType, 'WFStringSubstitutableState');
  assert.equal(parameters.WFContentItemSortProperty, 'Start Date');
  assert.equal(parameters.WFContentItemSortOrder, 'Latest First');
  assert.equal(parameters.WFContentItemLimitEnabled, true);
  assert.equal(parameters.WFContentItemLimitNumber, 1);
});

test('shipped Shortcut asks for optional types before reading Health and guards every query by its own selection', () => {
  const actions = workflow.WFWorkflowActions;
  const byId = new Map(actions.map((action) => [action.WFWorkflowActionParameters.UUID, action]));
  const { chooseAction, combined } = assertPickerChain(actions);
  const healthLabels = {
    'Weight': 'Berat badan',
    'Body Fat Percentage': 'Lemak tubuh',
    'Cardio Fitness': 'VO2 max',
    'Resting Heart Rate': 'Denyut istirahat',
  };
  const guards = [];
  const found = [];
  for (const action of actions) {
    const parameters = action.WFWorkflowActionParameters;
    if (action.WFWorkflowActionIdentifier === 'is.workflow.actions.conditional') {
      if (parameters.WFControlFlowMode === 0) guards.push({ ...parameters, positiveBranch: true });
      else if (parameters.WFControlFlowMode === 1) guards.at(-1).positiveBranch = false;
      else if (parameters.WFControlFlowMode === 2) guards.pop();
    }
    if (action.WFWorkflowActionIdentifier !== 'is.workflow.actions.filter.health.quantity') continue;
    assert.ok(actions.indexOf(chooseAction) < actions.indexOf(action), 'Selection must precede every Health query');
    const type = parameters.WFContentItemFilter.Value.WFActionParameterFilterTemplates[0].Values.Enumeration.Value;
    assert.ok(Object.hasOwn(healthLabels, type), 'Only supported, explicitly named Health types may be queried');
    found.push(type);
    assert.ok(guards.some((guard) => {
      if (!guard.positiveBranch || guard.WFCondition !== 100) return false;
      const input = guard.WFInput?.Variable?.Value;
      const match = input?.Type === 'ActionOutput' ? byId.get(input.OutputUUID) : undefined;
      if (match?.WFWorkflowActionIdentifier !== 'is.workflow.actions.text.match') return false;
      const matchParameters = match.WFWorkflowActionParameters;
      if (matchParameters.WFMatchTextPattern !== `(?m)^${healthLabels[type]}$`) return false;
      const references = Object.values(matchParameters.text?.Value?.attachmentsByRange ?? {});
      return references.length === 1 && references[0].Type === 'ActionOutput' &&
        references[0].OutputUUID === combined.WFWorkflowActionParameters.UUID;
    }), 'A skipped or denied Health type must not be queried by an unguarded action');
  }
  assert.deepEqual(found.sort(), Object.keys(healthLabels).sort(), 'Each supported Health type must have exactly one guarded query');
});

test('compiled Shortcut connection test sends a true JSON Boolean and only records a successful test', async () => {
  assert.equal(requests.length, 16, 'Shipped Shortcut must contain a connection test and every nonempty subset of the four optional metrics');
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
  assert.equal(store.has(keys.fitnessMeasurements('u3')), false);
  assert.deepEqual(store.get(keys.settings('u3')), profile);
});

// Exercise every shipped typed HTTP branch. A denied or unavailable optional
// Health type must not force an empty placeholder or a made-up metric value.
for (let mask = 1; mask < 16; mask++) {
  const metrics = metricOrder.filter((metric, index) => mask & (1 << index));
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
    const fitness = store.get(keys.fitnessMeasurements('u3'));
    for (const metric of ['vo2Max', 'restingHeartRate']) {
      if (metrics.includes(metric)) {
        assert.deepEqual(fitness?.[metric], {
          value: variables[`${metric}Value`],
          ...expectedReadings[metric],
          source: 'apple_health',
        }, `${metric} must keep its own original observation and explicit source`);
      } else assert.equal(fitness?.[metric], undefined, 'An omitted Health type must not become a fabricated reading');
    }
    assert.deepEqual(store.get(keys.settings('u3')), profile, 'Importing fitness observations must preserve the manual profile and its fallback metrics');
    const receipt = store.get(keys.healthSyncStatus('u3')).lastSync;
    assert.equal(receipt.provider, 'apple_health');
    assert.deepEqual(receipt.fields, [...metrics].sort());
    assert.deepEqual(receipt.dates, [...new Set(metrics.map((metric) => expectedReadings[metric].date))].sort());
    assert.deepEqual(store.get(keys.fitnessMeasurements('u4')), otherFitness, 'An independent account must retain its existing observations');
    assert.ok([...writtenKeys].every((key) => key.startsWith('mk:u3:')), 'Compiled request must write only to its credential owner');
    assert.ok(!JSON.stringify([...store.values()]).includes(token), 'No raw connection credential may be persisted');
  });
}
