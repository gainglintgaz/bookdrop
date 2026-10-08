import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { localUiOptions,startLocalUi } from './start-local-ui.mjs';

const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const close=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
test('UI configuration rejects non-loopback, credentials, query and API/UI port collision',()=>{
  for(const origin of ['https://example.test','http://localhost:5173','http://127.0.0.1:5173?token=fixture','http://user:fixture@127.0.0.1:5173'])assert.throws(()=>localUiOptions({BOOKDROP_LOCAL_ORIGIN:origin}),/LOCAL_UI_CONFIGURATION_REQUIRED/);
  assert.throws(()=>localUiOptions({BOOKDROP_LOCAL_API_PORT:'5173'}),/LOCAL_UI_CONFIGURATION_REQUIRED/);
  const options=localUiOptions({});assert.equal(options.envDir,false);assert.equal(options.envFile,false);assert.equal(options.configFile,false);
});
test('real UI serves local mode, preserves API Host/Origin and refuses files outside the checkout',{timeout:30000},async()=>{
  const requests=[];
  const api=createServer((request,response)=>{requests.push({host:request.headers.host,origin:request.headers.origin,path:request.url});response.setHeader('Content-Type','application/json');response.end(JSON.stringify({ok:true}));});
  const reservation=createServer();let ui;
  try {
    const apiPort=await listen(api),uiPort=await listen(reservation);await close(reservation);
    const origin=`http://127.0.0.1:${uiPort}`;
    process.env.VITE_FIXTURE_SECRET='fixture-never-expose';
    ui=await startLocalUi({BOOKDROP_LOCAL_ORIGIN:origin,BOOKDROP_LOCAL_API_PORT:String(apiPort)});
    const request=(route,options)=>fetch(origin+route,{...options,signal:AbortSignal.timeout(5000)});
    const index=await request('/upload/generated-fixture-token');assert.equal(index.status,200);assert.match(await index.text(),/name="referrer" content="no-referrer"/);
    const module=await request('/src/lib/mode.ts');const source=await module.text();assert.equal(module.status,200);assert.match(source,/"VITE_MODE"\s*:\s*"local"/);assert.ok(!source.includes('fixture-never-expose'));
    const proxied=await request('/api/bookdrop/fixture',{headers:{Origin:origin}});assert.deepEqual(await proxied.json(),{ok:true});
    assert.deepEqual(requests,[{host:`127.0.0.1:${uiPort}`,origin,path:'/api/bookdrop/fixture'}]);
    await request('/api/other');assert.equal(requests.length,1);
    const outside=await mkdtemp(path.join(tmpdir(),'bookdrop-ui-private-'));
    const privateFile=path.join(outside,'generated-private-fixture.txt');await writeFile(privateFile,'generated private fixture');
    const refused=await request('/@fs/'+privateFile.replaceAll('\\','/'));assert.equal(refused.status,403);assert.ok(!(await refused.text()).includes('generated private fixture'));
  } finally {
    await ui?.close();await close(api);if(reservation.listening)await close(reservation);
    const esbuild=await import('esbuild');esbuild.stop();
  }
});
