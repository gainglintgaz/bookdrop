-- 002_account_type.sql
-- Add dual-audience support: practitioner (bookkeepers) and solo (business owners)
-- Solo users get a self_client_id pointing to their own auto-created client row
--
-- 2026-05-06 IDEMPOTENCY FIX: wrapped every ALTER with IF NOT EXISTS so the
-- migration can be re-run safely. Defensive change only — semantic equivalence
-- preserved. Required because the original bare ALTERs would fail on second
-- apply with "column already exists", which blocked safe migration recovery.

ALTER TABLE bookkeepers ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'practitioner'
  CHECK (account_type IN ('practitioner', 'solo'));

ALTER TABLE bookkeepers ADD COLUMN IF NOT EXISTS business_name TEXT;

ALTER TABLE bookkeepers ADD COLUMN IF NOT EXISTS self_client_id UUID REFERENCES clients(id);

-- Note: the CHECK constraint on account_type is added inline with ADD COLUMN.
-- If the column exists from an old run without the constraint, this migration
-- won't add it. To recover from that edge case, run manually:
--   ALTER TABLE bookkeepers DROP CONSTRAINT IF EXISTS bookkeepers_account_type_check;
--   ALTER TABLE bookkeepers ADD CONSTRAINT bookkeepers_account_type_check
--     CHECK (account_type IN ('practitioner', 'solo'));
