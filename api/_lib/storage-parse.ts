// storage-parse.ts — download statement files from Supabase Storage and parse.
// V1: CSV/text only (pure, Node-safe). PDF remains browser/OCR path (honest).

import { supabaseAdmin } from './supabase.js'
import { parseCSVText, isCsvFilename } from '../../src/lib/parse-csv-statement.js'

export interface StorageStatement {
  uploadId: string
  filename: string
  storagePath: string
  docType: string | null
  summary: ReturnType<typeof parseCSVText>
  parseKind: 'csv' | 'skipped_pdf' | 'failed'
  error?: string
}

/**
 * Download one storage object as text (UTF-8). Binary PDFs will be garbage —
 * callers must only use this for CSV/text paths.
 */
export async function downloadStorageText(
  storagePath: string,
  bucket = 'documents',
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(storagePath)
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Download failed' }
  }
  try {
    const text = await data.text()
    return { ok: true, text }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to read file as text',
    }
  }
}

export interface UploadRowForParse {
  id: string
  storage_path: string
  filename_original: string
  doc_type?: string | null
}

/**
 * Parse bank/CC CSV uploads for a client period.
 * Skips PDFs with parseKind skipped_pdf (no fake transactions).
 */
export async function parseClientUploadsFromStorage(
  uploads: UploadRowForParse[],
): Promise<StorageStatement[]> {
  const out: StorageStatement[] = []

  for (const u of uploads) {
    const name = u.filename_original || u.storage_path
    if (!isCsvFilename(name)) {
      out.push({
        uploadId: u.id,
        filename: name,
        storagePath: u.storage_path,
        docType: u.doc_type ?? null,
        summary: parseCSVText(''),
        parseKind: 'skipped_pdf',
        error: 'Server prep parses CSV/text only — open Power tools to parse PDF in browser',
      })
      continue
    }

    const dl = await downloadStorageText(u.storage_path)
    if (!dl.ok) {
      out.push({
        uploadId: u.id,
        filename: name,
        storagePath: u.storage_path,
        docType: u.doc_type ?? null,
        summary: parseCSVText(''),
        parseKind: 'failed',
        error: dl.error,
      })
      continue
    }

    const summary = parseCSVText(dl.text)
    out.push({
      uploadId: u.id,
      filename: name,
      storagePath: u.storage_path,
      docType: u.doc_type ?? null,
      summary,
      parseKind: 'csv',
    })
  }

  return out
}

/** Flatten successful CSV parses into StatementSummary-shaped list for prep agent. */
export function statementsFromStorageParses(
  parses: StorageStatement[],
): Array<{
  bankName: string | null
  statementType: 'bank'
  startDate: string | null
  endDate: string | null
  openingBalance: number | null
  closingBalance: number | null
  totalCredits: number
  totalDebits: number
  pageCount: number
  transactions: Array<{
    date: string
    description: string
    amount: number
    balance?: number
    category?: string
    raw: string
  }>
}> {
  return parses
    .filter(p => p.parseKind === 'csv' && p.summary.transactions.length > 0)
    .map(p => ({
      bankName: p.summary.bankName,
      statementType: 'bank' as const,
      startDate: p.summary.startDate,
      endDate: p.summary.endDate,
      openingBalance: p.summary.openingBalance,
      closingBalance: p.summary.closingBalance,
      totalCredits: p.summary.totalCredits,
      totalDebits: p.summary.totalDebits,
      pageCount: p.summary.pageCount,
      transactions: p.summary.transactions,
    }))
}
