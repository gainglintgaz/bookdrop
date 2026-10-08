import { assertObjectKey, createPrivateStorage, StorageError } from './storage.mjs';

/** One durable job, one exact key. Run with a separate restricted service pool.
 * Never expose this function as a browser-supplied path deletion endpoint.
 * Pause cleanup during import/restore; these may reuse historical object keys.
 * No in-call retry after an uncertain database COMMIT. A later run rechecks the
 * durable job and treats an already-missing object as an idempotent completion.
 */
export async function processOneFileCleanup(pool,objects) {
  const storage=createPrivateStorage(objects), tx=await pool.connect();
  let began=false,destroy=false;
  try {
    await tx.query('BEGIN');began=true;
    await tx.query('SET LOCAL ROLE bookdrop_cleanup');
    const job=(await tx.query("SELECT * FROM app_private.file_cleanup WHERE status='pending' AND not_before<=now() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
    let result={status:'empty'};
    if(job) {
      let status='done',code='DELETED';
      try {
        assertObjectKey(job.object_key);
        if(!job.object_key.startsWith(`${job.owner_id}/`))throw new StorageError('INVALID_INPUT',400);
        const locked=(await tx.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',[job.object_key])).rows[0].acquired;
        if(!locked)throw new StorageError('UPLOAD_BUSY');
        const referenced=(await tx.query(`SELECT exists(SELECT 1 FROM public.document_uploads WHERE storage_path=$1) OR
          exists(SELECT 1 FROM public.engagement_letters WHERE storage_path=$1) OR exists(SELECT 1 FROM public.signatures WHERE signed_pdf_path=$1) OR exists(SELECT 1 FROM public.message_attachments WHERE storage_path=$1) AS present`,[job.object_key])).rows[0].present;
        if(referenced) {status='review';code='STILL_REFERENCED';}
        else {
          try {await storage.read(job.object_key,job.size_bytes,job.sha256);}
          catch(error){if(error instanceof StorageError && error.code==='FILE_NOT_FOUND')code='ALREADY_MISSING';else throw error;}
          if(code==='DELETED')await objects.delete(job.object_key);
        }
      } catch(error) {
        if(error instanceof StorageError && ['FILE_INTEGRITY','INVALID_INPUT'].includes(error.code)){status='review';code=error.code;}
        else {status='pending';code='STORAGE_UNAVAILABLE';}
      }
      await tx.query(`UPDATE app_private.file_cleanup SET status=$2,attempts=attempts+1,last_code=$3,
        processed_at=CASE WHEN $2='done' THEN now() ELSE NULL END,
        not_before=CASE WHEN $2='pending' THEN now()+interval '5 minutes' ELSE not_before END WHERE id=$1`,[job.id,status,code]);
      result={id:job.id,status:status==='pending'?'retry':status==='review'?'review':code==='ALREADY_MISSING'?'missing':'deleted'};
    }
    await tx.query('COMMIT');return result;
  } catch(error) {
    if(began){try{await tx.query('ROLLBACK');}catch{destroy=true;}}else destroy=true;
    throw error;
  } finally {tx.release(destroy);}
}
