const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { createHash } = require('node:crypto');

const store = new Map();
let failWrites = false;
let beforeEval = null;
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
    async set(key, value) { if (failWrites) throw new Error('synthetic storage failure'); store.set(key, structuredClone(value)); return 'OK'; },
    async eval(script, evalKeys, args) {
      if (failWrites) throw new Error('synthetic storage failure');
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
  store.clear(); failWrites = false; beforeEval = null;
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
    sample('weightKg', 0, '2026-09-01T06:00:00Z'), sample('bodyFatPercent', 100, '2026-09-01T06:00:00Z'),
    sample('unknown', 70, '2026-09-01T06:00:00Z'), sample('weightKg', 81, '2026-02-30T06:00:00Z'),
    sample('weightKg', 81, '2026-09-01'), sample('weightKg', 81, new Date(Date.now() + 60_000).toISOString()), null,
  ];
  for (const invalid of bad) {
    assert.equal((await send({ provider: 'apple_health', samples: [good, invalid] })).status, 400);
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

test('failed storage cannot mark data as received, and later connection tests preserve real receipt', async () => {
  failWrites = true;
  await assert.rejects(send({ provider: 'apple_health', samples: [sample('weightKg', 81, '2026-09-01T06:00:00Z')] }), /synthetic storage failure/);
  assert.equal(store.has(keys.healthSyncStatus('u3')), false);
  failWrites = false;
  await send({ weightKg: 81 });
  const receipt = (await getState()).lastSync;
  await send({ test: true, provider: 'apple_health' });
  assert.deepEqual((await getState()).lastSync, receipt);
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
});
