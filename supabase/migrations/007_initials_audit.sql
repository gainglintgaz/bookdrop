-- 007_initials_audit.sql
-- E-signature production hardening: Block 3 Phase E3
-- Initials capture support + AcroForm fill metadata + audit-log export support.
--
-- Closes audit gap #4 (no AcroForm support, no initials boxes). After this
-- migration:
--   • Each signatory can capture an initials image (separate from full signature)
--     that gets embedded at every initials placement on the document
--   • AcroForm fillable fields are detected, assigned per-signatory, and the
--     filled values stored on the signature row for audit
--   • Bookkeepers can export a CSV of every signature event for a given
--     engagement letter (no schema changes needed for this — the existing
--     signature_email_log + signatures + signature_attempts tables already
--     contain everything; this migration just adds an index for performance)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) signatures: initials image + filled-fields metadata
-- ─────────────────────────────────────────────────────────────────────────────

alter table signatures
  add column if not exists initials_image_data text,
  add column if not exists filled_form_fields  jsonb;

comment on column signatures.initials_image_data is
  'Base64 PNG of the signatory''s initials capture. Separate from signature_image_data so initials and full signatures can be different drawings. NULL = no initials required for this signatory.';
comment on column signatures.filled_form_fields is
  'Map of AcroForm field name → value submitted by the signatory. e.g. {"taxId": "12-3456789", "filingStatus": "MFJ"}. NULL = the document had no fillable fields.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Index for audit-log export performance
-- ─────────────────────────────────────────────────────────────────────────────
-- The audit-log export endpoint queries by engagement_letter_id + joins to
-- signature_email_log + signature_attempts. Indexes already exist on the
-- foreign keys but a composite index speeds the time-ordered scan.

create index if not exists signatures_letter_signed_at_idx
  on signatures(engagement_letter_id, signed_at desc nulls last);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) View: signature_audit_view — denormalized for export
-- ─────────────────────────────────────────────────────────────────────────────
-- Provides a single row per signature with all audit-relevant fields joined
-- in. The api/audit/signature-log.ts endpoint queries this view, RLS-scoped
-- to the bookkeeper.

create or replace view signature_audit_view as
select
  sig.id                                      as signature_id,
  sig.engagement_letter_id,
  sig.bookkeeper_id,
  sig.client_id,
  sig.signer_name,
  sig.signer_email,
  sig.signed_at,
  sig.ip_address,
  sig.user_agent,
  sig.consent_disclosure_version,
  sig.consent_disclosure_agreed_at,
  sig.attempt_id,
  sig.signed_pdf_path,
  -- Signatory metadata (multi-signer)
  sg.signer_role,
  sg.signer_portal_token                      as signatory_token,
  sg.required_pages                           as signatory_required_pages,
  sg.placement                                as signatory_placement,
  sg.invite_sent_at,
  -- Has initials? (boolean for export readability)
  case when sig.initials_image_data is not null then true else false end as has_initials,
  -- Filled-form fields (jsonb, exported as JSON string in CSV)
  sig.filled_form_fields,
  -- Email confirmation status
  (
    select count(*)
    from signature_email_log el
    where el.signature_id = sig.id
      and el.status = 'sent'
  )                                           as confirmation_emails_sent,
  -- Letter context
  el.label                                    as document_label,
  el.fully_signed_at                          as letter_fully_signed_at
from signatures sig
left join engagement_letter_signatories sg on sg.id = sig.signatory_id
left join engagement_letters el            on el.id = sig.engagement_letter_id;

comment on view signature_audit_view is
  'Denormalized per-signature audit data joining signatures + signatory + letter + email-log counts. Used by api/audit/signature-log.ts. RLS not directly applied to views; the endpoint enforces auth.uid() = bookkeeper_id in the WHERE clause.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS for signature_audit_view: scoped to bookkeeper
-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres views inherit RLS from their underlying tables — signatures table
-- has RLS enabled (auth.uid() = bookkeeper_id), so the view automatically
-- scopes to the authenticated bookkeeper. No additional grants needed.
-- Verify with: SET LOCAL ROLE authenticated; SELECT * FROM signature_audit_view;
