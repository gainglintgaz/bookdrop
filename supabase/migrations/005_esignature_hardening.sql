-- 005_esignature_hardening.sql
-- E-signature production hardening: Block 3 Phase E1
-- (Block 1 = legal-grade single-signer; closes 7 of 10 audit gaps)
--
-- All changes additive and idempotent. Existing single-signer signatures
-- continue to work unchanged.
--
-- After this migration:
--   • signatures table tracks user_agent + ESIGN/UETA consent metadata
--   • attempt_id allows the upcoming re-sign workflow without losing audit trail
--   • signature_email_log captures every confirmation email sent
--   • signature_attempts table powers per-portal-token rate limiting

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) signatures: add hardening columns
-- ─────────────────────────────────────────────────────────────────────────────

alter table signatures
  add column if not exists user_agent                   text,
  add column if not exists consent_disclosure_agreed_at timestamptz,
  add column if not exists consent_disclosure_version   text,
  add column if not exists attempt_id                   uuid;

comment on column signatures.user_agent is
  'Browser/OS fingerprint at time of signing. Captured from req.headers[user-agent]. Required for legal-grade audit trail.';
comment on column signatures.consent_disclosure_agreed_at is
  'When the signer accepted the ESIGN/UETA disclosure. NULL = signed before consent screen was added (legacy rows).';
comment on column signatures.consent_disclosure_version is
  'Versioned ID of the disclosure text shown (e.g. esign-2026-05-06-v1). Stored so we know what the signer actually agreed to.';
comment on column signatures.attempt_id is
  'Groups failed/draft signature attempts before final commit. NULL for legacy single-attempt rows. Used by re-sign workflow.';

-- Index for vendor_correction_stats-style lookups by attempt
create index if not exists signatures_attempt_idx
  on signatures(attempt_id) where attempt_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) signature_email_log: audit trail of confirmation emails sent
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists signature_email_log (
  id                  uuid primary key default gen_random_uuid(),
  signature_id        uuid not null references signatures(id) on delete cascade,
  recipient_email     text not null,
  -- Who is this email for? client = the signer; bookkeeper = the practitioner who owns the engagement letter
  recipient_role      text not null check (recipient_role in ('client', 'bookkeeper')),
  -- Email lifecycle. 'queued' = handed to Resend; 'sent' = Resend accepted; 'failed' = Resend errored.
  status              text not null default 'queued'
    check (status in ('queued', 'sent', 'failed')),
  -- Resend's email id (returned from the send API). NULL until Resend responds.
  resend_email_id     text,
  -- Why did this fail? Free-form for human investigation.
  error_message       text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  -- Denormalized so the row stays useful even if signature is deleted (cascade above is for cleanup)
  bookkeeper_id       uuid not null references bookkeepers(id) on delete cascade
);

create index if not exists signature_email_log_signature_idx
  on signature_email_log(signature_id, created_at desc);
create index if not exists signature_email_log_bookkeeper_idx
  on signature_email_log(bookkeeper_id, created_at desc);

alter table signature_email_log enable row level security;

-- Bookkeepers can read their own email logs only.
create policy "signature_email_log_owner_select" on signature_email_log
  for select using (auth.uid() = bookkeeper_id);

-- Inserts happen from the server-side function (service role). No client-side insert policy.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) signature_attempts: powers rate limiting per portal_token
-- ─────────────────────────────────────────────────────────────────────────────
-- Records every time someone hits the sign-document endpoint with a given
-- portal_token. The endpoint counts attempts in the last hour and refuses
-- the 6th attempt with a 429.
--
-- Old rows are cleaned up nightly by a scheduled job (TBD — for now, tolerate
-- unbounded growth; the table is small).

create table if not exists signature_attempts (
  id              uuid primary key default gen_random_uuid(),
  portal_token    text not null,
  attempted_at    timestamptz not null default now(),
  ip_address      text,
  user_agent      text,
  -- 'success' = signature recorded; 'invalid_token' = portal_token validation failed;
  -- 'already_signed' = 409 path; 'rate_limited' = 429; 'storage_failed' = 500 from
  -- PDF upload; 'insert_failed' = 500 from signatures insert.
  outcome         text not null check (outcome in (
                    'success', 'invalid_token', 'already_signed',
                    'rate_limited', 'storage_failed', 'insert_failed', 'mock_demo'
                  ))
);

create index if not exists signature_attempts_token_time_idx
  on signature_attempts(portal_token, attempted_at desc);

-- This table is server-side only (service role writes; no client read).
alter table signature_attempts enable row level security;
-- No public policies — only service_role can read or write.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Cleanup helper for signature_attempts (call from cron monthly)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function cleanup_old_signature_attempts(retention_days int default 30)
returns int language plpgsql security definer as $$
declare
  deleted_count int;
begin
  delete from signature_attempts
  where attempted_at < (now() - (retention_days || ' days')::interval);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function cleanup_old_signature_attempts is
  'Drops signature_attempts rows older than retention_days (default 30). Call from a monthly Vercel cron.';
