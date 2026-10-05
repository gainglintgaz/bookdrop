-- 008_advisor_fixes.sql
-- Address findings from get_advisors after migrations 004-007.
-- Pure tightening pass: no functional changes, only security + cleanup.
--
-- Applied to live project 2026-05-12 via apply_migration MCP tool.
-- This file is the canonical record of those changes so the migration history
-- on disk matches the live database state.

-- 1) Recreate signature_audit_view with security_invoker = true so RLS on
-- signatures (auth.uid() = bookkeeper_id) is enforced for the caller.
drop view if exists signature_audit_view;
create view signature_audit_view
  with (security_invoker = true) as
select
  sig.id                                      as signature_id,
  sig.engagement_letter_id,
  sig.bookkeeper_id,
  sig.client_id,
  sig.signer_name,
  sig.signer_email,
  sig.signed_at,
  sig.ip_address,
  sig.user_agent,
  sig.consent_disclosure_version,
  sig.consent_disclosure_agreed_at,
  sig.attempt_id,
  sig.signed_pdf_path,
  sg.signer_role,
  sg.signer_portal_token                      as signatory_token,
  sg.required_pages                           as signatory_required_pages,
  sg.placement                                as signatory_placement,
  sg.invite_sent_at,
  case when sig.initials_image_data is not null then true else false end as has_initials,
  sig.filled_form_fields,
  (
    select count(*)
    from signature_email_log el
    where el.signature_id = sig.id
      and el.status = 'sent'
  )                                           as confirmation_emails_sent,
  el.label                                    as document_label,
  el.fully_signed_at                          as letter_fully_signed_at
from signatures sig
left join engagement_letter_signatories sg on sg.id = sig.signatory_id
left join engagement_letters el            on el.id = sig.engagement_letter_id;

comment on view signature_audit_view is
  'Denormalized per-signature audit data. security_invoker=true so RLS on signatures (auth.uid() = bookkeeper_id) is enforced for the caller.';

-- 2) Pin search_path on all SECURITY DEFINER / volatile functions so they
-- can't be hijacked by an attacker creating same-named objects in a schema
-- earlier in the search_path.
alter function refresh_vendor_correction_stats() set search_path = public, pg_catalog;
alter function cleanup_old_signature_attempts(integer) set search_path = public, pg_catalog;
alter function count_letter_signatures(uuid) set search_path = public, pg_catalog;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='handle_new_user') then
    execute 'alter function public.handle_new_user() set search_path = public, pg_catalog';
  end if;
end $$;

-- 3) Revoke EXECUTE on SECURITY DEFINER functions from anon. These should
-- only be callable by the service role or by Vercel cron jobs.
revoke execute on function refresh_vendor_correction_stats()         from anon, authenticated, public;
revoke execute on function cleanup_old_signature_attempts(integer)   from anon, authenticated, public;
-- count_letter_signatures is read-only and useful for the bookkeeper UI;
-- keep it executable by authenticated, revoke from anon.
revoke execute on function count_letter_signatures(uuid)             from anon, public;
-- handle_new_user is a trigger function — should never be called via REST.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='handle_new_user') then
    execute 'revoke execute on function public.handle_new_user() from anon, authenticated, public';
  end if;
end $$;

-- 4) Lock down the materialized view (it currently leaks rollup data to anon).
revoke select on vendor_correction_stats from anon, authenticated, public;

-- 5) signature_attempts: explicit deny-all policy for clarity. The endpoint
-- uses the service-role key, which bypasses RLS entirely. This policy is
-- purely defensive against accidental anon access.
drop policy if exists "signature_attempts_no_public_access" on signature_attempts;
create policy "signature_attempts_no_public_access" on signature_attempts
  for all
  using (false)
  with check (false);

-- 6) Drop duplicate index on clients.portal_token.
drop index if exists idx_clients_portal_token;
