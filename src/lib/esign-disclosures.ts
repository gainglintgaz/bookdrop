// src/lib/esign-disclosures.ts
//
// Versioned ESIGN/UETA consent disclosure text. Stored as code so the exact
// language a signer agreed to is preserved in source control + the signatures
// table records `consent_disclosure_version` so we can prove what they saw.
//
// LEGAL NOTE: This text is a reasonable consumer-electronic-signature
// disclosure that aligns with the federal ESIGN Act (15 U.S.C. §§ 7001-7031)
// and the Uniform Electronic Transactions Act (UETA) as adopted by 49 states.
// State-specific addenda may be required for some industries (e.g. New York,
// Illinois). Consult counsel before relying on this text for high-stakes
// signing.
//
// To update the disclosure: bump the version (don't reuse old version IDs),
// add a new entry, set CURRENT_DISCLOSURE_VERSION to the new id. Old signatures
// retain their original version reference, so the audit trail stays accurate.

export interface EsignDisclosure {
  /** Stable identifier stored on signatures.consent_disclosure_version. Never reuse. */
  version: string
  /** Display label shown to the signer in the consent screen. */
  label: string
  /** Short summary above the checkbox. Plain language. */
  summary: string
  /**
   * Full disclosure text shown in the expandable section. Use \n\n for paragraph breaks.
   * No markdown — render as plain text via whitespace-pre-wrap.
   */
  fullText: string
}

/**
 * Disclosure registry. Newest at the bottom.
 * Append-only: never delete an entry, never reuse a version id.
 */
export const ESIGN_DISCLOSURES: Record<string, EsignDisclosure> = {
  'esign-2026-05-06-v1': {
    version: 'esign-2026-05-06-v1',
    label: 'Electronic Signature Disclosure and Consent',
    summary:
      'You\'re about to sign this document electronically. Please read and agree to the disclosure below before continuing.',
    fullText: [
      'Consent to Use Electronic Signatures and Records',
      '',
      'By checking the box below, you agree:',
      '',
      '1. You consent to use an electronic signature in place of a handwritten signature on this document.',
      '',
      '2. You consent to receive electronic records (including this document and any related records) electronically rather than on paper. You may withdraw this consent at any time before signing by closing this window without checking the box. Once you sign, your consent applies to the signed document.',
      '',
      '3. You confirm that you have the necessary hardware and software to view and retain electronic records: a current web browser, an internet connection, and either the ability to print or to save digital files.',
      '',
      '4. You may request a paper copy of any electronic record at any time by contacting the practitioner who sent you this document. There is no fee for this request.',
      '',
      '5. Your electronic signature is legally binding under the federal Electronic Signatures in Global and National Commerce Act (ESIGN, 15 U.S.C. §§ 7001-7031) and the Uniform Electronic Transactions Act (UETA) as adopted by your state.',
      '',
      '6. The practitioner will retain an audit record of this signing event, including: the date and time you signed, the IP address and browser you used, the version of this disclosure you agreed to, and a copy of the signed document. You may request a copy of this audit record from the practitioner at any time.',
      '',
      '7. To update your contact information for future electronic records, contact the practitioner directly.',
      '',
      'By checking the box and proceeding to sign, you acknowledge that you have read this disclosure, understand it, and agree to its terms.',
    ].join('\n'),
  },
} as const

/**
 * The version a NEW signature should reference. Reads at render time.
 * Update this constant when adding a new disclosure version.
 */
export const CURRENT_DISCLOSURE_VERSION = 'esign-2026-05-06-v1'

/** Convenience: the active disclosure object. */
export function currentDisclosure(): EsignDisclosure {
  const d = ESIGN_DISCLOSURES[CURRENT_DISCLOSURE_VERSION]
  if (!d) {
    // This is a code error, not a runtime user error — the build must include the current version.
    throw new Error(
      `[esign-disclosures] CURRENT_DISCLOSURE_VERSION="${CURRENT_DISCLOSURE_VERSION}" not found in ESIGN_DISCLOSURES`,
    )
  }
  return d
}

/**
 * Look up a historical disclosure by version (for audit-trail rendering).
 * Returns null if the version is unknown — callers should render a graceful fallback.
 */
export function disclosureByVersion(version: string | null | undefined): EsignDisclosure | null {
  if (!version) return null
  return ESIGN_DISCLOSURES[version] ?? null
}
