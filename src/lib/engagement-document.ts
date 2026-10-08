import { isDemoMode, isLocalMode } from '@/lib/mode'
import { fetchPrivateFile } from '@/lib/files'
import type { EngagementLetter } from '@/types'

export async function fetchEngagementDocument(letter: Pick<EngagementLetter, 'id' | 'storage_path'>): Promise<ArrayBuffer> {
  if (isLocalMode) return (await fetchPrivateFile(letter.id, 'letter')).arrayBuffer()
  if (isDemoMode) throw new Error('Document design is not available for demo documents.')
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(letter.storage_path, 3600)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not generate document URL')
  const response = await fetch(data.signedUrl)
  if (!response.ok) throw new Error(`Failed to download document (HTTP ${response.status})`)
  return response.arrayBuffer()
}
