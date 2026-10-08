import { backendRequest, BackendError } from '@/lib/backend'
import type { Bookkeeper } from '@/types'

export type ProfilePreferences = Pick<Bookkeeper, 'full_name' | 'practice_name' | 'reply_to_email' | 'reminder_tone' | 'notify_on_complete' | 'notify_on_any_upload' | 'notify_on_late'>
const allowed = ['full_name', 'practice_name', 'reply_to_email', 'reminder_tone', 'notify_on_complete', 'notify_on_any_upload', 'notify_on_late']

export async function saveLocalProfile(input: ProfilePreferences, expectedId: string): Promise<Bookkeeper> {
  if (!input || Object.keys(input).some(key => !allowed.includes(key)) ||
      typeof input.full_name !== 'string' || !input.full_name.trim() || input.full_name.length > 250 ||
      typeof input.practice_name !== 'string' || input.practice_name.length > 250 ||
      typeof input.reply_to_email !== 'string' || input.reply_to_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.reply_to_email.trim()) ||
      !['friendly', 'professional', 'firm'].includes(input.reminder_tone) ||
      [input.notify_on_complete, input.notify_on_any_upload, input.notify_on_late].some(value => typeof value !== 'boolean')) {
    throw new BackendError('INVALID_INPUT', 400, 'Please check your profile preferences.')
  }
  const saved = await backendRequest<Bookkeeper>('/profile', { ...input, full_name: input.full_name.trim(), practice_name: input.practice_name.trim(), reply_to_email: input.reply_to_email.trim() })
  if (!saved || saved.id !== expectedId || !['practitioner', 'solo'].includes(saved.account_type)) throw new BackendError('INVALID_RESPONSE', 200, 'The saved profile could not be verified. Refresh your account before trying again.')
  return saved
}
