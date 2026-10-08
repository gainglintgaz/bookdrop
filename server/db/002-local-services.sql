-- Local Better Auth uses its generated schema; never import this schema to Neon Auth.
begin;
create role bookdrop_auth nologin nosuperuser nocreatedb nocreaterole nobypassrls;
create role bookdrop_identity nologin nosuperuser nocreatedb nocreaterole nobypassrls;
create schema local_auth;
revoke all on schema local_auth from public;
grant usage on schema local_auth to bookdrop_auth;
alter default privileges in schema local_auth grant select, insert, update, delete on tables to bookdrop_auth;
grant usage on schema public, app_private to bookdrop_identity;
grant select, insert on app_private.identities to bookdrop_identity;
grant select, insert on public.bookkeepers, public.clients to bookdrop_identity;
grant update (self_client_id) on public.bookkeepers to bookdrop_identity;
create policy bookkeepers_identity_read on public.bookkeepers for select to bookdrop_identity using (true);
create policy bookkeepers_identity_create on public.bookkeepers for insert to bookdrop_identity with check (plan='free');
create policy bookkeepers_identity_link on public.bookkeepers for update to bookdrop_identity using (true) with check (plan='free');
create policy clients_identity_read on public.clients for select to bookdrop_identity using (true);
create policy clients_identity_create on public.clients for insert to bookdrop_identity with check (
  exists (select 1 from public.bookkeepers b where b.id=clients.bookkeeper_id and b.account_type='solo')
);
create table public.reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  day_of_month integer not null check (day_of_month between 1 and 31),
  reminder_number integer not null check (reminder_number between 1 and 5),
  is_active boolean not null default true,
  unique (client_id, reminder_number)
);
create index reminder_schedules_client_idx on public.reminder_schedules(client_id);
alter table public.reminder_schedules enable row level security;
alter table public.reminder_schedules force row level security;
create policy reminders_owner on public.reminder_schedules to bookdrop_app
 using (exists (select 1 from public.clients c where c.id=reminder_schedules.client_id))
 with check (exists (select 1 from public.clients c where c.id=reminder_schedules.client_id));
grant select, insert, update, delete on public.reminder_schedules to bookdrop_app;
commit;
