// pdf-extract.ts — Node/Vercel text extraction from PDF bytes via pdfjs-dist legacy.
// Worker disabled. No browser DOM. Failures return ok:false (honest — no fake lines).

export type PdfExtractResult =
  | { ok: true; lines: string[]; pageCount: number }
  | { ok: false; error: string }

/**
 * Extract text lines from a PDF ArrayBuffer using pdfjs-dist legacy build.
 * Groups text items by Y position (top-to-bottom) like the browser path.
 */
export async function extractPdfTextLines(
  data: ArrayBuffer | Uint8Array,
): Promise<PdfExtractResult> {
  try {
    // Dynamic import keeps cold start lighter when only CSVs are processed.
    // legacy/build is the Node-safe entry (no DOMMatrix / worker required).
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    // Copy into a plain ArrayBuffer-backed view (pdfjs rejects SharedArrayBuffer views)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)

    const loadingTask = pdfjs.getDocument({
      data: copy,
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      // @ts-expect-error — disableWorker exists on Node builds; not always in public types
      disableWorker: true,
    })

    const pdf = await loadingTask.promise
    const allLines: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()

      const lineMap = new Map<number, string[]>()
      for (const item of textContent.items) {
        if (!('str' in item)) continue
        const y = Math.round(('transform' in item ? (item as { transform: number[] }).transform[5] : 0) * 10) / 10
        if (!lineMap.has(y)) lineMap.set(y, [])
        lineMap.get(y)!.push((item as { str: string }).str)
      }

      const sortedLines = [...lineMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.join(' ').trim())
        .filter(line => line.length > 0)

      allLines.push(...sortedLines)
    }

    return { ok: true, lines: allLines, pageCount: pdf.numPages }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF extract failed'
    console.error('[pdf-extract]', message)
    return { ok: false, error: message }
  }
}
