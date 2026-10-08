import { randomUUID } from 'node:crypto';
import { readFileBody, StorageError } from './storage.mjs';

const id='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const documentUpload=new RegExp(`^/clients/(${id})/requirements/(${id})/upload$`);
const letterUpload=new RegExp(`^/clients/(${id})/letters/upload$`);
const download=new RegExp(`^/files/(${id})/(grant|download)$`);
const types=new Set(['application/pdf','image/png','image/jpeg','image/gif','image/webp','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip','application/octet-stream']);
export {types as PRIVATE_FILE_TYPES};
const fail=(code,status)=>{throw new StorageError(code,status);};
const headerText=(request,name,max)=>{
  let value;
  try { value=decodeURIComponent(request.headers.get(name) ?? ''); } catch { fail('INVALID_INPUT',400); }
  if (!value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail('INVALID_INPUT',400);
  return value;
};
export const isPrivateFileRoute=route=>documentUpload.test(route)||letterUpload.test(route)||download.test(route);

export async function handlePrivateFiles({request,route,tx,current,storage,grants,body,json}) {
  if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED',405);
  if (!storage || !grants) fail('STORAGE_UNAVAILABLE',503);
  const doc=documentUpload.exec(route), letter=letterUpload.exec(route), target=download.exec(route);
  if (current.portalClientId && letter) fail('FORBIDDEN',403);
  if (doc || letter) {
    if(storage.journaled !== true)fail('STORAGE_UNAVAILABLE',503);
    const clientId=(doc ?? letter)[1];
    if(current.portalClientId && current.portalClientId !== clientId)fail('NOT_FOUND',404);
    const lock=current.portalClientId ? '' : ' FOR SHARE';
    const active=(await tx.query(`SELECT id FROM public.clients WHERE id=$1 AND is_active${lock}`,[clientId])).rows[0];
    if (!active) fail('NOT_FOUND',404);
    if (doc && !(await tx.query(`SELECT id FROM public.document_requirements WHERE id=$1 AND client_id=$2${lock}`,[doc[2],clientId])).rows.length) fail('NOT_FOUND',404);
    const filename=headerText(request,'x-bookdrop-filename',255);
    if (filename === '.' || filename === '..' || /[/\\]/.test(filename)) fail('INVALID_INPUT',400);
    const contentType=(request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!types.has(contentType) || (letter && contentType !== 'application/pdf')) fail('INVALID_INPUT',400);
    let year,month,label;
    if (doc) {
      const yearHeader=request.headers.get('x-bookdrop-year') ?? '', monthHeader=request.headers.get('x-bookdrop-month') ?? '';
      if (!/^\d{1,4}$/.test(yearHeader) || !/^\d{1,2}$/.test(monthHeader)) fail('INVALID_INPUT',400);
      year=Number(yearHeader); month=Number(monthHeader);
      if (year < 1 || month < 1 || month > 12) fail('INVALID_INPUT',400);
    } else label=headerText(request,'x-bookdrop-label',250);
    const bytes=await readFileBody(request), fileId=randomUUID();
    const key=doc ? `${current.user.id}/${clientId}/${year}/${month}/${doc[2]}/${fileId}` : `${current.user.id}/${clientId}/engagement-letters/${fileId}`;
    // Reconciliation must not race an upload still committing its metadata.
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const saved=await storage.save(key,bytes,contentType);
    // On an uncertain database commit, retain this private object. Deleting it
    // here could destroy the bytes of an actually committed row. Reconciliation
    // must identify unreferenced objects before cleanup; never silently retry.
    const result=doc
      ? await tx.query('INSERT INTO public.document_uploads(id,requirement_id,client_id,bookkeeper_id,period_year,period_month,filename_original,storage_path,file_size_bytes,sha256,content_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[fileId,doc[2],clientId,current.user.id,year,month,filename,key,saved.size,saved.sha256,contentType])
      : await tx.query('INSERT INTO public.engagement_letters(id,bookkeeper_id,client_id,label,storage_path,filename,file_size_bytes,sha256,content_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[fileId,current.user.id,clientId,label,key,filename,saved.size,saved.sha256,contentType]);
    return json(result.rows[0]);
  }
  if (!target) fail('NOT_FOUND',404);
  const input=await body(request);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key=>!['kind','grant'].includes(key))) fail('INVALID_INPUT',400);
  const kind=input.kind ?? 'document';
  let record;
  if (kind === 'document') record=(await tx.query('SELECT id,storage_path,filename_original AS filename,file_size_bytes,sha256,content_type FROM public.document_uploads WHERE id=$1',[target[1]])).rows[0];
  else if (kind === 'letter') record=(await tx.query('SELECT id,storage_path,filename,file_size_bytes,sha256,content_type FROM public.engagement_letters WHERE id=$1',[target[1]])).rows[0];
  else if (kind === 'signed') record=(await tx.query("SELECT s.id,s.signed_pdf_path AS storage_path,l.filename,s.signed_pdf_size_bytes AS file_size_bytes,s.signed_pdf_sha256 AS sha256,'application/pdf' AS content_type FROM public.signatures s JOIN public.engagement_letters l ON l.id=s.engagement_letter_id WHERE s.id=$1",[target[1]])).rows[0];
  else if (kind === 'message') record=(await tx.query('SELECT id,storage_path,filename,file_size AS file_size_bytes,sha256,mime_type AS content_type FROM public.message_attachments WHERE id=$1',[target[1]])).rows[0];
  else fail('INVALID_INPUT',400);
  if (!record) fail('NOT_FOUND',404);
  if (!record.storage_path?.startsWith(`${current.user.id}/`) || !/^[a-f0-9]{64}$/.test(record.sha256 ?? '')) fail('FILE_INTEGRITY',503);
  if (target[2] === 'grant') return json({...grants.issue(record.id,current.user.id,record.sha256),size:Number(record.file_size_bytes),sha256:record.sha256,contentType:record.content_type});
  grants.verify(input.grant,record.id,current.user.id,record.sha256);
  const bytes=await storage.read(record.storage_path,record.file_size_bytes,record.sha256);
  const filename=encodeURIComponent(record.filename).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(bytes,{headers:{'Content-Type':record.content_type,'Content-Length':String(bytes.byteLength),'Content-Disposition':`attachment; filename*=UTF-8''${filename}`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
