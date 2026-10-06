const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { DEFAULT_SETTINGS } = require('../lib/types');
const { todayKey, lastNDateKeys } = require('../lib/dates');

// Deliberately synthetic bindings, confined to this test worker.
process.env.SESSION_SECRET = 'synthetic-session-signing-key-for-tests-only';
const store = new Map();
const accesses = [];
const redis = {
  async get(key) { accesses.push(key); return store.has(key) ? structuredClone(store.get(key)) : null; },
  async set(key, value) { accesses.push(key); store.set(key, structuredClone(value)); return 'OK'; },
  async eval(script, evalKeys, args) {
    const key=evalKeys[0]; accesses.push(key);
    const expected=JSON.parse(args[0]);
    if(!require('node:util').isDeepStrictEqual(store.get(key)??null,expected)) return 0;
    store.set(key,JSON.parse(args[1]));return 1;
  },
};
const keys = {
  day: (user, date) => `mk:${user}:day:${date}`,
  settings: (user) => `mk:${user}:settings`,
  body: (user) => `mk:${user}:body`,
  weight: (user) => `mk:${user}:weight`,
  weeklySummary: (user) => `mk:${user}:weeklySummary`,
};
// Use real handlers and middleware with an in-memory storage adapter. This
// exercises key isolation and behavior, not external Upstash connectivity.
const redisPath = require.resolve('../lib/redis');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: { redis, keys } };
const auth = require('../lib/auth');
const { getUsers, findUserByHealthSyncToken } = require('../lib/users');
const { middleware } = require('../middleware');
const logRoute = require('../app/api/log/route');
const authRoute = require('../app/api/auth/route');
const healthRoute = require('../app/api/health-sync/route');
const todayRoute = require('../app/api/today/route');
const trendsRoute = require('../app/api/trends/route');
const restaurantRoute = require('../app/api/restaurant/route');
const satietyRoute = require('../app/api/satiety/route');
const exerciseRoute = require('../app/api/exercise-credit/route');
const { computeStreak } = require('../lib/day');

function request(route, method = 'GET', body, user = 'u3', headers = {}) {
  return new NextRequest(`http://localhost${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  store.clear(); accesses.length = 0;
  for (const n of [1, 2, 3]) {
    process.env[`USER${n}_NAME`] = `Test user ${n}`;
    process.env[`USER${n}_PASSWORD`] = `test-password-${n}`;
    process.env[`USER${n}_HEALTH_SYNC_TOKEN`] = `test-health-${n}`;
  }
});

test('three slots retain stable identities; missing password disables only its slot', () => {
  assert.deepEqual(getUsers().map((user) => user.id), ['u1', 'u2', 'u3']);
  delete process.env.USER2_PASSWORD;
  assert.deepEqual(getUsers().map((user) => user.id), ['u1', 'u3']);
});

test('third user login produces a valid session, spoofed header is overwritten, revoked user is rejected', async () => {
  const response = await authRoute.POST(request('/api/auth', 'POST', { password: 'test-password-3' }, null));
  assert.equal(response.status, 200);
  const token = response.cookies.get(auth.SESSION_COOKIE).value;
  assert.equal(await auth.verifySessionToken(token), 'u3');
  const result = await middleware(request('/api/today', 'GET', undefined, 'u1', { cookie: `${auth.SESSION_COOKIE}=${token}` }));
  assert.equal(result.headers.get('x-middleware-request-x-user-id'), 'u3');
  delete process.env.USER3_PASSWORD;
  assert.equal(await auth.verifySessionToken(token), null);
  assert.equal((await middleware(request('/api/today', 'GET', undefined, 'u1', { cookie: `${auth.SESSION_COOKIE}=${token}` }))).status, 401);
  assert.equal((await middleware(request('/api/today', 'GET', undefined, 'u1'))).status, 401);
});

test('ambiguous passwords or sync tokens fail closed rather than choosing another user', () => {
  process.env.USER3_PASSWORD = process.env.USER1_PASSWORD;
  assert.equal(auth.findUserByPassword('test-password-1'), null);
  process.env.USER3_HEALTH_SYNC_TOKEN = process.env.USER1_HEALTH_SYNC_TOKEN;
  assert.equal(findUserByHealthSyncToken('test-health-1'), null);
});

test('food confirmation validates input, supports past days, and food edits reopen it', async () => {
  const date = todayKey(DEFAULT_SETTINGS.timezone);
  for (const invalid of [null, { foodLogComplete: 'true' }, { foodLogComplete: true, date: '2026-02-30' }, { foodLogComplete: true, date: '9999-01-01' }, { foodLogComplete: true, date: 1 }]) {
    assert.equal((await logRoute.PATCH(request('/api/log', 'PATCH', invalid))).status, 400);
  }
  assert.equal((await logRoute.PATCH(request('/api/log', 'PATCH', { foodLogComplete: true }, null))).status, 401);
  assert.equal((await logRoute.PATCH(request('/api/log', 'PATCH', { foodLogComplete: true, date, userId: 'u1' }))).status, 200);
  assert.equal(store.get(keys.day('u3', date)).foodLogComplete, true);
  await logRoute.POST(request('/api/log', 'POST', { type: 'meal', calories: 1800, foodName: 'Test meal' }));
  assert.equal(store.get(keys.day('u3', date)).foodLogComplete, false);
  await logRoute.PATCH(request('/api/log', 'PATCH', { foodLogComplete: true }));
  await logRoute.POST(request('/api/log', 'POST', { type: 'burn', calories: 400 }));
  assert.equal(store.get(keys.day('u3', date)).foodLogComplete, true);
  const id = store.get(keys.day('u3', date)).meals[0].id;
  await logRoute.DELETE(request(`/api/log?type=meal&id=${id}`, 'DELETE'));
  assert.equal(store.get(keys.day('u3', date)).foodLogComplete, false);
  assert.ok(accesses.every((key) => key.startsWith('mk:u3:')));
});

test('third-user Health Sync writes only third-user keys and keeps food confirmation', async () => {
  const date = todayKey(DEFAULT_SETTINGS.timezone);
  store.set(keys.day('u3', date), { date, meals: [], burns: [], foodLogComplete: true });
  const response = await healthRoute.POST(request('/api/health-sync', 'POST', { calories: 400, weightKg: 75, userId: 'u1' }, null, { authorization: 'Bearer test-health-3' }));
  assert.equal(response.status, 200);
  assert.equal(store.get(keys.day('u3', date)).foodLogComplete, true);
  assert.equal(store.get(keys.day('u3', date)).burns[0].calories, 400);
  assert.equal(store.get(keys.weight('u3'))[0].weightKg, 75);
  assert.ok(accesses.every((key) => key.startsWith('mk:u3:')));
  assert.equal((await healthRoute.POST(request('/api/health-sync', 'POST', { calories: 100 }, null))).status, 401);
});

test('Home, trends, restaurant, and satiety share intake budget with no exercise compensation', async () => {
  await logRoute.POST(request('/api/log', 'POST', { type: 'meal', calories: 2000 }));
  await logRoute.POST(request('/api/log', 'POST', { type: 'burn', calories: 800 }));
  const today = await (await todayRoute.GET(request('/api/today'))).json();
  assert.equal(today.summary.remaining, -200);
  assert.equal(today.summary.onTrack, false);
  assert.equal(today.weeklyBudget.consumed, 2000);
  assert.equal(today.weeklyBudget.isComplete, false);
  for (const [route, handler] of [['/api/restaurant', restaurantRoute], ['/api/satiety', satietyRoute]]) {
    const response = await handler.POST(request(route, 'POST', {}));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).input.remainingCalories, 0);
  }
  const trends = await (await trendsRoute.GET(request('/api/trends'))).json();
  assert.equal(trends.successRate, null);
  assert.equal(trends.days.at(-1).caloriesIn, 2000);
  assert.equal(trends.days.at(-1).foodLogStatus, 'partial');
  const exercise = await (await exerciseRoute.GET(request('/api/exercise-credit?extraKcal=10000'))).json();
  assert.deepEqual(exercise.suggestions, []);
});

test('streak follows confirmed logging and does not reward progressively smaller intake', async () => {
  const dates = lastNDateKeys(4, DEFAULT_SETTINGS.timezone);
  for (const [index, date] of dates.slice(0, -1).entries()) {
    store.set(keys.day('u3', date), { date, foodLogComplete: index !== 0, meals: [], burns: [] });
  }
  assert.equal(await computeStreak('u3', DEFAULT_SETTINGS.timezone), 2);
});

const bodyRoute = require('../app/api/body/route');
const weightRoute = require('../app/api/weight/route');

test('body API validates every measurement before writing; source and user are server controlled', async () => {
  assert.equal((await bodyRoute.GET(request('/api/body', 'GET', undefined, null))).status, 401);
  for (const invalid of [null, {}, { waistCm: null }, { waistCm: '90' }, { waistCm: -1 }, { waistCm: 500 }, { waistCm: 90, heightCm: 0 }, { waistCm: 90, date: '2026-02-30' }, { waistCm: 90, date: '9999-01-01' }, { weightKg: 78, bodyFatPercent: 100 }]) {
    assert.equal((await bodyRoute.POST(request('/api/body', 'POST', invalid))).status, 400);
    assert.equal(store.size, 0);
  }
  const response = await bodyRoute.POST(request('/api/body', 'POST', { waistCm: 90, heightCm: 170, source: 'shortcuts', userId: 'u1' }));
  assert.equal(response.status, 200);
  const snapshot = (await response.json()).snapshots[0];
  assert.equal(snapshot.waistCm.source, 'manual');
  assert.equal(snapshot.waistCm.heightCm, 170);
  assert.ok(accesses.every((key) => key.startsWith('mk:u3:')));
});

test('partial corrections retain untouched fields, their provenance, and historical height', async () => {
  const date = '2026-09-01';
  await bodyRoute.POST(request('/api/body', 'POST', { date, waistCm: 90, hipCm: 100, heightCm: 170 }));
  store.set(keys.settings('u3'), { ...DEFAULT_SETTINGS, heightCm: 180 });
  const response = await bodyRoute.POST(request('/api/body', 'POST', { date, waistCm: 89 }));
  const snapshot = (await response.json()).snapshots[0];
  assert.equal(snapshot.waistCm.value, 89);
  assert.equal(snapshot.waistCm.heightCm, 170);
  assert.equal(snapshot.hipCm.value, 100);
  assert.equal(snapshot.hipCm.heightCm, 170);
  await bodyRoute.POST(request('/api/body', 'POST', { date: '2026-08-01', waistCm: 92 }));
  const snapshots = (await (await bodyRoute.GET(request('/api/body'))).json()).snapshots;
  assert.equal(snapshots[0].waistCm.heightCm, null); // today's height never guessed for a past entry
});

test('weight-only Health Sync retains body fat and circles, with independent field sources', async () => {
  await bodyRoute.POST(request('/api/body', 'POST', { weightKg: 78, waistCm: 90, bodyFatPercent: 23, heightCm: 170 }));
  const date = todayKey(DEFAULT_SETTINGS.timezone);
  const oldId = store.get(keys.weight('u3'))[0].id;
  const response = await healthRoute.POST(request('/api/health-sync', 'POST', { weightKg: 77.8 }, null, { authorization: 'Bearer test-health-3' }));
  assert.equal(response.status, 200);
  const snapshot = (await (await bodyRoute.GET(request('/api/body'))).json()).snapshots[0];
  assert.equal(snapshot.weightKg.source, 'shortcuts');
  assert.equal(snapshot.weightKg.value, 77.8);
  assert.equal(snapshot.bodyFatPercent.value, 23);
  assert.equal(snapshot.bodyFatPercent.source, 'manual');
  assert.equal(snapshot.waistCm.value, 90);
  assert.equal(store.get(keys.weight('u3'))[0].id, oldId);
  assert.equal(store.get(keys.weight('u3'))[0].bodyFat, 23);
  assert.equal(snapshot.date, date);
});

test('standalone body-fat sync and repeated syncs merge once per date without overwriting other fields', async () => {
  await bodyRoute.POST(request('/api/body', 'POST', { waistCm: 90 }));
  for (const bodyFatPercent of [22, 21.5]) {
    const response = await healthRoute.POST(request('/api/health-sync', 'POST', { bodyFatPercent }, null, { authorization: 'Bearer test-health-3' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).synced.bodyFatPercent, true);
  }
  const snapshots = (await (await bodyRoute.GET(request('/api/body'))).json()).snapshots;
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].bodyFatPercent.value, 21.5);
  assert.equal(snapshots[0].bodyFatPercent.source, 'shortcuts');
  assert.equal(snapshots[0].waistCm.value, 90);
  assert.equal(snapshots[0].weightKg, undefined);
});

test('deleting a field preserves other measurements and cannot expose a legacy body-fat fallback', async () => {
  const date = todayKey(DEFAULT_SETTINGS.timezone);
  await bodyRoute.POST(request('/api/body', 'POST', { weightKg: 78, waistCm: 90, bodyFatPercent: 23, heightCm: 170 }));
  let response = await bodyRoute.DELETE(request(`/api/body?date=${date}&field=bodyFatPercent`, 'DELETE'));
  let snapshot = (await response.json()).snapshots[0];
  assert.equal(snapshot.bodyFatPercent, undefined);
  assert.equal(snapshot.weightKg.value, 78);
  assert.equal(snapshot.waistCm.value, 90);
  response = await bodyRoute.DELETE(request(`/api/body?date=${date}&field=weightKg`, 'DELETE'));
  snapshot = (await response.json()).snapshots[0];
  assert.equal(snapshot.weightKg, undefined);
  assert.equal(snapshot.waistCm.value, 90);
  assert.ok(accesses.every((key) => key.startsWith('mk:u3:')));
});

test('deleting a legacy weight preserves independent body fat and original metadata', async () => {
  const date = todayKey(DEFAULT_SETTINGS.timezone);
  const recordedAt = '2026-09-01T00:00:00Z';
  store.set(keys.weight('u3'), [{ id: 'legacy', date, weightKg: 78, bodyFat: 23, createdAt: recordedAt, source: 'shortcuts' }]);
  const response = await weightRoute.DELETE(request('/api/weight?id=legacy', 'DELETE'));
  assert.equal(response.status, 200);
  const snapshot = (await (await bodyRoute.GET(request('/api/body'))).json()).snapshots[0];
  assert.equal(snapshot.weightKg, undefined);
  assert.equal(snapshot.bodyFatPercent.value, 23);
  assert.equal(snapshot.bodyFatPercent.source, 'shortcuts');
  assert.equal(snapshot.bodyFatPercent.recordedAt, recordedAt);
});


test('Fitness uses the latest standalone body-fat reading and its date/source', async () => {
  await bodyRoute.POST(request('/api/body', 'POST', { date: '2026-09-01', weightKg: 78, bodyFatPercent: 23 }));
  await healthRoute.POST(request('/api/health-sync', 'POST', { bodyFatPercent: 22 }, null, { authorization: 'Bearer test-health-3' }));
  const fitnessRoute = require('../app/api/fitness-intelligence/route');
  const response = await fitnessRoute.GET(request('/api/fitness-intelligence'));
  const { intelligence } = await response.json();
  assert.equal(intelligence.bodyFatLatest, 22);
  assert.equal(intelligence.bodyFatDate, todayKey(DEFAULT_SETTINGS.timezone));
  assert.equal(intelligence.bodyFatSource, 'shortcuts');
});


test('an explicit zero Active Energy snapshot overwrites the previous sync without affecting food or body data', async () => {
  const date = todayKey(DEFAULT_SETTINGS.timezone);
  await bodyRoute.POST(request('/api/body', 'POST', { waistCm: 90 }));
  await logRoute.PATCH(request('/api/log', 'PATCH', { foodLogComplete: true }));
  for (const calories of [400, 0]) {
    const response = await healthRoute.POST(request('/api/health-sync', 'POST', { calories }, null, { authorization: 'Bearer test-health-3' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).synced.calories, true);
  }
  const log = store.get(keys.day('u3', date));
  assert.equal(log.burns.length, 1);
  assert.equal(log.burns[0].calories, 0);
  assert.equal(log.foodLogComplete, true);
  assert.equal(store.get(keys.body('u3'))[0].waistCm.value, 90);
});

const bodyResponseRoute = require('../app/api/body-response/route');
test('Body Response requires authentication and rejects unsupported periods before storage access', async () => {
  assert.equal((await bodyResponseRoute.GET(request('/api/body-response','GET',undefined,null))).status,401);
  for(const days of ['0','15','28foo','0x1c','NaN']) assert.equal((await bodyResponseRoute.GET(request('/api/body-response?days='+days))).status,400);
  assert.deepEqual(accesses,[]);
});
test('Body Response reads two bounded calendar windows, scoped to the authenticated user', async () => {
  store.set(keys.settings('u3'), {...DEFAULT_SETTINGS, timezone:'Asia/Jakarta'});
  const response=await bodyResponseRoute.GET(request('/api/body-response?days=56&userId=u1'));
  assert.equal(response.status,200);
  const report=await response.json();
  assert.equal(report.current.end,todayKey('Asia/Jakarta'));
  assert.equal(report.current.days.length,56);assert.equal(report.previous.days.length,56);
  assert.equal(accesses.filter(k=>k.includes(':day:')).length,112);
  assert.ok(accesses.every(k=>k.startsWith('mk:u3:')));
  assert.equal(report.current.food.average,null);assert.deepEqual(report.insights,[]);
});


const calibrationRoute = require('../app/api/calibration/route');
const settingsRoute = require('../app/api/settings/route');
const {calibrationFixture}=require('./calibration-fixture.cjs');
function seedCalibration(user='u3') {
  const f=calibrationFixture(todayKey('Asia/Jakarta'));
  store.set(keys.settings(user),f.settings);store.set(keys.weight(user),f.weights);
  for(const log of f.logs)store.set(keys.day(user,log.date),log);
  return f;
}
test('calibration read is isolated and never modifies active targets',async()=>{
  seedCalibration();const before=structuredClone(store.get(keys.settings('u3')));
  const response=await calibrationRoute.GET(request('/api/calibration?userId=u1'));
  const data=await response.json();assert.equal(data.calibration.status,'proposal');
  assert.deepEqual(store.get(keys.settings('u3')),before);assert.ok(accesses.every(k=>k.startsWith('mk:u3:')));
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await calibrationRoute.GET(request('/api/calibration','GET',undefined,null))).status,401);
});
test('calibration rejects incomplete input, missing context and unauthorized actions without target changes',async()=>{
  seedCalibration();
  assert.equal((await calibrationRoute.POST(request('/api/calibration','POST',{},null))).status,401);
  for(const body of [{},{action:'apply',fingerprint:'x'},{action:'unknown',fingerprint:'x'}]) assert.equal((await calibrationRoute.POST(request('/api/calibration','POST',body))).status,400);
  const f=seedCalibration();f.logs[0].foodLogComplete=false;f.logs[1].foodLogComplete=false;
  for(const log of f.logs)store.set(keys.day('u3',log.date),log);
  const data=await (await calibrationRoute.GET(request('/api/calibration'))).json();
  assert.equal((await calibrationRoute.POST(request('/api/calibration','POST',{action:'apply',contextConfirmed:true,fingerprint:data.fingerprint}))).status,409);
  assert.equal(store.get(keys.settings('u3')).dailyTargetKcal,1800);
});
test('keeping a proposal preserves calories/protein and records a reevaluation date',async()=>{
  const f=seedCalibration();const data=await (await calibrationRoute.GET(request('/api/calibration'))).json();
  const response=await calibrationRoute.POST(request('/api/calibration','POST',{action:'keep',fingerprint:data.fingerprint,dailyTargetKcal:900,userId:'u1'}));
  assert.equal(response.status,200);const saved=store.get(keys.settings('u3'));
  assert.equal(saved.dailyTargetKcal,1800);assert.equal(saved.proteinTargetG,f.settings.proteinTargetG);
  assert.equal(saved.calibrationReview.decision,'kept');assert.ok(saved.calibrationReview.reviewAfter>f.today);
  assert.equal(store.has(keys.settings('u1')),false);
  assert.equal((await (await calibrationRoute.GET(request('/api/calibration'))).json()).calibration.status,'waiting');
});
test('applying a current proposal recomputes server values and prevents replay or double application',async()=>{
  seedCalibration();const data=await (await calibrationRoute.GET(request('/api/calibration'))).json();
  const body={action:'apply',contextConfirmed:true,fingerprint:data.fingerprint,dailyTargetKcal:900,proteinTargetG:20};
  const response=await calibrationRoute.POST(request('/api/calibration','POST',body));assert.equal(response.status,200);
  assert.equal(store.get(keys.settings('u3')).dailyTargetKcal,1850);assert.equal(store.get(keys.settings('u3')).proteinTargetG,120);
  assert.equal((await calibrationRoute.POST(request('/api/calibration','POST',body))).status,409);
  assert.equal(store.get(keys.settings('u3')).dailyTargetKcal,1850);
});
test('food, measurement, or profile corrections invalidate an earlier proposal',async()=>{
  for(const change of ['food','weight','profile']){
    const f=seedCalibration();const data=await (await calibrationRoute.GET(request('/api/calibration'))).json();
    if(change==='food')store.get(keys.day('u3',f.dates[0])).meals[0].calories+=50;
    if(change==='weight')store.get(keys.weight('u3'))[0].weightKg+=.1;
    if(change==='profile')store.get(keys.settings('u3')).dailyTargetKcal=1900;
    assert.equal((await calibrationRoute.POST(request('/api/calibration','POST',{action:'apply',contextConfirmed:true,fingerprint:data.fingerprint}))).status,409);
    assert.equal(store.get(keys.settings('u3')).dailyTargetKcal,change==='profile'?1900:1800);
  }
});
test('concurrent apply requests cannot both commit the same target decision',async()=>{
  seedCalibration();const data=await (await calibrationRoute.GET(request('/api/calibration'))).json();
  const body={action:'apply',contextConfirmed:true,fingerprint:data.fingerprint};
  const responses=await Promise.all([calibrationRoute.POST(request('/api/calibration','POST',body)),calibrationRoute.POST(request('/api/calibration','POST',body))]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(store.get(keys.settings('u3')).dailyTargetKcal,1850);
});
test('saving a program preserves server-owned review history and ignores forged history',async()=>{
  const f=seedCalibration();const data=await (await calibrationRoute.GET(request('/api/calibration'))).json();
  await calibrationRoute.POST(request('/api/calibration','POST',{action:'keep',fingerprint:data.fingerprint}));
  const review=structuredClone(store.get(keys.settings('u3')).calibrationReview);
  const response=await settingsRoute.POST(request('/api/settings','POST',{...f.settings,calibrationReview:{reviewAfter:'1900-01-01'}}));
  assert.equal(response.status,200);assert.deepEqual(store.get(keys.settings('u3')).calibrationReview,review);
});
test('Home supplies body readiness so sparse weight data cannot drive legacy coach claims',async()=>{
  seedCalibration();const response=await todayRoute.GET(request('/api/today'));const data=await response.json();
  assert.equal(data.bodyResponse.periodDays,28);assert.equal(data.bodyResponse.current.food.ready,true);
  assert.equal(data.bodyResponse.current.weight.ready,true);
});
