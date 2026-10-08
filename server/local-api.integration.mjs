import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import pg from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { createLocalAuth } from './auth.mjs';
import { createApi } from './api.mjs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalObjectStore } from './local-storage.mjs';
import { createPrivateStorage } from './storage.mjs';
import { withPortal, portalPeriod, portalLetters } from './portal.mjs';
import { processOneFileCleanup } from './file-cleanup.mjs';
import { reconcileOneUpload } from './reconcile-uploads.mjs';
import { startLocalRuntime } from './runtime.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// All identities, passwords and reset messages in this file are disposable test
// fixtures. Nothing uses dotenv, hosted databases, real email, or real payments.
const native=process.env.BOOKDROP_TEST_NATIVE==='1';
const fixtureDatabase=native?process.env.BOOKDROP_TEST_DATABASE:'postgres';
const fixturePort=native?Number(process.env.BOOKDROP_TEST_PORT):5432;
const origin = native?process.env.BOOKDROP_TEST_ORIGIN:'http://127.0.0.1:8788';
if(native) {
  const url=new URL(origin);
  if(process.platform!=='win32' || !/^bookdrop_fixture_[a-f0-9]{32}$/.test(fixtureDatabase??'') || !Number.isInteger(fixturePort) || fixturePort<1024 || fixturePort>65535 || !process.env.BOOKDROP_TEST_ADMIN_PASSWORD || url.protocol!=='http:' || url.hostname!=='127.0.0.1' || !url.port || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw new Error('LOCAL_NATIVE_FIXTURE_REQUIRED');
} else if (process.env.BOOKDROP_TEST_SOCKET !== '/pgsocket' || process.platform !== 'linux') throw new Error('LOCAL_FIXTURE_SOCKET_REQUIRED');
const password = randomBytes(32).toString('hex');
const secret = randomBytes(32).toString('hex');
const pools = [];
const fixtureFetch = (url, options = {}) => fetch(url, {...options, signal: AbortSignal.timeout(5000)});
function pool(user = 'postgres', options, max = 1) {
  const result = new pg.Pool({host:native?'127.0.0.1':'/pgsocket',port:fixturePort,user,password:native&&user==='postgres'?process.env.BOOKDROP_TEST_ADMIN_PASSWORD:password,database:fixtureDatabase,ssl:false,max,connectionTimeoutMillis:1500,query_timeout:5000,options:options??''});
  pools.push(result);
  return result;
}
const clientInput = (name = 'Fixture client') => ({business_name:name,contact_email:'client@example.test',requirements:[{label:'Bank statement',doc_type:'bank',required:true}],reminderDays:[1,5,10]});

test('local Better Auth and PostgreSQL API', {timeout:60000}, async t => {
  console.log('Fixture stage: integration entered');
  t.beforeEach(context => console.log(`Fixture stage: ${context.name}`));
  let runtime;
  try {
    const admin = pool();
    let ready = false;
    for (let attempt=0;attempt<30;attempt++) {
      try { await admin.query('select 1'); ready=true; break; } catch { await new Promise(resolve => setTimeout(resolve,250)); }
    }
    assert.ok(ready,'isolated local PostgreSQL became ready');
    assert.equal((await admin.query('SELECT current_database() AS name')).rows[0].name,fixtureDatabase);
    console.log('Fixture stage: database connected');
    await admin.query(readFileSync(new URL('./db/001-core.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/002-local-services.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/003-uploads.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/004-client-history.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/005-private-files.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/006-portal.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/007-file-cleanup.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/008-upload-intents.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/009-notifications.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/010-close-cycle-outcomes.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/011-messages.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('./db/012-categorization-corrections.sql',import.meta.url),'utf8'));
    console.log('Fixture stage: application schema ready');
    const migrationPool = pool('postgres','-c search_path=local_auth,pg_catalog');
    const migrationAuth = createLocalAuth({pool:migrationPool,origin,secret});
    const migrations = await getMigrations(migrationAuth.options);
    assert.equal(migrations.unsafeChanges.length,0);
    await migrations.runMigrations();
    console.log('Fixture stage: identity schema ready');
    for (const [user,role] of [['bd_test_auth','bookdrop_auth'],['bd_test_identity','bookdrop_identity'],['bd_test_api','bookdrop_app'],['bd_test_portal','bookdrop_portal'],['bd_test_cleanup','bookdrop_cleanup'],['bd_test_intent','bookdrop_file_intent']]) {
      // Generated hex fixture password stays in this process; never logged.
      await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}' IN ROLE ${role}`);
    }
    const resets = [];
    const directory=await mkdtemp(path.join(os.tmpdir(),'bookdrop-http-files-'));
    let grantTime=Date.now();
    const connections=Object.fromEntries(Object.entries({auth:'bd_test_auth',identity:'bd_test_identity',tenant:'bd_test_api',portal:'bd_test_portal',cleanup:'bd_test_cleanup',intent:'bd_test_intent'}).map(([name,user])=>[name,{host:native?'127.0.0.1':'/pgsocket',port:fixturePort,user,password,database:fixtureDatabase}]));
    const apiFailures=[];
    const runtimeConfig={origin,connections,storageDirectory:directory,authSecret:secret,downloadSecret:randomBytes(32).toString('hex'),sendResetPassword:async message=>{resets.push(message);},grantOptions:{now:()=>grantTime,ttlSeconds:2},onEvent:event=>{if(event.code==='API_UNAVAILABLE'){apiFailures.push(event);console.log('Fixture API failure: '+JSON.stringify(event));}}};
    await t.test('runtime refuses administrative and mismatched database roles before listening',async()=>{
      await assert.rejects(startLocalRuntime({...runtimeConfig,connections:{...connections,auth:{...connections.auth,user:'postgres',password:native?process.env.BOOKDROP_TEST_ADMIN_PASSWORD:password}}}),{code:'LOCAL_ROLE_BOUNDARY_REQUIRED'});
      await assert.rejects(startLocalRuntime({...runtimeConfig,connections:{...connections,auth:connections.portal,portal:connections.auth}}),{code:'LOCAL_ROLE_BOUNDARY_REQUIRED'});
    });
    runtime=await startLocalRuntime(runtimeConfig);
    const {auth,objects,storage,grants}=runtime;
    const {auth:authPool,identity:identityPool,tenant:tenantPool,portal:portalPool,cleanup:cleanupPool,intent:intentPool}=runtime.pools;
    async function call(route,{data,cookie,portalToken,originHeader=origin,method=data===undefined?'GET':'POST'}={}) {
      const headers = new Headers();
      if (cookie) headers.set('Cookie',cookie);
      if (portalToken) headers.set('x-bookdrop-portal',portalToken);
      if (method==='POST') { headers.set('Origin',originHeader); headers.set('Content-Type','application/json'); }
      const response = await fixtureFetch(`${origin}/api/bookdrop${route}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data),redirect:'error'});
      const value = await response.json();
      return {status:response.status,value,cookies:response.headers.getSetCookie(),cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
    }
    const signup = (email,accountType='practitioner') => call('/auth/sign-up',{data:{email,password:'fixture-password-123!',fullName:'Test account',accountType,...(accountType==='solo'?{businessName:'Fixture solo'}:{})}});
    let one, two, solo, client;

    await t.test('HTTP boundary rejects alternate hosts, unsafe paths, oversized bodies and forged identities',async()=>{
      // Fetch manages Host itself. Use an explicit raw HTTP request to prove the
      // alternate-Host rejection on the wire rather than testing Fetch's rewrite.
      const alternateHost=await new Promise((resolve,reject)=>{
        const request=httpRequest(`${origin}/api/bookdrop/auth/session`,{headers:{Host:'other.example'}},response=>{
          response.resume(); response.on('end',()=>resolve(response.statusCode));
        });
        request.on('error',reject); request.end();
      });
      assert.equal(alternateHost,403);
      assert.equal((await fixtureFetch(`${origin}//other.example`)).status,403);
      assert.equal((await fixtureFetch(`${origin}/clients`)).status,404);
      assert.equal((await fixtureFetch(`${origin}/api/bookdrop/auth/sign-in`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(65536)})})).status,413);
      const forged=await fixtureFetch(`${origin}/api/bookdrop/auth/session`,{headers:{Authorization:'Bearer fixture-forged-identity','x-bookdrop-peer':'other-peer'}});
      assert.deepEqual(await forged.json(),{session:null});
    });

    await t.test('signup creates verified application mapping and HttpOnly cookie without exposing tokens',async()=>{
      one=await signup('one@example.test'); two=await signup('two@example.test'); solo=await signup('solo@example.test','solo');
      assert.equal(one.status,200); assert.equal(two.status,200); assert.equal(solo.status,200);
      assert.deepEqual(one.value,{ok:true});
      assert.ok(one.cookies.some(c=>/HttpOnly/i.test(c)));
      const session=await call('/auth/session',{cookie:one.cookie});
      assert.equal(session.value.session.bookkeeper.account_type,'practitioner');
      const soloSession=await call('/auth/session',{cookie:solo.cookie});
      assert.ok(soloSession.value.session.bookkeeper.self_client_id);
      const roles=(await admin.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname LIKE 'bd_test_%'")).rows;
      assert.ok(roles.every(r=>!r.rolsuper&&!r.rolbypassrls));
    });
    await t.test('client create persists with requirements and reminders; tenants cannot read or mutate each other',async()=>{
      const created=await call('/clients',{cookie:one.cookie,data:clientInput()});
      assert.equal(created.status,200); client=created.value;
      const read=await call(`/clients/${client.id}`,{cookie:one.cookie});
      assert.equal(read.value.requirements.length,1);
      assert.equal((await admin.query('SELECT count(*) FROM public.reminder_schedules WHERE client_id=$1',[client.id])).rows[0].count,'3');
      assert.deepEqual((await call('/clients',{cookie:two.cookie})).value,[]);
      assert.equal((await call(`/clients/${client.id}`,{cookie:two.cookie})).status,404);
      assert.equal((await call(`/clients/${client.id}`,{cookie:two.cookie,data:{...clientInput('Other tenant'),is_active:true}})).status,404);
      assert.equal((await call('/clients')).status,401);
      assert.equal((await call('/clients',{cookie:one.cookie,data:{...clientInput(),bookkeeper_id:client.bookkeeper_id}})).status,400);
      assert.equal((await call('/clients',{cookie:one.cookie,data:clientInput(),originHeader:'https://other.example'})).status,403);
    });
    await t.test('profile preferences persist for verified account only and deny protected fields and portal writes',async()=>{
      const beforeOne=(await call('/auth/session',{cookie:one.cookie})).value.session.bookkeeper;
      const beforeTwo=(await call('/auth/session',{cookie:two.cookie})).value.session.bookkeeper;
      const input={full_name:' Generated profile ',practice_name:' Generated practice ',reply_to_email:'reply@example.test',reminder_tone:'firm',notify_on_complete:false,notify_on_any_upload:true,notify_on_late:false};
      assert.equal((await call('/profile',{data:input})).status,401);
      assert.equal((await call('/profile',{cookie:one.cookie})).status,405);
      assert.equal((await call(`/profile/${beforeTwo.id}`,{cookie:one.cookie,data:input})).status,404);
      assert.equal((await call('/portal/profile',{portalToken:client.portal_token,data:input})).status,404);
      for(const protectedField of ['id','bookkeeper_id','email','plan','account_type','business_name','self_client_id','stripe_customer_id','stripe_subscription_id'])assert.equal((await call('/profile',{cookie:one.cookie,data:{...input,[protectedField]:'untrusted'}})).status,400);
      for(const invalid of [{full_name:''},{practice_name:null},{reply_to_email:'not-an-email'},{reminder_tone:'untrusted'},{notify_on_late:'true'},{notify_on_complete:null}])assert.equal((await call('/profile',{cookie:one.cookie,data:{...input,...invalid}})).status,400);
      assert.deepEqual((await call('/auth/session',{cookie:one.cookie})).value.session.bookkeeper,beforeOne);
      const saved=await call('/profile',{cookie:one.cookie,data:input});assert.equal(saved.status,200);assert.equal(saved.value.id,beforeOne.id);assert.equal(saved.value.full_name,input.full_name.trim());assert.equal(saved.value.practice_name,input.practice_name.trim());assert.equal(saved.value.notify_on_complete,false);assert.equal(saved.value.plan,beforeOne.plan);assert.equal(saved.value.email,beforeOne.email);
      assert.deepEqual((await call('/auth/session',{cookie:one.cookie})).value.session.bookkeeper,saved.value);
      assert.deepEqual((await call('/auth/session',{cookie:two.cookie})).value.session.bookkeeper,beforeTwo);
      const savedSolo=await call('/profile',{cookie:solo.cookie,data:{...input,practice_name:''}});assert.equal(savedSolo.status,200);assert.equal(savedSolo.value.account_type,'solo');assert.ok(savedSolo.value.self_client_id);
      await assert.rejects(tenantPool.query("UPDATE public.bookkeepers SET plan='pro'"),{code:'42501'});
    });
    await t.test('client edit is atomic and rejected requirement ownership rolls back the client edit',async()=>{
      const other=(await call('/clients',{cookie:two.cookie,data:clientInput('Other fixture')})).value;
      const foreignReq=(await call(`/clients/${other.id}`,{cookie:two.cookie})).value.requirements[0];
      const refused=await call(`/clients/${client.id}`,{cookie:one.cookie,data:{...clientInput('Must rollback'),is_active:true,requirements:[{id:foreignReq.id,label:'Bad',doc_type:'bank',required:true}]}});
      assert.equal(refused.status,403);
      const read=await call(`/clients/${client.id}`,{cookie:one.cookie});
      assert.equal(read.value.client.business_name,'Fixture client');
      const updated=await call(`/clients/${client.id}`,{cookie:one.cookie,data:{...clientInput('Saved edit'),is_active:true,requirements:read.value.requirements.map(r=>({id:r.id,label:'Updated requirement',doc_type:r.doc_type,required:r.required}))}});
      assert.equal(updated.status,200);
      assert.equal((await call(`/clients/${client.id}`,{cookie:one.cookie})).value.requirements[0].label,'Updated requirement');
    });
    await t.test('period status preserves upload metadata and denies cross-tenant or mismatched references',async()=>{
      const req=(await call(`/clients/${client.id}`,{cookie:one.cookie})).value.requirements[0];
      const other=(await call('/clients',{cookie:two.cookie})).value[0];
      const insert='INSERT INTO public.document_uploads(requirement_id,client_id,bookkeeper_id,period_year,period_month,filename_original,storage_path,file_size_bytes,parsed_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)';
      const fixture=[req.id,client.id,client.bookkeeper_id,2025,12,'fixture-only.pdf','fixture-only/no-object.pdf',42,{transactionCount:2}];
      await admin.query(insert,fixture);
      await assert.rejects(admin.query(insert,[req.id,other.id,other.bookkeeper_id,...fixture.slice(3)]),{code:'23503'});
      await assert.rejects(admin.query(insert,[req.id,client.id,other.bookkeeper_id,...fixture.slice(3)]),{code:'23503'});
      const status=await call('/clients/status',{cookie:one.cookie,data:{year:2025,month:12}});
      assert.equal(status.status,200); assert.equal(status.value.uploads.length,1);
      assert.equal(status.value.uploads[0].file_size_bytes,42);
      assert.deepEqual(status.value.uploads[0].parsed_summary,{transactionCount:2});
      assert.equal((await call('/clients/status',{cookie:one.cookie,data:{year:2026,month:1}})).value.uploads.length,0);
      assert.equal((await call('/clients/status',{cookie:two.cookie,data:{year:2025,month:12}})).value.uploads.length,0);
      assert.equal((await call('/clients/status',{cookie:solo.cookie,data:{year:2025,month:12}})).value.clients.length,1);
      assert.equal((await call('/clients/status',{data:{year:2025,month:12}})).status,401);
      assert.equal((await call('/clients/status',{cookie:one.cookie,data:{year:2025,month:13}})).status,400);
      assert.equal((await call('/clients/status',{cookie:one.cookie,data:{year:2025,month:12,bookkeeper_id:other.bookkeeper_id}})).status,400);
      assert.equal((await tenantPool.query('SELECT count(*) FROM public.document_uploads')).rows[0].count,'0');
    });
    await t.test('correction history derives owner, preserves exact data and audit undo while enforcing tenant/upload/solo boundaries',async()=>{
      const source=(await admin.query('SELECT id FROM public.document_uploads WHERE client_id=$1 LIMIT 1',[client.id])).rows[0];
      const input={clientId:client.id,uploadId:source.id,transactionDate:'2025-12-31',transactionAmountCents:-12345,vendorNormalized:'generated-vendor',descriptionRaw:'Generated transaction fixture',originalCategory:'Other',correctedCategory:'Office Supplies',originalConfidence:'low',reason:'Generated correction fixture'};
      assert.equal((await call('/corrections',{data:input})).status,401);
      assert.equal((await call('/corrections',{cookie:two.cookie,data:input})).status,404);
      assert.equal((await call('/corrections',{cookie:solo.cookie,data:input})).status,404);
      assert.equal((await call('/portal/corrections',{portalToken:client.portal_token,data:input})).status,404);
      for(const extra of [{bookkeeperId:client.bookkeeper_id},{status:'auto_promoted'},{appliedAt:'2025-01-01'},{id:randomUUID()}])assert.equal((await call('/corrections',{cookie:one.cookie,data:{...input,...extra}})).status,400);
      for(const invalid of [{transactionDate:'2025-02-30'},{transactionAmountCents:0.5},{transactionAmountCents:Number.MAX_SAFE_INTEGER+1},{correctedCategory:''},{originalConfidence:'untrusted'}])assert.equal((await call('/corrections',{cookie:one.cookie,data:{...input,...invalid}})).status,400);
      assert.equal((await call('/corrections',{cookie:one.cookie,data:{...input,uploadId:randomUUID()}})).status,404);
      const saved=await call('/corrections',{cookie:one.cookie,data:input});assert.equal(saved.status,200);assert.equal(saved.value.bookkeeper_id,client.bookkeeper_id);assert.equal(saved.value.transaction_amount_cents,-12345);assert.equal(saved.value.transaction_date,input.transactionDate);assert.equal(saved.value.description_raw,input.descriptionRaw);assert.equal(saved.value.status,'applied');assert.ok(saved.value.applied_at);
      assert.deepEqual((await call('/corrections',{cookie:two.cookie})).value,[]);
      assert.deepEqual((await call('/corrections',{cookie:one.cookie})).value,[saved.value]);
      assert.equal((await call(`/corrections/${saved.value.id}/undo`,{cookie:two.cookie,data:{}})).status,404);
      assert.equal((await call(`/corrections/${saved.value.id}/undo`,{cookie:one.cookie,data:{status:'applied'}})).status,400);
      for(let i=0;i<2;i++)assert.equal((await call(`/corrections/${saved.value.id}/undo`,{cookie:one.cookie,data:{}})).status,200);
      assert.deepEqual((await call('/corrections',{cookie:one.cookie})).value,[{...saved.value,status:'undone'}]);
      await admin.query("UPDATE public.categorization_corrections SET status='auto_promoted' WHERE id=$1",[saved.value.id]);
      assert.equal((await call(`/corrections/${saved.value.id}/undo`,{cookie:one.cookie,data:{}})).status,200);
      assert.deepEqual((await call('/corrections',{cookie:one.cookie})).value,[{...saved.value,status:'undone'}]);
      await assert.rejects(portalPool.query('SELECT * FROM public.categorization_corrections'),{code:'42501'});
      await assert.rejects(tenantPool.query('DELETE FROM public.categorization_corrections'),{code:'42501'});
      await assert.rejects(tenantPool.query("UPDATE public.categorization_corrections SET description_raw='untrusted'"),{code:'42501'});
      await admin.query('BEGIN');try{await admin.query('DELETE FROM public.document_uploads WHERE id=$1',[source.id]);const kept=(await admin.query('SELECT upload_id,client_id,description_raw FROM public.categorization_corrections WHERE id=$1',[saved.value.id])).rows[0];assert.equal(kept.upload_id,null);assert.equal(kept.client_id,client.id);assert.equal(kept.description_raw,input.descriptionRaw);}finally{await admin.query('ROLLBACK');}
      const other=(await call('/clients',{cookie:two.cookie})).value[0];await assert.rejects(admin.query("INSERT INTO public.categorization_corrections(bookkeeper_id,client_id,upload_id,corrected_category) VALUES($1,$2,$3,'Generated invalid reference')",[other.bookkeeper_id,other.id,source.id]),{code:'23503'});
      await admin.query('BEGIN');try{await admin.query('SET LOCAL ROLE bookdrop_app');await admin.query("SELECT set_config('bookdrop.bookkeeper_id',$1,true)",[client.bookkeeper_id]);await assert.rejects(admin.query("UPDATE public.categorization_corrections SET status='auto_promoted' WHERE id=$1",[saved.value.id]),{code:'42501'});}finally{await admin.query('ROLLBACK');}
      const current=(await call('/auth/session',{cookie:solo.cookie})).value.session;
      await admin.query('BEGIN');try{const secondary=randomUUID();await admin.query("INSERT INTO public.clients(id,bookkeeper_id,business_name,contact_email,portal_token) VALUES($1,$2,'Generated secondary fixture','fixture@example.test',$3)",[secondary,current.user.id,randomBytes(32).toString('base64url')]);await admin.query("INSERT INTO public.categorization_corrections(bookkeeper_id,client_id,corrected_category) VALUES($1,$2,'Generated hidden correction')",[current.user.id,secondary]);await admin.query('SET LOCAL ROLE bookdrop_app');await admin.query("SELECT set_config('bookdrop.bookkeeper_id',$1,true)",[current.user.id]);assert.deepEqual((await admin.query('SELECT * FROM public.categorization_corrections WHERE client_id=$1',[secondary])).rows,[]);}finally{await admin.query('ROLLBACK');}
    });
    await t.test('client detail preserves history, consent and signatories without leaking another tenant',async()=>{
      const other=(await call('/clients',{cookie:two.cookie})).value[0];
      await admin.query("INSERT INTO public.reminder_log(client_id,bookkeeper_id,period_year,period_month,reminder_number,triggered_by) VALUES ($1,$2,2025,12,1,'manual')",[client.id,client.bookkeeper_id]);
      const letter=(await admin.query("INSERT INTO public.engagement_letters(bookkeeper_id,client_id,label,storage_path,filename) VALUES ($1,$2,'Fixture letter','fixture-only/letter.pdf','letter.pdf') RETURNING id",[client.bookkeeper_id,client.id])).rows[0];
      const signatory=(await admin.query("INSERT INTO public.engagement_letter_signatories(engagement_letter_id,bookkeeper_id,signer_role,signer_name,signer_email,signer_portal_token) VALUES ($1,$2,'primary','Fixture signer','signer@example.test','fixture-signatory-token') RETURNING id",[letter.id,client.bookkeeper_id])).rows[0];
      await admin.query("INSERT INTO public.signatures(engagement_letter_id,client_id,bookkeeper_id,signer_name,signer_email,signature_image_data,portal_token_used,consent_disclosure_version,signatory_id) VALUES ($1,$2,$3,'Fixture signer','signer@example.test','fixture-image-only','fixture-token','fixture-consent',$4)",[letter.id,client.id,client.bookkeeper_id,signatory.id]);
      await assert.rejects(admin.query("INSERT INTO public.engagement_letters(bookkeeper_id,client_id,label,storage_path,filename) VALUES ($1,$2,'Refused','fixture-only/no.pdf','no.pdf')",[other.bookkeeper_id,client.id]),{code:'23503'});
      const detail=await call(`/clients/${client.id}/period`,{cookie:one.cookie,data:{year:2025,month:12}});
      assert.equal(detail.status,200); assert.equal(detail.value.reminders.length,1); assert.equal(detail.value.uploads.length,1);
      assert.equal(detail.value.letters[0].signature.consent_disclosure_version,'fixture-consent');
      assert.equal(detail.value.letters[0].signatories[0].id,signatory.id);
      const next=await call(`/clients/${client.id}/period`,{cookie:one.cookie,data:{year:2026,month:1}});
      assert.deepEqual(next.value.reminders,[]); assert.deepEqual(next.value.uploads,[]); assert.equal(next.value.letters.length,1);
      assert.equal((await call(`/clients/${client.id}/period`,{cookie:two.cookie,data:{year:2025,month:12}})).status,404);
      assert.equal((await call(`/clients/${client.id}/letters`,{cookie:two.cookie})).status,404);
      assert.equal((await call(`/clients/${client.id}/letters`,{cookie:one.cookie})).value.length,1);
      assert.equal((await call(`/clients/${client.id}/period`,{cookie:one.cookie,data:{year:2025,month:0}})).status,400);
      assert.equal((await call(`/clients/${client.id}/period`,{data:{year:2025,month:12}})).status,401);
    });
    await t.test('tearsheet preserves period uploads, nullable outcomes and tenant-only history without writable cycle claims',async()=>{
      const payload={year:2025,month:12};
      assert.equal((await call(`/clients/${client.id}/tearsheet`,{data:payload})).status,401);
      assert.equal((await call(`/clients/${client.id}/tearsheet`,{cookie:two.cookie,data:payload})).status,404);
      assert.equal((await call(`/clients/${client.id}/tearsheet`,{cookie:one.cookie})).status,405);
      assert.equal((await call(`/clients/${client.id}/tearsheet`,{cookie:one.cookie,data:{...payload,bookkeeper_id:client.bookkeeper_id}})).status,400);
      await admin.query('BEGIN');
      try {
        await admin.query('INSERT INTO public.close_cycle_outcomes(bookkeeper_id,client_id,period_year,period_month,hours_saved_minutes,accuracy_pct) VALUES($1,$2,2025,12,NULL,NULL)',[client.bookkeeper_id,client.id]);
        await admin.query('SET LOCAL ROLE bookdrop_app');
        await admin.query("SELECT set_config('bookdrop.bookkeeper_id',$1,true)",[client.bookkeeper_id]);
        assert.equal((await admin.query('SELECT accuracy_pct FROM public.close_cycle_outcomes')).rows[0].accuracy_pct,null);
        await admin.query("SELECT set_config('bookdrop.bookkeeper_id',$1,true)",[two.value.user?.id??(await call('/auth/session',{cookie:two.cookie})).value.session.user.id]);
        assert.deepEqual((await admin.query('SELECT * FROM public.close_cycle_outcomes')).rows,[]);
      } finally {await admin.query('ROLLBACK');}
      await assert.rejects(tenantPool.query('INSERT INTO public.close_cycle_outcomes(client_id,bookkeeper_id,period_year,period_month) VALUES($1,$2,2025,12)',[client.id,client.bookkeeper_id]),{code:'42501'});
      const result=await call(`/clients/${client.id}/tearsheet`,{cookie:one.cookie,data:payload});
      assert.equal(result.status,200);assert.equal(result.value.client.id,client.id);
      assert.deepEqual(result.value.outcomes,[]);assert.ok(result.value.reminders.length<=5);
      for(const requirement of result.value.requirements)for(const upload of requirement.uploads){assert.equal(upload.period_year,2025);assert.equal(upload.period_month,12);assert.equal(upload.client_id,client.id);}
      const outcome=(await admin.query('INSERT INTO public.close_cycle_outcomes(bookkeeper_id,client_id,period_year,period_month,hours_saved_minutes,accuracy_pct) VALUES($1,$2,2025,12,NULL,NULL) RETURNING id',[client.bookkeeper_id,client.id])).rows[0];
      try {
        const measured=await call(`/clients/${client.id}/tearsheet`,{cookie:one.cookie,data:payload});
        assert.equal(measured.status,200);assert.equal(measured.value.outcomes.length,1);
        assert.equal(measured.value.outcomes[0].accuracy_pct,null);assert.equal(measured.value.outcomes[0].hours_saved_minutes,null);
      } finally {await admin.query('DELETE FROM public.close_cycle_outcomes WHERE id=$1',[outcome.id]);}
      assert.equal((await call(`/clients/${client.id}/tearsheet`,{cookie:solo.cookie,data:payload})).status,404);
    });
    await t.test('portal database scope hides private fields, unrelated clients and signature details; revoked tokens stop working',async()=>{
      const token=client.portal_token, other=(await call('/clients',{cookie:two.cookie})).value[0];
      const data=await withPortal(portalPool,token,(tx,c)=>portalPeriod(tx,c,{year:2025,month:12}));
      assert.equal(data.client.id,client.id); assert.equal(data.requirements.length,1); assert.equal(data.requirements[0].uploads.length,1);
      assert.deepEqual(Object.keys(data.client).sort(),['id','business_name','contact_name','contact_email','notes_for_client'].sort());
      assert.deepEqual(Object.keys(data.bookkeeper).sort(),['full_name','practice_name','reply_to_email'].sort());
      assert.deepEqual(Object.keys((await withPortal(portalPool,token,portalLetters))[0].signature).sort(),['id','signed_at']);
      assert.equal((await withPortal(portalPool,token,tx=>tx.query('SELECT id FROM public.clients WHERE id=$1',[other.id]))).rows.length,0);
      for(const sql of ['SELECT notes_private FROM public.clients','SELECT portal_token FROM public.clients','SELECT plan FROM public.bookkeepers','SELECT signature_image_data FROM public.signatures','SELECT * FROM public.engagement_letter_signatories','SET ROLE bookdrop_app']) {
        await assert.rejects(withPortal(portalPool,token,tx=>tx.query(sql)),{code:'42501'});
      }
      assert.equal((await portalPool.query('SELECT id FROM public.clients')).rows.length,0);
      await assert.rejects(withPortal(portalPool,'invalid',portalLetters),{code:'NOT_FOUND'});
      await admin.query('UPDATE public.clients SET is_active=false WHERE id=$1',[client.id]);
      await assert.rejects(withPortal(portalPool,token,portalLetters),{code:'NOT_FOUND'});
      await admin.query('UPDATE public.clients SET is_active=true,portal_token=$2 WHERE id=$1',[client.id,randomBytes(32).toString('base64url')]);
      await assert.rejects(withPortal(portalPool,token,portalLetters),{code:'NOT_FOUND'});
      await admin.query('UPDATE public.clients SET portal_token=$2 WHERE id=$1',[client.id,token]);
    });
    await t.test('private upload/download persists bytes, refuses foreign access, corrupt files and expired grants',async()=>{
      const req=(await call(`/clients/${client.id}`,{cookie:one.cookie})).value.requirements[0];
      const route=`/clients/${client.id}/requirements/${req.id}/upload`;
      const bytes=Buffer.alloc(70000,1);
      async function upload(cookie,filename='Fixture.pdf') {
        return fixtureFetch(`${origin}/api/bookdrop${route}`,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/pdf','x-bookdrop-filename':encodeURIComponent(filename),'x-bookdrop-year':'2025','x-bookdrop-month':'12'},body:bytes});
      }
      assert.equal((await upload(two.cookie)).status,404);
      assert.equal((await upload(one.cookie,'../refused.pdf')).status,400);
      const response=await upload(one.cookie); assert.equal(response.status,200);
      const file=await response.json(); assert.equal(Number(file.file_size_bytes),bytes.length); assert.match(file.sha256,/^[a-f0-9]{64}$/);
      assert.deepEqual(await createPrivateStorage(await createLocalObjectStore(directory)).read(file.storage_path,file.file_size_bytes,file.sha256),bytes);
      const ticket=await call(`/files/${file.id}/grant`,{cookie:one.cookie,data:{kind:'document'}});
      assert.equal(ticket.status,200);
      assert.equal((await call(`/files/${file.id}/grant`,{cookie:two.cookie,data:{kind:'document'}})).status,404);
      assert.equal((await call(`/files/${file.id}/grant`,{data:{kind:'document'}})).status,401);
      async function read(cookie,grant=ticket.value.grant) {
        return fixtureFetch(`${origin}/api/bookdrop/files/${file.id}/download`,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({kind:'document',grant})});
      }
      const downloaded=await read(one.cookie); assert.equal(downloaded.status,200);
      assert.match(downloaded.headers.get('content-disposition'),/^attachment;/);
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
      assert.equal((await read(two.cookie)).status,404);
      assert.equal((await read(one.cookie,ticket.value.grant+'x')).status,403);
      grantTime+=2001; assert.equal((await read(one.cookie)).status,403);
      const fresh=await call(`/files/${file.id}/grant`,{cookie:one.cookie,data:{kind:'document'}});
      await admin.query("UPDATE public.document_uploads SET sha256=repeat('0',64) WHERE id=$1",[file.id]);
      assert.equal((await read(one.cookie,fresh.value.grant)).status,403);
      const corruptTicket=await call(`/files/${file.id}/grant`,{cookie:one.cookie,data:{kind:'document'}});
      assert.equal((await read(one.cookie,corruptTicket.value.grant)).status,503);
      const before=(await admin.query('SELECT count(*) FROM public.document_uploads')).rows[0].count;
      const failed=createApi({auth,identityPool,tenantPool,origin,grants,storage:createPrivateStorage({putIfAbsent:async()=>{throw new Error('fixture storage offline');},get:async()=>null,delete:async()=>{}})});
      const failure=await failed(new Request(`${origin}/api/bookdrop${route}`,{method:'POST',headers:{Origin:origin,Cookie:one.cookie,'Content-Type':'application/pdf','x-bookdrop-filename':'Fixture.pdf','x-bookdrop-year':'2025','x-bookdrop-month':'12'},body:bytes}));
      assert.equal(failure.status,503); assert.deepEqual(await failure.json(),{code:'STORAGE_UNAVAILABLE'});
      assert.equal((await admin.query('SELECT count(*) FROM public.document_uploads')).rows[0].count,before);
      const letterResponse=await fixtureFetch(`${origin}/api/bookdrop/clients/${client.id}/letters/upload`,{method:'POST',headers:{Origin:origin,Cookie:one.cookie,'Content-Type':'application/pdf','x-bookdrop-filename':'Letter.pdf','x-bookdrop-label':'Fixture%20letter'},body:Buffer.from('fixture letter bytes')});
      assert.equal(letterResponse.status,200);
      const letterFile=await letterResponse.json();
      assert.equal((await call(`/files/${letterFile.id}/grant`,{cookie:one.cookie,data:{kind:'letter'}})).status,200);
    });
    await t.test('portal HTTP uploads/downloads require active token and reject foreign references, owner operations and token URLs',async()=>{
      const token=client.portal_token, other=(await call('/clients',{cookie:two.cookie})).value[0];
      const req=(await call(`/clients/${client.id}`,{cookie:one.cookie})).value.requirements[0];
      const period=await call('/portal/period',{portalToken:token,data:{year:2025,month:12}});
      assert.equal(period.status,200);assert.equal(period.value.client.id,client.id);
      assert.equal((await call('/portal/period',{data:{year:2025,month:12}})).status,404);
      assert.equal((await call('/portal/period',{portalToken:token,data:{year:2025,month:12,clientId:other.id}})).status,400);
      assert.equal((await call('/portal/period',{portalToken:token,originHeader:'https://other.example',data:{year:2025,month:12}})).status,403);
      assert.equal((await fixtureFetch(`${origin}/api/bookdrop/portal/period?token=${token}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({year:2025,month:12})})).status,403);
      assert.equal((await call('/portal/clients',{portalToken:token,data:{}})).status,404);
      assert.equal((await call('/portal/letters',{portalToken:token,data:{}})).status,200);
      const bytes=Buffer.alloc(70001,2);
      async function upload(clientId=client.id,requirementId=req.id,portalToken=token) {
        return fixtureFetch(`${origin}/api/bookdrop/portal/clients/${clientId}/requirements/${requirementId}/upload`,{method:'POST',headers:{Origin:origin,'x-bookdrop-portal':portalToken,'Content-Type':'application/pdf','x-bookdrop-filename':'Portal.pdf','x-bookdrop-year':'2025','x-bookdrop-month':'12'},body:bytes});
      }
      assert.equal((await upload(other.id)).status,404);
      const foreignReq=(await call(`/clients/${other.id}`,{cookie:two.cookie})).value.requirements[0];
      assert.equal((await upload(client.id,foreignReq.id)).status,404);
      const uploaded=await upload();assert.equal(uploaded.status,200);const file=await uploaded.json();
      assert.equal(file.bookkeeper_id,client.bookkeeper_id);assert.equal(Number(file.file_size_bytes),bytes.length);
      const ticket=await call(`/portal/files/${file.id}/grant`,{portalToken:token,data:{kind:'document'}});
      assert.equal(ticket.status,200);
      const download=await fixtureFetch(`${origin}/api/bookdrop/portal/files/${file.id}/download`,{method:'POST',headers:{Origin:origin,'x-bookdrop-portal':token,'Content-Type':'application/json'},body:JSON.stringify({kind:'document',grant:ticket.value.grant})});
      assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
      assert.equal((await call(`/portal/files/${file.id}/grant`,{portalToken:other.portal_token,data:{kind:'document'}})).status,404);
      assert.equal((await call(`/portal/clients/${client.id}/letters/upload`,{portalToken:token,data:{}})).status,403);
      assert.equal((await call(`/portal/files/${file.id}/download`,{portalToken:token,data:{kind:'document',grant:'tampered'}})).status,403);
      await admin.query('UPDATE public.clients SET portal_token=$2 WHERE id=$1',[client.id,randomBytes(32).toString('base64url')]);
      assert.equal((await call(`/portal/files/${file.id}/download`,{portalToken:token,data:{kind:'document',grant:ticket.value.grant}})).status,404);
      await admin.query('UPDATE public.clients SET portal_token=$2 WHERE id=$1',[client.id,token]);
      const unavailable=createApi({auth,identityPool,tenantPool,origin,storage,grants});
      const refused=await unavailable(new Request(`${origin}/api/bookdrop/portal/letters`,{method:'POST',headers:{Origin:origin,'x-bookdrop-portal':token,'Content-Type':'application/json'},body:'{}'}));
      assert.equal(refused.status,503);
    });
    await t.test('two-way messaging derives participants, persists private attachments, and denies foreign/portal escalation',async()=>{
      const base=`/clients/${client.id}/messages`;
      assert.equal((await call(`${base}/list`,{data:{}})).status,401);
      assert.equal((await call(`${base}/list`,{cookie:two.cookie,data:{}})).status,404);
      assert.equal((await call(`${base}/list`,{cookie:solo.cookie,data:{}})).status,404);
      assert.equal((await call(`${base}/list`,{cookie:one.cookie,data:{bookkeeper_id:client.bookkeeper_id}})).status,400);
      const send=async(portal=false,extra=false)=>{
        const form=new FormData();form.append('content',portal?'Generated client reply':'Generated bookkeeper message');
        form.append('attachments',new Blob(['generated private message fixture'],{type:'application/pdf'}),'fixture.pdf');
        if(extra)form.append('sender_type','bookkeeper');
        const response=await fixtureFetch(`${origin}/api/bookdrop${portal?'/portal':''}${base}/send`,{method:'POST',headers:{Origin:origin,...(portal?{'x-bookdrop-portal':client.portal_token}:{Cookie:one.cookie})},body:form});
        return {status:response.status,value:await response.json()};
      };
      assert.equal((await send(true,true)).status,400);
      const sent=await send();assert.equal(sent.status,200);assert.equal(sent.value.sender_type,'bookkeeper');
      const reply=await send(true);assert.equal(reply.status,200);assert.equal(reply.value.sender_type,'client');
      assert.equal(sent.value.attachments.length,1);assert.equal(sent.value.attachments[0].file_size,Buffer.byteLength('generated private message fixture'));assert.ok(!Object.hasOwn(sent.value.attachments[0],'storage_path'));
      const visible=await call(`/portal${base}/list`,{portalToken:client.portal_token,data:{}});assert.equal(visible.status,200);assert.equal(visible.value.length,2);
      assert.equal((await call('/portal/messages/threads',{portalToken:client.portal_token,data:{}})).status,404);
      assert.equal((await call(`/portal/clients/${randomUUID()}/messages/list`,{portalToken:client.portal_token,data:{}})).status,404);
      assert.equal((await call('/messages/unread',{cookie:one.cookie})).value.count,1);
      assert.equal((await call('/messages/threads',{cookie:one.cookie})).value[0].client_id,client.id);
      assert.deepEqual((await call('/messages/threads',{cookie:two.cookie})).value,[]);
      assert.equal((await call(`${base}/read`,{cookie:one.cookie,data:{}})).status,200);
      assert.equal((await call(`${base}/read`,{cookie:one.cookie,data:{}})).status,200);
      assert.equal((await call('/messages/unread',{cookie:one.cookie})).value.count,0);
      let receipts=(await call(`${base}/list`,{cookie:one.cookie,data:{}})).value;
      assert.equal(receipts.find(row=>row.id===sent.value.id).read_at,null);assert.ok(receipts.find(row=>row.id===reply.value.id).read_at);
      assert.equal((await call(`/portal${base}/read`,{portalToken:client.portal_token,data:{}})).status,200);
      receipts=(await call(`${base}/list`,{cookie:one.cookie,data:{}})).value;assert.ok(receipts.every(row=>row.read_at));
      await assert.rejects(tenantPool.query("UPDATE public.messages SET sender_type='client'"),{code:'42501'});
      await assert.rejects(portalPool.query("UPDATE public.messages SET content='untrusted'"),{code:'42501'});
      const file=sent.value.attachments[0],ticket=await call(`/portal/files/${file.id}/grant`,{portalToken:client.portal_token,data:{kind:'message'}});
      assert.equal(ticket.status,200);
      const bytes=await fixtureFetch(`${origin}/api/bookdrop/portal/files/${file.id}/download`,{method:'POST',headers:{Origin:origin,'x-bookdrop-portal':client.portal_token,'Content-Type':'application/json'},body:JSON.stringify({kind:'message',grant:ticket.value.grant})});
      assert.equal(bytes.status,200);assert.equal(await bytes.text(),'generated private message fixture');
      assert.equal((await call(`/files/${file.id}/grant`,{cookie:two.cookie,data:{kind:'message'}})).status,404);
      const before=(await admin.query('SELECT count(*) FROM public.messages')).rows[0].count;
      const failedApi=createApi({auth,identityPool,tenantPool,origin,storage:{journaled:true,save:async()=>{throw new Error('generated offline fixture');}}});
      const form=new FormData();form.append('content','Generated rollback message');form.append('attachments',new Blob(['fixture'],{type:'application/pdf'}),'fixture.pdf');
      const failed=await failedApi(new Request(`${origin}/api/bookdrop${base}/send`,{method:'POST',headers:{Origin:origin,Cookie:one.cookie},body:form}));
      assert.equal(failed.status,503);assert.equal((await admin.query('SELECT count(*) FROM public.messages')).rows[0].count,before);
      await admin.query('UPDATE public.clients SET is_active=false WHERE id=$1',[client.id]);
      assert.equal((await call(`/portal${base}/list`,{portalToken:client.portal_token,data:{}})).status,404);
      await admin.query('UPDATE public.clients SET is_active=true WHERE id=$1',[client.id]);
    });
    await t.test('upload notifications are durable, owner-scoped and idempotently readable without portal or field escalation',async()=>{
      assert.equal((await call('/notifications')).status,401);
      const items=await call('/notifications',{cookie:one.cookie});assert.equal(items.status,200);assert.ok(items.value.length>0);
      const item=items.value[0];assert.equal(item.client_id,client.id);assert.equal(item.action_url,`/clients/${client.id}`);
      assert.ok(['upload_complete','upload_partial'].includes(item.type));assert.ok(!Object.hasOwn(item,'bookkeeper_id'));
      assert.deepEqual((await call('/notifications',{cookie:two.cookie})).value,[]);
      assert.equal((await call(`/notifications/${item.id}/read`,{cookie:two.cookie,data:{}})).status,404);
      assert.equal((await call(`/notifications/${item.id}/read`,{cookie:one.cookie,data:{bookkeeper_id:client.bookkeeper_id}})).status,400);
      const before=(await call('/notifications/unread',{cookie:one.cookie})).value.count;
      assert.equal((await call(`/notifications/${item.id}/read`,{cookie:one.cookie,data:{}})).status,200);
      assert.equal((await call(`/notifications/${item.id}/read`,{cookie:one.cookie,data:{}})).status,200);
      assert.equal((await call('/notifications/unread',{cookie:one.cookie})).value.count,before-1);
      assert.equal((await call('/notifications/read-all',{cookie:one.cookie,data:{}})).status,200);
      assert.equal((await call('/notifications/unread',{cookie:one.cookie})).value.count,0);
      assert.equal((await call('/portal/notifications',{portalToken:client.portal_token,data:{}})).status,404);
      await assert.rejects(portalPool.query('SELECT * FROM public.notifications'),{code:'42501'});
      await assert.rejects(tenantPool.query("UPDATE public.notifications SET title='untrusted title'"),{code:'42501'});
      const source=(await admin.query('SELECT source_upload_id FROM public.notifications WHERE id=$1',[item.id])).rows[0].source_upload_id;
      await admin.query('UPDATE public.document_uploads SET uploaded_at=uploaded_at WHERE id=$1',[source]);
      assert.equal((await admin.query('SELECT count(*) FROM public.notifications WHERE source_upload_id=$1',[source])).rows[0].count,'1');
      const foreign=(await admin.query('SELECT id,bookkeeper_id,business_name FROM public.clients WHERE bookkeeper_id<>$1 LIMIT 1',[client.bookkeeper_id])).rows[0];
      await admin.query('BEGIN');
      try {
        await admin.query('DELETE FROM public.notifications WHERE id=$1',[item.id]);
        await assert.rejects(admin.query("INSERT INTO public.notifications(bookkeeper_id,client_id,source_upload_id,type,title,body,client_name,action_url) VALUES ($1,$2,$3,'upload_partial','Fixture','Fixture',$4,$5)",[foreign.bookkeeper_id,foreign.id,source,foreign.business_name,`/clients/${foreign.id}`]),{code:'23503'});
      } finally {await admin.query('ROLLBACK');}
      const count=(await admin.query('SELECT count(*) FROM public.notifications')).rows[0].count;
      await admin.query('BEGIN');
      try {
        await admin.query("INSERT INTO public.document_uploads(id,requirement_id,client_id,bookkeeper_id,period_year,period_month,filename_original,storage_path) VALUES ($1,$2,$3,$4,2025,12,'Rollback fixture.pdf','generated-rollback-fixture')",[randomUUID(),client.requirements?.[0]?.id??(await admin.query('SELECT id FROM public.document_requirements WHERE client_id=$1 LIMIT 1',[client.id])).rows[0].id,client.id,client.bookkeeper_id]);
        assert.equal(Number((await admin.query('SELECT count(*) FROM public.notifications')).rows[0].count),Number(count)+1);
      } finally {await admin.query('ROLLBACK');}
      assert.equal((await admin.query('SELECT count(*) FROM public.notifications')).rows[0].count,count);
    });
    await t.test('notification RLS preserves the solo self-client boundary even for legacy same-owner client rows',async()=>{
      const current=(await call('/auth/session',{cookie:solo.cookie})).value.session;
      await admin.query('BEGIN');
      try {
        const secondary=randomUUID(),requirement=randomUUID();
        await admin.query("INSERT INTO public.clients(id,bookkeeper_id,business_name,contact_email,portal_token) VALUES ($1,$2,'Generated secondary solo fixture','fixture@example.test',$3)",[secondary,current.user.id,randomBytes(32).toString('base64url')]);
        await admin.query("INSERT INTO public.document_requirements(id,client_id,label) VALUES ($1,$2,'Generated requirement')",[requirement,secondary]);
        await admin.query("INSERT INTO public.document_uploads(requirement_id,client_id,bookkeeper_id,period_year,period_month,filename_original,storage_path) VALUES ($1,$2,$3,2025,12,'Fixture.pdf','generated-solo-fixture')",[requirement,secondary,current.user.id]);
        await admin.query('SET LOCAL ROLE bookdrop_app');
        await admin.query("SELECT set_config('bookdrop.bookkeeper_id',$1,true)",[current.user.id]);
        assert.deepEqual((await admin.query('SELECT * FROM public.notifications')).rows,[]);
      } finally {await admin.query('ROLLBACK');}
    });
    await t.test('concurrent creates cannot exceed the server-derived free plan limit',async()=>{
      const results=await Promise.all([1,2,3,4].map(i=>call('/clients',{cookie:one.cookie,data:clientInput(`Concurrent ${i}`)})));
      assert.equal(results.filter(r=>r.status===200).length,2);
      assert.equal(results.filter(r=>r.value.code==='PLAN_LIMIT').length,2);
      assert.equal((await call('/clients',{cookie:one.cookie})).value.length,3);
    });
    await t.test('solo accounts see only self-client and cannot create additional clients',async()=>{
      assert.equal((await call('/clients',{cookie:solo.cookie})).value.length,1);
      assert.equal((await call('/clients',{cookie:solo.cookie,data:clientInput()})).status,403);
    });
    await t.test('logout revokes the old cookie; bad passwords and expired sessions are denied',async()=>{
      assert.equal((await call('/auth/sign-in',{data:{email:'one@example.test',password:'wrong-fixture'}})).status,401);
      assert.equal((await call('/auth/sign-out',{cookie:one.cookie,data:{}})).status,200);
      assert.equal((await call('/auth/session',{cookie:one.cookie})).value.session,null);
      assert.equal((await call('/clients',{cookie:one.cookie})).status,401);
      const login=await call('/auth/sign-in',{data:{email:'one@example.test',password:'fixture-password-123!'}});
      assert.equal(login.status,200); one=login;
      await admin.query('UPDATE local_auth.session SET "expiresAt"=now()-interval \'1 minute\'');
      assert.equal((await call('/auth/session',{cookie:one.cookie})).value.session,null);
      assert.equal((await call('/auth/sign-in',{data:{email:'one@example.test',password:'wrong-fixture'}})).status,401);
      assert.equal((await call('/auth/sign-in',{data:{email:'one@example.test',password:'wrong-fixture'}})).status,429);
    });
    await t.test('password recovery uses an injected local inbox, replaces password and rejects token reuse',async()=>{
      // The installed provider permits three sign-in requests per ten seconds.
      // Let that real window expire; do not disable or clear the limiter.
      await new Promise(resolve=>setTimeout(resolve,11000));
      const beforeReset=await call('/auth/sign-in',{data:{email:'one@example.test',password:'fixture-password-123!'}});
      assert.equal(beforeReset.status,200);
      assert.equal((await call('/auth/reset-password',{data:{email:'one@example.test'}})).status,200);
      assert.equal(resets.length,1);
      const recoveryUrl=new URL(resets[0].url);
      assert.equal(recoveryUrl.origin,origin);
      assert.equal(recoveryUrl.pathname,'/reset-password');
      assert.equal(recoveryUrl.search,'');
      const token=new URLSearchParams(recoveryUrl.hash.slice(1)).get('token');
      assert.ok(token);
      assert.equal((await call('/auth/update-password',{data:{token,password:'replacement-fixture-123!'}})).status,200);
      assert.equal((await call('/auth/session',{cookie:beforeReset.cookie})).value.session,null);
      assert.equal((await call('/auth/update-password',{data:{token,password:'another-fixture-123!'}})).status,400);
      assert.equal((await call('/auth/sign-in',{data:{email:'one@example.test',password:'fixture-password-123!'}})).status,401);
      const login=await call('/auth/sign-in',{data:{email:'one@example.test',password:'replacement-fixture-123!'}});
      assert.equal(login.status,200); one=login;
      const noRecovery=createApi({auth,identityPool,tenantPool,origin});
      const response=await noRecovery(new Request(`${origin}/api/bookdrop/auth/reset-password`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'one@example.test'})}));
      assert.equal(response.status,503);
    });
    await t.test('upload journal survives metadata rollback; reconciliation waits for active uploads and preserves references',async()=>{
      await assert.rejects(tenantPool.query('SELECT * FROM app_private.file_upload_intents'),{code:'42501'});
      await assert.rejects(intentPool.query('SELECT * FROM app_private.file_upload_intents'),{code:'42501'});
      assert.equal((await reconcileOneUpload(cleanupPool)).status,'empty');
      const fileId=randomUUID(), key=`${client.bookkeeper_id}/${client.id}/orphan/${fileId}`;
      const bytes=Buffer.from('generated orphan fixture');
      const req=(await admin.query('SELECT id FROM public.document_requirements WHERE client_id=$1',[client.id])).rows[0];
      await admin.query('BEGIN');
      try {
        await admin.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
        const saved=await storage.save(key,bytes,'application/pdf');
        await assert.rejects(admin.query('INSERT INTO public.document_uploads(id,requirement_id,client_id,bookkeeper_id,period_year,period_month,filename_original,storage_path,file_size_bytes,sha256,content_type) VALUES($1,$2,$3,$4,2025,13,$5,$6,$7,$8,$9)',[fileId,req.id,client.id,client.bookkeeper_id,'orphan.pdf',key,saved.size,saved.sha256,'application/pdf']),{code:'23514'});
      } finally {await admin.query('ROLLBACK');}
      const orphan=(await admin.query('SELECT * FROM app_private.file_upload_intents WHERE object_key=$1',[key])).rows[0];
      assert.ok(orphan);assert.deepEqual(await objects.get(key),bytes);
      assert.equal((await admin.query('SELECT id FROM public.document_uploads WHERE id=$1',[fileId])).rows.length,0);
      await admin.query("UPDATE app_private.file_upload_intents SET not_before=now()-interval '1 second' WHERE id=$1",[orphan.id]);
      await admin.query('BEGIN');
      try {
        await admin.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
        assert.equal((await reconcileOneUpload(cleanupPool)).status,'busy');
        assert.equal((await processOneFileCleanup(cleanupPool,objects)).status,'empty');
      } finally {await admin.query('ROLLBACK');}
      await admin.query("UPDATE app_private.file_upload_intents SET not_before=now()-interval '1 second' WHERE status='pending'");
      const intents=(await admin.query("SELECT count(*) FROM app_private.file_upload_intents WHERE status='pending'")).rows[0];
      const results=[];for(let index=0;index<Number(intents.count);index++)results.push(await reconcileOneUpload(cleanupPool));
      assert.equal(results.filter(result=>result.status==='queued').length,1);
      assert.ok(results.some(result=>result.status==='referenced'));
      assert.equal((await reconcileOneUpload(cleanupPool)).status,'empty');
      assert.equal((await processOneFileCleanup(cleanupPool,objects)).status,'deleted');
      assert.equal(await objects.get(key),null);
      // Simulate a lost completion acknowledgement: retry finds already-missing bytes.
      await admin.query("UPDATE app_private.file_cleanup SET status='pending',not_before=now()-interval '1 second' WHERE source_id=$1",[orphan.id]);
      assert.equal((await processOneFileCleanup(cleanupPool,objects)).status,'missing');
      const referenced=(await admin.query("SELECT * FROM app_private.file_upload_intents WHERE status='referenced' LIMIT 1")).rows[0];
      await admin.query("INSERT INTO app_private.file_cleanup(owner_id,object_key,sha256,size_bytes,source_table,source_id,status,not_before) VALUES($1,$2,$3,$4,'fixture_probe',$5,'pending',now())",[referenced.owner_id,referenced.object_key,referenced.sha256,referenced.size_bytes,referenced.id]);
      assert.equal((await processOneFileCleanup(cleanupPool,objects)).status,'review');
      assert.ok(await objects.get(referenced.object_key));
    });
    await t.test('deletion cascades owned requirements; reused pool connections expose no tenant context',async()=>{
      assert.equal((await call(`/clients/${client.id}/delete`,{cookie:one.cookie,data:{}})).status,200,JSON.stringify(apiFailures.slice(-3)));
      assert.equal((await call(`/clients/${client.id}`,{cookie:one.cookie})).status,404);
      assert.equal((await tenantPool.query('SELECT count(*) FROM public.clients')).rows[0].count,'0');
      assert.equal((await admin.query('SELECT count(*) FROM public.document_requirements WHERE client_id=$1',[client.id])).rows[0].count,'0');
      assert.equal((await admin.query('SELECT count(*) FROM public.document_uploads WHERE client_id=$1',[client.id])).rows[0].count,'0');
    });
    await t.test('committed cascade queues exact private cleanup; grace, hash refusal and storage retry preserve bytes',async()=>{
      const jobs=(await admin.query("SELECT * FROM app_private.file_cleanup WHERE owner_id=$1 AND source_table IN ('document_uploads','engagement_letters','signatures','message_attachments') ORDER BY created_at,id",[client.bookkeeper_id])).rows;
      assert.ok(jobs.length>=4);assert.ok(jobs.some(job=>job.status==='review'));
      assert.ok(jobs.every(job=>new Date(job.not_before)>new Date(job.created_at)));
      assert.equal((await processOneFileCleanup(cleanupPool,objects)).status,'empty');
      await assert.rejects(tenantPool.query('SELECT * FROM app_private.file_cleanup'),{code:'42501'});
      await assert.rejects(cleanupPool.query('SELECT filename_original FROM public.document_uploads'),{code:'42501'});
      const pending=jobs.filter(job=>job.status==='pending');assert.ok(pending.length>=3);
      await admin.query("UPDATE app_private.file_cleanup SET not_before=now()-interval '1 second' WHERE status='pending'");
      const offline={...objects,get:async()=>{throw new Error('fixture offline');}};
      const failed=await processOneFileCleanup(cleanupPool,offline);assert.equal(failed.status,'retry');
      assert.ok(await objects.get(jobs.find(job=>job.id===failed.id).object_key));
      await admin.query("UPDATE app_private.file_cleanup SET not_before=now()-interval '1 second' WHERE status='pending'");
      const outcomes=[];
      for(let index=0;index<pending.length;index++)outcomes.push(await processOneFileCleanup(cleanupPool,objects));
      assert.equal(outcomes.filter(result=>result.status==='review').length,1);
      assert.equal(outcomes.filter(result=>result.status==='deleted').length,pending.length-1);
      for(const result of outcomes){const job=jobs.find(job=>job.id===result.id);assert.equal((await objects.get(job.object_key))===null,result.status==='deleted');}
      assert.equal((await processOneFileCleanup(cleanupPool,objects)).status,'empty');
      assert.equal((await admin.query('SELECT count(*) FROM public.clients')).rows[0].count,'4');
    });
    await t.test('unavailable tenant pool returns a stable failure without SQL or identity details',async()=>{
      const ended=pool('bd_test_api');await ended.end();
      const failures=[];
      const failedApi=createApi({auth,identityPool,tenantPool:ended,origin,onFailure:event=>failures.push(event)});
      const failed=await failedApi(new Request(`${origin}/api/bookdrop/clients`,{headers:{Cookie:one.cookie}}));
      assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{code:'UNAVAILABLE'});
      assert.deepEqual(failures,[{status:'failed',code:'API_UNAVAILABLE',stage:'tenant',cause:'UNKNOWN'}]);
      const sensitive=new Error('fixture@example.test secret SQL');sensitive.code='fixture-secret-value';
      const privateFailure=createApi({auth,identityPool,tenantPool:{connect:async()=>{throw sensitive;}},origin,onFailure:event=>failures.push(event)});
      assert.equal((await privateFailure(new Request(`${origin}/api/bookdrop/clients`,{headers:{Cookie:one.cookie}}))).status,503);
      assert.deepEqual(failures[1],failures[0]);
    });
    await t.test('runtime worker schedules bounded reconciliation/cleanup and pauses through a recovery window',async()=>{
      const makeOrphan=async()=>{
        const key=`${client.bookkeeper_id}/${randomUUID()}/runtime/${randomUUID()}`;
        await storage.save(key,Buffer.from('generated scheduled job fixture'),'application/pdf');
        await admin.query("UPDATE app_private.file_upload_intents SET not_before=now()-interval '1 second' WHERE object_key=$1",[key]);return key;
      };
      const first=await makeOrphan();runtime.jobs.start(1000);
      for(let attempt=0;attempt<30 && await objects.get(first)!==null;attempt++)await new Promise(resolve=>setTimeout(resolve,100));
      assert.equal(await objects.get(first),null);
      await runtime.jobs.pause();const second=await makeOrphan();
      await new Promise(resolve=>setTimeout(resolve,1100));
      assert.equal((await runtime.jobs.runOnce()).status,'paused');assert.ok(await objects.get(second));
      runtime.jobs.resume();const result=await runtime.jobs.runOnce();
      assert.equal(result.status,'pass');assert.equal(result.counts.deleted,1);assert.equal(await objects.get(second),null);
    });
    await t.test('runtime restarts with persistent database identity, session, client data and private bytes',async()=>{
      const key=`${client.bookkeeper_id}/${randomUUID()}/restart/${randomUUID()}`,bytes=Buffer.from('generated persistent restart fixture');
      await storage.save(key,bytes,'application/pdf');
      await runtime.close();await runtime.close();assert.equal(runtime.jobs.state.stopped,true);
      runtime=await startLocalRuntime(runtimeConfig);
      assert.equal((await call('/auth/session',{cookie:one.cookie})).value.session.bookkeeper.id,client.bookkeeper_id);
      assert.equal((await call('/clients',{cookie:one.cookie})).value.length,2);
      assert.deepEqual(await runtime.objects.get(key),bytes);
    });
    await t.test('operator command starts from process configuration, preserves sessions and stops with platform signal semantics',async()=>{
      await runtime.close();
      const env={...Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'].filter(name=>process.env[name]).map(name=>[name,process.env[name]])),BOOKDROP_LOCAL_DB_HOST:native?'127.0.0.1':'/pgsocket',BOOKDROP_LOCAL_DB_PORT:String(fixturePort),BOOKDROP_LOCAL_DB_NAME:fixtureDatabase,BOOKDROP_LOCAL_ORIGIN:origin,BOOKDROP_LOCAL_API_PORT:new URL(origin).port,BOOKDROP_LOCAL_OBJECT_DIRECTORY:directory,BOOKDROP_LOCAL_AUTH_SECRET:secret,BOOKDROP_LOCAL_DOWNLOAD_SECRET:runtimeConfig.downloadSecret};
      for(const [name,connection]of Object.entries(connections)){
        env[`BOOKDROP_LOCAL_${name.toUpperCase()}_USER`]=connection.user;
        env[`BOOKDROP_LOCAL_${name.toUpperCase()}_PASSWORD`]=connection.password;
      }
      const child=spawn(process.execPath,[fileURLToPath(new URL('./start-local.mjs',import.meta.url))],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
      let output='',errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
      const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
      try {
        await new Promise((resolve,reject)=>{
          const deadline=setTimeout(()=>reject(new Error('OPERATOR_START_TIMEOUT')),10000);
          child.once('error',()=>{clearTimeout(deadline);reject(new Error('OPERATOR_START_FAILED'));});
          child.once('exit',()=>{clearTimeout(deadline);reject(new Error('OPERATOR_EARLY_EXIT'));});
          child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('"status":"ready"')){clearTimeout(deadline);resolve();}});
        });
        assert.equal((await call('/auth/session',{cookie:one.cookie})).value.session.bookkeeper.id,client.bookkeeper_id);
        assert.equal((await call('/auth/reset-password',{data:{email:'one@example.test'}})).status,503);
        child.kill('SIGTERM');
        const result=await Promise.race([exited,new Promise((_,reject)=>{const deadline=setTimeout(()=>reject(new Error('OPERATOR_STOP_TIMEOUT')),7000);deadline.unref();})]);
        assert.deepEqual(result,native?{code:null,signal:'SIGTERM'}:{code:0,signal:null});assert.equal(errors,'');
        assert.deepEqual(JSON.parse(output.trim()),{status:'ready',jobsEnabled:false});
      } finally {if(child.exitCode===null)child.kill('SIGKILL');}
    });
  } finally {
    await runtime?.close();
    await Promise.allSettled(pools.map(p=>p.end()));
  }
});
