// api/sign-document.ts
// Vercel serverless function: Accepts a drawn signature from the client portal,
// embeds it into the engagement letter PDF using pdf-lib, stores the signed PDF,
// and inserts a signatures record.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from './_lib/supabase.js'
import { PDFDocument, rgb } from 'pdf-lib'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    engagementLetterId,
    clientId,
    portalToken,
    signerName,
    signerEmail,
    signatureImageData,
  } = req.body ?? {}

  if (!engagementLetterId || !clientId || !portalToken ||
      !signerName || !signerEmail || !signatureImageData) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Validate portal token
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, bookkeeper_id')
    .eq('id', clientId)
    .eq('portal_token', portalToken)
    .maybeSingle()

  if (clientErr || !client) {
    return res.status(403).json({ error: 'Invalid portal token' })
  }

  // Check not already signed
  const { data: existing } = await supabaseAdmin
    .from('signatures')
    .select('id')
    .eq('engagement_letter_id', engagementLetterId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ error: 'Document already signed' })
  }

  // Fetch the engagement letter
  const { data: letter, error: letterErr } = await supabaseAdmin
    .from('engagement_letters')
    .select('*')
    .eq('id', engagementLetterId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (letterErr || !letter) {
    return res.status(404).json({ error: 'Engagement letter not found' })
  }

  try {
    // Download original PDF from storage
    const { data: pdfData, error: dlErr } = await supabaseAdmin.storage
      .from('documents')
      .download(letter.storage_path)

    if (dlErr || !pdfData) {
      return res.status(500).json({ error: 'Failed to download document' })
    }

    // Embed signature into PDF using pdf-lib
    const pdfBytes = await pdfData.arrayBuffer()
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const pages = pdfDoc.getPages()
    const lastPage = pages[pages.length - 1]

    // Convert base64 PNG signature to bytes
    const signatureBase64 = signatureImageData.replace(
      /^data:image\/png;base64,/, ''
    )
    const signatureBytes = Buffer.from(signatureBase64, 'base64')
    const signatureImage = await pdfDoc.embedPng(signatureBytes)

    // Place signature at bottom of last page
    const sigWidth = 200
    const sigHeight = 60
    const sigX = 60
    const sigY = 80

    lastPage.drawImage(signatureImage, {
      x: sigX,
      y: sigY,
      width: sigWidth,
      height: sigHeight,
    })

    // Add signature line text
    lastPage.drawText(
      `Signed by: ${signerName} | ${signerEmail} | ${new Date().toISOString()}`,
      {
        x: sigX,
        y: sigY - 16,
        size: 8,
        color: rgb(0.4, 0.4, 0.4),
      }
    )

    // Save the signed PDF
    const signedPdfBytes = await pdfDoc.save()
    const signedPath = letter.storage_path.replace(
      '/engagement-letters/',
      '/engagement-letters/signed/'
    )

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('documents')
      .upload(signedPath, signedPdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadErr) {
      console.warn('[sign-document] Failed to save signed PDF:', uploadErr)
    }

    // Insert signature record
    const { error: insertErr } = await supabaseAdmin
      .from('signatures')
      .insert({
        engagement_letter_id: engagementLetterId,
        client_id: clientId,
        bookkeeper_id: client.bookkeeper_id,
        signer_name: signerName,
        signer_email: signerEmail,
        signature_image_data: signatureImageData,
        signed_pdf_path: uploadErr ? null : signedPath,
        ip_address: req.headers['x-forwarded-for']?.toString() ?? null,
        portal_token_used: portalToken,
      })

    if (insertErr) {
      return res.status(500).json({ error: 'Failed to save signature' })
    }

    return res.status(200).json({ success: true, signedPath: uploadErr ? null : signedPath })

  } catch (err) {
    console.error('[sign-document] Error:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Signature processing failed'
    })
  }
}
