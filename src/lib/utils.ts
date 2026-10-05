// src/lib/utils.ts
// Shared utility functions

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind class merger — use everywhere instead of raw className strings */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Convert dollars to cents for storage */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** Convert cents to dollars for display */
export function fromCents(cents: number): number {
  return cents / 100
}

/** Format cents as USD string */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(fromCents(cents))
}

/** Generate a cryptographically random portal token (12 chars, URL-safe) */
export function generatePortalToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const array = new Uint8Array(12)
  crypto.getRandomValues(array)
  return Array.from(array, byte => chars[byte % chars.length]).join('')
}

/** Get the current period (year + month) */
export function getCurrentPeriod(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Format month number as name */
export function formatMonth(month: number): string {
  const date = new Date(2024, month - 1) // year doesn't matter for month name
  return date.toLocaleString('en-US', { month: 'long' })
}

/** Format a period as "April 2026" */
export function formatPeriod(year: number, month: number): string {
  return `${formatMonth(month)} ${year}`
}

/** Format doc_type as a human-readable label */
export function formatDocType(docType: string): string {
  const map: Record<string, string> = {
    bank: 'Bank Statement',
    credit_card: 'Credit Card',
    receipt: 'Receipt',
    payroll: 'Payroll',
    w2: 'W-2',
    '1099_nec': '1099-NEC',
    '1099_misc': '1099-MISC',
    '1099_int': '1099-INT',
    '1099_div': '1099-DIV',
    '1099_k': '1099-K',
    '1040': '1040 / Tax Return',
    '1098': '1098 / Mortgage',
    investment: 'Investment',
    mortgage: 'Mortgage',
    other: 'Other',
  }
  return map[docType] ?? docType.replace(/_/g, ' ')
}

/** Format file size in human-readable form */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
