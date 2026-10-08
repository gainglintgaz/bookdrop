import { StorageError } from './storage.mjs';

/** Context is set by the server from a body/header token, never a claimed
 * bookkeeper/client ID. The separate login pool cannot SET ROLE bookdrop_app.
 * Every statement rechecks active-client RLS, including after token rotation.
 * No retry after an uncertain commit; discard connections on failed rollback.
 */
export async function withPortal(pool,token,operation) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{12,128}$/.test(token)) throw new StorageError('NOT_FOUND',404);
  if (!pool) throw new StorageError('UNAVAILABLE',503);
  const tx=await pool.connect(); let began=false,destroy=false;
  try {
    await tx.query('BEGIN'); began=true;
    await tx.query('SET LOCAL ROLE bookdrop_portal');
    await tx.query("SELECT set_config('bookdrop.portal_token',$1,true)",[token]);
    const client=(await tx.query('SELECT id,bookkeeper_id,business_name,contact_name,contact_email,notes_for_client FROM public.clients')).rows[0];
    if (!client) throw new StorageError('NOT_FOUND',404);
    const value=await operation(tx,client);
    await tx.query('COMMIT'); return value;
  } catch(error) {
    if(began){try{await tx.query('ROLLBACK');}catch{destroy=true;}}else destroy=true;
    throw error;
  } finally { tx.release(destroy); }
}

export async function portalPeriod(tx,client,{year,month}) {
  const result=await tx.query(`SELECT json_build_object(
    'client',json_build_object('id',c.id,'business_name',c.business_name,'contact_name',c.contact_name,'contact_email',c.contact_email,'notes_for_client',c.notes_for_client),
    'bookkeeper',(SELECT json_build_object('full_name',b.full_name,'practice_name',b.practice_name,'reply_to_email',b.reply_to_email) FROM public.bookkeepers b WHERE b.id=c.bookkeeper_id),
    'bookkeeperId',c.bookkeeper_id,'period',json_build_object('year',$2::integer,'month',$3::integer),
    'dueDay',5,
    'requirements',coalesce((SELECT json_agg(row_to_json(r)::jsonb || jsonb_build_object('uploads',coalesce((SELECT jsonb_agg(u ORDER BY u.uploaded_at,u.id) FROM public.document_uploads u WHERE u.requirement_id=r.id AND u.period_year=$2 AND u.period_month=$3),'[]'::jsonb)) ORDER BY r.sort_order,r.id) FROM public.document_requirements r WHERE r.client_id=c.id),'[]'::json)
  ) AS result FROM public.clients c WHERE c.id=$1`,[client.id,year,month]);
  if(!result.rows.length)throw new StorageError('NOT_FOUND',404);
  return result.rows[0].result;
}

export async function portalLetters(tx,client) {
  return (await tx.query(`SELECT l.*, (SELECT json_build_object('id',s.id,'signed_at',s.signed_at) FROM public.signatures s WHERE s.engagement_letter_id=l.id ORDER BY s.signed_at,s.id LIMIT 1) AS signature
    FROM public.engagement_letters l WHERE l.client_id=$1 ORDER BY l.created_at,l.id`,[client.id])).rows;
}
