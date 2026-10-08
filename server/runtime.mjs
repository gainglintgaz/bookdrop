import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalAuth } from './auth.mjs';
import { createApi } from './api.mjs';
import { startLocalHttp } from './http.mjs';
import { createLocalObjectStore } from './local-storage.mjs';
import { createPrivateStorage, createDownloadGrants } from './storage.mjs';
import { createJournaledStorage } from './upload-intents.mjs';
import { createFileJobs } from './jobs.mjs';
import { LocalRuntimeError } from './local-config.mjs';
export { LocalRuntimeError } from './local-config.mjs';

const roles={auth:'bookdrop_auth',identity:'bookdrop_identity',tenant:'bookdrop_app',portal:'bookdrop_portal',intent:'bookdrop_file_intent',cleanup:'bookdrop_cleanup'};
const probes={auth:'SELECT 1 FROM local_auth."user" LIMIT 0',identity:'SELECT 1 FROM app_private.identities LIMIT 0',tenant:'SELECT id FROM public.bookkeepers LIMIT 0',portal:'SELECT id FROM public.clients LIMIT 0',cleanup:'SELECT 1 FROM app_private.file_cleanup LIMIT 0'};
function validate({origin,connections,storageDirectory,authSecret,downloadSecret,apiPort,jobsEnabled=false,jobIntervalMs=60000,maxPerKind=10}) {
  let url;try{url=new URL(origin);}catch{throw new LocalRuntimeError('LOCAL_CONFIGURATION_REQUIRED');}
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || url.username || url.password || url.pathname!=='/' || url.search || url.hash || !url.port || Number(url.port)<1024)throw new LocalRuntimeError('LOCAL_CONFIGURATION_REQUIRED');
  if(apiPort!==undefined && (!Number.isInteger(apiPort) || apiPort<1024 || apiPort>65535))throw new LocalRuntimeError('LOCAL_CONFIGURATION_REQUIRED');
  if(typeof storageDirectory!=='string' || !path.isAbsolute(storageDirectory) || path.resolve(storageDirectory)===process.cwd() || typeof authSecret!=='string' || authSecret.length<32 || typeof downloadSecret!=='string' || downloadSecret.length<32 || typeof jobsEnabled!=='boolean' || !Number.isInteger(jobIntervalMs) || jobIntervalMs<1000 || jobIntervalMs>3600000 || !Number.isInteger(maxPerKind) || maxPerKind<1 || maxPerKind>100)throw new LocalRuntimeError('LOCAL_CONFIGURATION_REQUIRED');
  let sourceRoot=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
  if(sourceRoot===path.parse(sourceRoot).root)sourceRoot=process.cwd(); // Server-only fixture mount.
  const relative=path.relative(sourceRoot,path.resolve(storageDirectory));
  if(!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)))throw new LocalRuntimeError('PRIVATE_OBJECT_DIRECTORY_REQUIRED');
  let target;
  const users=new Set();
  for(const name of Object.keys(roles)) {
    const c=connections?.[name];
    if(!c || Object.keys(c).some(key=>!['host','port','database','user','password'].includes(key)) || typeof c.host!=='string' || !(c.host==='127.0.0.1' || c.host==='::1' || (process.platform==='linux' && c.host.startsWith('/'))) || !/^[a-zA-Z0-9_-]{1,63}$/.test(c.database??'') || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(c.user??'') || typeof c.password!=='string' || c.password.length<16 || !Number.isInteger(c.port??5432) || (c.port??5432)<1024 || (c.port??5432)>65535 || users.has(c.user))throw new LocalRuntimeError('LOCAL_DATABASE_CONFIGURATION_REQUIRED');
    const next=JSON.stringify([c.host,c.port??5432,c.database]);if(target && next!==target)throw new LocalRuntimeError('LOCAL_DATABASE_CONFIGURATION_REQUIRED');target=next;users.add(c.user);
  }
}

/** No dotenv, migrations, admin connection, hosted URL, email sender or file-job
 * activation is inferred. All six logins must have one exact restricted role.
 */
export async function startLocalRuntime(config) {
  validate(config);
  const pools={};let server,jobs;
  const emit=event=>{try{config.onEvent?.(event);}catch{/* Never emit connection details. */}};
  try {
    for(const [name,role]of Object.entries(roles)) {
      const pool=new pg.Pool({...config.connections[name],ssl:false,application_name:'bookdrop-local',max:name==='tenant'?4:1,connectionTimeoutMillis:1500,query_timeout:5000,options:name==='auth'?'-c search_path=local_auth,pg_catalog':''});
      pools[name]=pool;pool.on('error',()=>emit({status:'failed',code:'LOCAL_DATABASE_UNAVAILABLE'}));
      const check=(await pool.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls,
        ARRAY(SELECT x.rolname::text FROM pg_roles x WHERE x.rolname<>current_user AND pg_has_role(current_user,x.oid,'MEMBER')) AS memberships
        FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
      if(!check || check.rolsuper || check.rolcreatedb || check.rolcreaterole || check.rolbypassrls || check.memberships.length!==1 || check.memberships[0]!==role)throw new LocalRuntimeError('LOCAL_ROLE_BOUNDARY_REQUIRED');
      // The intent writer deliberately has no SELECT privilege on its queue.
      if(name!=='intent')await pool.query(probes[name]);
      else if(!(await pool.query("SELECT to_regclass('app_private.file_upload_intents') IS NOT NULL AS present")).rows[0].present)throw new LocalRuntimeError('LOCAL_SCHEMA_REQUIRED');
    }
    const objects=await createLocalObjectStore(config.storageDirectory);
    const storage=createJournaledStorage(createPrivateStorage(objects),pools.intent);
    const grants=createDownloadGrants({...config.grantOptions,key:config.downloadSecret});
    const auth=createLocalAuth({pool:pools.auth,origin:config.origin,secret:config.authSecret,sendResetPassword:config.sendResetPassword});
    const api=createApi({auth,identityPool:pools.identity,tenantPool:pools.tenant,portalPool:pools.portal,origin:config.origin,recoveryEnabled:typeof config.sendResetPassword==='function',storage,grants,onFailure:emit});
    jobs=createFileJobs({pool:pools.cleanup,objects,maxPerKind:config.maxPerKind,onEvent:emit});
    server=await startLocalHttp({api,origin:config.origin,port:config.apiPort});
    if(config.jobsEnabled===true)jobs.start(config.jobIntervalMs);
    let closing;
    const close=()=>closing??=(async()=>{
      await jobs.stop();
      await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>server.closeAllConnections(),5000);deadline.unref();server.close(error=>{clearTimeout(deadline);error?reject(error):resolve();});server.closeIdleConnections();});
      const ended=await Promise.allSettled(Object.values(pools).map(pool=>pool.end()));
      if(ended.some(result=>result.status==='rejected'))throw new LocalRuntimeError('LOCAL_SHUTDOWN_FAILED');
    })();
    emit({status:'ready',jobsEnabled:config.jobsEnabled===true});
    return {api,auth,server,jobs,pools,objects,storage,grants,close};
  } catch(error) {
    await jobs?.stop();server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
    await Promise.allSettled(Object.values(pools).map(pool=>pool.end()));
    throw error instanceof LocalRuntimeError?error:new LocalRuntimeError('LOCAL_STARTUP_FAILED');
  }
}
