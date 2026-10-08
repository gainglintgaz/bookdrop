-- Metadata deletion and its cleanup intent commit atomically. Objects remain
-- private during a 24-hour grace period. No browser role can read/alter jobs.
begin;
create role bookdrop_cleanup nologin nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public,app_private to bookdrop_cleanup;
create table app_private.file_cleanup (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  object_key text not null,
  sha256 text,
  size_bytes bigint,
  source_table text not null,
  source_id uuid not null,
  status text not null check(status in ('pending','review','done')),
  attempts integer not null default 0,
  not_before timestamptz not null default (now()+interval '24 hours'),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  last_code text
);
alter table app_private.file_cleanup enable row level security;
alter table app_private.file_cleanup force row level security;
create policy cleanup_worker on app_private.file_cleanup to bookdrop_cleanup using(true) with check(true);
create policy cleanup_migration_owner on app_private.file_cleanup to current_user using(true) with check(true);
grant select,update on app_private.file_cleanup to bookdrop_cleanup;
grant select(storage_path) on public.document_uploads,public.engagement_letters to bookdrop_cleanup;
grant select(signed_pdf_path) on public.signatures to bookdrop_cleanup;
create policy uploads_cleanup_probe on public.document_uploads for select to bookdrop_cleanup using(true);
create policy letters_cleanup_probe on public.engagement_letters for select to bookdrop_cleanup using(true);
create policy signatures_cleanup_probe on public.signatures for select to bookdrop_cleanup using(true);
create index uploads_storage_path_idx on public.document_uploads(storage_path);
create index letters_storage_path_idx on public.engagement_letters(storage_path);
create index signatures_storage_path_idx on public.signatures(signed_pdf_path) where signed_pdf_path is not null;
create index cleanup_pending_idx on app_private.file_cleanup(not_before,created_at) where status='pending';

create function app_private.queue_file_cleanup() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare object_path text; digest text; object_size bigint;
begin
  if TG_TABLE_NAME='signatures' then
    object_path:=OLD.signed_pdf_path; digest:=OLD.signed_pdf_sha256; object_size:=OLD.signed_pdf_size_bytes;
    if TG_OP='UPDATE' and OLD.signed_pdf_path is not distinct from NEW.signed_pdf_path then return null; end if;
  else
    object_path:=OLD.storage_path; digest:=OLD.sha256; object_size:=OLD.file_size_bytes;
    if TG_OP='UPDATE' and OLD.storage_path is not distinct from NEW.storage_path then return null; end if;
  end if;
  if object_path is null then return null; end if;
  insert into app_private.file_cleanup(owner_id,object_key,sha256,size_bytes,source_table,source_id,status)
    values(OLD.bookkeeper_id,object_path,digest,object_size,TG_TABLE_NAME,OLD.id,
      case when digest ~ '^[a-f0-9]{64}$' and object_size>0 then 'pending' else 'review' end);
  return null;
end $$;
revoke all on function app_private.queue_file_cleanup() from public;
create trigger uploads_cleanup_delete after delete on public.document_uploads for each row execute function app_private.queue_file_cleanup();
create trigger uploads_cleanup_replace after update of storage_path on public.document_uploads for each row execute function app_private.queue_file_cleanup();
create trigger letters_cleanup_delete after delete on public.engagement_letters for each row execute function app_private.queue_file_cleanup();
create trigger letters_cleanup_replace after update of storage_path on public.engagement_letters for each row execute function app_private.queue_file_cleanup();
create trigger signatures_cleanup_delete after delete on public.signatures for each row execute function app_private.queue_file_cleanup();
create trigger signatures_cleanup_replace after update of signed_pdf_path on public.signatures for each row execute function app_private.queue_file_cleanup();
commit;
