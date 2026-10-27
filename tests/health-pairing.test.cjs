const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { NextRequest } = require('next/server');

const store = new Map();
let failReads = false;
let failWrites = false;
let beforeEval = null;
const keys = {
  healthConnection: (user) => `mk:${user}:healthConnection`,
  healthPairing: (user) => `mk:${user}:healthPairing`,
  healthSyncStatus: (user) => `mk:${user}:healthSyncStatus`,
};
const redisPath = require.resolve('../lib/redis');
const storageFailure = () => new Error('private-upstream-detail https://redis.invalid synthetic-secret');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: {
  keys,
  redis: {
    async get(key) { if (failReads) throw storageFailure(); return structuredClone(store.get(key) ?? null); },
    async set(key, value) { if (failWrites) throw storageFailure(); store.set(key, structuredClone(value)); return 'OK'; },
    async eval(script, evalKeys, args) {
      if (failWrites) throw storageFailure();
      if (beforeEval) await beforeEval(evalKeys, args);
      for (let i = 0; i < evalKeys.length; i++) {
        if (!isDeepStrictEqual(store.get(evalKeys[i]) ?? null, JSON.parse(args[i]))) return 0;
      }
      for (let i = 0; i < evalKeys.length; i++) store.set(evalKeys[i], JSON.parse(args[evalKeys.length + i]));
      return 1;
    },
  },
} };

const issueRoute = require('../app/api/health-pairing/route');
const redeemRoute = require('../app/api/health-pairing/redeem/route');
const { middleware } = require('../middleware');
const { makeSessionToken, SESSION_COOKIE } = require('../lib/auth');
const { issueHealthPairing, redeemHealthPairing, HealthPairingInvalid } = require('../lib/healthPairing');
const { issueHealthToken, revokeHealthToken, findHealthSyncUser, getHealthConnection } = require('../lib/healthConnection');
const originalNow = Date.now;
const originalNodeEnv = process.env.NODE_ENV;
const origin = 'https://slothly.example';

function request(path, body, headers = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST', headers: { host: 'slothly.example', 'x-forwarded-proto': 'https', 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function issue(user = 'u3', headers = {}) {
  return issueRoute.POST(request('/api/health-pairing', undefined, {
    cookie: `${SESSION_COOKIE}=${await makeSessionToken(user)}`, origin, ...headers,
  }));
}
const redeem = (code, headers = {}) => redeemRoute.POST(request('/api/health-pairing/redeem', { code }, headers));
const getCode = async (user = 'u3') => (await (await issue(user)).json()).code;
const hash = (token) => createHash('sha256').update(token).digest('hex');

beforeEach(() => {
  store.clear(); failReads = false; failWrites = false; beforeEval = null;
  process.env.SESSION_SECRET = 'synthetic-pairing-session-secret';
  process.env.NODE_ENV = 'test';
  for (const n of [1, 2, 3, 4, 5]) {
    process.env[`USER${n}_INVITE_CODE`] = `pairing-invite-${n}`;
    process.env[`USER${n}_NAME`] = `Synthetic User ${n}`;
    process.env[`USER${n}_HEALTH_SYNC_TOKEN`] = `legacy-health-${n}`;
  }
});
afterEach(() => {
  Date.now = originalNow;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
});

test('pairing issue requires a signed active-account session even with a spoofed user header', async () => {
  assert.equal((await issueRoute.POST(request('/api/health-pairing', undefined, { 'x-user-id': 'u3' }))).status, 401);
  assert.equal((await middleware(request('/api/health-pairing', undefined, { 'x-user-id': 'u3' }))).status, 401);
  assert.equal((await issue('u3', { cookie: `${SESSION_COOKIE}=u3.forged` })).status, 401);
  const cookie = await makeSessionToken('u3');
  delete process.env.USER3_INVITE_CODE;
  assert.equal((await issueRoute.POST(request('/api/health-pairing', undefined, { cookie: `${SESSION_COOKIE}=${cookie}` }))).status, 401);
  assert.equal(store.size, 0);
});

test('only the exact redeem path bypasses session middleware', async () => {
  assert.equal((await middleware(request('/api/health-pairing/redeem', {}))).headers.get('x-middleware-next'), '1');
  for (const path of ['/api/health-pairing', '/api/health-pairing/redeem/private', '/api/health-pairing/redeem-other']) {
    assert.equal((await middleware(request(path, {}))).status, 401);
  }
});

test('issue rejects cross-origin, unsafe-host and insecure public mutations without issuing a code', async () => {
  for (const headers of [
    { origin: 'https://elsewhere.example' }, { origin: 'http://slothly.example' },
    { 'sec-fetch-site': 'cross-site' }, { host: 'username@slothly.example' },
    { 'x-forwarded-proto': 'http', origin: 'http://slothly.example' },
    { 'x-forwarded-proto': 'ftp', origin: 'ftp://slothly.example' },
  ]) assert.equal((await issue('u3', headers)).status, 403);
  assert.equal(store.size, 0);
});

test('issuance contains only a short-lived account code and stores its hash without credentials', async () => {
  const response = await issue();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.deepEqual(Object.keys(result).sort(), ['code', 'expiresAt', 'redeemUrl']);
  assert.match(result.code, /^hp1\.u3\.[A-Za-z0-9_-]{43}$/);
  assert.equal(result.redeemUrl, `${origin}/api/health-pairing/redeem`);
  assert.ok(Date.parse(result.expiresAt) - Date.now() > 299_000);
  assert.ok(Date.parse(result.expiresAt) - Date.now() <= 300_000);
  const ticket = store.get(keys.healthPairing('u3'));
  assert.equal(ticket.codeHash, hash(result.code));
  assert.ok(!JSON.stringify([...store.values()]).includes(result.code));
  assert.ok(!JSON.stringify([...store.values()]).includes('slothly.u3.'));
  assert.equal(await findHealthSyncUser('legacy-health-3').then((user) => user?.id), 'u3');
});

test('redeem produces one account-bound hash-only token and consumes the ticket', async () => {
  const code = await getCode();
  const response = await redeem(code);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.deepEqual(Object.keys(result).sort(), ['accountName', 'endpoint', 'status', 'token']);
  assert.equal(result.status, 'paired'); assert.equal(result.endpoint, `${origin}/api/health-sync`);
  assert.equal(result.accountName, 'Synthetic User 3');
  assert.match(result.token, /^slothly\.u3\.[A-Za-z0-9_-]{43}$/);
  assert.equal((await findHealthSyncUser(result.token)).id, 'u3');
  assert.equal(await findHealthSyncUser(result.token.replace('.u3.', '.u1.')), null);
  assert.equal(store.get(keys.healthPairing('u3')), null);
  const credential = store.get(keys.healthConnection('u3'));
  assert.equal(credential.installs[0].tokenHash, hash(result.token));
  assert.ok(!JSON.stringify([...store.values()]).includes(result.token));
  assert.ok(!JSON.stringify([...store.values()]).includes(code));
  assert.equal((await getHealthConnection('u3')).configured, true);
  assert.equal((await redeem(code)).status, 410);
});

test('first additive pairing preserves legacy access and later pairing preserves both Shortcut installations', async () => {
  const first = await (await redeem(await getCode())).json();
  assert.equal((await findHealthSyncUser('legacy-health-3')).id, 'u3');
  assert.equal(store.get(keys.healthConnection('u3')).legacyAllowed, true);
  const second = await (await redeem(await getCode())).json();
  assert.notEqual(first.token, second.token);
  assert.equal((await findHealthSyncUser(first.token)).id, 'u3');
  assert.equal((await findHealthSyncUser(second.token)).id, 'u3');
  assert.equal((await findHealthSyncUser('legacy-health-1')).id, 'u1');
});

test('redeem account label comes from the verified owner rather than client-supplied identity fields', async () => {
  const code = await getCode();
  const response = await redeemRoute.POST(request('/api/health-pairing/redeem', {
    code, accountName: 'Spoofed Other Account', userId: 'u1',
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.accountName, 'Synthetic User 3');
  assert.equal((await findHealthSyncUser(result.token)).id, 'u3');
  process.env.USER3_NAME = '   ';
  const fallback = await (await redeem(await getCode())).json();
  assert.equal(fallback.accountName, 'Pengguna Slothly');
});

test('additive pairing preserves a working managed token and its creation time without reactivating legacy', async () => {
  const manual = await issueHealthToken('u3');
  const before = structuredClone(store.get(keys.healthConnection('u3')));
  const paired = await (await redeem(await getCode())).json();
  const credential = store.get(keys.healthConnection('u3'));
  assert.equal(credential.tokenHash, before.tokenHash); assert.equal(credential.createdAt, before.createdAt);
  assert.equal(credential.legacyAllowed, undefined);
  assert.equal((await findHealthSyncUser(manual.token)).id, 'u3');
  assert.equal((await findHealthSyncUser(paired.token)).id, 'u3');
  assert.equal(await findHealthSyncUser('legacy-health-3'), null);
});

test('wrong code, account substitution, superseded issue and cross-host redemption cannot claim an installation', async () => {
  const old = await getCode();
  const code = await getCode();
  for (const candidate of [old, code.replace('.u3.', '.u1.'), code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'), '', 'hp1.u3.short']) {
    assert.equal((await redeem(candidate)).status, 410);
  }
  assert.equal((await redeem(code, { host: 'other.example' })).status, 410);
  assert.equal((await redeem(code, { origin: 'https://elsewhere.example' })).status, 400);
  assert.equal(store.get(keys.healthConnection('u3')), null);
  assert.equal((await redeem(code)).status, 200);
});

test('five-minute expiry is enforced at the exact boundary and does not modify access credentials', async () => {
  const code = await getCode();
  const expiresAt = Date.parse(store.get(keys.healthPairing('u3')).expiresAt);
  Date.now = () => expiresAt;
  const response = await redeem(code);
  assert.equal(response.status, 410); assert.equal((await response.json()).code, 'pairing_invalid');
  assert.equal(store.get(keys.healthConnection('u3')), null);
});

test('inactive account and malformed requests return a sanitized no-store pairing error', async () => {
  const code = await getCode();
  delete process.env.USER3_INVITE_CODE;
  for (const body of [{ code }, null, [], {}, { code: 42 }]) {
    const response = await redeemRoute.POST(request('/api/health-pairing/redeem', body));
    assert.ok([400, 410].includes(response.status));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.code, 'pairing_invalid');
    assert.ok(!JSON.stringify(result).includes(code));
  }
});

function holdWrite(predicate) {
  let entered, release, held = false;
  const reached = new Promise((resolve) => { entered = resolve; });
  const resume = new Promise((resolve) => { release = resolve; });
  beforeEval = async (evalKeys, args) => {
    const next = args.slice(evalKeys.length).map((value) => JSON.parse(value));
    if (!held && predicate(evalKeys, next)) { held = true; entered(); await resume; }
  };
  return { reached, release };
}

test('concurrent redemption atomically allows exactly one working claimant', async () => {
  const code = await getCode();
  const gate = holdWrite((evalKeys, next) => evalKeys[0] === keys.healthPairing('u3') && next[0] === null);
  const first = redeem(code);
  await gate.reached;
  const winner = await redeem(code);
  gate.release();
  const loser = await first;
  assert.equal(winner.status, 200); assert.equal(loser.status, 410);
  const { token } = await winner.json();
  assert.equal((await findHealthSyncUser(token)).id, 'u3');
  assert.equal(store.get(keys.healthConnection('u3')).installs.length, 1);
});

test('explicit rotate or disconnect revokes installed access and pending tickets without affecting another account', async () => {
  for (const action of [issueHealthToken, revokeHealthToken]) {
    store.clear();
    const existing = await (await redeem(await getCode())).json();
    const pending = await getCode();
    await action('u3');
    assert.equal(await findHealthSyncUser(existing.token), null);
    assert.equal(await findHealthSyncUser('legacy-health-3'), null);
    assert.equal((await redeem(pending)).status, 410);
    assert.equal((await findHealthSyncUser('legacy-health-1')).id, 'u1');
  }
});

test('disconnect committed during a redeem retry prevents credential resurrection', async () => {
  const code = await getCode();
  const gate = holdWrite((evalKeys, next) => evalKeys[0] === keys.healthPairing('u3') && next[0] === null);
  const pending = redeem(code);
  await gate.reached;
  await revokeHealthToken('u3');
  gate.release();
  assert.equal((await pending).status, 410);
  assert.equal((await getHealthConnection('u3')).configured, false);
  assert.equal(store.get(keys.healthConnection('u3')).installs, undefined);
});

test('a repeated disconnect invalidates tickets issued against an already-revoked record', async () => {
  Date.now = () => 1_800_000_000_000;
  await revokeHealthToken('u3');
  const code = await getCode();
  await revokeHealthToken('u3');
  assert.equal((await redeem(code)).status, 410);
});

test('storage conflicts retry against latest installs without replacing independent manual access', async () => {
  const { token } = await issueHealthToken('u3');
  const code = await getCode();
  let conflicts = 0;
  beforeEval = async (evalKeys) => {
    if (evalKeys[0] === keys.healthPairing('u3') && conflicts++ === 0) {
      const credential = store.get(keys.healthConnection('u3'));
      store.set(keys.healthConnection('u3'), { ...credential, installs: [{ tokenHash: 'a'.repeat(64), createdAt: '2026-01-01T00:00:00.000Z' }] });
    }
  };
  assert.equal((await redeem(code)).status, 200);
  assert.ok(conflicts >= 2);
  assert.equal(store.get(keys.healthConnection('u3')).installs.length, 2);
  assert.equal((await findHealthSyncUser(token)).id, 'u3');
});

test('only sixteen paired installations are retained while a manual token remains valid', async () => {
  const { token } = await issueHealthToken('u3');
  let first;
  for (let i = 0; i < 17; i++) {
    const paired = await (await redeem(await getCode())).json();
    first ??= paired.token;
    assert.equal((await findHealthSyncUser(paired.token)).id, 'u3');
  }
  assert.equal(store.get(keys.healthConnection('u3')).installs.length, 16);
  assert.equal(await findHealthSyncUser(first), null);
  assert.equal((await findHealthSyncUser(token)).id, 'u3');
});

test('storage failures expose no upstream details, codes or tokens and leave the ticket retryable', async () => {
  failReads = true;
  const issued = await issue();
  assert.equal(issued.status, 503); assert.equal((await issued.json()).code, 'storage_unavailable');
  failReads = false;
  const code = await getCode();
  failWrites = true;
  const response = await redeem(code);
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.text();
  assert.match(body, /storage_unavailable/);
  assert.ok(!body.includes(code)); assert.ok(!body.includes('private-upstream')); assert.ok(!body.includes('synthetic-secret'));
  failWrites = false;
  assert.equal((await redeem(code)).status, 200);
});

test('HTTP permits only loopback hosts in either build mode and public deployments require HTTPS', async () => {
  const cookie = `${SESSION_COOKIE}=${await makeSessionToken('u3')}`;
  for (const mode of ['test', 'production']) {
    process.env.NODE_ENV = mode;
    for (const host of ['localhost:3000', '127.0.0.1:3100', '[::1]:3000']) {
      const origin = `http://${host}`;
      const response = await issueRoute.POST(new NextRequest(`${origin}/api/health-pairing`, {
        method: 'POST', headers: { cookie, host, origin },
      }));
      assert.equal(response.status, 200);
      const { code, redeemUrl } = await response.json();
      assert.equal(redeemUrl, `${origin}/api/health-pairing/redeem`);
      const paired = await redeemRoute.POST(new NextRequest(redeemUrl, {
        method: 'POST', headers: { host, 'content-type': 'application/json' }, body: JSON.stringify({ code }),
      }));
      assert.equal(paired.status, 200);
    }
    for (const host of ['192.168.1.10:3000', 'slothly.example', 'localhost.attacker.invalid']) {
      assert.equal((await issue('u3', { host, origin: `http://${host}`, 'x-forwarded-proto': 'http' })).status, 403);
    }
  }
  assert.equal((await issue()).status, 200);
});
