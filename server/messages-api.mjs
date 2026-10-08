import {randomUUID} from 'node:crypto';
import {readFileBody,StorageError} from './storage.mjs';
import {PRIVATE_FILE_TYPES} from './files-api.mjs';
const id='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const conversation=new RegExp(`^/clients/(${id})/messages/(list|send|read)$`);
export const isMessageRoute=route=>conversation.test(route)||['/messages/threads','/messages/unread'].includes(route);
const fail=(code,status)=>{throw new StorageError(code,status);};
async function empty(request,body){const value=await body(request);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length)fail('INVALID_INPUT',400);}
const attachments=`coalesce((SELECT json_agg(json_build_object('id',a.id,'filename',a.filename,'file_size',a.file_size,'mime_type',a.mime_type) ORDER BY a.created_at,a.id) FROM public.message_attachments a WHERE a.message_id=m.id),'[]'::json)`;
export async function handleMessages({request,route,tx,current,body,json,storage}) {
  const target=conversation.exec(route),portal=Boolean(current.portalClientId),sender=portal?'client':'bookkeeper';
  if(!target) {
    if(portal)fail('NOT_FOUND',404);
    if(request.method!=='GET')fail('METHOD_NOT_ALLOWED',405);
    if(route==='/messages/unread')return json((await tx.query("SELECT count(*)::integer AS count FROM public.messages WHERE sender_type='client' AND read_at IS NULL")).rows[0]);
    if(route==='/messages/threads')return json((await tx.query(`SELECT c.id AS client_id,c.business_name,coalesce(c.contact_name,'') AS contact_name,row_to_json(m) AS last_message,
      (SELECT count(*)::integer FROM public.messages u WHERE u.client_id=c.id AND u.sender_type='client' AND u.read_at IS NULL) AS unread_count
      FROM public.clients c JOIN LATERAL(SELECT id,client_id,bookkeeper_id,sender_type,content,read_at,created_at FROM public.messages WHERE client_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1)m ON true ORDER BY m.created_at DESC,c.id`)).rows);
    fail('NOT_FOUND',404);
  }
  if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
  const clientId=target[1],operation=target[2];
  if(portal&&clientId!==current.portalClientId)fail('NOT_FOUND',404);
  const client=(await tx.query(`SELECT id,is_active FROM public.clients WHERE id=$1${portal?'':' FOR SHARE'}`,[clientId])).rows[0];
  if(!client)fail('NOT_FOUND',404);
  if(operation==='list'){await empty(request,body);return json((await tx.query(`SELECT m.id,m.client_id,m.bookkeeper_id,m.sender_type,m.content,m.read_at,m.created_at,${attachments} AS attachments FROM public.messages m WHERE m.client_id=$1 ORDER BY m.created_at,m.id`,[clientId])).rows);}
  if(operation==='read'){await empty(request,body);await tx.query('UPDATE public.messages SET read_at=now() WHERE client_id=$1 AND sender_type=$2 AND read_at IS NULL',[clientId,sender==='client'?'bookkeeper':'client']);return json({ok:true});}
  if(!client.is_active)fail('NOT_FOUND',404);
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))fail('INVALID_INPUT',400);
  const bytes=await readFileBody(request);let form;
  try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')}}).formData();}catch{fail('INVALID_INPUT',400);}
  if([...form.keys()].some(key=>!['content','attachments'].includes(key))||form.getAll('content').length!==1)fail('INVALID_INPUT',400);
  const content=form.get('content'),files=form.getAll('attachments');
  if(typeof content!=='string'||!content.trim()||content.length>10000||files.length>5)fail('INVALID_INPUT',400);
  for(const file of files)if(!(file instanceof Blob)||typeof file.name!=='string'||!file.name.trim()||file.name.length>255||/[/\\\x00-\x1f\x7f]/.test(file.name)||['.','..'].includes(file.name)||!file.size||!PRIVATE_FILE_TYPES.has(file.type||'application/octet-stream'))fail('INVALID_INPUT',400);
  if(files.length&&storage?.journaled!==true)fail('STORAGE_UNAVAILABLE',503);
  const messageId=randomUUID(),owner=current.user.id;
  const message=(await tx.query('INSERT INTO public.messages(id,client_id,bookkeeper_id,sender_type,content) VALUES($1,$2,$3,$4,$5) RETURNING *',[messageId,clientId,owner,sender,content.trim()])).rows[0];
  message.attachments=[];
  for(const file of files){
    const fileId=randomUUID(),key=`${owner}/${clientId}/messages/${messageId}/${fileId}`,mime=file.type||'application/octet-stream';
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const saved=await storage.save(key,new Uint8Array(await file.arrayBuffer()),mime);
    const attachment=await tx.query('INSERT INTO public.message_attachments(id,message_id,client_id,bookkeeper_id,filename,file_size,storage_path,mime_type,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,filename,file_size,mime_type',[fileId,messageId,clientId,owner,file.name,saved.size,key,mime,saved.sha256]);
    message.attachments.push({...attachment.rows[0],file_size:Number(attachment.rows[0].file_size)});
  }
  return json(message);
}
