/** Reconcile one old upload intent. Pause alongside cleanup during restore.
 * No in-call retry after uncertain COMMIT. State and queue change atomically.
 */
export async function reconcileOneUpload(pool) {
  const tx=await pool.connect();let began=false,destroy=false;
  try {
    await tx.query('BEGIN');began=true;
    await tx.query('SET LOCAL ROLE bookdrop_cleanup');
    const job=(await tx.query("SELECT * FROM app_private.file_upload_intents WHERE status='pending' AND not_before<=now() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
    let result={status:'empty'};
    if(job) {
      const locked=(await tx.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',[job.object_key])).rows[0].acquired;
      if(!locked) {
        await tx.query("UPDATE app_private.file_upload_intents SET not_before=now()+interval '5 minutes' WHERE id=$1",[job.id]);
        result={id:job.id,status:'busy'};
      } else {
        const referenced=(await tx.query(`SELECT exists(SELECT 1 FROM public.document_uploads WHERE storage_path=$1) OR
          exists(SELECT 1 FROM public.engagement_letters WHERE storage_path=$1) OR exists(SELECT 1 FROM public.signatures WHERE signed_pdf_path=$1) OR exists(SELECT 1 FROM public.message_attachments WHERE storage_path=$1) AS present`,[job.object_key])).rows[0].present;
        const status=referenced?'referenced':'queued';
        if(!referenced)await tx.query("INSERT INTO app_private.file_cleanup(owner_id,object_key,sha256,size_bytes,source_table,source_id,status,not_before) VALUES($1,$2,$3,$4,'upload_intent',$5,'pending',now())",[job.owner_id,job.object_key,job.sha256,job.size_bytes,job.id]);
        await tx.query('UPDATE app_private.file_upload_intents SET status=$2 WHERE id=$1',[job.id,status]);
        result={id:job.id,status};
      }
    }
    await tx.query('COMMIT');return result;
  } catch(error) {
    if(began){try{await tx.query('ROLLBACK');}catch{destroy=true;}}else destroy=true;
    throw error;
  } finally {tx.release(destroy);}
}
