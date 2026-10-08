-- Deliberate portable messaging contract: server-derived participants, private
-- immutable attachments, and read-only receipts for the receiving participant.
begin;
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  sender_type text not null check(sender_type in ('bookkeeper','client')),
  content text not null check(length(content) between 1 and 10000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id,client_id,bookkeeper_id),
  foreign key(client_id,bookkeeper_id) references public.clients(id,bookkeeper_id) on delete cascade
);
create index messages_client_created_idx on public.messages(client_id,created_at,id);
create index messages_bookkeeper_unread_idx on public.messages(bookkeeper_id,read_at) where read_at is null;
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  client_id uuid not null,
  bookkeeper_id uuid not null,
  filename text not null,
  file_size bigint not null check(file_size between 1 and 52428800),
  storage_path text not null unique,
  mime_type text not null,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key(message_id,client_id,bookkeeper_id) references public.messages(id,client_id,bookkeeper_id) on delete cascade
);
create index message_attachments_message_idx on public.message_attachments(message_id);
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.message_attachments enable row level security;
alter table public.message_attachments force row level security;
revoke all on public.messages,public.message_attachments from public;
grant select on public.messages,public.message_attachments to bookdrop_app,bookdrop_portal;
grant insert(id,client_id,bookkeeper_id,sender_type,content) on public.messages to bookdrop_app,bookdrop_portal;
grant update(read_at) on public.messages to bookdrop_app,bookdrop_portal;
grant insert(id,message_id,client_id,bookkeeper_id,filename,file_size,storage_path,mime_type,sha256) on public.message_attachments to bookdrop_app,bookdrop_portal;
create policy messages_owner_read on public.messages for select to bookdrop_app
  using(bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=messages.client_id));
create policy messages_owner_send on public.messages for insert to bookdrop_app
  with check(sender_type='bookkeeper' and bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=messages.client_id and c.is_active));
create policy messages_owner_receipt on public.messages for update to bookdrop_app
  using(sender_type='client' and bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=messages.client_id))
  with check(sender_type='client' and bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=messages.client_id));
create policy messages_portal_read on public.messages for select to bookdrop_portal
  using(exists(select 1 from public.clients c where c.id=messages.client_id and c.bookkeeper_id=messages.bookkeeper_id));
create policy messages_portal_send on public.messages for insert to bookdrop_portal
  with check(sender_type='client' and exists(select 1 from public.clients c where c.id=messages.client_id and c.bookkeeper_id=messages.bookkeeper_id));
create policy messages_portal_receipt on public.messages for update to bookdrop_portal
  using(sender_type='bookkeeper' and exists(select 1 from public.clients c where c.id=messages.client_id))
  with check(sender_type='bookkeeper' and exists(select 1 from public.clients c where c.id=messages.client_id));
create policy attachments_owner_read on public.message_attachments for select to bookdrop_app
  using(exists(select 1 from public.messages m where m.id=message_attachments.message_id));
create policy attachments_portal_read on public.message_attachments for select to bookdrop_portal
  using(exists(select 1 from public.messages m where m.id=message_attachments.message_id));
create policy attachments_owner_send on public.message_attachments for insert to bookdrop_app
  with check(exists(select 1 from public.messages m where m.id=message_attachments.message_id and m.sender_type='bookkeeper'));
create policy attachments_portal_send on public.message_attachments for insert to bookdrop_portal
  with check(exists(select 1 from public.messages m where m.id=message_attachments.message_id and m.sender_type='client'));
grant select(storage_path) on public.message_attachments to bookdrop_cleanup;
create policy attachments_cleanup_probe on public.message_attachments for select to bookdrop_cleanup using(true);
create function app_private.queue_message_attachment_cleanup() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  insert into app_private.file_cleanup(owner_id,object_key,sha256,size_bytes,source_table,source_id,status)
    values(old.bookkeeper_id,old.storage_path,old.sha256,old.file_size,'message_attachments',old.id,'pending');
  return null;
end $$;
revoke all on function app_private.queue_message_attachment_cleanup() from public;
create trigger message_attachment_cleanup_delete after delete on public.message_attachments
  for each row execute function app_private.queue_message_attachment_cleanup();
commit;
