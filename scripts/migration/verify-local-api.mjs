import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readdirSync, mkdtempSync, cpSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = fileURLToPath(new URL('../../server',import.meta.url));
if (readdirSync(root).some(name => /^\.env|credential|^\.npmrc$/i.test(name))) throw new Error('SANITIZED_SERVER_DIRECTORY_REQUIRED');
const name = `bookdrop-api-test-${randomUUID()}`;
const volume = `${name}-socket`;
const nodeName = `${name}-runner`;
// Docker's shared Windows mount was observed waiting in p9_client_rpc during
// Node realpathSync. Test a fixed, sanitized copy on the Linux container FS.
const snapshot=mkdtempSync(path.join(os.tmpdir(),'bookdrop-api-source-'));
const copy=path.join(snapshot,'server');
cpSync(root,copy,{recursive:true,filter(source){
  const name=path.basename(source);
  const vendor=path.relative(root,source).split(path.sep).includes('node_modules');
  const credentialName=/credential|^secrets[.-]/i.test(name);
  if(name==='.bin' || name==='.git' || /^\.env|^\.npmrc$/i.test(name) || (credentialName && !(vendor && /\.(?:mjs|cjs|js|ts|map)$/.test(name))))return false;
  const stat=lstatSync(source);if(stat.isSymbolicLink())throw new Error('SANITIZED_SERVER_DIRECTORY_REQUIRED');
  return stat.isDirectory() || /\.(?:mjs|cjs|js|json|ts|sql|node|wasm|map)$/.test(name);
}});
const hashes=[];
function hashSource(dir){for(const item of readdirSync(dir,{withFileTypes:true})){if(item.name==='node_modules')continue;const file=path.join(dir,item.name);if(item.isDirectory())hashSource(file);else hashes.push({path:path.relative(copy,file).replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(file)).digest('hex')});}}
hashSource(copy);
writeFileSync(path.join(snapshot,'source-hashes.json'),JSON.stringify(hashes,null,2)+'\n',{flag:'wx'});
const env = Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','Path','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(k => process.env[k]).map(k => [k,process.env[k]]));
env.POSTGRES_PASSWORD = randomBytes(32).toString('hex');
function docker(args, input) {
  const result = spawnSync('docker',args,{env,encoding:'utf8',windowsHide:true,timeout:90000,...(input?{input,stdio:['pipe','inherit','inherit']}:{})});
  if (result.error || result.status !== 0) throw new Error(`LOCAL_COMMAND_${result.error?.code==='ETIMEDOUT'?'TIMEOUT':'FAILED'}:${args[0]}`);
  return result.stdout?.trim();
}
let started = false,runnerCreated=false;
try {
  const archive=path.join(snapshot,'server.tar');
  const packed=spawnSync('tar',['-cf',archive,'-C',copy,'.'],{env,encoding:'utf8',windowsHide:true,timeout:90000});
  if(packed.error || packed.status!==0)throw new Error('LOCAL_SOURCE_ARCHIVE_FAILED');
  for (const image of ['postgres:17.6','node:22-bookworm-slim']) docker(['image','inspect',image,'--format','{{.Id}}']);
  docker(['volume','create','--label','purpose=bookdrop-api-test',volume]);
  docker(['run','--detach','--name',name,'--network','none','--label','purpose=bookdrop-api-test','--env','POSTGRES_PASSWORD',
    '--mount',`type=volume,source=${volume},target=/var/run/postgresql`,'postgres:17.6','postgres','-c','listen_addresses=']);
  started = true;
  const state = JSON.parse(docker(['inspect',name,'--format','{{json .HostConfig}}']));
  if (state.NetworkMode !== 'none' || Object.keys(state.PortBindings ?? {}).length) throw new Error('LOCAL_ISOLATION_FAILED');
  let ready = false;
  for (let attempt=0;attempt<40;attempt++) {
    try { docker(['exec',name,'pg_isready','-U','postgres']); ready=true; break; } catch { await new Promise(resolve=>setTimeout(resolve,250)); }
  }
  if(!ready)throw new Error('LOCAL_DATABASE_NOT_READY');
  docker(['create','--interactive','--name',nodeName,'--network','none','--label','purpose=bookdrop-api-test',
    '--mount',`type=volume,source=${volume},target=/pgsocket`,
    '--workdir','/app','--env','BOOKDROP_TEST_SOCKET=/pgsocket','node:22-bookworm-slim','node','-e',
    "const {spawn}=require('node:child_process');console.log('Fixture stage: extracting sanitized source');const unpack=spawn('tar',['-xf','-','-C','/app'],{stdio:['pipe','inherit','inherit']});process.stdin.pipe(unpack.stdin);unpack.on('error',()=>process.exit(1));unpack.on('exit',code=>{if(code!==0)process.exit(1);process.stdin.unpipe(unpack.stdin);process.stdin.pause();console.log('Fixture stage: source ready');const test=spawn(process.execPath,['--test','local-api.integration.mjs'],{stdio:'inherit'});test.on('error',()=>process.exit(1));test.on('exit',code=>process.exit(code??1));});"]);
  runnerCreated=true;
  const runnerState=JSON.parse(docker(['inspect',nodeName,'--format','{{json .HostConfig}}']));
  if(runnerState.NetworkMode!=='none' || Object.keys(runnerState.PortBindings??{}).length)throw new Error('LOCAL_ISOLATION_FAILED');
  // Docker cp stalled on this Windows host. Stream only the sanitized archive,
  // with no shared host mount or published port, before running unchanged tests.
  docker(['start','--attach','--interactive',nodeName],readFileSync(archive));
  if(docker(['inspect',nodeName,'--format','{{.State.ExitCode}}'])!=='0')throw new Error('LOCAL_TEST_FAILED');
  console.log('PASS: real local auth/API integration; both containers network=none; no ports or environment files');
} finally {
  if(runnerCreated)docker(['stop','--timeout','10',nodeName]);
  if(started)docker(['stop',name]);
  console.log(`Retained fixture: database=${name}; runner=${nodeName}; socket-volume=${volume}`);
  console.log(`Retained source snapshot: ${snapshot}`);
}
