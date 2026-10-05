-- 009_document_line_items_and_portal_events.sql
-- Phase 1: line-level truth + append-only portal confirm audit.
-- Additive only. FinKeel-inspired source_kind spine (no fabricated kinds).
-- Advisors: run get_advisors after apply on live project.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) document_line_items
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists document_line_items (
  id                    uuid primary key default gen_random_uuid(),
  upload_id             uuid not null references document_uploads(id) on delete cascade,
  client_id             uuid not null references clients(id) on delete cascade,
  bookkeeper_id         uuid not null references bookkeepers(id) on delete cascade,
  line_index            int  not null check (line_index >= 0),
  txn_date              date,
  description_raw       text not null default '',
  description_display   text not null default '',
  amount_cents          bigint not null,
  amount_sign           text not null check (amount_sign in ('credit', 'debit')),
  suggested_category    text,
  suggested_subcategory text,
  confidence            text check (confidence in ('high', 'medium', 'low')),
  matched_vendor        text,
  final_category        text,
  final_subcategory     text,
  confirmed_by          text check (confirmed_by is null or confirmed_by in ('client_portal', 'bookkeeper')),
  confirmed_at          timestamptz,
  source_kind           text not null default 'statement_parse'
    check (source_kind in (
      'statement_parse', 'pdf_parse', 'csv_import', 'manual',
      'ai_suggested', 'correction', 'rule'
    )),
  source_rule           text,
  content_hash          text,
  engine_version        text,
  created_at            timestamptz not null default now(),
  unique (upload_id, line_index)
);

create index if not exists doc_line_items_upload_idx on document_line_items(upload_id);
create index if not exists doc_line_items_client_period_idx on document_line_items(client_id, bookkeeper_id);
create index if not exists doc_line_items_open_idx
  on document_line_items(bookkeeper_id, client_id)
  where confirmed_at is null and confidence = 'low';

comment on table document_line_items is
  'Line-level parse/categorize truth for audit + client/bookkeeper confirm. Money in cents.';

alter table document_line_items enable row level security;

create policy "doc_line_items_owner_all" on document_line_items
  for all
  using (auth.uid() = bookkeeper_id)
  with check (auth.uid() = bookkeeper_id);

-- Public portal does NOT get broad select; confirm via service-role path validating portal_token.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) portal_line_events (append-only)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists portal_line_events (
  id                         uuid primary key default gen_random_uuid(),
  line_id                    uuid references document_line_items(id) on delete set null,
  upload_id                  uuid not null references document_uploads(id) on delete cascade,
  client_id                  uuid not null references clients(id) on delete cascade,
  bookkeeper_id              uuid not null references bookkeepers(id) on delete cascade,
  event_type                 text not null
    check (event_type in (
      'view_confirm_ui', 'accept', 'change', 'reject_file', 'bookkeeper_correct'
    )),
  before_category            text,
  after_category             text,
  portal_token_fingerprint   text not null,
  recorded_at                timestamptz not null default now(),
  meta                       jsonb not null default '{}'::jsonb
);

create index if not exists portal_line_events_upload_idx
  on portal_line_events(upload_id, recorded_at desc);
create index if not exists portal_line_events_client_idx
  on portal_line_events(client_id, recorded_at desc);

comment on table portal_line_events is
  'Append-only audit of portal/bookkeeper line actions. Store token fingerprint never raw token.';

alter table portal_line_events enable row level security;

create policy "portal_line_events_owner_select" on portal_line_events
  for select
  using (auth.uid() = bookkeeper_id);

-- Inserts for portal happen via service role (Edge Function); bookkeepers may insert bookkeeper_correct.
create policy "portal_line_events_owner_insert" on portal_line_events
  for insert
  with check (auth.uid() = bookkeeper_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) categorization_corrections: link to line + actor
-- ─────────────────────────────────────────────────────────────────────────────

alter table categorization_corrections
  add column if not exists line_id uuid references document_line_items(id) on delete set null,
  add column if not exists actor text
    check (actor is null or actor in ('bookkeeper', 'client_portal')),
  add column if not exists portal_token_fingerprint text;

comment on column categorization_corrections.line_id is
  'Optional FK to document_line_items for two-way trace.';
comment on column categorization_corrections.actor is
  'Who applied the correction: bookkeeper app or client magic-link portal.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Per-client confirm policy (customization — no one-size-fits-all)
-- ─────────────────────────────────────────────────────────────────────────────

alter table clients
  add column if not exists confirm_policy text not null default 'low_confidence'
    check (confirm_policy in ('off', 'low_confidence', 'all_lines'));

comment on column clients.confirm_policy is
  'Portal confirm: off | only low_confidence lines | all parsed lines. Per-client override.';
