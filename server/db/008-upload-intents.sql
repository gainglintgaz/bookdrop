-- Persist before object creation on a separate connection, so metadata rollback
-- cannot erase the evidence needed to reconcile a private orphan later.
begin;
create role bookdrop_file_intent nologin nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema app_private to bookdrop_file_intent;
create table app_private.file_upload_intents (
  id uuid primary key,
  owner_id uuid not null,
  object_key text not null unique,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check(size_bytes between 1 and 52428800),
  status text not null default 'pending' check(status in ('pending','referenced','queued')),
  created_at timestamptz not null default now(),
  not_before timestamptz not null default (now()+interval '24 hours')
);
alter table app_private.file_upload_intents enable row level security;
alter table app_private.file_upload_intents force row level security;
create policy intent_writer on app_private.file_upload_intents for insert to bookdrop_file_intent with check(true);
create policy intent_cleanup on app_private.file_upload_intents to bookdrop_cleanup using(true) with check(true);
grant insert(id,owner_id,object_key,sha256,size_bytes) on app_private.file_upload_intents to bookdrop_file_intent;
grant select,update on app_private.file_upload_intents to bookdrop_cleanup;
grant insert on app_private.file_cleanup to bookdrop_cleanup;
create index upload_intents_pending_idx on app_private.file_upload_intents(not_before,created_at) where status='pending';
commit;
