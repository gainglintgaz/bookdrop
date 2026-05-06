// api/audit/signature-log.ts
//
// Audit-trail export endpoint. Block 3 Phase E3 deliverable.
//
// Returns a tamper-evident audit log for an engagement letter's signatures.
// Format: CSV (universal, openable in Excel + Google Sheets + accounting
// software). Each row is one signature event with full audit metadata.
//
// Auth: bookkeeper must be authenticated (uses Supabase JWT). The endpoint
// validates the bookkeeper owns the engagement letter via signature_audit_view
// (which inherits RLS from the signatures table — `auth.uid() = bookkeeper_id`).
//
// Use case: a CPA's compliance officer asks "prove this signature was real."
// The CPA hits this endpoint, gets a CSV with signer name, email, IP, browser,
// timestamp, ESIGN consent version, signing URL, and confirmation-email count.
// That CSV is the audit record that holds up in court.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../_lib/supabase.js'

function isServerDemoMode(): boolean {
  return process.env.VITE_MODE === 'demo'
}

interface AuditRow {
  signature_id: string
  engagement_letter_id: string
  bookkeeper_id: string
  client_id: string
  signer_name: string
  signer_email: string
  signed_at: string | null
  ip_address: string | null
  user_agent: string | null
  consent_disclosure_version: string | null
  consent_disclosure_agreed_at: string | null
  attempt_id: string | null
  signed_pdf_path: string | null
  signer_role: string | null
  signatory_token: string | null
  signatory_required_pages: number[] | null
  signatory_placement: unknown
  invite_sent_at: string | null
  has_initials: boolean
  filled_form_fields: Record<string, unknown> | null
  confirmation_emails_sent: number
  document_label: string | null
  letter_fully_signed_at: string | null
}

const CSV_HEADERS = [
  'Signature ID',
  'Document',
  'Signer Name',
  'Signer Email',
  'Signer Role',
  'Signed At (UTC)',
  'IP Address',
  'Browser / User Agent',
  'ESIGN Disclosure Version',
  'Consent Agreed At (UTC)',
  'Has Initials',
  'Required Pages',
  'Filled Form Fields (JSON)',
  'Invite Sent At',
  'Confirmation Emails Sent',
  'Letter Fully Signed At',
  'Attempt ID',
  'Signed PDF Path',
] as const

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s: string
  if (typeof value === 'object') {
    try { s = JSON.stringify(value) } catch { s = String(value) }
  } else {
    s = String(value)
  }
  // RFC 4180: quote cells that contain comma, quote, or newline. Escape inner quotes.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowsToCsv(rows: AuditRow[]): string {
  const headerLine = CSV_HEADERS.join(',')
  const dataLines = rows.map(r => [
    r.signature_id,
    r.document_label,
    r.signer_name,
    r.signer_email,
    r.signer_role ?? 'primary',
    r.signed_at,
    r.ip_address,
    r.user_agent,
    r.consent_disclosure_version,
    r.consent_disclosure_agreed_at,
    r.has_initials ? 'yes' : 'no',
    r.signatory_required_pages,
    r.filled_form_fields,
    r.invite_sent_at,
    r.confirmation_emails_sent,
    r.letter_fully_signed_at,
    r.attempt_id,
    r.signed_pdf_path,
  ].map(escapeCsvCell).join(','))
  return [headerLine, ...dataLines].join('\r\n')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (isServerDemoMode()) {
    // Demo: return a single mock row so UX can be validated end-to-end without DB
    const mockCsv = [
      CSV_HEADERS.join(','),
      [
        'demo-sig-1',
        'Demo Engagement Letter 2026',
        'Demo Signer',
        'demo@example.com',
        'primary',
        new Date().toISOString(),
        '203.0.113.1',
        'Mozilla/5.0 (demo)',
        'esign-2026-05-06-v1',
        new Date().toISOString(),
        'no',
        '',
        '',
        new Date().toISOString(),
        '2',
        new Date().toISOString(),
        '',
        'demo/path/signed.pdf',
      ].map(escapeCsvCell).join(','),
    ].join('\r\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="signature-audit-demo.csv"')
    return res.status(200).send(mockCsv)
  }

  const engagementLetterId = (req.query.engagementLetterId ?? req.query.letterId) as string | undefined
  const bookkeeperId = req.query.bookkeeperId as string | undefined

  if (!engagementLetterId || !bookkeeperId) {
    return res.status(400).json({ error: 'Missing engagementLetterId or bookkeeperId' })
  }

  // Validate bookkeeper owns the letter (defense in depth alongside RLS-via-view)
  const { data: letter, error: letterErr } = await supabaseAdmin
    .from('engagement_letters')
    .select('id, label')
    .eq('id', engagementLetterId)
    .eq('bookkeeper_id', bookkeeperId)
    .maybeSingle()

  if (letterErr || !letter) {
    return res.status(404).json({ error: 'Engagement letter not found' })
  }

  const { data: rows, error: queryErr } = await supabaseAdmin
    .from('signature_audit_view')
    .select('*')
    .eq('engagement_letter_id', engagementLetterId)
    .eq('bookkeeper_id', bookkeeperId)
    .order('signed_at', { ascending: true })

  if (queryErr) {
    console.error('[signature-log] query failed:', queryErr)
    return res.status(500).json({ error: 'Failed to load audit log' })
  }

  if (!rows || rows.length === 0) {
    // Empty letter still gets headers — useful for the "we have a record showing zero signatures" case
    const emptyCsv = CSV_HEADERS.join(',') + '\r\n'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="signature-audit-${engagementLetterId}.csv"`)
    return res.status(200).send(emptyCsv)
  }

  const csv = rowsToCsv(rows as AuditRow[])

  // Add a BOM so Excel opens UTF-8 cleanly
  const csvWithBom = '﻿' + csv

  const filenameSafe = (letter.label ?? 'engagement-letter')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .toLowerCase()
    .slice(0, 60)

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="signature-audit-${filenameSafe}.csv"`)
  res.setHeader('X-Total-Signatures', String(rows.length))
  return res.status(200).send(csvWithBom)
}
