import type { FastifyInstance } from 'fastify';
import { documentEmails } from '@xarra/db';
import { sendEmail, isEmailConfigured } from './email.js';
import { generatePdf } from './pdf.js';

interface SendDocumentOptions {
  app: FastifyInstance;
  documentType: string;
  documentId: string;
  recipientEmail: string;
  subject: string;
  message?: string;
  html: string;
  documentNumber: string;
  sentBy?: string;
}

export async function sendDocumentEmail(options: SendDocumentOptions): Promise<{ success: boolean; error?: string }> {
  const { app, documentType, documentId, recipientEmail, subject, message, html, documentNumber, sentBy } = options;

  if (!isEmailConfigured()) {
    // Log as failed
    await app.db.insert(documentEmails).values({
      documentType,
      documentId,
      sentTo: recipientEmail,
      sentBy,
      subject,
      message,
      status: 'FAILED',
      errorMessage: 'Email service not configured (RESEND_API_KEY missing)',
    });
    return { success: false, error: 'Email service not configured' };
  }

  try {
    // Generate PDF
    const pdfBuffer = await generatePdf(html);

    // Build email HTML with optional message
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #166534;">${subject}</h2>
        ${message ? `<p>${message}</p>` : ''}
        <p>Please find attached ${documentType.toLowerCase().replace('_', ' ')} <strong>${documentNumber}</strong>.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">This email was sent from Xarra Books Management System.</p>
      </div>
    `;

    await sendEmail({
      to: recipientEmail,
      subject,
      html: emailHtml,
    });

    // Log success
    await app.db.insert(documentEmails).values({
      documentType,
      documentId,
      sentTo: recipientEmail,
      sentBy,
      subject,
      message,
      status: 'SENT',
    });

    return { success: true };
  } catch (err: any) {
    // Log failure
    await app.db.insert(documentEmails).values({
      documentType,
      documentId,
      sentTo: recipientEmail,
      sentBy,
      subject,
      message,
      status: 'FAILED',
      errorMessage: err.message,
    });

    return { success: false, error: err.message };
  }
}
