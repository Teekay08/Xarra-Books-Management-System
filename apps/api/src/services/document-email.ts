import type { FastifyInstance } from 'fastify';
import { documentEmails } from '@xarra/db';
import { sendEmailWithAttachment, isEmailConfigured } from './email.js';
import { generatePdf } from './pdf.js';

interface SendDocumentOptions {
  app: FastifyInstance;
  documentType: string;
  documentId: string;
  recipientEmail: string;
  subject: string;
  /** Pre-built email body HTML — replaces the generic stub when provided */
  emailHtml?: string;
  /** HTML used to render the PDF attachment */
  html: string;
  documentNumber: string;
  sentBy?: string;
  /** Filename for the PDF attachment (without .pdf extension) */
  attachmentName?: string;
}

export async function sendDocumentEmail(options: SendDocumentOptions): Promise<{ success: boolean; error?: string }> {
  const {
    app, documentType, documentId, recipientEmail,
    subject, emailHtml, html, documentNumber, sentBy, attachmentName,
  } = options;

  if (!isEmailConfigured()) {
    await app.db.insert(documentEmails).values({
      documentType,
      documentId,
      sentTo: recipientEmail,
      sentBy,
      subject,
      status: 'FAILED',
      errorMessage: 'Email service not configured (RESEND_API_KEY missing)',
    });
    return { success: false, error: 'Email service not configured' };
  }

  try {
    // Generate PDF attachment
    const pdfBuffer = await generatePdf(html);

    // Use caller-supplied email body, or fall back to a generic stub
    const body = emailHtml ?? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #166534;">${subject}</h2>
        <p>Please find the attached ${documentType.toLowerCase().replace(/_/g, ' ')} <strong>${documentNumber}</strong>.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">This email was sent from Xarra Books Management System.</p>
      </div>
    `;

    await sendEmailWithAttachment({
      to: recipientEmail,
      subject,
      html: body,
      attachments: [{
        filename: `${attachmentName ?? documentNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });

    await app.db.insert(documentEmails).values({
      documentType,
      documentId,
      sentTo: recipientEmail,
      sentBy,
      subject,
      status: 'SENT',
    });

    return { success: true };
  } catch (err: any) {
    await app.db.insert(documentEmails).values({
      documentType,
      documentId,
      sentTo: recipientEmail,
      sentBy,
      subject,
      status: 'FAILED',
      errorMessage: err.message,
    });

    return { success: false, error: err.message };
  }
}
