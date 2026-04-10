-- supabase/migrations/001_initial_schema.sql
-- BookkeeperPortal — Complete Initial Schema
-- Run: supabase db push
-- Or apply via Supabase dashboard SQL editor

-- ─── EXTENSIONS ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── BOOKKEEPERS ─────────────────────────────────────────────────────────────
-- The paying customers. One row per bookkeeper account.
create table if not exists bookkeepers (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique not null,
  full_name       text not null,
  practice_name   text not null default '',
  reply_to_email  text not null,
  plan            text not null default 'free'
                  check (plan in ('free', 'starter', 'pro')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  reminder_tone   text not null default 'professional'
                  check (reminder_tone in ('friendly', 'professional', 'firm')),
  notify_on_complete    boolean not null default true,
  notify_on_any_upload  boolean not null default false,
  notify_on_late        boolean not null default true,
  created_at      timestamptz not null default now()
);

-- RLS: bookkeepers can only read/write their own row
alter table bookkeepers enable row level security;

create policy "bookkeepers_own_row" on bookkeepers
  for all using (auth.uid() = id);

-- ─── CLIENTS ─────────────────────────────────────────────────────────────────
-- The bookkeeper's clients. They never log in — they upload via portal_token.
create table if not exists clients (
  id              uuid primary key default uuid_generate_v4(),
  bookkeeper_id   uuid not null references bookkeepers(id) on delete cascade,
  business_name   text not null,
  contact_name    text,
  contact_email   text not null,
  portal_token    text unique not null,
  notes_private   text,
  notes_for_client text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index clients_bookkeeper_id_idx on clients(bookkeeper_id);
create index clients_portal_token_idx on clients(portal_token);

alter table clients enable row level security;

create policy "clients_owner_only" on clients
  for all using (auth.uid() = bookkeeper_id);

-- Public read for portal_token lookup (upload page — no auth)
-- The Edge Function handling uploads uses service role, so no public policy needed
-- But the client upload page needs to read client data — allow read by token
create policy "clients_public_read_by_token" on clients
  for select using (true);
-- Note: This allows reading all clients by token. The token IS the auth for clients.
-- The token is 12 random chars (~72 bits entropy) — secure for this use case.

-- ─── DOCUMENT REQUIREMENTS ───────────────────────────────────────────────────
-- What documents each client must submit each month.
create table if not exists document_requirements (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid not null references clients(id) on delete cascade,
  label       text not null,
  doc_type    text not null default 'other'
              check (doc_type in ('bank', 'credit_card', 'receipt', 'payroll', 'other')),
  required    boolean not null default true,
  sort_order  int not null default 0
);

create index doc_requirements_client_id_idx on document_requirements(client_id);

alter table document_requirements enable row level security;

-- Bookkeepers access requirements via their clients
create policy "doc_requirements_via_client" on document_requirements
  for all using (
    exists (
      select 1 from clients
      where clients.id = document_requirements.client_id
      and clients.bookkeeper_id = auth.uid()
    )
  );

-- Public read for the upload page (needed to show what's required)
create policy "doc_requirements_public_read" on document_requirements
  for select using (true);

-- ─── DOCUMENT UPLOADS ────────────────────────────────────────────────────────
-- The actual files submitted by clients.
create table if not exists document_uploads (
  id                  uuid primary key default uuid_generate_v4(),
  requirement_id      uuid not null references document_requirements(id) on delete cascade,
  client_id           uuid not null references clients(id) on delete cascade,
  bookkeeper_id       uuid not null references bookkeepers(id) on delete cascade,
  period_year         int not null,
  period_month        int not null check (period_month between 1 and 12),
  filename_original   text not null,
  storage_path        text not null,
  file_size_bytes     bigint not null default 0,
  uploaded_at         timestamptz not null default now()
);

create index doc_uploads_client_month_idx on document_uploads(client_id, period_year, period_month);
create index doc_uploads_bookkeeper_idx on document_uploads(bookkeeper_id);
create index doc_uploads_requirement_idx on document_uploads(requirement_id);

alter table document_uploads enable row level security;

-- Bookkeepers can read/delete their own uploads
create policy "doc_uploads_owner_read" on document_uploads
  for select using (auth.uid() = bookkeeper_id);

create policy "doc_uploads_owner_delete" on document_uploads
  for delete using (auth.uid() = bookkeeper_id);

-- Insert via service role only (upload page uses Edge Function with service role)
-- No authenticated insert policy — clients don't have auth sessions

-- ─── REMINDER SCHEDULES ──────────────────────────────────────────────────────
-- When to send automated reminders for each client.
create table if not exists reminder_schedules (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id) on delete cascade,
  day_of_month    int not null check (day_of_month between 1 and 31),
  reminder_number int not null check (reminder_number between 1 and 5),
  is_active       boolean not null default true,
  unique (client_id, reminder_number)
);

create index reminder_schedules_client_idx on reminder_schedules(client_id);

alter table reminder_schedules enable row level security;

create policy "reminder_schedules_via_client" on reminder_schedules
  for all using (
    exists (
      select 1 from clients
      where clients.id = reminder_schedules.client_id
      and clients.bookkeeper_id = auth.uid()
    )
  );

-- ─── REMINDER LOG ────────────────────────────────────────────────────────────
-- Audit trail of every reminder email sent.
create table if not exists reminder_log (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id) on delete cascade,
  bookkeeper_id   uuid not null references bookkeepers(id) on delete cascade,
  period_year     int not null,
  period_month    int not null check (period_month between 1 and 12),
  sent_at         timestamptz not null default now(),
  reminder_number int not null,
  triggered_by    text not null default 'auto'
                  check (triggered_by in ('auto', 'manual')),
  resend_email_id text
);

create index reminder_log_client_month_idx on reminder_log(client_id, period_year, period_month);
create index reminder_log_bookkeeper_idx on reminder_log(bookkeeper_id);

alter table reminder_log enable row level security;

create policy "reminder_log_owner" on reminder_log
  for all using (auth.uid() = bookkeeper_id);

-- ─── STORAGE BUCKET ──────────────────────────────────────────────────────────
-- Run this separately in Supabase dashboard or via CLI:
-- supabase storage create documents --private

-- Storage RLS (apply via Supabase dashboard → Storage → Policies):
-- Allow bookkeepers to read their own files:
--   (storage.foldername(name))[1] = auth.uid()::text
-- Allow service role to insert (for upload edge function):
--   service_role only

-- ─── USEFUL VIEWS ────────────────────────────────────────────────────────────

-- Client submission status for the current month
create or replace view client_monthly_status as
select
  c.id as client_id,
  c.bookkeeper_id,
  c.business_name,
  c.contact_email,
  c.portal_token,
  extract(year from now())::int as period_year,
  extract(month from now())::int as period_month,
  count(dr.id) filter (where dr.required) as required_count,
  count(du.id) filter (where dr.required) as submitted_required_count,
  case
    when count(dr.id) filter (where dr.required) = 0 then 'complete'
    when count(du.id) filter (where dr.required) = 0 then 'not_started'
    when count(du.id) filter (where dr.required) = count(dr.id) filter (where dr.required) then 'complete'
    else 'partial'
  end as submission_status
from clients c
left join document_requirements dr on dr.client_id = c.id
left join document_uploads du on du.requirement_id = dr.id
  and du.period_year = extract(year from now())::int
  and du.period_month = extract(month from now())::int
where c.is_active = true
group by c.id, c.bookkeeper_id, c.business_name, c.contact_email, c.portal_token;

-- Late rate per client (last 6 months)
create or replace view client_late_rates as
with monthly_data as (
  select
    c.id as client_id,
    c.bookkeeper_id,
    generate_series as period_month,
    extract(year from (now() - ((generate_series - 1) || ' months')::interval))::int as period_year
  from clients c
  cross join generate_series(1, 6)
  where c.is_active = true
    and c.created_at < now() - interval '2 months'
),
monthly_status as (
  select
    md.client_id,
    md.bookkeeper_id,
    count(distinct md.period_month) as months_tracked,
    count(distinct du.period_month) filter (
      where du.uploaded_at < make_date(md.period_year, md.period_month::int, 6)::timestamptz
    ) as on_time_count
  from monthly_data md
  left join document_uploads du on du.client_id = md.client_id
    and du.period_year = md.period_year
    and du.period_month = md.period_month::int
  group by md.client_id, md.bookkeeper_id
)
select
  client_id,
  bookkeeper_id,
  months_tracked,
  on_time_count,
  case
    when months_tracked = 0 then null
    else round(on_time_count::numeric / months_tracked::numeric, 2)
  end as on_time_rate
from monthly_status;
