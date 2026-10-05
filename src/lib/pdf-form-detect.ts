// src/lib/pdf-form-detect.ts
//
// AcroForm field detection using pdf-lib. Block 3 Phase E3.
//
// When a bookkeeper uploads a fillable PDF (W-9, 1099-NEC, 1099-MISC,
// custom firm form, etc.), this helper enumerates every fillable field and
// returns metadata that EngagementLetterEditor + the portal signing flow
// can use to render native React inputs alongside the PDF preview.
//
// Aligned with ai-first-principles.md §5 anti-fabrication: the detection is
// deterministic and based on real PDF metadata, not LLM-inferred. Every
// field returned IS a real AcroForm field present in the source PDF.

import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } from 'pdf-lib'

/** Shape of a single fillable field detected in a PDF. */
export interface DetectedFormField {
  /** AcroForm field name — used by pdf-lib `form.getTextField(name)` etc. */
  name: string
  /** Field type — drives the React input rendered for the signatory. */
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'unknown'
  /** Current value if the PDF has a default. NULL = empty. */
  defaultValue: string | string[] | null
  /** Whether the PDF marks this field as required. */
  isRequired: boolean
  /** Available options for radio + dropdown fields. */
  options?: string[]
  /** Whether the field is read-only (rendered but not editable). */
  isReadOnly: boolean
}

/** Top-level detection result with diagnostics. */
export interface FormDetectionResult {
  /** True if the PDF has any AcroForm fields at all. */
  hasForm: boolean
  /** Detected fields. Empty array if hasForm is false. */
  fields: DetectedFormField[]
  /** Total page count (useful for placement designer). */
  pageCount: number
  /**
   * Errors per field that couldn't be classified. Always empty unless the PDF
   * has malformed/unsupported AcroForm structures. Logged but not fatal —
   * the bookkeeper can still use the document; just without the affected fields.
   */
  warnings: string[]
}

/**
 * Detect AcroForm fields in a PDF byte stream.
 *
 * Returns a result object with `fields: []` for non-fillable PDFs (the common
 * case for engagement letters). Never throws — malformed PDFs return
 * `hasForm: false` with a warning.
 */
export async function detectFormFields(pdfBytes: ArrayBuffer | Uint8Array): Promise<FormDetectionResult> {
  const warnings: string[] = []
  let pdfDoc: PDFDocument

  try {
    pdfDoc = await PDFDocument.load(pdfBytes)
  } catch (err) {
    warnings.push(`PDFDocument.load failed: ${err instanceof Error ? err.message : String(err)}`)
    return { hasForm: false, fields: [], pageCount: 0, warnings }
  }

  const pageCount = pdfDoc.getPageCount()

  let form
  try {
    form = pdfDoc.getForm()
  } catch (err) {
    // pdf-lib throws on PDFs with no /AcroForm root. That's not an error
    // for our purposes — it just means there are no fillable fields.
    warnings.push(`No AcroForm: ${err instanceof Error ? err.message : String(err)}`)
    return { hasForm: false, fields: [], pageCount, warnings }
  }

  let rawFields
  try {
    rawFields = form.getFields()
  } catch (err) {
    warnings.push(`form.getFields failed: ${err instanceof Error ? err.message : String(err)}`)
    return { hasForm: false, fields: [], pageCount, warnings }
  }

  if (!rawFields || rawFields.length === 0) {
    return { hasForm: false, fields: [], pageCount, warnings }
  }

  const fields: DetectedFormField[] = []
  for (const field of rawFields) {
    const detected = classifyField(field, warnings)
    if (detected) fields.push(detected)
  }

  return {
    hasForm: fields.length > 0,
    fields,
    pageCount,
    warnings,
  }
}

/** Classify a pdf-lib PDFField into our normalized DetectedFormField shape. */
function classifyField(
  field: ReturnType<ReturnType<PDFDocument['getForm']>['getFields']>[number],
  warnings: string[],
): DetectedFormField | null {
  const name = field.getName()
  // pdf-lib's `isReadOnly()` is on most field subclasses; some have `isExportable()`.
  // We defensively check via try/catch since the union of methods is messy.
  let isReadOnly = false
  let isRequired = false
  try {
    if ('isReadOnly' in field && typeof (field as { isReadOnly?: () => boolean }).isReadOnly === 'function') {
      isReadOnly = (field as { isReadOnly: () => boolean }).isReadOnly()
    }
    if ('isRequired' in field && typeof (field as { isRequired?: () => boolean }).isRequired === 'function') {
      isRequired = (field as { isRequired: () => boolean }).isRequired()
    }
  } catch {
    // ignore — defaults preserved
  }

  if (field instanceof PDFTextField) {
    return {
      name,
      type: 'text',
      defaultValue: field.getText() ?? null,
      isRequired,
      isReadOnly,
    }
  }
  if (field instanceof PDFCheckBox) {
    return {
      name,
      type: 'checkbox',
      defaultValue: field.isChecked() ? 'true' : 'false',
      isRequired,
      isReadOnly,
    }
  }
  if (field instanceof PDFRadioGroup) {
    return {
      name,
      type: 'radio',
      defaultValue: field.getSelected() ?? null,
      options: field.getOptions(),
      isRequired,
      isReadOnly,
    }
  }
  if (field instanceof PDFDropdown) {
    return {
      name,
      type: 'dropdown',
      defaultValue: field.getSelected() ?? null,
      options: field.getOptions(),
      isRequired,
      isReadOnly,
    }
  }
  if (field instanceof PDFOptionList) {
    return {
      name,
      type: 'dropdown',
      defaultValue: field.getSelected() ?? null,
      options: field.getOptions(),
      isRequired,
      isReadOnly,
    }
  }

  warnings.push(`Unknown field type for "${name}" — skipping`)
  return null
}

/**
 * Apply filled values to the AcroForm fields and flatten the result.
 *
 * Used at signing time: takes the fillable PDF + signatory's submitted values,
 * fills the fields, then flattens (makes the form non-editable) so the saved
 * PDF preserves the values without allowing post-sign tampering.
 *
 * Returns the byte stream of the flattened PDF, ready for storage upload.
 *
 * Anti-fabrication: this function ONLY writes values that were explicitly
 * supplied. It does NOT invent values for missing required fields — that's
 * the calling validation layer's job (UI rejects empty required fields).
 */
export async function fillAndFlattenForm(
  pdfBytes: ArrayBuffer | Uint8Array,
  values: Record<string, string | boolean>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()

  for (const [fieldName, value] of Object.entries(values)) {
    let field
    try {
      field = form.getField(fieldName)
    } catch {
      // Field doesn't exist in this PDF — skip silently. Common case: a
      // signatory's submitted values include extras the form doesn't have.
      continue
    }

    if (field instanceof PDFTextField) {
      field.setText(typeof value === 'string' ? value : String(value))
    } else if (field instanceof PDFCheckBox) {
      const truthy = value === true || value === 'true' || value === 'on'
      if (truthy) field.check()
      else field.uncheck()
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value === 'string') field.select(value)
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      if (typeof value === 'string') field.select(value)
    }
  }

  // Flatten makes the form fields non-editable in the saved PDF.
  // Critical for anti-tampering: a signed-and-flattened PDF can't be
  // edited to change the filled values after the fact.
  form.flatten()

  return pdfDoc.save()
}
