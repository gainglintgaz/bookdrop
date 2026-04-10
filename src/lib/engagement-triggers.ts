// src/lib/engagement-triggers.ts
// Contextual in-app feedback nudges. Each trigger fires once per user via localStorage.

const PREFIX = 'bdrop_trigger_'

export const TRIGGER_FIRST_CLIENT = 'first_client'
export const TRIGGER_FIRST_UPLOAD = 'first_upload'
export const TRIGGER_FIRST_REMINDER = 'first_reminder'
export const TRIGGER_FIRST_ZIP = 'first_zip'
export const TRIGGER_THREE_CLIENTS = 'three_clients'
export const TRIGGER_ALL_COMPLETE = 'all_complete'

export function checkAndFireTrigger(key: string, toast: () => void): void {
  const storageKey = `${PREFIX}${key}`
  try {
    if (localStorage.getItem(storageKey)) return
    toast()
    localStorage.setItem(storageKey, new Date().toISOString())
  } catch (error) {
    console.warn('[engagement-triggers] localStorage access failed for trigger:', key, error)
  }
}
