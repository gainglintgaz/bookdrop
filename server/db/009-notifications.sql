-- Portable in-app upload events. Not an email queue or a hosted-schema copy.
begin;
alter table public.document_uploads add constraint uploads_notification_owner_key unique(id,client_id,bookkeeper_id);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  client_id uuid not null,
  source_upload_id uuid unique not null,
  type text not null check (type in ('upload_complete','upload_partial')),
  title text not null,
  body text not null,
  client_name text not null,
  read boolean not null default false,
  action_url text not null check (action_url ~ '^/clients/[0-9a-f-]{36}$'),
  created_at timestamptz not null default now(),
  foreign key (client_id,bookkeeper_id) references public.clients(id,bookkeeper_id) on delete cascade,
  foreign key (source_upload_id,client_id,bookkeeper_id) references public.document_uploads(id,client_id,bookkeeper_id) on delete cascade
);
create index notifications_owner_time_idx on public.notifications(bookkeeper_id,created_at desc,id);
create index notifications_unread_idx on public.notifications(bookkeeper_id) where not read;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
revoke all on public.notifications from public;
grant select on public.notifications to bookdrop_app;
grant update(read) on public.notifications to bookdrop_app;
create policy notifications_owner_read on public.notifications for select to bookdrop_app
  using (bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=notifications.client_id));
create policy notifications_owner_update on public.notifications for update to bookdrop_app
  using (bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=notifications.client_id))
  with check (bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=notifications.client_id));
-- The upload trigger runs with the invoking role's privileges and RLS scope.
-- Portal may insert an event for its active client, but cannot read notifications.
grant insert(bookkeeper_id,client_id,source_upload_id,type,title,body,client_name,action_url,created_at)
  on public.notifications to bookdrop_app,bookdrop_portal;
create policy notifications_owner_insert on public.notifications for insert to bookdrop_app
  with check (bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=notifications.client_id));
create policy notifications_portal_insert on public.notifications for insert to bookdrop_portal
  with check (exists(select 1 from public.clients c where c.id=notifications.client_id and c.bookkeeper_id=notifications.bookkeeper_id));
create function app_private.notify_document_upload() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
declare complete boolean; business text;
begin
  perform pg_advisory_xact_lock(hashtextextended('upload-notification:'||new.client_id||':'||new.period_year||':'||new.period_month,0));
  select c.business_name into business from public.clients c where c.id=new.client_id;
  select not exists (
    select 1 from public.document_requirements r where r.client_id=new.client_id and r.required
    and not exists(select 1 from public.document_uploads u where u.requirement_id=r.id
      and u.period_year=new.period_year and u.period_month=new.period_month)
  ) into complete;
  insert into public.notifications(bookkeeper_id,client_id,source_upload_id,type,title,body,client_name,action_url,created_at)
    values(new.bookkeeper_id,new.client_id,new.id,
      case when complete then 'upload_complete' else 'upload_partial' end,
      case when complete then 'Required documents received' else 'Document received' end,
      'A document was received for '||new.period_year||'-'||lpad(new.period_month::text,2,'0')||'.',
      business,'/clients/'||new.client_id,new.uploaded_at);
  return new;
end $$;
revoke all on function app_private.notify_document_upload() from public;
create trigger document_upload_notification after insert on public.document_uploads
  for each row execute function app_private.notify_document_upload();
commit;
