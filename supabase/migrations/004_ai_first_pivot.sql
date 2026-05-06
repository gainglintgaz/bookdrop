-- supabase/migrations/004_ai_first_pivot.sql
-- AI-first pivot: Phase A flywheel capture + auto-categorization metadata
--
-- Implements DATA_FLYWHEEL.md §C (corrections in core flow) + §D.1 (auto-categorization
-- at upload moment) + §D.2 (cycle outcomes captured at sign-off). All schema changes
-- are additive — no breaking changes to existing tables.
--
-- After this migration:
--  • Every document upload of a bank/CC statement carries categorization metadata
--    (auto_categorized_at, confidence, summary)
--  • Every categorization correction made by a bookkeeper writes a row that compounds
--    over time as the per-firm classification corpus
--  • Every close-cycle sign-off writes a row capturing hours-saved, accuracy %, and
--    AI-claim-vs-actual delta — the highest-density training signal
--
-- This is the schema half of the AI-first pivot. The UI half wires categorization
-- into the upload handler and adds correction-capture UX.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) document_uploads: auto-categorization metadata columns
-- ─────────────────────────────────────────────────────────────────────────────

alter table document_uploads
  add column if not exists auto_categorized_at        timestamptz,
  add column if not exists auto_categorization_confidence text
    check (auto_categorization_confidence in ('high', 'medium', 'low')),
  add column if not exists client_confirmed_at        timestamptz,
  add column if not exists parsed_summary             jsonb,
  add column if not exists categorization_summary     jsonb;

comment on column document_uploads.auto_categorized_at is
  'When the auto-categorization engine ran on this upload. NULL means it was not run (e.g. non-bank doc).';
comment on column document_uploads.auto_categorization_confidence is
  'Aggregate confidence tier across all transactions in this upload.';
comment on column document_uploads.client_confirmed_at is
  'When the client confirmed the auto-categorization on the public upload page.';
comment on column document_uploads.parsed_summary is
  'JSON: bankName, accountLast4, openingBalance, closingBalance, totalCredits, totalDebits, transactionCount';
comment on column document_uploads.categorization_summary is
  'JSON: totalCategorized, highConfidence, mediumConfidence, lowConfidence, byCategory, flagsCount';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) categorization_corrections: every bookkeeper-corrected categorization
-- ─────────────────────────────────────────────────────────────────────────────
-- Highest-density training signal in the entire product. Each row records what
-- the engine guessed, what the bookkeeper corrected it to, and why. Compounds
-- per-firm: bookkeeper A's corrections train BookDrop's classifier for A's
-- future transactions. Cross-firm aggregation (k=N gated) lands in V1.1+.

create table if not exists categorization_corrections (
  id                  uuid primary key default gen_random_uuid(),
  bookkeeper_id       uuid not null references bookkeepers(id) on delete cascade,
  client_id           uuid not null references clients(id)     on delete cascade,
  upload_id           uuid references document_uploads(id)     on delete set null,
  -- The transaction that was corrected — denormalized so the row stays useful
  -- even if the source upload is deleted later.
  transaction_date    date,
  transaction_amount_cents bigint,
  vendor_normalized   text,
  description_raw     text,
  -- The before/after of the correction
  original_category   text,
  corrected_category  text not null,
  original_subcategory text,
  corrected_subcategory text,
  -- Why this was corrected — optional, but valuable when populated
  reason              text,
  -- Status of this correction in the learning loop
  status              text not null default 'applied'
    check (status in ('applied', 'undone', 'auto_promoted')),
  applied_at          timestamptz not null default now(),
  -- How sure was the engine when it made the (now-corrected) call?
  original_confidence text
    check (original_confidence in ('high', 'medium', 'low'))
);

create index if not exists cat_corrections_bookkeeper_idx
  on categorization_corrections(bookkeeper_id, applied_at desc);
create index if not exists cat_corrections_vendor_idx
  on categorization_corrections(bookkeeper_id, vendor_normalized);
create index if not exists cat_corrections_client_idx
  on categorization_corrections(client_id, applied_at desc);

alter table categorization_corrections enable row level security;

-- Bookkeepers see + write their own corrections only. RLS strict.
create policy "cat_corrections_owner_all" on categorization_corrections
  for all
  using (auth.uid() = bookkeeper_id)
  with check (auth.uid() = bookkeeper_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) close_cycle_outcomes: per-cycle outcome capture at sign-off
-- ─────────────────────────────────────────────────────────────────────────────
-- Captured when the bookkeeper marks a client's monthly close as complete.
-- This is the "outcome" half of every loop (per data-flywheel.md §2 and
-- DATA_FLYWHEEL.md §C). Without this row, the loop never closes and the
-- flywheel never spins.

create table if not exists close_cycle_outcomes (
  id                       uuid primary key default gen_random_uuid(),
  bookkeeper_id            uuid not null references bookkeepers(id) on delete cascade,
  client_id                uuid not null references clients(id)     on delete cascade,
  period_year              int  not null,
  period_month             int  not null check (period_month between 1 and 12),
  -- Outcome metrics
  hours_saved_minutes      int  default 0,
  accuracy_pct             numeric(5,2),                          -- % of AI calls that needed no correction
  reconciliation_match_pct numeric(5,2),                          -- % of bank txns that paired to ledger
  total_categorized        int  default 0,
  total_corrected          int  default 0,
  total_anomalies_flagged  int  default 0,
  total_anomalies_real     int  default 0,                        -- of those, how many were real issues
  -- Free-form context
  notes                    text,
  worth_it                 boolean,                                -- was the AI helpful this cycle?
  -- Loop closure
  signed_off_at            timestamptz not null default now(),
  unique (client_id, period_year, period_month)
);

create index if not exists close_outcomes_bookkeeper_idx
  on close_cycle_outcomes(bookkeeper_id, signed_off_at desc);
create index if not exists close_outcomes_client_idx
  on close_cycle_outcomes(client_id, period_year desc, period_month desc);

alter table close_cycle_outcomes enable row level security;

create policy "close_outcomes_owner_all" on close_cycle_outcomes
  for all
  using (auth.uid() = bookkeeper_id)
  with check (auth.uid() = bookkeeper_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) View: per-bookkeeper firm-level correction stats
-- ─────────────────────────────────────────────────────────────────────────────
-- Powers the source-provenance citations like "you've corrected this vendor 4
-- times" without a per-render query. Refresh nightly via Supabase Cron.

create materialized view if not exists vendor_correction_stats as
select
  bookkeeper_id,
  vendor_normalized,
  corrected_category,
  count(*) as correction_count,
  max(applied_at) as last_corrected_at
from categorization_corrections
where status = 'applied'
  and vendor_normalized is not null
group by bookkeeper_id, vendor_normalized, corrected_category;

create unique index if not exists vendor_correction_stats_pk
  on vendor_correction_stats(bookkeeper_id, vendor_normalized, corrected_category);

-- Refresh helper — call from cron or from the UI when a bookkeeper applies
-- a meaningful number of new corrections.
create or replace function refresh_vendor_correction_stats()
returns void language sql security definer as $$
  refresh materialized view concurrently vendor_correction_stats;
$$;
