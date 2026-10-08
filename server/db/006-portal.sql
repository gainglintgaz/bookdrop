-- A distinct server-only role for one active portal client. No auth/billing,
-- private notes, token reads, signature images or signatory invitations.
begin;
create role bookdrop_portal nologin nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public,app_private to bookdrop_portal;
create function app_private.portal_token() returns text
language sql stable security invoker set search_path=pg_catalog
as $$ select nullif(current_setting('bookdrop.portal_token',true),'') $$;
revoke all on function app_private.portal_token() from public;
grant execute on function app_private.portal_token() to bookdrop_portal;

grant select(id,bookkeeper_id,business_name,contact_name,contact_email,notes_for_client,is_active,confirm_policy)
  on public.clients to bookdrop_portal;
create policy clients_portal on public.clients for select to bookdrop_portal
  using (is_active and portal_token=app_private.portal_token());
grant select(id,full_name,practice_name,reply_to_email) on public.bookkeepers to bookdrop_portal;
create policy bookkeepers_portal on public.bookkeepers for select to bookdrop_portal
  using (exists(select 1 from public.clients c where c.bookkeeper_id=bookkeepers.id));
grant select on public.document_requirements,public.document_uploads,public.engagement_letters to bookdrop_portal;
create policy requirements_portal on public.document_requirements for select to bookdrop_portal
  using (exists(select 1 from public.clients c where c.id=document_requirements.client_id));
create policy uploads_portal_read on public.document_uploads for select to bookdrop_portal
  using (exists(select 1 from public.clients c where c.id=document_uploads.client_id and c.bookkeeper_id=document_uploads.bookkeeper_id));
grant insert(id,requirement_id,client_id,bookkeeper_id,period_year,period_month,filename_original,storage_path,file_size_bytes,sha256,content_type)
  on public.document_uploads to bookdrop_portal;
create policy uploads_portal_create on public.document_uploads for insert to bookdrop_portal
  with check (exists(select 1 from public.clients c where c.id=document_uploads.client_id and c.bookkeeper_id=document_uploads.bookkeeper_id));
create policy letters_portal on public.engagement_letters for select to bookdrop_portal
  using (is_active and exists(select 1 from public.clients c where c.id=engagement_letters.client_id));
grant select(id,engagement_letter_id,client_id,bookkeeper_id,signed_at,signed_pdf_path,signed_pdf_sha256,signed_pdf_size_bytes)
  on public.signatures to bookdrop_portal;
create policy signatures_portal on public.signatures for select to bookdrop_portal
  using (exists(select 1 from public.engagement_letters l where l.id=signatures.engagement_letter_id and l.client_id=signatures.client_id));
commit;
