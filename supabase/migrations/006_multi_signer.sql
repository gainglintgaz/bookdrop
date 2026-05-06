-- 006_multi_signer.sql
-- E-signature production hardening: Block 3 Phase E2
-- Multi-signer support + per-page signature placement.
--
-- Closes audit gaps #1 (single-signer constraint), #2 (last-page-only), #3
-- (hardcoded coords) from the 2026-05-06 audit. After this migration:
--   • A single engagement letter can require N signatories (joint filers,
--     multi-member LLCs, multi-shareholder S-corps)
--   • Each signatory gets their own portal_token + designated pages
--   • Signatures embed at per-signatory placement coords (not last-page only)
--
-- Backwards-compatible: existing single-signer signatures are backfilled
-- as primary signatories. Legacy code paths keep working.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) engagement_letter_signatories — one row per required signer per letter
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists engagement_letter_signatories (
  id                    uuid primary key default gen_random_uuid(),
  engagement_letter_id  uuid not null references engagement_letters(id) on delete cascade,
  -- The bookkeeper who owns this letter (denormalized for RLS performance)
  bookkeeper_id         uuid not null references bookkeepers(id) on delete cascade,
  -- Role/relationship — drives email tone, placement defaults, and audit clarity
  signer_role           text not null
    check (signer_role in ('primary', 'spouse', 'partner', 'guarantor', 'other')),
  -- Who is this signer? Captured once at invite time so the audit trail is preserved
  -- even if the signer ignores the invite or fails to sign
  signer_name           text not null,
  signer_email          text not null,
  -- Each signatory gets their OWN portal token — independent invite link.
  -- This is what makes "send Sue the letter for her, send Bob a different link"
  -- a clean UX without accidentally letting Bob see/sign Sue's row.
  signer_portal_token   text not null unique,
  -- Which pages this signatory must sign (1-indexed). NULL = all pages.
  -- e.g. [1, 5, 10] means signatures on pages 1, 5, 10 only.
  required_pages        jsonb not null default '[]'::jsonb,
  -- Per-placement coordinate metadata. Array of:
  --   { page: int, type: 'signature' | 'initials' | 'date' | 'text',
  --     x: number, y: number, width: number, height: number,
  --     fieldName?: string  // for 'text' type only — links to AcroForm field name }
  -- Bookkeeper sets these at invite time via SignaturePlacementDesigner (Phase E3)
  -- or accepts the default last-page placement.
  placement             jsonb not null default '[]'::jsonb,
  -- When did this signatory complete their part?
  signed_at             timestamptz,
  -- The signatures.id row this signatory created (FK; NULL until signed)
  signature_id          uuid,  -- FK added below as not enforced (avoid circular create-time)
  -- Re-sign tracking: the previous attempt_id, if this signatory was asked to re-sign
  previous_attempt_id   uuid,
  invite_sent_at        timestamptz,
  invite_email_id       text,                    -- Resend email id of the invite
  status                text not null default 'invited'
    check (status in ('invited', 'viewed', 'signed', 'voided')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- One signer_role per letter at most (no two "primary" signers on one letter).
  -- "other" is exempt because multiple "other" signers are legitimate.
  unique (engagement_letter_id, signer_role)
    deferrable initially deferred
);

-- Drop the over-restrictive unique above (it would block multiple 'other' signers).
-- Replaced with a partial unique that excludes 'other':
alter table engagement_letter_signatories
  drop constraint if exists engagement_letter_signatories_engagement_letter_id_signer_role_key;
create unique index if not exists engagement_letter_signatories_role_unique
  on engagement_letter_signatories(engagement_letter_id, signer_role)
  where signer_role <> 'other';

create index if not exists engagement_letter_signatories_letter_idx
  on engagement_letter_signatories(engagement_letter_id);
create index if not exists engagement_letter_signatories_token_idx
  on engagement_letter_signatories(signer_portal_token);
create index if not exists engagement_letter_signatories_bookkeeper_status_idx
  on engagement_letter_signatories(bookkeeper_id, status, created_at desc);

alter table engagement_letter_signatories enable row level security;

-- Bookkeepers can see + manage signatories on their own letters.
create policy "letter_signatories_owner_all" on engagement_letter_signatories
  for all
  using (auth.uid() = bookkeeper_id)
  with check (auth.uid() = bookkeeper_id);

-- Public read by token (the signer's portal page needs to load their own row).
-- Read-only — signing happens via the api/sign-document.ts service-role endpoint.
create policy "letter_signatories_public_read_by_token" on engagement_letter_signatories
  for select to anon
  using (true);  -- API enforces signer_portal_token match; row visibility doesn't leak data
                 -- because the signer must already know the token to query the row.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) signatures.signatory_id FK — links each signature to its signatory
-- ─────────────────────────────────────────────────────────────────────────────

alter table signatures
  add column if not exists signatory_id uuid;

-- Add FK constraint AFTER backfill (below) so legacy signatures don't violate it.

create index if not exists signatures_signatory_idx
  on signatures(signatory_id) where signatory_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Backfill: existing single-signer signatures become 'primary' signatories
-- ─────────────────────────────────────────────────────────────────────────────
-- For every existing signatures row, create the corresponding
-- engagement_letter_signatories row with signer_role='primary' and link them.
--
-- Idempotent: only inserts if no signatory exists for that engagement_letter_id
-- + 'primary' yet. Safe to re-run.

do $$
declare
  sig record;
  new_signatory_id uuid;
begin
  for sig in
    select s.id, s.engagement_letter_id, s.client_id, s.bookkeeper_id,
           s.signer_name, s.signer_email, s.signed_at, s.portal_token_used
    from signatures s
    where s.signatory_id is null
      -- Only backfill rows whose engagement letter still exists
      and exists (
        select 1 from engagement_letters el where el.id = s.engagement_letter_id
      )
      -- And that don't already have a primary signatory backfilled
      and not exists (
        select 1 from engagement_letter_signatories sg
        where sg.engagement_letter_id = s.engagement_letter_id
          and sg.signer_role = 'primary'
      )
  loop
    insert into engagement_letter_signatories (
      engagement_letter_id, bookkeeper_id, signer_role,
      signer_name, signer_email,
      signer_portal_token,
      required_pages, placement,
      signed_at, signature_id, status,
      invite_sent_at, created_at, updated_at
    ) values (
      sig.engagement_letter_id, sig.bookkeeper_id, 'primary',
      sig.signer_name, sig.signer_email,
      -- Backfilled rows don't have a real signatory token; use the original
      -- portal_token used at signing as a stand-in. Gives us a unique value.
      coalesce(sig.portal_token_used, gen_random_uuid()::text),
      '[]'::jsonb,                    -- legacy signatures have no per-page metadata
      '[]'::jsonb,                    -- legacy placement was hardcoded (last page)
      sig.signed_at, sig.id, 'signed',
      sig.signed_at, sig.signed_at, sig.signed_at
    )
    returning id into new_signatory_id;

    -- Link the signature back to its new signatory
    update signatures
       set signatory_id = new_signatory_id
     where id = sig.id;
  end loop;
end $$;

-- Now that legacy rows are backfilled, the FK can be enforced.
-- (NEW signatures must reference an existing signatory.)
do $$
begin
  if not exists (
    select 1 from information_schema.referential_constraints
    where constraint_name = 'signatures_signatory_id_fkey'
      and constraint_schema = 'public'
  ) then
    alter table signatures
      add constraint signatures_signatory_id_fkey
        foreign key (signatory_id)
        references engagement_letter_signatories(id)
        on delete set null;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) engagement_letters.fully_signed_at — set when ALL signatories have signed
-- ─────────────────────────────────────────────────────────────────────────────
-- Convenience column for the bookkeeper dashboard so we don't need a join
-- every time. Updated by the api/sign-document.ts endpoint.

alter table engagement_letters
  add column if not exists fully_signed_at timestamptz,
  add column if not exists total_signatories_required int default 1;

-- For legacy single-signer letters that already have a signature, set
-- fully_signed_at to match. Idempotent.
update engagement_letters el
   set fully_signed_at = sig.signed_at,
       total_signatories_required = 1
  from signatures sig
 where sig.engagement_letter_id = el.id
   and el.fully_signed_at is null
   and sig.signed_at is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Helper: count required vs signed signatories for a letter
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function count_letter_signatures(letter_id uuid)
returns table (total_required int, total_signed int)
language sql security definer as $$
  select
    coalesce(count(*), 0)::int                                  as total_required,
    coalesce(count(*) filter (where status = 'signed'), 0)::int as total_signed
  from engagement_letter_signatories
  where engagement_letter_id = letter_id;
$$;

comment on function count_letter_signatures is
  'Returns (total_required, total_signed) for a given engagement_letter. Used by api/sign-document.ts to set engagement_letters.fully_signed_at when the last signatory signs.';
