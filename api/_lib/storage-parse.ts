// storage-parse.ts — download statement files from Supabase Storage and parse.
// CSV/text: pure Node-safe parser. PDF: pdfjs text extract + pure line parser.
// Scanned image-only PDFs return empty transactions (honest — OCR is browser/Gemini path).

import { supabaseAdmin } from './supabase.js'
import { parseCSVText, isCsvFilename } from '../../src/lib/parse-csv-statement.js'
import {
  parseStatementFromLines,
  isPdfFilename,
  type LineStatementSummary,
} from '../../src/lib/parse-statement-from-lines.js'
import { extractPdfTextLines } from './pdf-extract.js'

export type StatementSummaryLike = {
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
}

export interface StorageStatement {
  uploadId: string
  filename: string
  storagePath: string
  docType: string | null
  summary: StatementSummaryLike
  parseKind: 'csv' | 'pdf' | 'skipped' | 'failed'
  error?: string
}

function emptySummary(): StatementSummaryLike {
  return {
    bankName: null,
    statementType: 'bank',
    startDate: null,
    endDate: null,
    openingBalance: null,
    closingBalance: null,
    totalCredits: 0,
    totalDebits: 0,
    pageCount: 0,
    transactions: [],
  }
}

function fromCsv(s: ReturnType<typeof parseCSVText>): StatementSummaryLike {
  return {
    bankName: s.bankName,
    statementType: 'bank',
    startDate: s.startDate,
    endDate: s.endDate,
    openingBalance: s.openingBalance,
    closingBalance: s.closingBalance,
    totalCredits: s.totalCredits,
    totalDebits: s.totalDebits,
    pageCount: s.pageCount,
    transactions: s.transactions,
  }
}

function fromLines(s: LineStatementSummary): StatementSummaryLike {
  return {
    bankName: s.bankName,
    statementType: 'bank',
    startDate: s.startDate,
    endDate: s.endDate,
    openingBalance: s.openingBalance,
    closingBalance: s.closingBalance,
    totalCredits: s.totalCredits,
    totalDebits: s.totalDebits,
    pageCount: s.pageCount,
    transactions: s.transactions,
  }
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

export async function downloadStorageBytes(
  storagePath: string,
  bucket = 'documents',
): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(storagePath)
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Download failed' }
  }
  try {
    const bytes = await data.arrayBuffer()
    return { ok: true, bytes }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to read file bytes',
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
 * Parse bank/CC uploads for a client period (CSV + text PDF).
 * Image-only PDFs yield parseKind pdf with 0 transactions (not skipped_pdf theater).
 */
export async function parseClientUploadsFromStorage(
  uploads: UploadRowForParse[],
): Promise<StorageStatement[]> {
  const out: StorageStatement[] = []

  for (const u of uploads) {
    const name = u.filename_original || u.storage_path

    if (isCsvFilename(name)) {
      const dl = await downloadStorageText(u.storage_path)
      if (dl.ok === false) {
        out.push({
          uploadId: u.id,
          filename: name,
          storagePath: u.storage_path,
          docType: u.doc_type ?? null,
          summary: emptySummary(),
          parseKind: 'failed',
          error: dl.error,
        })
        continue
      }
      const summary = fromCsv(parseCSVText(dl.text))
      out.push({
        uploadId: u.id,
        filename: name,
        storagePath: u.storage_path,
        docType: u.doc_type ?? null,
        summary,
        parseKind: 'csv',
      })
      continue
    }

    if (isPdfFilename(name)) {
      const dl = await downloadStorageBytes(u.storage_path)
      if (dl.ok === false) {
        out.push({
          uploadId: u.id,
          filename: name,
          storagePath: u.storage_path,
          docType: u.doc_type ?? null,
          summary: emptySummary(),
          parseKind: 'failed',
          error: dl.error,
        })
        continue
      }

      const extracted = await extractPdfTextLines(dl.bytes)
      if (extracted.ok === false) {
        out.push({
          uploadId: u.id,
          filename: name,
          storagePath: u.storage_path,
          docType: u.doc_type ?? null,
          summary: emptySummary(),
          parseKind: 'failed',
          error: extracted.error,
        })
        continue
      }

      const summary = fromLines(
        parseStatementFromLines(extracted.lines, extracted.pageCount),
      )
      out.push({
        uploadId: u.id,
        filename: name,
        storagePath: u.storage_path,
        docType: u.doc_type ?? null,
        summary,
        parseKind: 'pdf',
        error:
          summary.transactions.length === 0
            ? 'PDF text extracted but no bank lines matched — image scan may need browser OCR'
            : undefined,
      })
      continue
    }

    out.push({
      uploadId: u.id,
      filename: name,
      storagePath: u.storage_path,
      docType: u.doc_type ?? null,
      summary: emptySummary(),
      parseKind: 'skipped',
      error: 'Unsupported type for server prep (use CSV or PDF)',
    })
  }

  return out
}

/** Flatten successful parses with transactions for prep agent. */
export function statementsFromStorageParses(
  parses: StorageStatement[],
): StatementSummaryLike[] {
  return parses
    .filter(
      p =>
        (p.parseKind === 'csv' || p.parseKind === 'pdf') &&
        p.summary.transactions.length > 0,
    )
    .map(p => p.summary)
}
