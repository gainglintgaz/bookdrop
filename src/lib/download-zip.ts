// src/lib/download-zip.ts
// Client-side ZIP generation using JSZip.
// Downloads all uploaded files for a client + period as a single ZIP.

import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/mode'
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
      const { data, error } = await supabase.storage
        .from('documents')
        .download(upload.storage_path)

      if (error || !data) {
        console.error(`Failed to download ${upload.filename_original}:`, error)
        return null
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
    zip.file(filename, result.data)
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
