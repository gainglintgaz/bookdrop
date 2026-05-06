-- scripts/verify-schema.sql
-- Paste this into the Supabase SQL Editor and run. The output tells you the
-- exact starting state so you know which migrations need to run next.
--
-- Run modes:
--   • Before any migration: shows what's already there from prior attempts
--   • Between migrations: confirms the previous one applied
--   • After migration 004: serves as the Block 1 acceptance gate
--
-- The script never modifies data. Read-only.

-- ============================================================================
-- 1) WHICH TABLES EXIST?
-- ============================================================================

select '=== 1. Tables in public schema ===' as section;

select
  table_name,
  case
    when table_name in ('bookkeepers', 'clients', 'document_requirements', 'document_uploads',
                        'reminder_schedules', 'reminder_log', 'messages', 'message_attachments',
                        'notifications', 'workflow_results') then 'migration 001'
    when table_name in ('engagement_letters', 'signatures') then 'migration 003'
    when table_name in ('categorization_corrections', 'close_cycle_outcomes') then 'migration 004'
    else 'unknown / extra'
  end as expected_from
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

-- ============================================================================
-- 2) BOOKKEEPERS COLUMNS — confirms migration 002 status
-- ============================================================================

select '=== 2. bookkeepers columns (account_type, business_name, self_client_id added in migration 002) ===' as section;

select
  column_name,
  data_type,
  is_nullable,
  column_default,
  case
    when column_name in ('account_type', 'business_name', 'self_client_id') then 'migration 002'
    when column_name in ('id', 'email', 'full_name', 'practice_name', 'reply_to_email',
                          'plan', 'stripe_customer_id', 'stripe_subscription_id',
                          'reminder_tone', 'created_at') then 'migration 001'
    else 'unknown / extra'
  end as expected_from
from information_schema.columns
where table_schema = 'public' and table_name = 'bookkeepers'
order by ordinal_position;

-- ============================================================================
-- 3) DOCUMENT_UPLOADS COLUMNS — confirms migration 004 Phase A schema
-- ============================================================================

select '=== 3. document_uploads columns (auto_categorized_at + JSONB summaries added in migration 004) ===' as section;

select
  column_name,
  data_type,
  is_nullable,
  case
    when column_name in ('auto_categorized_at', 'auto_categorization_confidence',
                          'client_confirmed_at', 'parsed_summary', 'categorization_summary')
      then 'migration 004'
    else 'migration 001'
  end as expected_from
from information_schema.columns
where table_schema = 'public' and table_name = 'document_uploads'
order by ordinal_position;

-- ============================================================================
-- 4) SIGNATURES COLUMNS — confirms migration 003 (and reveals what e-sig hardening needs)
-- ============================================================================

select '=== 4. signatures columns (added in migration 003; user_agent + consent_disclosure_* will be added in Block 3 E1 migration 005) ===' as section;

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'signatures'
order by ordinal_position;

-- ============================================================================
-- 5) RLS STATUS — every public table must have RLS enabled
-- ============================================================================

select '=== 5. Row-Level Security per table (every value should be true) ===' as section;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  case when c.relrowsecurity then '✓ OK' else '⚠ RLS DISABLED — security risk' end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- ============================================================================
-- 6) RLS POLICIES PER TABLE — every table should have at least one
-- ============================================================================

select '=== 6. Active RLS policies ===' as section;

select
  schemaname,
  tablename,
  policyname,
  cmd as command,
  case
    when qual is not null then qual
    else '(no using clause)'
  end as using_clause
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ============================================================================
-- 7) STORAGE BUCKETS — `documents` must exist and be PRIVATE
-- ============================================================================

select '=== 7. Storage buckets (documents must be public=false) ===' as section;

select
  id,
  name,
  public,
  case when name = 'documents' and not public then '✓ private (correct)'
       when name = 'documents' and public then '⚠ PUBLIC — fix immediately'
       else '(other bucket)'
  end as status,
  created_at
from storage.buckets
order by created_at;

-- ============================================================================
-- 8) MIGRATION 004-SPECIFIC OBJECTS — final acceptance gate
-- ============================================================================

select '=== 8. Migration 004 objects (must all be present after 004 applies) ===' as section;

select 'categorization_corrections table'    as object_name,
       case when exists (select 1 from information_schema.tables
                          where table_schema='public' and table_name='categorization_corrections')
            then '✓ exists' else '✗ missing' end as status
union all
select 'close_cycle_outcomes table',
       case when exists (select 1 from information_schema.tables
                          where table_schema='public' and table_name='close_cycle_outcomes')
            then '✓ exists' else '✗ missing' end
union all
select 'vendor_correction_stats materialized view',
       case when exists (select 1 from pg_matviews
                          where schemaname='public' and matviewname='vendor_correction_stats')
            then '✓ exists' else '✗ missing' end
union all
select 'document_uploads.auto_categorized_at column',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='document_uploads'
                                and column_name='auto_categorized_at')
            then '✓ exists' else '✗ missing' end
union all
select 'document_uploads.parsed_summary column',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='document_uploads'
                                and column_name='parsed_summary')
            then '✓ exists' else '✗ missing' end
union all
select 'refresh_vendor_correction_stats() function',
       case when exists (select 1 from pg_proc p
                          join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname='public' and p.proname='refresh_vendor_correction_stats')
            then '✓ exists' else '✗ missing' end;

-- ============================================================================
-- DECISION GUIDE based on outputs
-- ============================================================================
-- After running this script, check:
--
--   PATH A (fresh project — recommended path):
--     Section 1 returns 0 rows.
--     → Run migrations 001 → 002 → 003 → 004 in order.
--
--   PATH B (partial prior application):
--     Section 1 returns some tables but not all.
--     Section 2 may show missing columns in bookkeepers (account_type, etc.)
--     → Skip the migrations whose objects already exist; run the remainder.
--     → Migration 002 is now idempotent (Block 0) so re-running it is safe.
--     → Migration 004 is fully additive so re-running is safe.
--
--   PATH C (already fully applied):
--     Section 8 shows ALL ✓ exists.
--     → No migrations needed. Proceed to Sub-block 1C smoke test.
--
-- After every run, take Section 5 + Section 7 to verify security posture:
--     Every table must have rls_enabled=true.
--     The `documents` storage bucket must have public=false.
