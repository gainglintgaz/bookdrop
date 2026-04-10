-- 002_account_type.sql
-- Add dual-audience support: practitioner (bookkeepers) and solo (business owners)
-- Solo users get a self_client_id pointing to their own auto-created client row

ALTER TABLE bookkeepers ADD COLUMN account_type TEXT NOT NULL DEFAULT 'practitioner'
  CHECK (account_type IN ('practitioner', 'solo'));

ALTER TABLE bookkeepers ADD COLUMN business_name TEXT;

ALTER TABLE bookkeepers ADD COLUMN self_client_id UUID REFERENCES clients(id);
