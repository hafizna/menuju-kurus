const {createRequire}=require('node:module');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const project=require('node:path').resolve(__dirname,'..');
const projectRequire=createRequire(project+'/package.json');
projectRequire('@next/env').loadEnvConfig(project);
const required=['SESSION_SECRET','USER1_EMAIL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'];
const missing=required.filter(name=>!process.env[name]);
if(missing.length){console.error('Missing runtime requirements: '+missing.join(', '));process.exit(2);}
const base=process.argv[2]||'http://127.0.0.1:3000';
const parsed=new URL(base);
assert.ok(['127.0.0.1','localhost'].includes(parsed.hostname),'This helper only targets a local app instance');
require(project+'/tests/register.cjs');
const {redis,keys}=projectRequire('./lib/redis');
const {DEFAULT_SETTINGS}=projectRequire('./lib/types');
const {verifySessionToken,makeSessionToken,SESSION_COOKIE}=projectRequire('./lib/auth');
const {getUserById}=projectRequire('./lib/users');
const {saveCalibrationDecision}=projectRequire('./lib/calibrationStore');
const id='integration-'+randomUUID();
let stage='Redis read', temporaryKeyCreated=false;
(async()=>{
  assert.equal(await redis.ping(),'PONG');
  stage='Redis calibration compare-and-set';
  const initial={...DEFAULT_SETTINGS,dailyTargetKcal:1800};
  const next={...initial,dailyTargetKcal:1850};
  temporaryKeyCreated=true;
  await redis.set(keys.settings(id),initial,{ex:120});
  const commits=await Promise.all([saveCalibrationDecision(id,initial,next),saveCalibrationDecision(id,initial,next)]);
  assert.equal(commits.filter(Boolean).length,1);
  assert.equal((await redis.get(keys.settings(id))).dailyTargetKcal,1850);
  assert.equal(await saveCalibrationDecision(id,initial,next),false);
  await redis.del(keys.settings(id));temporaryKeyCreated=false;
  console.log('Redis PING and real Lua concurrent compare-and-set: PASS; temporary key removed.');
  stage='Login page';
  assert.equal((await fetch(base+'/login')).status,200);
  assert.equal((await fetch(base+'/api/me')).status,401);
  // Google Sign-In and PIN entry both end in the same signed session cookie,
  // so this mints one directly per slot instead of driving either login UI
  // (Google OAuth needs a real browser + real Google account; PIN needs one
  // already registered) — it still exercises real Redis reads per user.
  for(const slot of [1,2,3,4,5]){
    if(!process.env[`USER${slot}_EMAIL`])continue;
    stage=`User ${slot} session`;
    const token=await makeSessionToken(`u${slot}`);
    assert.equal(await verifySessionToken(token),`u${slot}`);
    const cookie=`${SESSION_COOKIE}=${encodeURIComponent(token)}`;
    for(const route of ['/api/me','/api/today','/api/body','/api/body-response?days=28','/api/calibration']){
      stage=`User ${slot} authenticated read ${route}`;
      const response=await fetch(base+route,{headers:{cookie}});assert.equal(response.status,200);
      const data=await response.json();
      if(route==='/api/me')assert.equal(data.name,getUserById(`u${slot}`).name);
      if(route==='/api/today')assert.ok(data.settings&&data.bodyResponse);
      if(route==='/api/body')assert.ok(Array.isArray(data.snapshots));
      if(route.startsWith('/api/body-response'))assert.equal(data.periodDays,28);
      if(route==='/api/calibration')assert.ok(data.calibration&&data.fingerprint);
    }
    console.log(`User ${slot}: session and five authenticated read routes PASS.`);
  }
  console.log('Live integration PASS. No meal, body, or actual-user target data was modified. Google Sign-In, PIN login, Gemini, and Health Sync were not exercised.');
})().catch(()=>{console.error(`Live integration FAILED during ${stage}; credential values and response bodies suppressed.`);process.exitCode=1;}).finally(async()=>{
  if(temporaryKeyCreated){try{await redis.del(keys.settings(id));console.log('Temporary integration key removed.');}catch{console.error('Temporary-key cleanup failed; check integration-prefixed settings keys.');process.exitCode=1;}}
});
