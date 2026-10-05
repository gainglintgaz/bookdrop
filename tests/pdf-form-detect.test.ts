import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { detectFormFields, fillAndFlattenForm } from '../src/lib/pdf-form-detect'

/**
 * pdf-form-detect tests. Uses pdf-lib in-memory (no test fixtures) so the
 * tests are hermetic and fast — we construct minimal PDFs at test time
 * with known fields, then assert detection behavior.
 */

describe('detectFormFields — non-fillable PDFs', () => {
  it('returns hasForm=false for a plain PDF with no AcroForm', async () => {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.addPage([612, 792])
    const bytes = await pdfDoc.save()

    const result = await detectFormFields(bytes)
    expect(result.hasForm).toBe(false)
    expect(result.fields).toEqual([])
    expect(result.pageCount).toBe(1)
    // pdf-lib raises on getForm() for non-AcroForm PDFs — we capture that as a warning, not an error
  })

  it('returns hasForm=false for a fresh PDFDocument with no pages added', async () => {
    // pdf-lib's PDFDocument.create() produces a valid PDF on save() — even
    // without explicitly added pages, the resulting bytes parse to a 1-page doc.
    // The important invariant: hasForm is false and warnings include the
    // "no AcroForm" diagnostic.
    const pdfDoc = await PDFDocument.create()
    const bytes = await pdfDoc.save()

    const result = await detectFormFields(bytes)
    expect(result.hasForm).toBe(false)
    expect(result.fields).toEqual([])
  })

  it('handles malformed bytes gracefully (returns warnings, no throw)', async () => {
    // Random bytes that aren't a PDF
    const garbage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]) // looks like JPEG header
    const result = await detectFormFields(garbage)
    expect(result.hasForm).toBe(false)
    expect(result.fields).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('detectFormFields — fillable PDFs', () => {
  it('detects a single text field', async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const form = pdfDoc.getForm()
    const textField = form.createTextField('signerName')
    textField.addToPage(page, { x: 50, y: 700, width: 200, height: 30 })
    const bytes = await pdfDoc.save()

    const result = await detectFormFields(bytes)
    expect(result.hasForm).toBe(true)
    expect(result.fields.length).toBe(1)
    expect(result.fields[0].name).toBe('signerName')
    expect(result.fields[0].type).toBe('text')
  })

  it('detects a checkbox', async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const form = pdfDoc.getForm()
    const cb = form.createCheckBox('agreeToTerms')
    cb.addToPage(page, { x: 50, y: 700, width: 20, height: 20 })
    const bytes = await pdfDoc.save()

    const result = await detectFormFields(bytes)
    expect(result.hasForm).toBe(true)
    expect(result.fields.length).toBe(1)
    expect(result.fields[0].type).toBe('checkbox')
    expect(result.fields[0].name).toBe('agreeToTerms')
    expect(result.fields[0].defaultValue).toBe('false') // unchecked by default
  })

  it('detects a dropdown with options', async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const form = pdfDoc.getForm()
    const dd = form.createDropdown('filingStatus')
    dd.addOptions(['Single', 'MFJ', 'MFS', 'HOH'])
    dd.addToPage(page, { x: 50, y: 700, width: 100, height: 30 })
    const bytes = await pdfDoc.save()

    const result = await detectFormFields(bytes)
    expect(result.hasForm).toBe(true)
    expect(result.fields.length).toBe(1)
    expect(result.fields[0].type).toBe('dropdown')
    expect(result.fields[0].options).toEqual(['Single', 'MFJ', 'MFS', 'HOH'])
  })

  it('detects multiple fields of mixed types', async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const form = pdfDoc.getForm()

    const txt = form.createTextField('taxId')
    txt.addToPage(page, { x: 50, y: 700, width: 200, height: 30 })

    const cb = form.createCheckBox('isUSCitizen')
    cb.addToPage(page, { x: 50, y: 650, width: 20, height: 20 })

    const dd = form.createDropdown('state')
    dd.addOptions(['CA', 'NY', 'TX'])
    dd.addToPage(page, { x: 50, y: 600, width: 100, height: 30 })

    const bytes = await pdfDoc.save()
    const result = await detectFormFields(bytes)

    expect(result.hasForm).toBe(true)
    expect(result.fields.length).toBe(3)

    const byName = new Map(result.fields.map(f => [f.name, f]))
    expect(byName.get('taxId')?.type).toBe('text')
    expect(byName.get('isUSCitizen')?.type).toBe('checkbox')
    expect(byName.get('state')?.type).toBe('dropdown')
    expect(byName.get('state')?.options).toEqual(['CA', 'NY', 'TX'])
  })

  it('preserves default text values', async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const form = pdfDoc.getForm()
    const txt = form.createTextField('preFilledField')
    txt.setText('default-value-here')
    txt.addToPage(page, { x: 50, y: 700, width: 200, height: 30 })
    const bytes = await pdfDoc.save()

    const result = await detectFormFields(bytes)
    expect(result.fields[0].defaultValue).toBe('default-value-here')
  })
})

describe('fillAndFlattenForm', () => {
  it('fills text fields and produces a flattened (non-fillable) PDF', async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const form = pdfDoc.getForm()
    const txt = form.createTextField('clientName')
    txt.addToPage(page, { x: 50, y: 700, width: 200, height: 30 })
    const sourceBytes = await pdfDoc.save()

    const filledBytes = await fillAndFlattenForm(sourceBytes, { clientName: 'Acme Corp' })

    // Reload and confirm the form is gone (flattened) — detection returns hasForm=false
    const reloaded = await detectFormFields(filledBytes)
    expect(reloaded.hasForm).toBe(false) // flattened: no editable form fields
    expect(reloaded.pageCount).toBe(1)   // page count preserved
  })

  it('skips field names that don\'t exist in the PDF (no throw)', async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const form = pdfDoc.getForm()
    const txt = form.createTextField('realField')
    txt.addToPage(page, { x: 50, y: 700, width: 200, height: 30 })
    const sourceBytes = await pdfDoc.save()

    // Intentionally pass a field name that doesn't exist
    const filledBytes = await fillAndFlattenForm(sourceBytes, {
      realField: 'value-1',
      ghostField: 'value-2', // not in the PDF — should be silently ignored
    })

    expect(filledBytes).toBeInstanceOf(Uint8Array)
    expect(filledBytes.length).toBeGreaterThan(100) // basic sanity check
  })

  it('handles checkbox values (true/false strings)', async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792])
    const form = pdfDoc.getForm()
    const cb = form.createCheckBox('agreeBox')
    cb.addToPage(page, { x: 50, y: 700, width: 20, height: 20 })
    const sourceBytes = await pdfDoc.save()

    // 'true' string should check the box
    const filled = await fillAndFlattenForm(sourceBytes, { agreeBox: 'true' })
    expect(filled).toBeInstanceOf(Uint8Array)
    // The flattened result preserves the checked visual state but the form is non-editable.
    // Detection: no form fields after flatten.
    const reloaded = await detectFormFields(filled)
    expect(reloaded.hasForm).toBe(false)
  })
})
