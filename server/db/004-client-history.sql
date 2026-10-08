-- Portable client history. Signing and email writes require their dedicated
-- server workflows; application tenants receive read access only here.
begin;
create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  sent_at timestamptz not null default now(),
  reminder_number integer not null,
  triggered_by text not null default 'auto' check (triggered_by in ('auto','manual')),
  resend_email_id text,
  foreign key (client_id,bookkeeper_id) references public.clients(id,bookkeeper_id) on delete cascade
);
create index reminder_log_client_period_idx on public.reminder_log(client_id,period_year,period_month);
create index reminder_log_owner_idx on public.reminder_log(bookkeeper_id);
create table public.engagement_letters (
  id uuid primary key default gen_random_uuid(),
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  client_id uuid not null,
  label text not null,
  storage_path text not null,
  filename text not null,
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  fully_signed_at timestamptz,
  total_signatories_required integer default 1,
  unique (id,client_id,bookkeeper_id),
  unique (id,bookkeeper_id),
  foreign key (client_id,bookkeeper_id) references public.clients(id,bookkeeper_id) on delete cascade
);
create index letters_client_idx on public.engagement_letters(client_id,created_at);
create index letters_owner_idx on public.engagement_letters(bookkeeper_id);
create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  engagement_letter_id uuid not null,
  client_id uuid not null,
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  signed_at timestamptz not null default now(),
  signer_name text not null,
  signer_email text not null,
  signature_image_data text not null,
  signed_pdf_path text,
  ip_address text,
  portal_token_used text not null,
  user_agent text,
  consent_disclosure_agreed_at timestamptz,
  consent_disclosure_version text,
  attempt_id uuid,
  signatory_id uuid,
  initials_image_data text,
  filled_form_fields jsonb,
  unique (id,engagement_letter_id,bookkeeper_id),
  foreign key (engagement_letter_id,client_id,bookkeeper_id) references public.engagement_letters(id,client_id,bookkeeper_id) on delete cascade
);
create index signatures_letter_time_idx on public.signatures(engagement_letter_id,signed_at desc);
create index signatures_owner_idx on public.signatures(bookkeeper_id);
create index signatures_client_idx on public.signatures(client_id);
create table public.engagement_letter_signatories (
  id uuid primary key default gen_random_uuid(),
  engagement_letter_id uuid not null,
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  signer_role text not null check (signer_role in ('primary','spouse','partner','guarantor','other')),
  signer_name text not null,
  signer_email text not null,
  signer_portal_token text not null unique,
  required_pages jsonb not null default '[]',
  placement jsonb not null default '[]',
  signed_at timestamptz,
  signature_id uuid,
  previous_attempt_id uuid,
  invite_sent_at timestamptz,
  invite_email_id text,
  status text not null default 'invited' check (status in ('invited','viewed','signed','voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,engagement_letter_id,bookkeeper_id),
  foreign key (engagement_letter_id,bookkeeper_id) references public.engagement_letters(id,bookkeeper_id) on delete cascade,
  foreign key (signature_id,engagement_letter_id,bookkeeper_id) references public.signatures(id,engagement_letter_id,bookkeeper_id)
    on delete set null (signature_id) deferrable initially deferred
);
create unique index signatories_role_idx on public.engagement_letter_signatories(engagement_letter_id,signer_role) where signer_role <> 'other';
create index signatories_letter_idx on public.engagement_letter_signatories(engagement_letter_id);
create index signatories_owner_idx on public.engagement_letter_signatories(bookkeeper_id,status,created_at desc);
alter table public.signatures add constraint signatures_signatory_owner_fk
  foreign key (signatory_id,engagement_letter_id,bookkeeper_id) references public.engagement_letter_signatories(id,engagement_letter_id,bookkeeper_id)
  on delete set null (signatory_id) deferrable initially deferred;
alter table public.reminder_log enable row level security;
alter table public.reminder_log force row level security;
alter table public.engagement_letters enable row level security;
alter table public.engagement_letters force row level security;
alter table public.signatures enable row level security;
alter table public.signatures force row level security;
alter table public.engagement_letter_signatories enable row level security;
alter table public.engagement_letter_signatories force row level security;
create policy reminder_history_owner on public.reminder_log for select to bookdrop_app
  using (bookkeeper_id=app_private.bookkeeper_id() and exists (select 1 from public.clients c where c.id=reminder_log.client_id));
create policy letters_owner on public.engagement_letters to bookdrop_app
  using (bookkeeper_id=app_private.bookkeeper_id() and exists (select 1 from public.clients c where c.id=engagement_letters.client_id))
  with check (bookkeeper_id=app_private.bookkeeper_id() and exists (select 1 from public.clients c where c.id=engagement_letters.client_id));
create policy signatures_owner on public.signatures for select to bookdrop_app
  using (bookkeeper_id=app_private.bookkeeper_id() and exists (select 1 from public.engagement_letters l where l.id=signatures.engagement_letter_id));
create policy signatories_owner on public.engagement_letter_signatories for select to bookdrop_app
  using (bookkeeper_id=app_private.bookkeeper_id() and exists (select 1 from public.engagement_letters l where l.id=engagement_letter_signatories.engagement_letter_id));
grant select on public.reminder_log,public.engagement_letters,public.signatures,public.engagement_letter_signatories to bookdrop_app;
commit;
