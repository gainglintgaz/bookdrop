import { reconcileOneUpload } from './reconcile-uploads.mjs';
import { processOneFileCleanup } from './file-cleanup.mjs';

/** Server-only worker; never accepts browser paths. Pause and await the current
 * transaction before restore/import. Failures wait for a later scheduled pass,
 * rather than retrying a potentially committed transaction inside this pass.
 */
export function createFileJobs({pool,objects,maxPerKind=10,onEvent=()=>{},reconcile=reconcileOneUpload,cleanup=processOneFileCleanup}) {
  if(!pool || !objects || !Number.isInteger(maxPerKind) || maxPerKind<1 || maxPerKind>100)throw new Error('FILE_JOBS_CONFIGURATION_REQUIRED');
  let active=null,timer=null,paused=false,stopped=false;
  const emit=event=>{try{onEvent(event);}catch{/* An observer cannot replay a transaction. */}};
  async function work() {
    const counts={referenced:0,queued:0,busy:0,deleted:0,missing:0,review:0,retry:0};
    let intentsEmpty=false,cleanupEmpty=false;
    try {
      for(let index=0;index<maxPerKind && !paused && !stopped;index++) {
        if(!intentsEmpty) {
          const result=await reconcile(pool);
          if(result.status==='empty')intentsEmpty=true;
          else if(['referenced','queued','busy'].includes(result.status))counts[result.status]++;
          else throw new Error('INVALID_JOB_RESULT');
        }
        if(paused || stopped)break;
        if(!cleanupEmpty) {
          const result=await cleanup(pool,objects);
          if(result.status==='empty')cleanupEmpty=true;
          else if(['deleted','missing','review','retry'].includes(result.status))counts[result.status]++;
          else throw new Error('INVALID_JOB_RESULT');
        }
        if(intentsEmpty && cleanupEmpty)break;
      }
      const result={status:'pass',counts};emit(result);return result;
    } catch {
      const result={status:'failed',code:'FILE_JOBS_UNAVAILABLE',counts};emit(result);return result;
    }
  }
  return {
    runOnce() {
      if(stopped)return Promise.resolve({status:'stopped'});
      if(paused)return Promise.resolve({status:'paused'});
      if(active)return Promise.resolve({status:'busy'});
      active=work().finally(()=>{active=null;});return active;
    },
    start(intervalMs=60000) {
      if(stopped || timer || !Number.isInteger(intervalMs) || intervalMs<1000 || intervalMs>3600000)throw new Error('FILE_JOBS_CONFIGURATION_REQUIRED');
      timer=setInterval(()=>{void this.runOnce();},intervalMs);timer.unref();
    },
    async pause() {paused=true;await active;},
    resume() {if(stopped)throw new Error('FILE_JOBS_STOPPED');paused=false;},
    async stop() {stopped=true;paused=true;clearInterval(timer);timer=null;await active;},
    get state() {return {running:active!==null,paused,stopped,scheduled:timer!==null};},
  };
}
