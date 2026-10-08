-- Portable core, applied once to a new dedicated database by its migration owner.
-- No provider schemas, passwords, browser grants, or production data.
begin;
create role bookdrop_app nologin nosuperuser nocreatedb nocreaterole nobypassrls;
create schema app_private;
revoke all on schema app_private from public;
revoke create on schema public from public;
grant usage on schema public, app_private to bookdrop_app;

-- Set only by the server after verifying a session; always transaction-local.
create function app_private.bookkeeper_id() returns uuid
language sql stable security invoker set search_path = pg_catalog
as $$ select nullif(current_setting('bookdrop.bookkeeper_id', true), '')::uuid $$;
revoke all on function app_private.bookkeeper_id() from public;
grant execute on function app_private.bookkeeper_id() to bookdrop_app;

create table public.bookkeepers (
  id uuid primary key,
  email text unique not null,
  full_name text not null default '',
  practice_name text not null default '',
  reply_to_email text not null default '',
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  reminder_tone text not null default 'professional' check (reminder_tone in ('friendly', 'professional', 'firm')),
  notify_on_complete boolean not null default true,
  notify_on_any_upload boolean not null default false,
  notify_on_late boolean not null default true,
  created_at timestamptz not null default now(),
  account_type text not null default 'practitioner' check (account_type in ('practitioner', 'solo')),
  business_name text,
  self_client_id uuid
);

-- Auth subject strings map to preserved application UUIDs. Only trusted account
-- provisioning/session services may use this table; no tenant-role privileges.
create table app_private.identities (
  provider text not null,
  subject text not null,
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  primary key (provider, subject),
  unique (provider, bookkeeper_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  business_name text not null,
  contact_name text,
  contact_email text not null,
  -- Server generates cryptographic tokens; preserve existing values during import.
  portal_token text unique not null,
  notes_private text,
  notes_for_client text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  confirm_policy text not null default 'low_confidence' check (confirm_policy in ('off', 'low_confidence', 'all_lines')),
  unique (id, bookkeeper_id)
);
create index clients_owner_name_idx on public.clients(bookkeeper_id, business_name);
alter table public.bookkeepers add constraint bookkeepers_self_client_owner_fk
  foreign key (self_client_id, id) references public.clients(id, bookkeeper_id)
  deferrable initially deferred;

create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  label text not null,
  doc_type text not null default 'other' check (doc_type in (
    'bank', 'credit_card', 'receipt', 'payroll', 'w2', '1099_nec', '1099_misc',
    '1099_int', '1099_div', '1099_k', '1040', '1098', 'investment', 'mortgage', 'other'
  )),
  required boolean not null default true,
  sort_order integer not null default 0
);
create index requirements_client_order_idx on public.document_requirements(client_id, sort_order);

alter table public.bookkeepers enable row level security;
alter table public.bookkeepers force row level security;
alter table public.clients enable row level security;
alter table public.clients force row level security;
alter table public.document_requirements enable row level security;
alter table public.document_requirements force row level security;

create policy bookkeepers_owner on public.bookkeepers to bookdrop_app
  using (id = app_private.bookkeeper_id()) with check (id = app_private.bookkeeper_id());
create policy clients_owner on public.clients to bookdrop_app
  using (bookkeeper_id = app_private.bookkeeper_id() and exists (
    select 1 from public.bookkeepers b where b.id = clients.bookkeeper_id
    and (b.account_type = 'practitioner' or b.self_client_id = clients.id)
  ))
  with check (bookkeeper_id = app_private.bookkeeper_id() and exists (
    select 1 from public.bookkeepers b where b.id = clients.bookkeeper_id
    and (b.account_type = 'practitioner' or b.self_client_id = clients.id)
  ));
create policy requirements_owner on public.document_requirements to bookdrop_app
  using (exists (select 1 from public.clients c where c.id = document_requirements.client_id))
  with check (exists (select 1 from public.clients c where c.id = document_requirements.client_id));

revoke all on public.bookkeepers, public.clients, public.document_requirements from public;
grant select on public.bookkeepers to bookdrop_app;
grant update (full_name, practice_name, reply_to_email, reminder_tone,
  notify_on_complete, notify_on_any_upload, notify_on_late, business_name)
  on public.bookkeepers to bookdrop_app;
-- Plan checks belong to the server mutation transaction before client creation.
-- No anonymous role or Data API is exposed; the portal requires a separate API.
grant select, insert, update, delete on public.clients, public.document_requirements to bookdrop_app;
commit;
