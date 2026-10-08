export class LocalRuntimeError extends Error {constructor(code){super(code);this.code=code;}}

/** Validate required configuration before loading database/auth dependencies.
 * Values remain inside the process; this module never reads files or logs them.
 */
export function localConfigFromEnvironment(env) {
  const required=name=>{const value=env[name];if(!value)throw new LocalRuntimeError('LOCAL_CONFIGURATION_REQUIRED');return value;};
  const connections=Object.fromEntries(['auth','identity','tenant','portal','intent','cleanup'].map(name=>{
    const prefix=`BOOKDROP_LOCAL_${name.toUpperCase()}`;
    return [name,{host:env.BOOKDROP_LOCAL_DB_HOST??'127.0.0.1',port:Number(env.BOOKDROP_LOCAL_DB_PORT??5432),database:required('BOOKDROP_LOCAL_DB_NAME'),user:required(`${prefix}_USER`),password:required(`${prefix}_PASSWORD`)}];
  }));
  const mode=env.BOOKDROP_LOCAL_FILE_JOBS??'paused';if(!['paused','enabled'].includes(mode))throw new LocalRuntimeError('LOCAL_CONFIGURATION_REQUIRED');
  return {origin:env.BOOKDROP_LOCAL_ORIGIN??'http://127.0.0.1:5173',apiPort:Number(env.BOOKDROP_LOCAL_API_PORT??8788),connections,storageDirectory:required('BOOKDROP_LOCAL_OBJECT_DIRECTORY'),authSecret:required('BOOKDROP_LOCAL_AUTH_SECRET'),downloadSecret:required('BOOKDROP_LOCAL_DOWNLOAD_SECRET'),jobsEnabled:mode==='enabled'};
}
