import { randomBytes, randomUUID } from 'node:crypto';
import { withTenant } from './db/tenant.ts';
import { StorageError } from './storage.mjs';
import { isPrivateFileRoute, handlePrivateFiles } from './files-api.mjs';
import { withPortal, portalPeriod, portalLetters } from './portal.mjs';
import {isMessageRoute,handleMessages} from './messages-api.mjs';
import {isCorrectionRoute,handleCorrections} from './corrections-api.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const docTypes = new Set(['bank','credit_card','receipt','payroll','w2','1099_nec','1099_misc','1099_int','1099_div','1099_k','1040','1098','investment','mortgage','other']);
class ApiError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new ApiError(code, status); };
const json = (value, status = 200, cookies = []) => {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy':'no-referrer' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(value), { status, headers });
};
const text = (value, max, optional = false) => {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_INPUT', 400);
  return value.trim();
};
const email = value => {
  const result = text(value, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('INVALID_INPUT', 400);
  return result;
};
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('INVALID_INPUT', 400);
}
function periodInput(input) {
  keys(input,['year','month']);
  if (!Number.isInteger(input.year) || input.year < 1 || input.year > 9999 || !Number.isInteger(input.month) || input.month < 1 || input.month > 12) fail('INVALID_INPUT',400);
  return input;
}
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail('INVALID_INPUT', 400);
  const reader = request.body?.getReader();
  if (!reader) fail('INVALID_INPUT', 400);
  const parts = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) { await reader.cancel(); fail('PAYLOAD_TOO_LARGE', 413); }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    fail('INVALID_INPUT', 400);
  } finally { reader.releaseLock(); }
}
function clientInput(value, updating = false) {
  keys(value, ['business_name','contact_name','contact_email','notes_for_client','notes_private','requirements','reminderDays', ...(updating ? ['is_active'] : [])]);
  if (!Array.isArray(value.requirements) || value.requirements.length > 50) fail('INVALID_INPUT', 400);
  const requirements = value.requirements.map(req => {
    keys(req, ['id','label','doc_type','required']);
    if ((req.id !== undefined && req.id !== null && (!updating || !uuid.test(req.id))) || !docTypes.has(req.doc_type) || typeof req.required !== 'boolean') fail('INVALID_INPUT', 400);
    return { id: req.id ?? null, label: text(req.label, 250), doc_type: req.doc_type, required: req.required };
  });
  if (new Set(requirements.filter(r => r.id).map(r => r.id)).size !== requirements.filter(r => r.id).length) fail('INVALID_INPUT', 400);
  const days = value.reminderDays ?? [1,5,10];
  if (!Array.isArray(days) || days.length > 5 || days.some(day => !Number.isInteger(day) || day < 1 || day > 31) || new Set(days).size !== days.length) fail('INVALID_INPUT', 400);
  if (updating && typeof value.is_active !== 'boolean') fail('INVALID_INPUT', 400);
  return { business: text(value.business_name, 250), contact: text(value.contact_name, 250, true), email: email(value.contact_email),
    notes: text(value.notes_for_client, 5000, true), privateNotes: text(value.notes_private, 5000, true), requirements, days, active: updating ? value.is_active : true };
}

/** A request handler shared by the local HTTP bridge and integration test.
 * Identity lookup and auth use separate restricted pools; tenant queries always
 * use the RLS transaction helper. No arbitrary table/SQL/provider proxy exists.
 */
export function createApi({ auth, identityPool, tenantPool, portalPool, origin, recoveryEnabled = false, storage, grants, onFailure }) {
  async function provision(user) {
    if (!user?.id || !['practitioner','solo'].includes(user.accountType)) fail('FORBIDDEN', 403);
    const tx = await identityPool.connect();
    let destroy = false;
    try {
      await tx.query('BEGIN');
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`local-better-auth:${user.id}`]);
      const existing = await tx.query('SELECT bookkeeper_id FROM app_private.identities WHERE provider=$1 AND subject=$2', ['local-better-auth',user.id]);
      if (!existing.rows.length) {
        const id = randomUUID();
        await tx.query("INSERT INTO public.bookkeepers(id,email,full_name,reply_to_email,account_type,business_name) VALUES ($1,$2,$3,$2,$4,$5)",
          [id,user.email,user.name,user.accountType,user.businessName ?? null]);
        if (user.accountType === 'solo') {
          const clientId = randomUUID();
          await tx.query('INSERT INTO public.clients(id,bookkeeper_id,business_name,contact_name,contact_email,portal_token) VALUES ($1,$2,$3,$4,$5,$6)',
            [clientId,id,text(user.businessName,250),user.name,user.email,randomBytes(32).toString('base64url')]);
          await tx.query('UPDATE public.bookkeepers SET self_client_id=$1 WHERE id=$2', [clientId,id]);
        }
        await tx.query('INSERT INTO app_private.identities(provider,subject,bookkeeper_id) VALUES ($1,$2,$3)', ['local-better-auth',user.id,id]);
      }
      await tx.query('COMMIT');
    } catch (error) {
      try { await tx.query('ROLLBACK'); } catch { destroy = true; }
      throw error;
    } finally { tx.release(destroy); }
  }
  async function session(request) {
    const result = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true, disableRefresh: true } });
    if (!result || new Date(result.session.expiresAt).getTime() <= Date.now()) return null;
    const mapping = await identityPool.query('SELECT b.* FROM app_private.identities i JOIN public.bookkeepers b ON b.id=i.bookkeeper_id WHERE i.provider=$1 AND i.subject=$2', ['local-better-auth',result.user.id]);
    const bookkeeper = mapping.rows[0];
    if (!bookkeeper || (bookkeeper.account_type === 'solo' && !bookkeeper.self_client_id)) fail('FORBIDDEN', 403);
    return { user: { id: bookkeeper.id, email: result.user.email }, bookkeeper, expiresAt: new Date(result.session.expiresAt) };
  }
  async function authOperation(request, path, input) {
    const headers = new Headers({ 'Content-Type': 'application/json', Origin: origin, 'x-bookdrop-peer': '127.0.0.1' });
    if (request.headers.has('cookie')) headers.set('cookie', request.headers.get('cookie'));
    const response = await auth.handler(new Request(`${origin}/api/bookdrop/identity${path}`, { method: 'POST', headers, body: JSON.stringify(input) }));
    const result = await response.json();
    if (!response.ok) fail(response.status >= 500 ? 'UNAVAILABLE' : response.status === 401 ? 'INVALID_CREDENTIALS' : response.status === 429 ? 'RATE_LIMITED' : 'INVALID_INPUT', response.status >= 500 ? 503 : response.status);
    return { result, cookies: response.headers.getSetCookie() };
  }
  return async request => {
    let stage='request';
    try {
      const url = new URL(request.url);
      if (url.origin !== origin || url.search || request.headers.get('sec-fetch-site') === 'cross-site') fail('FORBIDDEN',403);
      if (!url.pathname.startsWith('/api/bookdrop/')) fail('NOT_FOUND',404);
      if (!['GET','POST'].includes(request.method)) fail('METHOD_NOT_ALLOWED',405);
      if (request.method === 'POST' && request.headers.get('origin') !== origin) fail('FORBIDDEN',403);
      const route = url.pathname.replace(/^\/api\/bookdrop(?=\/)/,'');
      if (route.startsWith('/portal/')) {
        stage='portal';
        if(request.method !== 'POST')fail('METHOD_NOT_ALLOWED',405);
        const fileRoute=route.slice('/portal'.length);
        if(!['/portal/period','/portal/letters'].includes(route) && !isPrivateFileRoute(fileRoute) && !isMessageRoute(fileRoute))fail('NOT_FOUND',404);
        return await withPortal(portalPool,request.headers.get('x-bookdrop-portal'),async(tx,client)=>{
          if(isMessageRoute(fileRoute))return handleMessages({request,route:fileRoute,tx,current:{user:{id:client.bookkeeper_id},portalClientId:client.id},body,json,storage});
          if(route === '/portal/period')return json(await portalPeriod(tx,client,periodInput(await body(request))));
          if(route === '/portal/letters'){keys(await body(request),[]);return json(await portalLetters(tx,client));}
          return handlePrivateFiles({request,route:fileRoute,tx,current:{user:{id:client.bookkeeper_id},portalClientId:client.id},storage,grants,body,json});
        });
      }
      if(route.startsWith('/auth/'))stage='auth';
      if (route === '/auth/session' && request.method === 'GET') {
        const current = await session(request);
        return json({ session: current ? { user: current.user, bookkeeper: current.bookkeeper } : null });
      }
      if (route === '/auth/sign-up' && request.method === 'POST') {
        const input = await body(request); keys(input,['email','password','fullName','businessName','accountType']);
        if (!['practitioner','solo'].includes(input.accountType) || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) fail('INVALID_INPUT',400);
        const businessName = text(input.businessName,250,input.accountType !== 'solo');
        const { result, cookies } = await authOperation(request,'/sign-up/email',{ email:email(input.email), password:input.password, name:text(input.fullName,250), accountType:input.accountType, businessName });
        await provision(result.user);
        return json({ ok:true },200,cookies);
      }
      if (route === '/auth/sign-in' && request.method === 'POST') {
        const input = await body(request); keys(input,['email','password']);
        if (typeof input.password !== 'string' || input.password.length > 128) fail('INVALID_INPUT',400);
        const { result, cookies } = await authOperation(request,'/sign-in/email',{email:email(input.email),password:input.password});
        // Recover an interrupted first provisioning transaction using persisted
        // signup metadata from the verified auth user, never fresh client claims.
        await provision(result.user);
        return json({ ok:true },200,cookies);
      }
      if (route === '/auth/sign-out' && request.method === 'POST') {
        await body(request);
        const { cookies } = await authOperation(request,'/sign-out',{});
        return json({ok:true},200,cookies);
      }
      if (route === '/auth/reset-password' && request.method === 'POST') {
        if (!recoveryEnabled) fail('RECOVERY_UNAVAILABLE',503);
        const input = await body(request); keys(input,['email']);
        const { cookies } = await authOperation(request,'/request-password-reset',{email:email(input.email),redirectTo:`${origin}/reset-password`});
        return json({ok:true},200,cookies);
      }
      if (route === '/auth/update-password' && request.method === 'POST') {
        if (!recoveryEnabled) fail('RECOVERY_UNAVAILABLE',503);
        const input = await body(request); keys(input,['token','password']);
        if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) fail('INVALID_INPUT',400);
        const { cookies } = await authOperation(request,'/reset-password',{token:text(input.token,512),newPassword:input.password});
        return json({ok:true},200,cookies);
      }
      const statusRoute = route === '/clients/status';
      const profileRoute = route === '/profile';
      const correctionRoute = isCorrectionRoute(route);
      const notificationRoute = /^\/notifications(?:\/(unread|read-all|([0-9a-f-]+)\/read))?$/.exec(route);
      const fileRoute = isPrivateFileRoute(route);
      const messageRoute=isMessageRoute(route);
      const clientRoute = /^\/clients(?:\/([0-9a-f-]+)(\/(?:delete|period|letters|tearsheet))?)?$/.exec(route);
      if ((!statusRoute && !profileRoute && !correctionRoute && !clientRoute && !fileRoute && !notificationRoute && !messageRoute) || (clientRoute?.[1] && !uuid.test(clientRoute[1])) || (notificationRoute?.[2] && !uuid.test(notificationRoute[2]))) fail('NOT_FOUND',404);
      stage='session';
      const current = await session(request);
      if (!current) fail('UNAUTHENTICATED',401);
      const clientId = clientRoute?.[1];
      stage='tenant';
      return await withTenant(tenantPool,request,async () => ({bookkeeperId:current.user.id,expiresAt:current.expiresAt}),async tx => {
        if(correctionRoute)return handleCorrections({request,route,tx,current,body,json});
        if(profileRoute) {
          if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
          const input=await body(request);
          keys(input,['full_name','practice_name','reply_to_email','reminder_tone','notify_on_complete','notify_on_any_upload','notify_on_late']);
          if(typeof input.practice_name!=='string'||input.practice_name.length>250||!['friendly','professional','firm'].includes(input.reminder_tone)||['notify_on_complete','notify_on_any_upload','notify_on_late'].some(key=>typeof input[key]!=='boolean'))fail('INVALID_INPUT',400);
          const saved=await tx.query('UPDATE public.bookkeepers SET full_name=$1,practice_name=$2,reply_to_email=$3,reminder_tone=$4,notify_on_complete=$5,notify_on_any_upload=$6,notify_on_late=$7 WHERE id=$8 RETURNING *',[text(input.full_name,250),input.practice_name.trim(),email(input.reply_to_email),input.reminder_tone,input.notify_on_complete,input.notify_on_any_upload,input.notify_on_late,current.user.id]);
          if(!saved.rows[0])fail('NOT_FOUND',404);
          return json(saved.rows[0]);
        }
        if(messageRoute)return handleMessages({request,route,tx,current,body,json,storage});
        if (notificationRoute) {
          const operation=notificationRoute[1];
          if (!operation || operation==='unread') {
            if(request.method!=='GET')fail('METHOD_NOT_ALLOWED',405);
            if(operation==='unread')return json((await tx.query('SELECT count(*)::integer AS count FROM public.notifications WHERE NOT read')).rows[0]);
            return json((await tx.query("SELECT id,type,title,body,client_id,client_name,read,action_url,created_at FROM public.notifications WHERE created_at>=now()-interval '30 days' ORDER BY created_at DESC,id DESC LIMIT 200")).rows);
          }
          if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
          keys(await body(request),[]);
          if(operation==='read-all')await tx.query('UPDATE public.notifications SET read=true WHERE NOT read');
          else if(!(await tx.query('UPDATE public.notifications SET read=true WHERE id=$1 RETURNING id',[notificationRoute[2]])).rows.length)fail('NOT_FOUND',404);
          return json({ok:true});
        }
        if (fileRoute) return handlePrivateFiles({request,route,tx,current,storage,grants,body,json});
        if(clientRoute?.[2]==='/tearsheet') {
          if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
          const {year,month}=periodInput(await body(request));
          const result=await tx.query(`SELECT json_build_object(
            'client',row_to_json(c),
            'requirements',coalesce((SELECT json_agg(to_jsonb(r)||jsonb_build_object('uploads',coalesce((SELECT jsonb_agg(u ORDER BY u.uploaded_at,u.id) FROM public.document_uploads u WHERE u.requirement_id=r.id AND u.client_id=c.id AND u.period_year=$2 AND u.period_month=$3),'[]'::jsonb)) ORDER BY r.sort_order,r.id) FROM public.document_requirements r WHERE r.client_id=c.id),'[]'::json),
            'reminders',coalesce((SELECT json_agg(h ORDER BY h.sent_at DESC,h.id) FROM (SELECT * FROM public.reminder_log WHERE client_id=c.id ORDER BY sent_at DESC,id LIMIT 5) h),'[]'::json),
            'outcomes',coalesce((SELECT json_agg(o ORDER BY o.period_year DESC,o.period_month DESC) FROM (SELECT period_year,period_month,hours_saved_minutes,accuracy_pct,reconciliation_match_pct,total_categorized,total_corrected FROM public.close_cycle_outcomes WHERE client_id=c.id ORDER BY period_year DESC,period_month DESC LIMIT 24) o),'[]'::json)
          ) AS snapshot FROM public.clients c WHERE c.id=$1`,[clientId,year,month]);
          if(!result.rows[0])fail('NOT_FOUND',404);
          return json(result.rows[0].snapshot);
        }
        if (clientRoute?.[2] === '/period') {
          if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED',405);
          const {year,month} = periodInput(await body(request));
          const result = await tx.query(`SELECT json_build_object(
            'client', row_to_json(c),
            'requirements',coalesce((SELECT json_agg(r ORDER BY r.sort_order) FROM public.document_requirements r WHERE r.client_id=c.id),'[]'::json),
            'uploads',coalesce((SELECT json_agg(u ORDER BY u.uploaded_at) FROM public.document_uploads u WHERE u.client_id=c.id AND u.period_year=$2 AND u.period_month=$3),'[]'::json),
            'reminders',coalesce((SELECT json_agg(h ORDER BY h.sent_at DESC) FROM public.reminder_log h WHERE h.client_id=c.id AND h.period_year=$2 AND h.period_month=$3),'[]'::json),
            'letters',coalesce((SELECT json_agg(row_to_json(l)::jsonb || jsonb_build_object(
              'signature',(SELECT to_jsonb(s) FROM public.signatures s WHERE s.engagement_letter_id=l.id ORDER BY s.signed_at,s.id LIMIT 1),
              'signatories',coalesce((SELECT jsonb_agg(sg ORDER BY sg.created_at,sg.id) FROM public.engagement_letter_signatories sg WHERE sg.engagement_letter_id=l.id),'[]'::jsonb)
            ) ORDER BY l.created_at,l.id) FROM public.engagement_letters l WHERE l.client_id=c.id AND l.is_active),'[]'::json)
          ) AS result FROM public.clients c WHERE c.id=$1`,[clientId,year,month]);
          if (!result.rows.length) fail('NOT_FOUND',404);
          return json(result.rows[0].result);
        }
        if (clientRoute?.[2] === '/letters') {
          if (request.method !== 'GET') fail('METHOD_NOT_ALLOWED',405);
          if (!(await tx.query('SELECT id FROM public.clients WHERE id=$1',[clientId])).rows.length) fail('NOT_FOUND',404);
          const result=await tx.query(`SELECT l.*, (SELECT row_to_json(s) FROM public.signatures s WHERE s.engagement_letter_id=l.id ORDER BY s.signed_at,s.id LIMIT 1) AS signature,
            coalesce((SELECT json_agg(sg ORDER BY sg.created_at,sg.id) FROM public.engagement_letter_signatories sg WHERE sg.engagement_letter_id=l.id),'[]'::json) AS signatories
            FROM public.engagement_letters l WHERE l.client_id=$1 AND l.is_active ORDER BY l.created_at,l.id`,[clientId]);
          return json(result.rows);
        }
        if (statusRoute) {
          if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED',405);
          const input = periodInput(await body(request));
          // One statement gives clients, requirements and period uploads the same
          // database snapshot. RLS applies independently to every subquery.
          const result = await tx.query(`SELECT json_build_object(
            'clients', coalesce((SELECT json_agg(c ORDER BY c.business_name) FROM public.clients c), '[]'::json),
            'requirements', coalesce((SELECT json_agg(r ORDER BY r.sort_order) FROM public.document_requirements r), '[]'::json),
            'uploads', coalesce((SELECT json_agg(u ORDER BY u.uploaded_at) FROM public.document_uploads u WHERE u.period_year=$1 AND u.period_month=$2), '[]'::json)
          ) AS result`,[input.year,input.month]);
          return json(result.rows[0].result);
        }
        if (request.method === 'GET') {
          if (!clientId) return json((await tx.query('SELECT * FROM public.clients ORDER BY business_name')).rows);
          const client = (await tx.query('SELECT * FROM public.clients WHERE id=$1',[clientId])).rows[0];
          if (!client) fail('NOT_FOUND',404);
          const requirements = (await tx.query('SELECT * FROM public.document_requirements WHERE client_id=$1 ORDER BY sort_order',[clientId])).rows;
          return json({client,requirements});
        }
        const locked = (await tx.query('SELECT id,plan,account_type FROM public.bookkeepers WHERE id=$1 FOR UPDATE',[current.user.id])).rows[0];
        if (!locked || locked.account_type !== 'practitioner') fail('FORBIDDEN',403);
        let existing;
        if (clientId) {
          existing = (await tx.query('SELECT * FROM public.clients WHERE id=$1 FOR UPDATE',[clientId])).rows[0];
          if (!existing) fail('NOT_FOUND',404);
        }
        if (clientRoute[2] === '/delete') {
          await body(request);
          await tx.query('DELETE FROM public.clients WHERE id=$1',[clientId]);
          return json({ok:true});
        }
        const input = clientInput(await body(request),Boolean(clientId));
        const limits = {free:3,starter:15,pro:null};
        if (!Object.hasOwn(limits,locked.plan)) fail('FORBIDDEN',403);
        if (input.active && (!existing || !existing.is_active) && limits[locked.plan] !== null) {
          const count = Number((await tx.query('SELECT count(*) FROM public.clients WHERE is_active')).rows[0].count);
          if (count >= limits[locked.plan]) fail('PLAN_LIMIT',409);
        }
        let client;
        if (!clientId) {
          client = (await tx.query('INSERT INTO public.clients(bookkeeper_id,business_name,contact_name,contact_email,notes_for_client,notes_private,portal_token) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [current.user.id,input.business,input.contact,input.email,input.notes,input.privateNotes,randomBytes(32).toString('base64url')])).rows[0];
          for (const [index,day] of input.days.entries()) await tx.query('INSERT INTO public.reminder_schedules(client_id,day_of_month,reminder_number) VALUES ($1,$2,$3)',[client.id,day,index+1]);
        } else {
          client = (await tx.query('UPDATE public.clients SET business_name=$1,contact_name=$2,contact_email=$3,notes_for_client=$4,notes_private=$5,is_active=$6 WHERE id=$7 RETURNING *',
            [input.business,input.contact,input.email,input.notes,input.privateNotes,input.active,clientId])).rows[0];
          const owned = new Set((await tx.query('SELECT id FROM public.document_requirements WHERE client_id=$1',[clientId])).rows.map(r => r.id));
          if (input.requirements.some(req => req.id && !owned.has(req.id))) fail('FORBIDDEN',403);
          await tx.query('DELETE FROM public.document_requirements WHERE client_id=$1 AND NOT (id=ANY($2::uuid[]))',[clientId,input.requirements.filter(r => r.id).map(r => r.id)]);
        }
        for (const [index,req] of input.requirements.entries()) {
          if (req.id) await tx.query('UPDATE public.document_requirements SET label=$1,doc_type=$2,required=$3,sort_order=$4 WHERE id=$5 AND client_id=$6',[req.label,req.doc_type,req.required,index,req.id,client.id]);
          else await tx.query('INSERT INTO public.document_requirements(client_id,label,doc_type,required,sort_order) VALUES ($1,$2,$3,$4,$5)',[client.id,req.label,req.doc_type,req.required,index]);
        }
        return json(client);
      });
    } catch (error) {
      if (error instanceof ApiError || error instanceof StorageError) return json({code:error.code},error.status);
      if (error?.code === 'UNAUTHENTICATED') return json({code:'UNAUTHENTICATED'},401);
      // Only protocol/error categories reach the operator. Never emit request
      // routes, identifiers, SQL, error messages or provider response objects.
      const code=typeof error?.code==='string' && (/^(?:08|23|40|42|53|55|57|58)[A-Z0-9]{3}$/.test(error.code) || ['ECONNREFUSED','ECONNRESET','ETIMEDOUT'].includes(error.code))?error.code:error?.message==='Query read timeout'?'QUERY_TIMEOUT':'UNKNOWN';
      try {onFailure?.({status:'failed',code:'API_UNAVAILABLE',stage,cause:code});}catch{/* Reporting cannot change the response or retry the operation. */}
      // Raw auth/SQL errors may contain PII. The client receives only a stable code.
      return json({code:'UNAVAILABLE'},503);
    }
  };
}
