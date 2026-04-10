// src/lib/db.ts
// Supabase database helper functions
// Every query checks for error before using data (golden path).

import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/mode'
import { getDemoClientByToken, getDemoRequirementsWithUploads } from '@/lib/demo-data'
import type {
  Client,
  DocumentRequirement,
  DocumentUpload,
  RequirementWithUploads,
  EngagementLetter,
  EngagementLetterWithSignature,
  ClientPortalData,
  Bookkeeper,
} from '@/types'
import { getCurrentPeriod } from '@/lib/utils'

// ─── PORTAL (PUBLIC — no auth) ──────────────────────────────────────────────

/** Fetch client data by portal token — used on the public upload page */
export async function fetchClientByToken(token: string): Promise<ClientPortalData | null> {
  if (isDemoMode) return getDemoClientByToken(token)

  const { year, month } = getCurrentPeriod()

  // Fetch client by token
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, business_name, contact_name, contact_email, notes_for_client, bookkeeper_id')
    .eq('portal_token', token)
    .eq('is_active', true)
    .maybeSingle()

  if (clientError) throw new Error(clientError.message)
  if (!client) return null

  // Fetch bookkeeper info
  const { data: bookkeeper, error: bkError } = await supabase
    .from('bookkeepers')
    .select('full_name, practice_name, reply_to_email')
    .eq('id', client.bookkeeper_id)
    .maybeSingle()

  if (bkError) throw new Error(bkError.message)
  if (!bookkeeper) return null

  // Fetch requirements with any uploads for this period
  const { data: requirements, error: reqError } = await supabase
    .from('document_requirements')
    .select('*')
    .eq('client_id', client.id)
    .order('sort_order', { ascending: true })

  if (reqError) throw new Error(reqError.message)

  // Fetch uploads for this period
  const { data: uploads, error: upError } = await supabase
    .from('document_uploads')
    .select('*')
    .eq('client_id', client.id)
    .eq('period_year', year)
    .eq('period_month', month)

  if (upError) throw new Error(upError.message)

  // Merge uploads into requirements
  const requirementsWithUploads: RequirementWithUploads[] = (requirements ?? []).map(req => ({
    ...req,
    uploads: (uploads ?? []).filter(u => u.requirement_id === req.id),
  }))

  return {
    client: {
      id: client.id,
      business_name: client.business_name,
      contact_name: client.contact_name,
      contact_email: client.contact_email,
      notes_for_client: client.notes_for_client,
    },
    bookkeeper: bookkeeper as Pick<Bookkeeper, 'full_name' | 'practice_name' | 'reply_to_email'>,
    bookkeeperId: client.bookkeeper_id,
    requirements: requirementsWithUploads,
    period: { year, month },
    dueDay: 5, // Default due day — could be configurable per client later
  }
}

// ─── UPLOAD (PUBLIC — service role via Edge Function in production) ──────────

/** Upload a file for a specific requirement + period.
 *  In production this goes through an Edge Function with service_role.
 *  For MVP, we use the anon client (the RLS policy allows public uploads via token). */
export async function uploadDocumentFile(
  file: File,
  clientId: string,
  bookkeeperId: string,
  requirementId: string,
  year: number,
  month: number,
): Promise<DocumentUpload> {
  if (isDemoMode) {
    // Simulate a successful upload with a fake record
    return {
      id: `demo-upload-${Date.now()}`,
      requirement_id: requirementId,
      client_id: clientId,
      bookkeeper_id: bookkeeperId,
      period_year: year,
      period_month: month,
      filename_original: file.name,
      storage_path: `demo/${file.name}`,
      file_size_bytes: file.size,
      uploaded_at: new Date().toISOString(),
    }
  }

  const storagePath = `${bookkeeperId}/${clientId}/${year}/${month}/${requirementId}/${file.name}`

  // Upload to storage
  const { error: storageError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { upsert: true })

  if (storageError) throw new Error(`Upload failed: ${storageError.message}`)

  // Insert record via Edge Function or direct insert
  // For now: direct insert (will move to Edge Function for service_role)
  const { data, error } = await supabase
    .from('document_uploads')
    .insert({
      requirement_id: requirementId,
      client_id: clientId,
      bookkeeper_id: bookkeeperId,
      period_year: year,
      period_month: month,
      filename_original: file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
    })
    .select()
    .maybeSingle()

  if (error) throw new Error(`Record insert failed: ${error.message}`)
  if (!data) throw new Error('Upload succeeded but no record returned')

  return data
}

// ─── POST-UPLOAD NOTIFICATION ───────────────────────────────────────────────

/** Fire-and-forget notification to bookkeeper after a successful upload. */
export async function notifyBookkeeperOfUpload(
  clientId: string,
  bookkeeperId: string,
  fileName: string,
  periodYear: number,
  periodMonth: number,
  portalToken: string,
): Promise<void> {
  if (isDemoMode) return

  try {
    await fetch('/api/notify-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, bookkeeperId, fileName, periodYear, periodMonth, portalToken }),
    })
  } catch {
    // Notification failure should never block the upload flow
    console.warn('[Notify] Failed to notify bookkeeper — upload still succeeded')
  }
}

// ─── BOOKKEEPER QUERIES (auth required) ─────────────────────────────────────

/** Fetch all clients for the authenticated bookkeeper */
export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('business_name', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Fetch requirements for a specific client */
export async function fetchRequirements(clientId: string): Promise<DocumentRequirement[]> {
  const { data, error } = await supabase
    .from('document_requirements')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Fetch uploads for a client in a specific period */
export async function fetchUploadsForPeriod(
  clientId: string,
  year: number,
  month: number,
): Promise<DocumentUpload[]> {
  const { data, error } = await supabase
    .from('document_uploads')
    .select('*')
    .eq('client_id', clientId)
    .eq('period_year', year)
    .eq('period_month', month)

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Fetch requirements with uploads for a client and period */
export async function fetchRequirementsWithUploads(
  clientId: string,
  year: number,
  month: number,
): Promise<RequirementWithUploads[]> {
  if (isDemoMode) return getDemoRequirementsWithUploads(clientId)

  const [requirements, uploads] = await Promise.all([
    fetchRequirements(clientId),
    fetchUploadsForPeriod(clientId, year, month),
  ])

  return requirements.map(req => ({
    ...req,
    uploads: uploads.filter(u => u.requirement_id === req.id),
  }))
}

// ─── ENGAGEMENT LETTERS & SIGNATURES ────────────────────────────────────────

export async function fetchEngagementLetters(
  clientId: string
): Promise<EngagementLetterWithSignature[]> {
  if (isDemoMode) return []

  const { data: letters, error } = await supabase
    .from('engagement_letters')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  if (!letters || letters.length === 0) return []

  // Fetch signatures for all letters in one query
  const letterIds = letters.map((l: EngagementLetter) => l.id)
  const { data: sigs, error: sigErr } = await supabase
    .from('signatures')
    .select('*')
    .in('engagement_letter_id', letterIds)

  if (sigErr) throw new Error(sigErr.message)

  return letters.map((letter: EngagementLetter) => ({
    ...letter,
    signature: sigs?.find((s: { engagement_letter_id: string }) => s.engagement_letter_id === letter.id) ?? null,
  }))
}

export async function uploadEngagementLetter(
  file: File,
  clientId: string,
  bookkeeperId: string,
  label: string,
): Promise<EngagementLetter> {
  const path = `${bookkeeperId}/${clientId}/engagement-letters/${Date.now()}_${file.name}`

  const { error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(path, file, { upsert: false })

  if (uploadErr) throw new Error(uploadErr.message)

  const { data, error } = await supabase
    .from('engagement_letters')
    .insert({
      bookkeeper_id: bookkeeperId,
      client_id: clientId,
      label,
      storage_path: path,
      filename: file.name,
      file_size_bytes: file.size,
    })
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Failed to save engagement letter')
  return data
}

export async function fetchEngagementLettersForPortal(
  clientId: string,
  portalToken: string,
): Promise<EngagementLetterWithSignature[]> {
  // Public function — validates via portal_token
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('portal_token', portalToken)
    .maybeSingle()

  if (clientErr || !client) return []

  const { data: letters, error } = await supabase
    .from('engagement_letters')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)

  if (error) throw new Error(error.message)
  if (!letters || letters.length === 0) return []

  const letterIds = letters.map((l: EngagementLetter) => l.id)
  const { data: sigs } = await supabase
    .from('signatures')
    .select('*')
    .in('engagement_letter_id', letterIds)

  return letters.map((letter: EngagementLetter) => ({
    ...letter,
    signature: sigs?.find((s: { engagement_letter_id: string }) => s.engagement_letter_id === letter.id) ?? null,
  }))
}
