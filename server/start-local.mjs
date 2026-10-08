import { pathToFileURL } from 'node:url';
import { localConfigFromEnvironment, LocalRuntimeError } from './local-config.mjs';
export { localConfigFromEnvironment } from './local-config.mjs';

/** Environment values stay inside the process. No dotenv or credential files. */
async function main() {
  let runtime;
  try {
    const config=localConfigFromEnvironment(process.env);
    const {startLocalRuntime}=await import('./runtime.mjs');
    runtime=await startLocalRuntime({...config,onEvent:event=>console.log(JSON.stringify(event))});
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;try{await runtime.close();}catch{console.error('LOCAL_SHUTDOWN_FAILED');process.exitCode=1;}};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  } catch(error) {console.error(error instanceof LocalRuntimeError?error.code:'LOCAL_STARTUP_FAILED');process.exitCode=1;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await main();
