// src/lib/receipt-scanner.ts
// Receipt/document image processing engine for digitizing hard copies —
// photos of receipts, faxed documents, mailed invoices, etc.

export interface ScannedDocument {
  id: string
  filename: string
  imageDataUrl: string
  thumbnailDataUrl: string
  originalSize: { width: number; height: number }
  processedSize: { width: number; height: number }
  fileSize: number
  capturedAt: string
  source: 'camera' | 'file-upload' | 'clipboard'
  ocrText: string | null
  extractedData: {
    possibleAmount: number | null
    possibleDate: string | null
    possibleVendor: string | null
    possibleCategory: string | null
  }
  notes: string
  tags: string[]
}

export interface ScanBatch {
  documents: ScannedDocument[]
  createdAt: string
  businessName: string
  period: { year: number; month: number }
}

// ---------- Vendor-to-category mapping ----------

const VENDOR_CATEGORY_MAP: Record<string, string> = {
  'office depot': 'Office Supplies',
  'staples': 'Office Supplies',
  'amazon': 'Office Supplies',
  'costco': 'Supplies',
  'walmart': 'Supplies',
  'home depot': 'Maintenance',
  'lowes': 'Maintenance',
  'fedex': 'Shipping',
  'ups': 'Shipping',
  'usps': 'Shipping',
  'uber': 'Travel',
  'lyft': 'Travel',
  'delta': 'Travel',
  'united': 'Travel',
  'american airlines': 'Travel',
  'southwest': 'Travel',
  'marriott': 'Lodging',
  'hilton': 'Lodging',
  'holiday inn': 'Lodging',
  'at&t': 'Utilities',
  'verizon': 'Utilities',
  'comcast': 'Utilities',
  'pg&e': 'Utilities',
  'starbucks': 'Meals',
  'mcdonalds': 'Meals',
  'subway': 'Meals',
  'doordash': 'Meals',
  'grubhub': 'Meals',
  'shell': 'Fuel',
  'chevron': 'Fuel',
  'exxon': 'Fuel',
  'bp': 'Fuel',
  'quickbooks': 'Software',
  'adobe': 'Software',
  'microsoft': 'Software',
  'google': 'Advertising',
  'facebook': 'Advertising',
  'meta': 'Advertising',
}

const KNOWN_VENDORS = Object.keys(VENDOR_CATEGORY_MAP)

// ---------- OCR via Tesseract.js ----------

let ocrWorker: import('tesseract.js').Worker | null = null

/**
 * Run OCR on an image data URL using Tesseract.js (loaded on demand).
 * Returns the extracted text, or an empty string on failure.
 */
export async function runOCR(imageDataUrl: string): Promise<string> {
  try {
    const { createWorker } = await import('tesseract.js')
    if (!ocrWorker) {
      ocrWorker = await createWorker('eng')
    }
    const { data } = await ocrWorker.recognize(imageDataUrl)
    return data.text.trim()
  } catch (err) {
    console.warn('OCR failed:', err)
    return ''
  }
}

/** Terminate the OCR worker (call on cleanup) */
export async function terminateOCR(): Promise<void> {
  if (ocrWorker) {
    await ocrWorker.terminate()
    ocrWorker = null
  }
}

// ---------- Public API ----------

/** Generate a unique scan ID */
export function generateScanId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => chars[byte % chars.length]).join('')
}

/**
 * Process an image file or camera capture into a ScannedDocument.
 * 1. Reads file as data URL
 * 2. Loads into Image element
 * 3. Resizes to max 1200px wide via canvas
 * 4. Generates 200px thumbnail
 * 5. Extracts metadata from filename
 */
export async function processImage(
  file: File | Blob,
  source: 'camera' | 'file-upload' | 'clipboard',
): Promise<ScannedDocument> {
  const rawDataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(rawDataUrl)

  const originalSize = { width: img.width, height: img.height }

  const optimized = await optimizeImage(rawDataUrl, 1200)
  const thumbnail = await optimizeImage(rawDataUrl, 200)

  const filename = file instanceof File ? file.name : `scan-${Date.now()}.jpg`

  // Run OCR on the optimized image
  const ocrText = await runOCR(optimized.dataUrl)

  // Extract receipt metadata from filename + OCR text
  const extracted = extractReceiptData(filename, ocrText)

  return {
    id: generateScanId(),
    filename,
    imageDataUrl: optimized.dataUrl,
    thumbnailDataUrl: thumbnail.dataUrl,
    originalSize,
    processedSize: { width: optimized.width, height: optimized.height },
    fileSize: file.size,
    capturedAt: new Date().toISOString(),
    source,
    ocrText: ocrText || null,
    extractedData: extracted,
    notes: '',
    tags: [],
  }
}

/**
 * Resize and optimize an image for storage.
 * Renders to canvas at the target max width (default 1200px),
 * outputs as JPEG at 0.85 quality.
 */
export async function optimizeImage(
  dataUrl: string,
  maxWidth = 1200,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl)

  let width = img.width
  let height = img.height

  if (width > maxWidth) {
    const scale = maxWidth / width
    width = maxWidth
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas 2d context')

  ctx.drawImage(img, 0, 0, width, height)

  const resultUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { dataUrl: resultUrl, width, height }
}

/**
 * Extract receipt metadata from filename and notes text.
 * Uses regex patterns to find dollar amounts, dates, vendor names, and categories.
 * This is NOT real OCR — it parses user-provided text.
 */
export function extractReceiptData(
  filename: string,
  notes: string,
): {
  possibleAmount: number | null
  possibleDate: string | null
  possibleVendor: string | null
  possibleCategory: string | null
} {
  const combined = `${filename} ${notes}`.toLowerCase()

  // --- Amount: prefer "total" line, then any $XX.XX ---
  let possibleAmount: number | null = null
  const totalLineMatch = combined.match(/(?:total|amount\s*due|balance\s*due|grand\s*total)[:\s]*\$?\s?(\d{1,6}(?:[.,]\d{1,2})?)/)
  if (totalLineMatch) {
    possibleAmount = parseFloat(totalLineMatch[1].replace(',', '.'))
  } else {
    // Fall back to any dollar amount (take the largest as likely total)
    const allAmounts = [...combined.matchAll(/\$\s?(\d{1,6}(?:[.,]\d{1,2})?)/g)]
    if (allAmounts.length > 0) {
      const amounts = allAmounts.map(m => parseFloat(m[1].replace(',', '.')))
      possibleAmount = Math.max(...amounts)
    }
  }

  // --- Date: MM/DD/YYYY, MM/DD/YY, MM-DD-YYYY, MM-DD, YYYY-MM-DD ---
  let possibleDate: string | null = null

  const isoMatch = combined.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  const usMatch = combined.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  const shortMatch = combined.match(/(\d{1,2})[-/](\d{1,2})(?!\d)/)

  if (isoMatch) {
    possibleDate = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  } else if (usMatch) {
    const year = usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3]
    possibleDate = `${year}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`
  } else if (shortMatch) {
    const now = new Date()
    possibleDate = `${now.getFullYear()}-${shortMatch[1].padStart(2, '0')}-${shortMatch[2].padStart(2, '0')}`
  }

  // --- Vendor: match against known vendor names ---
  let possibleVendor: string | null = null
  for (const vendor of KNOWN_VENDORS) {
    if (combined.includes(vendor)) {
      // Capitalize for display
      possibleVendor = vendor.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      break
    }
  }

  // --- Category: derive from vendor ---
  let possibleCategory: string | null = null
  if (possibleVendor) {
    possibleCategory = VENDOR_CATEGORY_MAP[possibleVendor.toLowerCase()] ?? null
  }

  return { possibleAmount, possibleDate, possibleVendor, possibleCategory }
}

/**
 * Export a scan batch as a downloadable ZIP.
 * Uses dynamic import of JSZip (already in the project).
 * Adds each image and a manifest.json to the archive.
 */
export async function exportScansAsZip(batch: ScanBatch): Promise<void> {
  if (batch.documents.length === 0) return

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // Build manifest
  const manifest = {
    businessName: batch.businessName,
    period: batch.period,
    createdAt: batch.createdAt,
    documentCount: batch.documents.length,
    documents: batch.documents.map((doc, i) => ({
      index: i + 1,
      filename: doc.filename,
      capturedAt: doc.capturedAt,
      source: doc.source,
      extractedData: doc.extractedData,
      notes: doc.notes,
      tags: doc.tags,
    })),
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  // Add each image
  for (const doc of batch.documents) {
    const base64 = doc.imageDataUrl.split(',')[1]
    if (base64) {
      zip.file(doc.filename, base64, { base64: true })
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `${batch.businessName.replace(/\s+/g, '-')}_${batch.period.year}-${String(batch.period.month).padStart(2, '0')}_scans.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------- Internal helpers ----------

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}
