-- scripts/ROLLBACK_004.sql
-- Reverses migration 004 (AI-first pivot Phase A schema additions).
--
-- Use this when:
--   • Migration 004 partially applied and you need a clean slate before retrying
--   • Migration 004 caused unexpected schema conflicts
--   • You're testing the migration on a project that needs to be reset
--
-- Safety:
--   • This script is destructive — DROP statements remove data
--   • Phase A data (categorization_corrections, close_cycle_outcomes) will be LOST
--   • document_uploads new columns will be DROPPED (data in those columns lost)
--   • Other migrations (001, 002, 003) remain untouched
--
-- After running this, re-run migration 004 from scratch with the latest version.
--
-- Pre-launch only: while no real customers exist, this is safe. Once we have real
-- bookkeepers using Phase A correction capture, ROLLBACK is no longer safe — every
-- correction row in categorization_corrections is highest-density training data
-- per data-flywheel.md §C.

begin;

-- 1) Drop the materialized view and refresh function (created in 004)
drop materialized view if exists vendor_correction_stats;
drop function if exists refresh_vendor_correction_stats();

-- 2) Drop close_cycle_outcomes table (no readers/writers as of 2026-05-06)
drop table if exists close_cycle_outcomes;

-- 3) Drop categorization_corrections table
-- WARNING: this contains every Phase A flywheel correction. Backup first if non-empty.
drop table if exists categorization_corrections;

-- 4) Drop the new columns added to document_uploads
-- The trigger was on this table — drop it before column drop
alter table if exists document_uploads
  drop column if exists categorization_summary,
  drop column if exists parsed_summary,
  drop column if exists client_confirmed_at,
  drop column if exists auto_categorization_confidence,
  drop column if exists auto_categorized_at;

commit;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running, paste this into the SQL editor to confirm rollback:

select
  'document_uploads should NOT have auto_categorized_at' as test,
  case when exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='document_uploads'
          and column_name='auto_categorized_at'
  ) then '✗ FAILED — column still exists' else '✓ OK — column gone' end as result
union all
select 'categorization_corrections table should NOT exist',
       case when exists (
         select 1 from information_schema.tables
         where table_schema='public' and table_name='categorization_corrections'
       ) then '✗ FAILED — table still exists' else '✓ OK — table gone' end
union all
select 'close_cycle_outcomes table should NOT exist',
       case when exists (
         select 1 from information_schema.tables
         where table_schema='public' and table_name='close_cycle_outcomes'
       ) then '✗ FAILED — table still exists' else '✓ OK — table gone' end
union all
select 'vendor_correction_stats matview should NOT exist',
       case when exists (
         select 1 from pg_matviews
         where schemaname='public' and matviewname='vendor_correction_stats'
       ) then '✗ FAILED — matview still exists' else '✓ OK — matview gone' end;

-- ============================================================================
-- NUCLEAR OPTION (only if everything is broken and project has no real data)
-- ============================================================================
-- If migrations 001-004 are in an irrecoverable state, the fastest fix is to
-- drop everything in the public schema and re-run from scratch. Pre-launch only.
--
-- DO NOT RUN THIS without explicit founder approval AND confirmation that no
-- real customer data exists.
--
-- begin;
-- drop schema if exists public cascade;
-- create schema public;
-- grant all on schema public to postgres;
-- grant all on schema public to anon;
-- grant all on schema public to authenticated;
-- grant all on schema public to service_role;
-- commit;
--
-- After the nuclear reset, re-apply 001 → 002 → 003 → 004 in order.
