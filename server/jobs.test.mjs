import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileJobs } from './jobs.mjs';
import { startLocalRuntime } from './runtime.mjs';
import { localConfigFromEnvironment } from './start-local.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('worker bounds each pass and emits counts without object paths or raw errors',async()=>{
  let calls=0;const events=[];
  const jobs=createFileJobs({pool:{},objects:{},maxPerKind:2,onEvent:event=>events.push(event),reconcile:async()=>{calls++;return{status:'queued',object_key:'private fixture'};},cleanup:async()=>{calls++;return{status:'deleted'};}});
  assert.equal((await jobs.runOnce()).counts.deleted,2);assert.equal(calls,4);
  assert.ok(!JSON.stringify(events).includes('private fixture'));
  await jobs.stop();assert.equal((await jobs.runOnce()).status,'stopped');
});
test('pause waits for an active operation; concurrent runs and paused runs do not start work',async()=>{
  let release,entered;const began=new Promise(resolve=>{entered=resolve;});
  const pending=new Promise(resolve=>{release=resolve;});let cleanupCalls=0;
  const jobs=createFileJobs({pool:{},objects:{},reconcile:async()=>{entered();await pending;return{status:'queued'};},cleanup:async()=>{cleanupCalls++;return{status:'empty'};}});
  const run=jobs.runOnce();await began;
  assert.equal((await jobs.runOnce()).status,'busy');let paused=false;
  const wait=jobs.pause().then(()=>{paused=true;});await Promise.resolve();assert.equal(paused,false);
  release();await run;await wait;assert.equal(cleanupCalls,0);
  assert.equal((await jobs.runOnce()).status,'paused');jobs.resume();await jobs.stop();
});
test('failed transaction stops the pass without immediate retry and exposes only a stable failure',async()=>{
  let calls=0;const jobs=createFileJobs({pool:{},objects:{},reconcile:async()=>{calls++;throw new Error('fixture secret SQL');},cleanup:async()=>{throw new Error('must not execute');}});
  const result=await jobs.runOnce();assert.equal(calls,1);assert.equal(result.status,'failed');
  assert.ok(!JSON.stringify(result).includes('fixture secret'));await jobs.stop();
});
test('runtime rejects hosted targets and invalid configuration before connecting',async()=>{
  await assert.rejects(startLocalRuntime({origin:'https://example.test'}),{code:'LOCAL_CONFIGURATION_REQUIRED'});
  const connections=Object.fromEntries(['auth','identity','tenant','portal','intent','cleanup'].map(name=>[name,{host:'hosted.example.test',database:'fixture',user:`fixture_${name}`,password:'generated-fixture-value'}]));
  const config={origin:'http://127.0.0.1:8788',storageDirectory:path.join(tmpdir(),'runtime-fixture'),authSecret:'x'.repeat(32),downloadSecret:'y'.repeat(32),connections};
  await assert.rejects(startLocalRuntime(config),{code:'LOCAL_DATABASE_CONFIGURATION_REQUIRED'});
  await assert.rejects(startLocalRuntime({...config,storageDirectory:path.resolve('server/private-fixture')}),{code:'PRIVATE_OBJECT_DIRECTORY_REQUIRED'});
});
test('operator configuration defaults jobs to paused; missing or misspelled settings fail closed',()=>{
  const env={BOOKDROP_LOCAL_DB_NAME:'fixture',BOOKDROP_LOCAL_OBJECT_DIRECTORY:path.join(tmpdir(),'runtime-fixture'),BOOKDROP_LOCAL_AUTH_SECRET:'x'.repeat(32),BOOKDROP_LOCAL_DOWNLOAD_SECRET:'y'.repeat(32)};
  for(const name of ['AUTH','IDENTITY','TENANT','PORTAL','INTENT','CLEANUP']){env[`BOOKDROP_LOCAL_${name}_USER`]=`fixture_${name.toLowerCase()}`;env[`BOOKDROP_LOCAL_${name}_PASSWORD`]='fixture-generated-password';}
  const config=localConfigFromEnvironment(env);assert.equal(config.jobsEnabled,false);assert.equal(config.apiPort,8788);assert.equal(config.origin,'http://127.0.0.1:5173');
  assert.throws(()=>localConfigFromEnvironment({...env,BOOKDROP_LOCAL_FILE_JOBS:'enable'}),{code:'LOCAL_CONFIGURATION_REQUIRED'});
  assert.throws(()=>localConfigFromEnvironment({}),{code:'LOCAL_CONFIGURATION_REQUIRED'});
});
test('real operator command fails without configuration and prints only a stable code',()=>{
  const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path'].filter(name=>process.env[name]).map(name=>[name,process.env[name]]));
  const result=spawnSync(process.execPath,['server/start-local.mjs'],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),'LOCAL_CONFIGURATION_REQUIRED');
});
