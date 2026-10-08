// Local verification only. Reuse dependencies from the reviewed, stopped Linux
// fixture that passed before notifications; always use a new database and runner.
import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readdirSync,readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../../server',import.meta.url));
const cache='bookdrop-api-test-e471f84e-f233-4ee6-b92c-0101492f1610-runner';
const cacheImage=process.env.BOOKDROP_TEST_CACHE_IMAGE;
if(cacheImage && !/^sha256:[a-f0-9]{64}$/.test(cacheImage))throw new Error('IMMUTABLE_LOCAL_CACHE_IMAGE_REQUIRED');
const id=randomUUID(),name=`bookdrop-api-cached-${id}`,runner=`${name}-runner`,volume=`${name}-socket`,image=cacheImage??`bookdrop-local-api-cache:${id}`;
const snapshot=mkdtempSync(path.join(os.tmpdir(),'bookdrop-api-overlay-')),copy=path.join(snapshot,'server');mkdirSync(copy);
const hash=value=>createHash('sha256').update(value).digest('hex'),hashes=[];
for(const directory of ['','db']) {
  if(directory)mkdirSync(path.join(copy,directory));
  for(const item of readdirSync(path.join(root,directory),{withFileTypes:true})) {
    if(item.name==='node_modules')continue;
    if(/^\.env|credential|^\.npmrc$|^secrets[.-]/i.test(item.name))throw new Error('SANITIZED_SOURCE_REQUIRED');
    if(item.isDirectory()){if(!directory&&item.name==='db')continue;throw new Error('UNREVIEWED_SOURCE_DIRECTORY');}
    if(!/\.(?:mjs|ts|sql|json)$/.test(item.name)||lstatSync(path.join(root,directory,item.name)).isSymbolicLink())throw new Error('UNREVIEWED_SOURCE_FILE');
    const relative=path.posix.join(directory,item.name),source=path.join(root,directory,item.name);
    hashes.push({path:relative,sha256:hash(readFileSync(source))});copyFileSync(source,path.join(copy,directory,item.name));
  }
}
writeFileSync(path.join(copy,'fixture-source-hashes.json'),JSON.stringify(hashes)+'\n',{flag:'wx'});
writeFileSync(path.join(snapshot,'source-hashes.json'),JSON.stringify(hashes,null,2)+'\n',{flag:'wx'});
const lock=hash(readFileSync(path.join(root,'package-lock.json')));
const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','Path','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
env.POSTGRES_PASSWORD=randomBytes(32).toString('hex');
function docker(args,input){
  const result=spawnSync('docker',args,{env,encoding:'utf8',windowsHide:true,timeout:90000,...(input?{input,stdio:['pipe','inherit','inherit']}:{})});
  if(result.error||result.status!==0)throw new Error(`LOCAL_COMMAND_${result.error?.code==='ETIMEDOUT'?'TIMEOUT':'FAILED'}:${args[0]}`);
  return result.stdout?.trim();
}
const state=JSON.parse(docker(['inspect',cache,'--format','{{json .HostConfig}}']));
if(state.NetworkMode!=='none'||Object.keys(state.PortBindings??{}).length||docker(['inspect',cache,'--format','{{.State.Status}}'])!=='exited'||docker(['inspect',cache,'--format','{{index .Config.Labels "purpose"}}'])!=='bookdrop-api-test')throw new Error('REVIEWED_STOPPED_CACHE_REQUIRED');
let databaseStarted=false,runnerCreated=false;
try {
  const archive=path.join(snapshot,'server.tar');
  const tar=spawnSync('tar',['-cf',archive,'-C',copy,'.'],{env,encoding:'utf8',windowsHide:true,timeout:90000});
  if(tar.error||tar.status!==0)throw new Error('LOCAL_SOURCE_ARCHIVE_FAILED');
  docker(['image','inspect','postgres:17.6','--format','{{.Id}}']);
  if(cacheImage && docker(['image','inspect',cacheImage,'--format','{{index .Config.Labels "purpose"}}'])!=='bookdrop-api-test')throw new Error('REVIEWED_CACHE_IMAGE_REQUIRED');
  const imageId=cacheImage??docker(['commit','--pause=true',cache,image]);
  console.log('Fixture stage: local dependency cache ready');
  writeFileSync(path.join(snapshot,'cache.json'),JSON.stringify({cache,image,imageId,lock,files:hashes.length,archiveBytes:lstatSync(archive).size},null,2)+'\n',{flag:'wx'});
  docker(['volume','create','--label','purpose=bookdrop-api-cached-test',volume]);
  docker(['run','--detach','--name',name,'--network','none','--label','purpose=bookdrop-api-cached-test','--env','POSTGRES_PASSWORD','--mount',`type=volume,source=${volume},target=/var/run/postgresql`,'postgres:17.6','postgres','-c','listen_addresses=']);databaseStarted=true;
  const dbState=JSON.parse(docker(['inspect',name,'--format','{{json .HostConfig}}']));
  if(dbState.NetworkMode!=='none'||Object.keys(dbState.PortBindings??{}).length)throw new Error('LOCAL_ISOLATION_FAILED');
  let ready=false;for(let attempt=0;attempt<40;attempt++){try{docker(['exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}
  if(!ready)throw new Error('LOCAL_DATABASE_NOT_READY');
  const bootstrap=`const fs=require('node:fs'),{createHash}=require('node:crypto'),{spawn}=require('node:child_process');const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(sha('/app/package-lock.json')!=='${lock}')throw Error('CACHE_LOCK_MISMATCH');for(const n of fs.readdirSync('/app'))if(n!=='node_modules')fs.rmSync('/app/'+n,{recursive:true,force:true});console.log('Fixture stage: transferring application source only');const unpack=spawn('tar',['-xf','-','-C','/app'],{stdio:['pipe','inherit','inherit']});process.stdin.pipe(unpack.stdin);unpack.on('error',()=>process.exit(1));unpack.on('exit',code=>{if(code!==0)process.exit(1);process.stdin.unpipe(unpack.stdin);process.stdin.pause();for(const entry of JSON.parse(fs.readFileSync('/app/fixture-source-hashes.json')))if(sha('/app/'+entry.path)!==entry.sha256)throw Error('SOURCE_HASH_MISMATCH');console.log('Fixture stage: dependency lock and current source verified');const run=spawn(process.execPath,['--test','local-api.integration.mjs'],{stdio:'inherit'});run.on('error',()=>process.exit(1));run.on('exit',code=>process.exit(code??1));});`;
  docker(['create','--interactive','--name',runner,'--network','none','--label','purpose=bookdrop-api-cached-test','--mount',`type=volume,source=${volume},target=/pgsocket`,'--workdir','/app','--env','BOOKDROP_TEST_SOCKET=/pgsocket','--entrypoint','node',image,'-e',bootstrap]);runnerCreated=true;
  const runnerState=JSON.parse(docker(['inspect',runner,'--format','{{json .HostConfig}}']));
  if(runnerState.NetworkMode!=='none'||Object.keys(runnerState.PortBindings??{}).length)throw new Error('LOCAL_ISOLATION_FAILED');
  docker(['start','--attach','--interactive',runner],readFileSync(archive));
  if(docker(['inspect',runner,'--format','{{.State.ExitCode}}'])!=='0')throw new Error('LOCAL_TEST_FAILED');
  for(const entry of hashes)if(hash(readFileSync(path.join(root,entry.path)))!==entry.sha256)throw new Error('SOURCE_CHANGED_DURING_TEST');
  console.log('PASS: current local auth/API integration; verified lock/source; fresh PostgreSQL; both containers network=none; no ports or host mounts');
} finally {
  if(runnerCreated)docker(['stop','--timeout','10',runner]);
  if(databaseStarted)docker(['stop','--timeout','10',name]);
  console.log(`Fixture resources: database=${databaseStarted?name:'not-created'}; runner=${runnerCreated?runner:'not-created'}; volume=${volume}; cache-image=${image}; source=${snapshot}; created containers stopped/retained`);
}
