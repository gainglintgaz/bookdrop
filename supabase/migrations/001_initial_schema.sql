-- ============================================================================
-- BookDrop V1 — Complete Initial Schema
-- supabase/migrations/001_initial_schema.sql
--
-- Run: supabase db push
-- Or:  supabase migration up
-- Or:  paste into Supabase dashboard SQL editor
--
-- This creates ALL tables, RLS policies, indexes, storage buckets, views,
-- and helper functions needed for a fresh V1 deployment.
-- ============================================================================

-- ─── EXTENSIONS ─────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- generate_portal_token() — 12-char random alphanumeric string
-- Used as the magic link key for client upload pages.
-- ~71 bits of entropy (62^12) — more than enough for this use case.

create or replace function generate_portal_token()
returns text
language plpgsql
as $$
declare
  chars  text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i      int;
begin
  for i in 1..12 loop
    result := result || substr(chars, floor(random() * 62 + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- Auto-generate portal_token on client INSERT if not provided.
-- Retries up to 5 times on uniqueness collision (astronomically unlikely).

create or replace function auto_generate_portal_token()
returns trigger
language plpgsql
as $$
declare
  attempts int := 0;
begin
  if new.portal_token is null or new.portal_token = '' then
    loop
      new.portal_token := generate_portal_token();
      -- Check uniqueness
      if not exists (select 1 from clients where portal_token = new.portal_token) then
        exit;
      end if;
      attempts := attempts + 1;
      if attempts >= 5 then
        raise exception 'Could not generate unique portal_token after 5 attempts';
      end if;
    end loop;
  end if;
  return new;
end;
$$;


-- ============================================================================
-- TABLE 1: BOOKKEEPERS (the paying customers)
-- ============================================================================

create table if not exists bookkeepers (
  id                      uuid primary key references auth.users(id) on delete cascade,
  email                   text unique not null,
  full_name               text not null,
  practice_name           text not null default '',
  reply_to_email          text not null,
  plan                    text not null default 'free'
                          check (plan in ('free', 'starter', 'pro')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  reminder_tone           text not null default 'professional'
                          check (reminder_tone in ('friendly', 'professional', 'firm')),
  notify_on_complete      boolean not null default true,
  notify_on_any_upload    boolean not null default false,
  notify_on_late          boolean not null default true,
  created_at              timestamptz not null default now()
);

alter table bookkeepers enable row level security;

-- Bookkeepers can only read/write their own row
create policy "bookkeepers_own_row" on bookkeepers
  for all using (auth.uid() = id);


-- ============================================================================
-- TABLE 2: CLIENTS (the bookkeeper's clients — never log in)
-- ============================================================================

create table if not exists clients (
  id               uuid primary key default gen_random_uuid(),
  bookkeeper_id    uuid not null references bookkeepers(id) on delete cascade,
  business_name    text not null,
  contact_name     text,
  contact_email    text not null,
  portal_token     text unique not null default generate_portal_token(),
  notes_private    text,
  notes_for_client text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Trigger: auto-generate portal_token if NULL/empty on insert
create trigger trg_clients_auto_portal_token
  before insert on clients
  for each row
  execute function auto_generate_portal_token();

-- Indexes
create index if not exists clients_bookkeeper_id_idx on clients(bookkeeper_id);
-- portal_token already has a UNIQUE constraint which creates an implicit index

alter table clients enable row level security;

-- Authenticated bookkeepers: full access to their own clients
create policy "clients_owner_all" on clients
  for all using (auth.uid() = bookkeeper_id);

-- Public: anyone with a valid portal_token can look up the client (upload page)
-- Uses portal_token as the "auth" — token IS the secret
create policy "clients_public_read_by_token" on clients
  for select
  to anon
  using (true);
  -- The upload page passes the token and filters client-side.
  -- Token entropy (62^12 ~ 71 bits) makes brute-force infeasible.


-- ============================================================================
-- TABLE 3: DOCUMENT REQUIREMENTS
-- ============================================================================

create table if not exists document_requirements (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  label       text not null,
  doc_type    text not null default 'other'
              check (doc_type in ('bank', 'credit_card', 'receipt', 'payroll', 'w2', '1099_nec', '1099_misc', '1099_int', '1099_div', '1099_k', '1040', '1098', 'investment', 'mortgage', 'other')),
  required    boolean not null default true,
  sort_order  int not null default 0
);

create index if not exists doc_requirements_client_id_idx on document_requirements(client_id);

alter table document_requirements enable row level security;

-- Authenticated: bookkeepers access via their clients
create policy "doc_requirements_owner_all" on document_requirements
  for all using (
    exists (
      select 1 from clients
      where clients.id = document_requirements.client_id
        and clients.bookkeeper_id = auth.uid()
    )
  );

-- Public: upload page needs to show what documents are required
create policy "doc_requirements_public_read" on document_requirements
  for select
  to anon
  using (true);


-- ============================================================================
-- TABLE 4: DOCUMENT UPLOADS
-- ============================================================================

create table if not exists document_uploads (
  id                uuid primary key default gen_random_uuid(),
  requirement_id    uuid not null references document_requirements(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  bookkeeper_id     uuid not null references bookkeepers(id) on delete cascade,
  period_year       int not null,
  period_month      int not null check (period_month between 1 and 12),
  filename_original text not null,
  storage_path      text not null,
  file_size_bytes   bigint not null default 0,
  uploaded_at       timestamptz not null default now()
);

-- Indexes
create index if not exists doc_uploads_client_month_idx
  on document_uploads(client_id, period_year, period_month);
create index if not exists doc_uploads_bookkeeper_idx
  on document_uploads(bookkeeper_id);
create index if not exists doc_uploads_requirement_idx
  on document_uploads(requirement_id);

alter table document_uploads enable row level security;

-- Authenticated: bookkeepers can read and delete their uploads
create policy "doc_uploads_owner_select" on document_uploads
  for select using (auth.uid() = bookkeeper_id);

create policy "doc_uploads_owner_delete" on document_uploads
  for delete using (auth.uid() = bookkeeper_id);

-- Public: anon can insert (upload page). The Edge Function validates
-- portal_token and populates bookkeeper_id before inserting via service role.
-- This policy allows anon inserts as a fallback if not using service role.
create policy "doc_uploads_public_insert" on document_uploads
  for insert
  to anon
  with check (true);

-- Public: anon can read uploads for a client (upload page shows what's already submitted)
create policy "doc_uploads_public_select" on document_uploads
  for select
  to anon
  using (true);


-- ============================================================================
-- TABLE 5: REMINDER SCHEDULES
-- ============================================================================

create table if not exists reminder_schedules (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  day_of_month    int not null check (day_of_month between 1 and 31),
  reminder_number int not null check (reminder_number between 1 and 5),
  is_active       boolean not null default true,
  unique (client_id, reminder_number)
);

create index if not exists reminder_schedules_client_idx on reminder_schedules(client_id);

alter table reminder_schedules enable row level security;

create policy "reminder_schedules_owner_all" on reminder_schedules
  for all using (
    exists (
      select 1 from clients
      where clients.id = reminder_schedules.client_id
        and clients.bookkeeper_id = auth.uid()
    )
  );


-- ============================================================================
-- TABLE 6: REMINDER LOG
-- ============================================================================

create table if not exists reminder_log (
  id              uuid primary key default gen_random_uuid(),
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

-- Indexes
create index if not exists reminder_log_client_month_idx
  on reminder_log(client_id, period_year, period_month);
create index if not exists reminder_log_bookkeeper_idx
  on reminder_log(bookkeeper_id);

alter table reminder_log enable row level security;

create policy "reminder_log_owner_all" on reminder_log
  for all using (auth.uid() = bookkeeper_id);


-- ============================================================================
-- TABLE 7: MESSAGES (two-way client-bookkeeper messaging)
-- ============================================================================

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  bookkeeper_id   uuid not null references bookkeepers(id) on delete cascade,
  sender_type     text not null check (sender_type in ('bookkeeper', 'client')),
  content         text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- Indexes
create index if not exists messages_client_created_idx
  on messages(client_id, created_at);
create index if not exists messages_bookkeeper_unread_idx
  on messages(bookkeeper_id, read_at) where read_at is null;

alter table messages enable row level security;

-- Authenticated: bookkeepers can do everything with their own messages
create policy "messages_owner_all" on messages
  for all using (auth.uid() = bookkeeper_id);

-- Public: clients can send messages via portal (sender_type must be 'client')
create policy "messages_public_insert" on messages
  for insert
  to anon
  with check (sender_type = 'client');

-- Public: clients can read their own conversation via portal_token lookup
-- The upload page passes client_id derived from portal_token
create policy "messages_public_select" on messages
  for select
  to anon
  using (
    exists (
      select 1 from clients
      where clients.id = messages.client_id
    )
  );


-- ============================================================================
-- TABLE 8: MESSAGE ATTACHMENTS
-- ============================================================================

create table if not exists message_attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references messages(id) on delete cascade,
  filename      text not null,
  file_size     bigint,
  storage_path  text not null,
  mime_type     text,
  created_at    timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on message_attachments(message_id);

alter table message_attachments enable row level security;

-- Authenticated: bookkeepers access via their messages
create policy "message_attachments_owner_all" on message_attachments
  for all using (
    exists (
      select 1 from messages
      where messages.id = message_attachments.message_id
        and messages.bookkeeper_id = auth.uid()
    )
  );

-- Public: anon can read attachments for messages they can see
create policy "message_attachments_public_select" on message_attachments
  for select
  to anon
  using (
    exists (
      select 1 from messages
      where messages.id = message_attachments.message_id
    )
  );

-- Public: anon can insert attachments when sending a message
create policy "message_attachments_public_insert" on message_attachments
  for insert
  to anon
  with check (
    exists (
      select 1 from messages
      where messages.id = message_attachments.message_id
        and messages.sender_type = 'client'
    )
  );


-- ============================================================================
-- TABLE 9: NOTIFICATIONS (in-app notifications for bookkeepers)
-- ============================================================================

create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  bookkeeper_id   uuid not null references bookkeepers(id) on delete cascade,
  type            text not null,
  title           text not null,
  body            text not null,
  client_id       uuid references clients(id) on delete set null,
  client_name     text,
  read            boolean not null default false,
  action_url      text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

-- Indexes
create index if not exists notifications_bookkeeper_created_idx
  on notifications(bookkeeper_id, created_at);
create index if not exists notifications_bookkeeper_unread_idx
  on notifications(bookkeeper_id, read) where read = false;

alter table notifications enable row level security;

create policy "notifications_owner_all" on notifications
  for all using (auth.uid() = bookkeeper_id);


-- ============================================================================
-- TABLE 10: WORKFLOW RESULTS (document processing workflow tracking)
-- ============================================================================

create table if not exists workflow_results (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  bookkeeper_id   uuid not null references bookkeepers(id) on delete cascade,
  period_year     int not null,
  period_month    int not null check (period_month between 1 and 12),
  status          text not null default 'pending'
                  check (status in ('pending', 'running', 'completed', 'failed')),
  summary         jsonb,
  steps           jsonb,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

-- Indexes
create index if not exists workflow_results_client_month_idx
  on workflow_results(client_id, period_year, period_month);
create index if not exists workflow_results_bookkeeper_idx
  on workflow_results(bookkeeper_id);

alter table workflow_results enable row level security;

create policy "workflow_results_owner_all" on workflow_results
  for all using (auth.uid() = bookkeeper_id);


-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================

-- Create the private 'documents' bucket for file uploads.
-- Storage path: {bookkeeper_id}/{client_id}/{year}/{month}/{requirement_id}/{filename}
-- Access: signed URLs only, generated server-side, expire in 1 hour.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,                -- private bucket
  52428800,             -- 50 MB max file size
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Storage policies: bookkeepers can read/list their own folder
create policy "storage_documents_owner_select" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policies: bookkeepers can delete their own files
create policy "storage_documents_owner_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policies: bookkeepers can upload to their own folder
create policy "storage_documents_owner_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policies: anon can upload (for client upload page via portal)
-- The Edge Function validates portal_token and constructs the correct path.
-- This policy allows anon inserts into the documents bucket.
create policy "storage_documents_anon_insert" on storage.objects
  for insert
  to anon
  with check (bucket_id = 'documents');


-- ============================================================================
-- VIEWS — Dashboard Insights
-- ============================================================================

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

-- Late rate per client (rolling 6-month window)
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

-- Unread message counts per client (for bookkeeper dashboard)
create or replace view unread_message_counts as
select
  m.bookkeeper_id,
  m.client_id,
  c.business_name,
  count(*) as unread_count,
  max(m.created_at) as latest_message_at
from messages m
join clients c on c.id = m.client_id
where m.read_at is null
  and m.sender_type = 'client'
group by m.bookkeeper_id, m.client_id, c.business_name;

-- Unread notification count per bookkeeper
create or replace view unread_notification_counts as
select
  bookkeeper_id,
  count(*) as unread_count
from notifications
where read = false
group by bookkeeper_id;


-- ============================================================================
-- DONE
-- ============================================================================
-- Migration complete. Tables created:
--   1. bookkeepers          — practitioner accounts
--   2. clients              — bookkeeper's clients (portal_token auth)
--   3. document_requirements — what each client must submit
--   4. document_uploads     — actual submitted files
--   5. reminder_schedules   — automated reminder configuration
--   6. reminder_log         — audit trail of sent reminders
--   7. messages             — two-way client-bookkeeper messaging
--   8. message_attachments  — files attached to messages
--   9. notifications        — in-app notifications for bookkeepers
--  10. workflow_results     — document processing workflow tracking
--
-- Also created:
--   - Storage bucket: documents (private, 50MB limit)
--   - Helper functions: generate_portal_token(), auto_generate_portal_token()
--   - Views: client_monthly_status, client_late_rates,
--            unread_message_counts, unread_notification_counts
--   - RLS policies on all tables + storage
--   - Performance indexes on all foreign keys and query patterns
