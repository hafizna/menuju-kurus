const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { createHash } = require('node:crypto');

const store = new Map();
let failWrites = false;
let failReads = false;
let beforeEval = null;
const storageFailure = () => new Error('synthetic storage failure: https://redis.invalid upstream-private-detail');
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
    async get(key) { if (failReads) throw storageFailure(); return structuredClone(store.get(key) ?? null); },
    async set(key, value) { if (failWrites) throw storageFailure(); store.set(key, structuredClone(value)); return 'OK'; },
    async eval(script, evalKeys, args) {
      if (failWrites) throw storageFailure();
      if (beforeEval) await beforeEval(evalKeys, args);
      for (let i = 0; i < evalKeys.length; i++) {
        if (!require('node:util').isDeepStrictEqual(store.get(evalKeys[i]) ?? null, JSON.parse(args[i]))) return 0;
      }
      for (let i = 0; i < evalKeys.length; i++) store.set(evalKeys[i], JSON.parse(args[evalKeys.length + i]));
      return 1;
    },
  },
} };
const connection = require('../app/api/health-connection/route');
const sync = require('../app/api/health-sync/route');
const fitness = require('../app/api/fitness-intelligence/route');
const { findHealthSyncUser } = require('../lib/healthConnection');
const { middleware } = require('../middleware');

function request(path, method = 'GET', body, user = 'u3', headers = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const getState = async (user = 'u3') => (await connection.GET(request('/api/health-connection', 'GET', undefined, user))).json();
const issue = async (user = 'u3') => (await connection.POST(request('/api/health-connection', 'POST', {}, user))).json();
const send = (body, token = 'legacy-health-3') => sync.POST(request('/api/health-sync', 'POST', body, null, { authorization: `Bearer ${token}` }));
const sample = (metric, value, measuredAt) => ({ metric, value, measuredAt });

beforeEach(() => {
  store.clear(); failWrites = false; failReads = false; beforeEval = null;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.SESSION_SECRET = 'synthetic-health-session-secret';
  for (const n of [1, 2, 3, 4, 5]) {
    process.env[`USER${n}_INVITE_CODE`] = `health-invite-${n}`;
    process.env[`USER${n}_HEALTH_SYNC_TOKEN`] = `legacy-health-${n}`;
  }
});

test('connection management is session gated, never cached, and rejects inactive accounts and cross-origin mutations', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    assert.equal((await connection[method](request('/api/health-connection', method, undefined, null))).status, 401);
    assert.equal((await middleware(request('/api/health-connection', method, undefined, 'u3'))).status, 401);
  }
  assert.equal((await connection.GET(request('/api/health-connection'))).headers.get('cache-control'), 'no-store');
  assert.equal((await connection.POST(request('/api/health-connection', 'POST', {}, 'u3', { origin: 'https://elsewhere.example' }))).status, 403);
  delete process.env.USER3_INVITE_CODE;
  assert.equal((await connection.POST(request('/api/health-connection', 'POST'))).status, 401);
});

test('tokens are unique, shown only once, stored only as hashes, and bound to their owner', async () => {
  const issued = await issue();
  assert.match(issued.token, /^slothly\.u3\.[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.configured, true); assert.equal(issued.legacy, false);
  assert.equal(store.get(keys.healthConnection('u3')).tokenHash, createHash('sha256').update(issued.token).digest('hex'));
  assert.ok(!JSON.stringify([...store.values()]).includes(issued.token));
  assert.equal((await getState()).token, undefined);
  assert.equal((await findHealthSyncUser(issued.token)).id, 'u3');
  assert.equal(await findHealthSyncUser(issued.token.replace('.u3.', '.u1.')), null);
  assert.equal((await getState('u1')).legacy, true);
  assert.ok([...store.keys()].every((key) => key.startsWith('mk:u3:')));
});

test('rotation and disconnection invalidate previous and legacy tokens without touching another user', async () => {
  assert.equal((await getState()).legacy, true);
  const first = await issue();
  assert.equal(await findHealthSyncUser('legacy-health-3'), null);
  const second = await issue();
  assert.notEqual(first.token, second.token);
  assert.equal(await findHealthSyncUser(first.token), null);
  assert.equal((await findHealthSyncUser(second.token)).id, 'u3');
  await connection.DELETE(request('/api/health-connection', 'DELETE'));
  assert.equal((await getState()).configured, false);
  assert.equal(await findHealthSyncUser(second.token), null);
  assert.equal(await findHealthSyncUser('legacy-health-3'), null);
  assert.equal((await findHealthSyncUser('legacy-health-1')).id, 'u1');
  assert.equal((await send({ weightKg: 70 }, second.token)).status, 401);
  const reconnected = await issue();
  assert.equal((await findHealthSyncUser(reconnected.token)).id, 'u3');
  delete process.env.USER3_INVITE_CODE;
  assert.equal(await findHealthSyncUser(reconnected.token), null);
});

test('connection tests validate credentials without creating health measurements or a sync success', async () => {
  const { token } = await issue();
  const response = await send({ test: true, provider: 'apple_health' }, token);
  assert.equal(response.status, 200); assert.equal((await response.json()).tested, true);
  const state = await getState();
  assert.ok(state.lastTestAt); assert.equal(state.lastSync, null);
  assert.equal(store.has(keys.weight('u3')), false); assert.equal(store.has(keys.body('u3')), false);
  assert.equal((await send({ test: true, weightKg: 70 }, token)).status, 400);
  assert.equal((await send({ test: true }, 'invalid')).status, 401);
});

async function diagnostic(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-type'), /application\/json/);
  const errors = {
    connection_invalid: 'Koneksi belum valid. Sambungkan ulang dari Slothly.',
    request_invalid: 'Format permintaan belum sesuai. Perbarui Shortcut dari Slothly lalu coba lagi.',
    storage_unavailable: 'Data belum dapat disimpan. Coba lagi sebentar.',
  };
  assert.deepEqual(await response.json(), { status: 'error', code, error: errors[code] });
}

test('missing, malformed, and invalid bearer credentials have the same sanitized diagnostic at either stage', async () => {
  for (const body of [{ provider: 'apple_health', test: true }, { provider: 'apple_health', samples: [sample('weightKg', 81, '2026-09-01T06:00:00Z')] }]) {
    for (const authorization of ['', 'Basic synthetic-private-token', 'Bearer synthetic-private-token']) {
      await diagnostic(await sync.POST(request('/api/health-sync', 'POST', body, null, { authorization })), 401, 'connection_invalid');
    }
  }
  assert.equal(store.size, 0);
});

test('connection tests require a JSON boolean and never accept number or text substitutes', async () => {
  for (const testValue of [false, 0, 1, 'true', 'false', '1', {}, []]) {
    await diagnostic(await send({ provider: 'apple_health', test: testValue }), 400, 'request_invalid');
    assert.equal(store.size, 0);
  }
  for (const fields of [{ weightKg: 81 }, { samples: [] }]) {
    await diagnostic(await send({ provider: 'apple_health', test: true, ...fields }), 400, 'request_invalid');
    assert.equal(store.size, 0);
  }
  const response = await send({ provider: 'apple_health', test: true });
  assert.deepEqual(await response.json(), { ok: true, status: 'tested', tested: true });
  assert.deepEqual([...store.keys()], [keys.healthSyncStatus('u3')]);
  assert.ok(store.get(keys.healthSyncStatus('u3')).lastTestAt);
  assert.equal(store.get(keys.healthSyncStatus('u3')).lastSync, null);
});

test('invalid JSON and unsupported requests return safe request diagnostics without recording a test or import', async () => {
  for (const body of [null, [], {}, { provider: 'health_connect', test: true }]) {
    await diagnostic(await send(body), 400, 'request_invalid');
  }
  const malformed = new NextRequest('http://localhost/api/health-sync', {
    method: 'POST', headers: { authorization: 'Bearer legacy-health-3', 'content-type': 'application/json' }, body: '{"private-payload":',
  });
  await diagnostic(await sync.POST(malformed), 400, 'request_invalid');
  assert.equal(store.size, 0);
});

test('sample imports preserve independent original dates and timestamps and do not relabel old data as today', async () => {
  const { token } = await issue();
  const response = await send({ provider: 'apple_health', userId: 'u1', samples: [
    sample('weightKg', 81.2, '2026-09-01T18:30:00Z'),
    sample('bodyFatPercent', 23.4, '2026-09-01T06:00:00Z'),
  ] }, token);
  assert.equal(response.status, 200); assert.equal((await response.json()).received, 2);
  const weights = store.get(keys.weight('u3'));
  assert.equal(weights[0].date, '2026-09-02'); assert.equal(weights[0].createdAt, '2026-09-01T18:30:00.000Z');
  const body = store.get(keys.body('u3'));
  assert.equal(body[0].date, '2026-09-01'); assert.equal(body[0].bodyFatPercent.recordedAt, '2026-09-01T06:00:00.000Z');
  const state = await getState();
  assert.deepEqual(state.lastSync.dates, ['2026-09-01', '2026-09-02']);
  assert.deepEqual(state.lastSync.fields, ['bodyFatPercent', 'weightKg']);
  assert.equal(state.lastSync.provider, 'apple_health'); assert.ok(state.lastSync.receivedAt);
  assert.ok([...store.keys()].every((key) => key.startsWith('mk:u3:')));
});

test('same-day samples collapse to latest, replays do not duplicate, and older imports cannot overwrite newer measurements', async () => {
  const payload = { provider: 'apple_health', samples: [
    sample('weightKg', 81, '2026-09-01T06:00:00Z'), sample('weightKg', 80, '2026-09-01T07:00:00Z'),
    sample('bodyFatPercent', 24, '2026-09-01T07:00:00Z'),
  ] };
  assert.equal((await (await send(payload)).json()).ignored, 1);
  const id = store.get(keys.weight('u3'))[0].id;
  await send(payload);
  assert.equal(store.get(keys.weight('u3')).length, 1); assert.equal(store.get(keys.weight('u3'))[0].id, id);
  const previousSync = (await getState()).lastSync;
  const old = await send({ provider: 'apple_health', samples: [sample('weightKg', 90, '2026-09-01T05:00:00Z'), sample('bodyFatPercent', 30, '2026-09-01T05:00:00Z')] });
  assert.equal((await old.json()).ignored, 2);
  assert.equal(store.get(keys.weight('u3'))[0].weightKg, 80);
  assert.equal(store.get(keys.body('u3'))[0].bodyFatPercent.value, 24);
  assert.deepEqual((await getState()).lastSync, previousSync);
});

test('invalid sample batches are rejected completely before any measurement write', async () => {
  const good = sample('weightKg', 81, '2026-09-01T06:00:00Z');
  const bad = [
    sample('weightKg', true, '2026-09-01T06:00:00Z'), sample('weightKg', '81', '2026-09-01T06:00:00Z'),
    sample('weightKg', '81,2', '2026-09-01T06:00:00Z'), sample('weightKg', false, '2026-09-01T06:00:00Z'),
    sample('weightKg', null, '2026-09-01T06:00:00Z'),
    sample('weightKg', 0, '2026-09-01T06:00:00Z'), sample('bodyFatPercent', 100, '2026-09-01T06:00:00Z'),
    sample('unknown', 70, '2026-09-01T06:00:00Z'), sample('weightKg', 81, '2026-02-30T06:00:00Z'),
    sample('weightKg', 81, '2026-09-01'), sample('weightKg', 81, new Date(Date.now() + 60_000).toISOString()), null,
  ];
  for (const invalid of bad) {
    await diagnostic(await send({ provider: 'apple_health', samples: [good, invalid] }), 400, 'request_invalid');
    assert.equal(store.size, 0);
  }
  for (const samples of [[], Array(201).fill(good), 'wrong']) assert.equal((await send({ provider: 'apple_health', samples })).status, 400);
  assert.equal((await send({ provider: 'health_connect', samples: [good] })).status, 400);
  assert.equal((await send({ samples: [good] })).status, 400);
});

test('legacy partial and zero snapshots work; malformed fields do not save valid siblings', async () => {
  assert.equal((await send({ calories: 300, weightKg: 80 })).status, 200);
  assert.equal((await send({ calories: 0 })).status, 200);
  const day = [...store.entries()].find(([key]) => key.includes(':day:'))[1];
  assert.equal(day.burns.length, 1); assert.equal(day.burns[0].calories, 0);
  const previous = structuredClone([...store.entries()]);
  for (const invalid of [true, [], 'abc', 401]) assert.equal((await send({ weightKg: invalid, bodyFatPercent: 25 })).status, 400);
  assert.deepEqual([...store.entries()], previous);
});

test('individual fitness samples retain original provenance without changing profile defaults or another user', async () => {
  for (const [metric, value] of [['vo2Max', 42.5], ['restingHeartRate', 63]]) {
    store.clear();
    const profile = { timezone: 'Asia/Jakarta', vo2Max: 35, restingHeartRate: 72, displayName: 'Unchanged profile', cardioMinutesWeekly: 90 };
    store.set(keys.settings('u3'), structuredClone(profile));
    const response = await send({ provider: 'apple_health', userId: 'u1', samples: [sample(metric, value, '2026-09-01T18:30:00Z')] });
    const result = await response.json();
    assert.equal(response.status, 200); assert.equal(result.received, 1); assert.equal(result.synced[metric], true);
    assert.deepEqual(store.get(keys.fitnessMeasurements('u3')), {
      [metric]: { value, date: '2026-09-02', recordedAt: '2026-09-01T18:30:00.000Z', source: 'apple_health' },
    });
    assert.deepEqual(store.get(keys.settings('u3')), profile);
    assert.equal(store.has(keys.fitnessMeasurements('u1')), false);
    const state = await getState();
    assert.deepEqual(state.lastSync.fields, [metric]);
    assert.deepEqual(state.lastSync.dates, ['2026-09-02']);
    assert.equal(store.has(keys.weight('u3')), false); assert.equal(store.has(keys.body('u3')), false);
  }
});

test('fitness samples require finite numeric values, supported ranges and complete original timestamps before any writes', async () => {
  const good = sample('vo2Max', 42, '2026-09-01T06:00:00Z');
  const bad = [
    sample('vo2Max', '42', '2026-09-01T06:00:00Z'), sample('restingHeartRate', true, '2026-09-01T06:00:00Z'),
    sample('vo2Max', 9.9, '2026-09-01T06:00:00Z'), sample('vo2Max', 90.1, '2026-09-01T06:00:00Z'),
    sample('restingHeartRate', 29.9, '2026-09-01T06:00:00Z'), sample('restingHeartRate', 140.1, '2026-09-01T06:00:00Z'),
    sample('vo2Max', null, '2026-09-01T06:00:00Z'), sample('restingHeartRate', 63, '2026-09-01'),
    sample('restingHeartRate', 63, '2026-02-30T06:00:00Z'), sample('vo2Max', 42, new Date(Date.now() + 60_000).toISOString()),
    sample('calories', 100, '2026-09-01T06:00:00Z'),
  ];
  for (const invalid of bad) {
    await diagnostic(await send({ provider: 'apple_health', samples: [good, invalid] }), 400, 'request_invalid');
    assert.equal(store.size, 0);
  }
  const edges = await send({ provider: 'apple_health', samples: [sample('vo2Max', 10, '2026-09-01T06:00:00Z'), sample('restingHeartRate', 140, '2026-09-01T06:00:00Z')] });
  assert.equal(edges.status, 200); assert.equal((await edges.json()).received, 2);
});

test('latest fitness observations reject older dates and exact replays while preserving the independent metric', async () => {
  await send({ provider: 'apple_health', samples: [
    sample('vo2Max', 43, '2026-09-03T06:00:00Z'), sample('restingHeartRate', 62, '2026-09-02T06:00:00Z'),
  ] });
  const receipt = (await getState()).lastSync;
  const stale = await (await send({ provider: 'apple_health', samples: [
    sample('vo2Max', 40, '2026-09-01T06:00:00Z'), sample('restingHeartRate', 62, '2026-09-02T06:00:00Z'),
  ] })).json();
  assert.equal(stale.received, 0); assert.equal(stale.ignored, 2);
  assert.deepEqual((await getState()).lastSync, receipt);
  await send({ provider: 'apple_health', samples: [sample('vo2Max', 44, '2026-09-04T06:00:00Z')] });
  const readings = store.get(keys.fitnessMeasurements('u3'));
  assert.equal(readings.vo2Max.value, 44); assert.equal(readings.restingHeartRate.value, 62);
  assert.equal(readings.restingHeartRate.date, '2026-09-02');
});

test('fitness display and recap use imported values with source dates and fall back only for unsynced profile metrics', async () => {
  const profile = { timezone: 'Asia/Jakarta', fitnessGoal: 'athletic', vo2Max: null, restingHeartRate: 72, cardioMinutesWeekly: 90 };
  store.set(keys.settings('u3'), structuredClone(profile));
  await send({ provider: 'apple_health', samples: [sample('vo2Max', 43, '2026-09-01T18:30:00Z')] });
  const result = await (await fitness.GET(request('/api/fitness-intelligence'))).json();
  assert.equal(result.settings.vo2Max, null, 'Profile values stay independent from imported observations');
  assert.equal(result.intelligence.vo2Max, 43); assert.equal(result.intelligence.restingHeartRate, 72);
  assert.deepEqual(result.intelligence.vo2MaxReading, {
    value: 43, date: '2026-09-02', recordedAt: '2026-09-01T18:30:00.000Z', source: 'apple_health',
  });
  assert.equal(result.intelligence.restingHeartRateReading, null);
  assert.equal(result.intelligence.baselineReady, true); assert.equal(typeof result.intelligence.score, 'number');
  const recap = await (await fitness.POST(request('/api/fitness-intelligence', 'POST', {}))).json();
  assert.deepEqual(recap.intelligence, result.intelligence);
  assert.equal(recap.ai.source, 'template'); assert.equal(recap.ai.summary, result.intelligence.recap);
  assert.deepEqual(store.get(keys.settings('u3')), profile);
  const other = await (await fitness.GET(request('/api/fitness-intelligence', 'GET', undefined, 'u1'))).json();
  assert.equal(other.intelligence.vo2Max, null); assert.equal(other.intelligence.vo2MaxReading, null);
});

test('legacy flat fitness payloads remain profile updates without replacing timestamped observations', async () => {
  await send({ provider: 'apple_health', samples: [sample('vo2Max', 43, '2026-09-01T06:00:00Z')] });
  const response = await send({ vo2Max: '35.5', restingHeartRate: 68, cardioMinutesWeekly: 120 });
  assert.equal(response.status, 200);
  assert.equal(store.get(keys.settings('u3')).vo2Max, 35.5);
  assert.equal(store.get(keys.settings('u3')).restingHeartRate, 68);
  assert.equal(store.get(keys.settings('u3')).cardioMinutesWeekly, 120);
  assert.equal(store.get(keys.fitnessMeasurements('u3')).vo2Max.value, 43);
});

test('failed storage cannot mark data as received, and later connection tests preserve real receipt', async () => {
  failWrites = true;
  await diagnostic(await send({ provider: 'apple_health', samples: [sample('weightKg', 81, '2026-09-01T06:00:00Z')] }), 503, 'storage_unavailable');
  assert.equal(store.has(keys.healthSyncStatus('u3')), false);
  failWrites = false;
  await send({ weightKg: 81 });
  const receipt = (await getState()).lastSync;
  await send({ test: true, provider: 'apple_health' });
  assert.deepEqual((await getState()).lastSync, receipt);
});

test('storage read and test-write failures return only an allowlisted diagnostic and never a successful receipt', async () => {
  failReads = true;
  await diagnostic(await send({ provider: 'apple_health', test: true }), 503, 'storage_unavailable');
  failReads = false; failWrites = true;
  await diagnostic(await send({ provider: 'apple_health', test: true }), 503, 'storage_unavailable');
  assert.equal(store.size, 0);
});

test('a later failed measurement write does not stamp a receipt for the partially processed batch', async () => {
  await send({ provider: 'apple_health', samples: [sample('weightKg', 82, '2026-08-31T06:00:00Z')] });
  const previousReceipt = structuredClone(store.get(keys.healthSyncStatus('u3')));
  beforeEval = async (evalKeys) => { if (evalKeys.includes(keys.body('u3'))) throw storageFailure(); };
  await diagnostic(await send({ provider: 'apple_health', samples: [
    sample('weightKg', 81, '2026-09-01T06:00:00Z'), sample('bodyFatPercent', 24, '2026-09-01T06:00:00Z'),
  ] }), 503, 'storage_unavailable');
  assert.ok(store.get(keys.weight('u3')).some((entry) => entry.date === '2026-09-01'));
  assert.equal(store.has(keys.body('u3')), false);
  assert.deepEqual(store.get(keys.healthSyncStatus('u3')), previousReceipt);
});

// Pause immediately before an atomic write, after its snapshot was read. This
// forces the conflicting order instead of relying on a timing-sensitive race.
function holdWrite(predicate) {
  let reached, release;
  let held = false;
  const entered = new Promise((resolve) => { reached = resolve; });
  const resumed = new Promise((resolve) => { release = resolve; });
  beforeEval = async (evalKeys, args) => {
    const next = args.slice(evalKeys.length).map((value) => JSON.parse(value));
    if (!held && predicate(evalKeys, next)) { held = true; reached(); await resumed; }
  };
  return { entered, release };
}

test('fitness atomic retries keep the newer cross-day winner and concurrent independent metrics without touching profile edits', async () => {
  for (const metric of ['vo2Max', 'restingHeartRate']) {
    store.clear();
    const gate = holdWrite((evalKeys, next) => evalKeys[0] === keys.fitnessMeasurements('u3') && next[0][metric]?.value === 40);
    const older = send({ provider: 'apple_health', samples: [sample(metric, 40, '2026-09-01T05:00:00Z')] });
    await gate.entered;
    await send({ provider: 'apple_health', samples: [sample(metric, 50, '2026-09-02T06:00:00Z')] });
    store.set(keys.settings('u3'), { displayName: 'Edited while importing', vo2Max: 31, restingHeartRate: 75 });
    gate.release();
    const result = await (await older).json();
    assert.equal(result.received, 0); assert.equal(result.ignored, 1);
    assert.equal(store.get(keys.fitnessMeasurements('u3'))[metric].value, 50);
    assert.equal(store.get(keys.fitnessMeasurements('u3'))[metric].date, '2026-09-02');
    assert.equal(store.get(keys.settings('u3')).displayName, 'Edited while importing');
  }
  store.clear();
  const gate = holdWrite((evalKeys, next) => evalKeys[0] === keys.fitnessMeasurements('u3') && next[0].vo2Max?.value === 43);
  const first = send({ provider: 'apple_health', samples: [sample('vo2Max', 43, '2026-09-01T06:00:00Z')] });
  await gate.entered;
  await send({ provider: 'apple_health', samples: [sample('restingHeartRate', 62, '2026-09-02T06:00:00Z')] });
  gate.release();
  assert.equal((await (await first).json()).received, 1);
  const readings = store.get(keys.fitnessMeasurements('u3'));
  assert.equal(readings.vo2Max.value, 43); assert.equal(readings.restingHeartRate.value, 62);
});

test('concurrent older weight and body-fat imports retry their timestamp guard instead of overwriting the newer winner', async () => {
  for (const [metric, older, newer, key] of [
    ['weightKg', 90, 80, keys.weight('u3')], ['bodyFatPercent', 30, 20, keys.body('u3')],
  ]) {
    const gate = holdWrite((evalKeys, next) => evalKeys[0] === key &&
      (metric === 'weightKg' ? next[0][0]?.weightKg : next[0][0]?.bodyFatPercent?.value) === older);
    const oldRequest = send({ provider: 'apple_health', samples: [sample(metric, older, '2026-09-01T05:00:00Z')] });
    await gate.entered;
    const newResponse = await send({ provider: 'apple_health', samples: [sample(metric, newer, '2026-09-01T06:00:00Z')] });
    assert.equal((await newResponse.json()).received, 1);
    gate.release();
    const oldResponse = await (await oldRequest).json();
    assert.equal(oldResponse.received, 0); assert.equal(oldResponse.ignored, 1);
    const entry = store.get(key)[0];
    assert.equal(metric === 'weightKg' ? entry.weightKg : entry.bodyFatPercent.value, newer);
    assert.equal(metric === 'weightKg' ? entry.createdAt : entry.bodyFatPercent.recordedAt, '2026-09-01T06:00:00.000Z');
  }
});

test('concurrent imports on different dates retain both measurements after a conflict retry', async () => {
  for (const metric of ['weightKg', 'bodyFatPercent']) {
    const key = metric === 'weightKg' ? keys.weight('u3') : keys.body('u3');
    const gate = holdWrite((evalKeys, next) => evalKeys[0] === key && next[0].some((entry) => entry.date === '2026-09-01'));
    const first = send({ provider: 'apple_health', samples: [sample(metric, metric === 'weightKg' ? 81 : 24, '2026-09-01T05:00:00Z')] });
    await gate.entered;
    await send({ provider: 'apple_health', samples: [sample(metric, metric === 'weightKg' ? 80 : 23, '2026-09-02T05:00:00Z')] });
    gate.release(); await first;
    assert.deepEqual(store.get(key).map((entry) => entry.date), ['2026-09-01', '2026-09-02']);
  }
});

test('a manual correction committed while an import waits is kept with its notes and independent body fields', async () => {
  const { upsertWeightEntry } = require('../lib/weight');
  const { upsertBodyCheckIn } = require('../lib/bodyStore');
  const gate = holdWrite((evalKeys) => evalKeys[0] === keys.weight('u3'));
  const importing = send({ provider: 'apple_health', samples: [sample('weightKg', 90, '2026-09-01T05:00:00Z')] });
  await gate.entered;
  await upsertWeightEntry('u3', { date: '2026-09-01', weightKg: 79, note: 'Corrected by me', source: 'manual' });
  gate.release();
  assert.equal((await (await importing).json()).ignored, 1);
  assert.equal(store.get(keys.weight('u3'))[0].weightKg, 79);
  assert.equal(store.get(keys.weight('u3'))[0].note, 'Corrected by me');

  const bodyGate = holdWrite((evalKeys) => evalKeys[0] === keys.body('u3'));
  const fatImport = send({ provider: 'apple_health', samples: [sample('bodyFatPercent', 30, '2026-09-01T05:00:00Z')] });
  await bodyGate.entered;
  await upsertBodyCheckIn('u3', '2026-09-01', { bodyFatPercent: 21, waistCm: 90 }, 'manual', 170);
  bodyGate.release();
  assert.equal((await (await fatImport).json()).ignored, 1);
  const body = store.get(keys.body('u3'))[0];
  assert.equal(body.bodyFatPercent.value, 21); assert.equal(body.waistCm.value, 90);
});

test('deleting a weight retries against concurrent new dates and preserves concurrent independent body-fat data', async () => {
  const { deleteWeightEntry } = require('../lib/weight');
  store.set(keys.weight('u3'), [{ id: 'legacy', date: '2026-09-01', weightKg: 81, bodyFat: 30, source: 'shortcuts', createdAt: '2026-09-01T05:00:00.000Z' }]);
  const gate = holdWrite((evalKeys) => evalKeys.length === 2);
  const deleting = deleteWeightEntry('u3', 'legacy');
  await gate.entered;
  await send({ provider: 'apple_health', samples: [
    sample('weightKg', 80, '2026-09-02T06:00:00Z'), sample('bodyFatPercent', 20, '2026-09-01T06:00:00Z'),
  ] });
  gate.release(); await deleting;
  assert.deepEqual(store.get(keys.weight('u3')).map((entry) => entry.date), ['2026-09-02']);
  assert.equal(store.get(keys.body('u3'))[0].bodyFatPercent.value, 20);
});

test('body-field and legacy-fat deletions retry without discarding concurrent dates or other fields', async () => {
  const { upsertBodyCheckIn, deleteBodyField } = require('../lib/bodyStore');
  const { upsertWeightEntry, deleteWeightBodyFat } = require('../lib/weight');
  await upsertBodyCheckIn('u3', '2026-09-01', { bodyFatPercent: 25, waistCm: 90 }, 'manual', 170);
  const gate = holdWrite((evalKeys, next) => evalKeys[0] === keys.body('u3') && !next[0][0]?.bodyFatPercent);
  const deleting = deleteBodyField('u3', '2026-09-01', 'bodyFatPercent');
  await gate.entered;
  await send({ provider: 'apple_health', samples: [sample('bodyFatPercent', 20, '2026-09-02T06:00:00Z')] });
  gate.release(); await deleting;
  assert.equal(store.get(keys.body('u3'))[0].bodyFatPercent, undefined);
  assert.equal(store.get(keys.body('u3'))[0].waistCm.value, 90);
  assert.equal(store.get(keys.body('u3'))[1].bodyFatPercent.value, 20);

  await upsertWeightEntry('u3', { date: '2026-09-01', weightKg: 81, bodyFat: 25 });
  const fatGate = holdWrite((evalKeys, next) => evalKeys[0] === keys.weight('u3') && next[0][0]?.bodyFat === undefined);
  const clearing = deleteWeightBodyFat('u3', '2026-09-01');
  await fatGate.entered;
  await send({ provider: 'apple_health', samples: [sample('weightKg', 80, '2026-09-02T06:00:00Z')] });
  fatGate.release(); await clearing;
  assert.equal(store.get(keys.weight('u3'))[0].bodyFat, undefined);
  assert.equal(store.get(keys.weight('u3'))[1].weightKg, 80);
});

test('repeated storage conflicts fail after a bounded number of attempts instead of silently dropping data', async () => {
  const { upsertWeightEntry } = require('../lib/weight');
  let conflicts = 0;
  beforeEval = async () => {
    store.set(keys.weight('u3'), [{ id: 'racer', date: '2026-09-02', weightKg: 80, note: String(++conflicts), createdAt: '2026-09-02T06:00:00Z' }]);
  };
  await assert.rejects(upsertWeightEntry('u3', { date: '2026-09-01', weightKg: 81 }), /changed repeatedly/);
  assert.equal(conflicts, 8);
  assert.equal(store.get(keys.weight('u3')).some((entry) => entry.date === '2026-09-01'), false);
  conflicts = 0;
  await diagnostic(await send({ provider: 'apple_health', samples: [sample('weightKg', 81, '2026-09-01T06:00:00Z')] }), 503, 'storage_unavailable');
  assert.equal(conflicts, 8);
  assert.equal(store.has(keys.healthSyncStatus('u3')), false);
});

test('same-origin connection mutations work through the browser-facing host and HTTPS proxy', async () => {
  for (const method of ['POST', 'DELETE']) {
    const response = await connection[method](request('/api/health-connection', method, {}, 'u3', {
      host: 'slothly.example', 'x-forwarded-proto': 'https', origin: 'https://slothly.example',
    }));
    assert.equal(response.status, 200);
    assert.equal((await connection[method](request('/api/health-connection', method, {}, 'u3', {
      host: 'slothly.example', 'x-forwarded-proto': 'https', origin: 'https://elsewhere.example',
    }))).status, 403);
    assert.equal((await connection[method](request('/api/health-connection', method, {}, 'u3', {
      host: 'slothly.example', 'x-forwarded-proto': 'https', origin: 'http://slothly.example',
    }))).status, 403);
  }
});

test('a concurrent connection test and receipt preserve both status fields in either completion order', async () => {
  const { recordHealthTest, recordHealthSync } = require('../lib/healthConnection');
  const receipt = { receivedAt: '2026-09-01T07:00:00.000Z', provider: 'apple_health', dates: ['2026-09-01'], fields: ['weightKg'] };
  for (const testFirst of [true, false]) {
    store.delete(keys.healthSyncStatus('u3'));
    const gate = holdWrite((evalKeys, next) => evalKeys[0] === keys.healthSyncStatus('u3') &&
      (testFirst ? next[0].lastTestAt !== null : next[0].lastSync !== null));
    const first = testFirst ? recordHealthTest('u3') : recordHealthSync('u3', receipt);
    await gate.entered;
    if (testFirst) await recordHealthSync('u3', receipt); else await recordHealthTest('u3');
    gate.release(); await first;
    const status = store.get(keys.healthSyncStatus('u3'));
    assert.deepEqual(status.lastSync, receipt);
    assert.ok(status.lastTestAt);
  }
});
