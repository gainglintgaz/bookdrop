import { spawnSync } from 'node:child_process';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { readFileSync,readdirSync,mkdtempSync,writeFileSync,existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

if(process.platform!=='win32')throw new Error('WINDOWS_NATIVE_FIXTURE_REQUIRED');
const root=fileURLToPath(new URL('../../server',import.meta.url));
if(readdirSync(root).some(name=>/^\.env|credential|^\.npmrc$/i.test(name)))throw new Error('SANITIZED_SERVER_DIRECTORY_REQUIRED');
const database='bookdrop_fixture_'+randomUUID().replaceAll('-','');
const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','Path','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const record=mkdtempSync(path.join(os.tmpdir(),'bookdrop-native-pg-'));
const cluster=path.join(record,'cluster');
// Disable libpq's implicit credential/configuration files. The generated cluster
// trusts local fixture connections; this does not verify password authentication.
env.PGPASSFILE=path.join(record,'absent-password-file');
env.PGSERVICEFILE=path.join(record,'absent-service-file');
const located=spawnSync('where.exe',['postgres.exe'],{env,encoding:'utf8',windowsHide:true,timeout:10000});
const executable=located.status===0?located.stdout.trim().split(/\r?\n/)[0]:'';
if(!path.isAbsolute(executable)||executable.startsWith('\\\\'))throw new Error('LOCAL_POSTGRES_BINARY_REQUIRED');
const bin=path.dirname(executable);
for(const name of ['postgres','initdb','pg_ctl','psql'])if(!existsSync(path.join(bin,name+'.exe')))throw new Error('LOCAL_POSTGRES_BINARY_REQUIRED');
function command(name,args,timeout=30000){
  // A detached Windows server may inherit pg_ctl's pipes. Its own log is
  // explicit; do not wait for that long-lived server to close captured handles.
  const result=spawnSync(path.join(bin,name+'.exe'),args,{env,encoding:'utf8',windowsHide:true,timeout,...(name==='pg_ctl'?{stdio:'ignore'}:{})});
  if(result.error||result.status!==0)throw new Error('LOCAL_POSTGRES_'+(result.error?.code==='ETIMEDOUT'?'TIMEOUT':'FAILED')+':'+name);
  return (result.stdout??'').trim();
}
const version=command('postgres',['--version']);
if(!/^postgres \(PostgreSQL\) (17|18)\./.test(version))throw new Error('LOCAL_POSTGRES_VERSION_UNVERIFIED');
const sources=readdirSync(root).filter(name=>/\.(?:mjs|ts|json)$/.test(name)).map(name=>path.join(root,name));
sources.push(...readdirSync(path.join(root,'db')).filter(name=>/\.(?:sql|ts)$/.test(name)).map(name=>path.join(root,'db',name)));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const hashes=sources.map(file=>({path:path.relative(root,file).replaceAll('\\','/'),sha256:hash(file)}));
writeFileSync(path.join(record,'source-hashes.json'),JSON.stringify(hashes,null,2)+'\n',{flag:'wx'});
async function unusedPort(){
  const reserve=createServer();
  const port=await new Promise((resolve,reject)=>{reserve.once('error',reject);reserve.listen(0,'127.0.0.1',()=>resolve(reserve.address().port));});
  await new Promise(resolve=>reserve.close(resolve));
  return port;
}
let startAttempted=false;
try {
  command('initdb',['-D',cluster,'-A','trust','-U','postgres','--encoding=UTF8','--no-locale'],60000);
  const databasePort=await unusedPort();
  startAttempted=true;
  command('pg_ctl',['start','-D',cluster,'-l',path.join(record,'startup.log'),'-w','-t','30','-o','-h 127.0.0.1 -p '+databasePort],40000);
  const psql=['-X','--no-password','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(databasePort),'-U','postgres','-d','postgres','-At'];
  const actualDirectory=command('psql',[...psql,'-c',"SELECT current_setting('data_directory')"]);
  if(path.resolve(actualDirectory).toLowerCase()!==path.resolve(cluster).toLowerCase())throw new Error('LOCAL_FIXTURE_IDENTITY_MISMATCH');
  // Only our freshly initialized cluster may receive DDL. This identifier is
  // generated and cannot select an operator's existing database.
  command('psql',[...psql,'-c','CREATE DATABASE '+database]);
  const port=await unusedPort();
  writeFileSync(path.join(record,'fixture.json'),JSON.stringify({database,cluster,databasePort,origin:'http://127.0.0.1:'+port,postgres:version,node:process.version,scope:'generated local data; loopback only; fixture database authentication uses trust'},null,2)+'\n',{flag:'wx'});
  console.log('Fixture stage: isolated native '+version+'; generated database ready');
  const result=spawnSync(process.execPath,['--test',path.join(root,'local-api.integration.mjs')],{env:{...env,BOOKDROP_TEST_NATIVE:'1',BOOKDROP_TEST_DATABASE:database,BOOKDROP_TEST_PORT:String(databasePort),BOOKDROP_TEST_ORIGIN:'http://127.0.0.1:'+port,BOOKDROP_TEST_ADMIN_PASSWORD:randomBytes(32).toString('hex')},stdio:'inherit',windowsHide:true,timeout:90000});
  if(result.error||result.status!==0)throw new Error(result.error?.code==='ETIMEDOUT'?'LOCAL_NATIVE_TEST_TIMEOUT':'LOCAL_NATIVE_TEST_FAILED');
  for(const entry of hashes)if(hash(path.join(root,entry.path))!==entry.sha256)throw new Error('LOCAL_SOURCE_CHANGED_DURING_TEST');
  console.log('PASS: native Windows auth/API/runtime integration; generated data; loopback-only PostgreSQL; source hashes unchanged');
} finally {
  if(startAttempted){
    const status=spawnSync(path.join(bin,'pg_ctl.exe'),['status','-D',cluster],{env,encoding:'utf8',windowsHide:true,timeout:10000});
    if(status.status===0)command('pg_ctl',['stop','-D',cluster,'-m','fast','-w','-t','10'],15000);
    else if(status.status!==3)throw new Error('LOCAL_FIXTURE_STOP_STATUS_UNCERTAIN');
  }
  console.log('Retained native fixture and source manifest: '+record);
}
