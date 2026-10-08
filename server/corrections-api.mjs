import {randomUUID} from 'node:crypto';
import {StorageError} from './storage.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const undo=/^\/corrections\/([0-9a-f-]+)\/undo$/;
export const isCorrectionRoute=route=>route==='/corrections'||undo.test(route);
const fail=(code,status=400)=>{throw new StorageError(code,status);};
function keys(input,allowed){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))fail('INVALID_INPUT');}
function text(value,max,required=false){if(value==null&&!required)return null;if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail('INVALID_INPUT');return value.trim()||null;}
function row(value){if(value.transaction_amount_cents!==null&&!Number.isSafeInteger(value.transaction_amount_cents))fail('UNAVAILABLE',503);return value;}
export async function handleCorrections({request,route,tx,current,body,json}) {
  const target=undo.exec(route);
  if(target){
    if(!uuid.test(target[1]))fail('NOT_FOUND',404);
    if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
    keys(await body(request),[]);
    const saved=await tx.query("UPDATE public.categorization_corrections SET status='undone' WHERE id=$1 RETURNING id",[target[1]]);
    if(!saved.rows.length)fail('NOT_FOUND',404);
    return json({ok:true});
  }
  if(request.method==='GET')return json((await tx.query('SELECT to_jsonb(c) AS correction FROM public.categorization_corrections c ORDER BY applied_at DESC,id')).rows.map(item=>row(item.correction)));
  if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
  const input=await body(request);
  keys(input,['clientId','uploadId','transactionDate','transactionAmountCents','vendorNormalized','descriptionRaw','originalCategory','correctedCategory','originalSubcategory','correctedSubcategory','originalConfidence','reason']);
  if(!uuid.test(input.clientId)||input.uploadId!=null&&!uuid.test(input.uploadId))fail('INVALID_INPUT');
  if(input.transactionAmountCents!=null&&!Number.isSafeInteger(input.transactionAmountCents))fail('INVALID_INPUT');
  const date=input.transactionDate??null;
  if(date!==null&&(typeof date!=='string'||!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date+'T00:00:00Z').getTime())||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))fail('INVALID_INPUT');
  if(input.originalConfidence!=null&&!['high','medium','low'].includes(input.originalConfidence))fail('INVALID_INPUT');
  const values=[randomUUID(),current.user.id,input.clientId,input.uploadId??null,date,input.transactionAmountCents??null,text(input.vendorNormalized,250),text(input.descriptionRaw,2000),text(input.originalCategory,120),text(input.correctedCategory,120,true),text(input.originalSubcategory,120),text(input.correctedSubcategory,120),text(input.reason,2000),input.originalConfidence??null];
  if(!(await tx.query('SELECT id FROM public.clients WHERE id=$1',[input.clientId])).rows.length)fail('NOT_FOUND',404);
  if(input.uploadId!=null&&!(await tx.query('SELECT id FROM public.document_uploads WHERE id=$1 AND client_id=$2',[input.uploadId,input.clientId])).rows.length)fail('NOT_FOUND',404);
  const saved=await tx.query('INSERT INTO public.categorization_corrections(id,bookkeeper_id,client_id,upload_id,transaction_date,transaction_amount_cents,vendor_normalized,description_raw,original_category,corrected_category,original_subcategory,corrected_subcategory,reason,original_confidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING to_jsonb(categorization_corrections) AS correction',values);
  return json(row(saved.rows[0].correction));
}
