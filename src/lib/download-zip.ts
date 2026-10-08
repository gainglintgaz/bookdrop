// src/lib/download-zip.ts
// Client-side ZIP generation using JSZip.
// Downloads all uploaded files for a client + period as a single ZIP.

import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'
import { isDemoMode, isLocalMode } from '@/lib/mode'
import { fetchPrivateFile } from '@/lib/files'
import type { DocumentUpload } from '@/types'

export async function downloadUploadsAsZip(
  uploads: DocumentUpload[],
  zipFilename: string,
): Promise<void> {
  if (uploads.length === 0) return

  if (isDemoMode) {
    alert(`Demo Mode: ZIP download simulated for ${uploads.length} file(s) as "${zipFilename}"`)
    return
  }

  const zip = new JSZip()

  // Download all files first
  const downloadResults = await Promise.all(
    uploads.map(async (upload) => {
      if (/[/\\]/.test(upload.filename_original) || Array.from(upload.filename_original).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || ['.', '..', ''].includes(upload.filename_original)) {
        throw new Error('A document has an invalid filename. No ZIP was created.')
      }
      if (isLocalMode) return { originalName: upload.filename_original, data: await fetchPrivateFile(upload.id) }
      const { data, error } = await supabase.storage
        .from('documents')
        .download(upload.storage_path)

      if (error || !data) {
        throw new Error('Some documents could not be downloaded. No ZIP was created. Please try again.')
      }

      return { originalName: upload.filename_original, data }
    })
  )

  // Add to ZIP with deduplication
  const usedNames = new Set<string>()
  for (const result of downloadResults) {
    if (!result) continue
    const original = result.originalName
    const ext = original.includes('.') ? '.' + original.split('.').pop() : ''
    const base = original.includes('.') ? original.slice(0, original.lastIndexOf('.')) : original
    let filename = original
    let counter = 1
    while (usedNames.has(filename)) {
      counter++
      filename = `${base} (${counter})${ext}`
    }
    usedNames.add(filename)
    zip.file(filename, await result.data.arrayBuffer())
  }

  // Generate ZIP and trigger browser download
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = zipFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
