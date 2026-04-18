import type { FastifyInstance } from 'fastify';
import { eq, sql, and } from 'drizzle-orm';
import {
  invoices, invoiceLines, consignmentLines, consignments,
  inventoryMovements, remittances, remittanceInvoices,
  channelPartners,
} from '@xarra/db';
import { generatePdf } from './pdf.js';
import { renderReceiptHtml } from './templates/receipt.js';
import { renderInvoiceHtml } from './templates/invoice.js';
import { sendEmail, isEmailConfigured } from './email.js';

interface ReconciliationResult {
  invoiceId: string;
  invoiceNumber: string;
  titlesReconciled: Array<{
    titleId: string;
    quantity: number;
    consignmentLineId: string | null;
  }>;
  consignmentsUpdated: string[];
}

/**
 * When an invoice reaches PAID status, determine what was sold per title:
 * - For lines linked to a consignment line: increment qtySold on the consignment line
 * - For all lines with a titleId: create SELL inventory movements
 *
 * Idempotent — checks for existing SELL movements before creating new ones.
 */
export async function reconcileInvoiceSales(
  app: FastifyInstance,
  invoiceId: string,
  userId?: string,
): Promise<ReconciliationResult | null> {
  const invoice = await app.db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: { lines: true },
  });

  if (!invoice) return null;
  // Only reconcile fully paid invoices
  if (invoice.status !== 'PAID') return null;

  const result: ReconciliationResult = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    titlesReconciled: [],
    consignmentsUpdated: [],
  };

  const consignmentIdsToCheck = new Set<string>();

  await app.db.transaction(async (tx) => {
    for (const line of invoice.lines) {
      if (!line.titleId) continue;

      const qty = Math.floor(Number(line.quantity));
      if (qty <= 0) continue;

      // Idempotency: check if a SELL movement already exists for this invoice + title + line
      const existingMovement = await tx.execute(sql`
        SELECT id FROM inventory_movements
        WHERE movement_type = 'SELL'
          AND reference_type = 'INVOICE_LINE'
          AND reference_id = ${line.id}
          AND title_id = ${line.titleId}
        LIMIT 1
      `);

      if (existingMovement.length > 0) {
        // Already reconciled this line
        continue;
      }

      // Create SELL inventory movement
      await tx.insert(inventoryMovements).values({
        titleId: line.titleId,
        movementType: 'SELL',
        quantity: qty,
        fromLocation: 'XARRA_WAREHOUSE',
        reason: `Invoice ${invoice.number} — line ${line.lineNumber}`,
        referenceType: 'INVOICE_LINE',
        referenceId: line.id,
        createdBy: userId,
      });

      // Update consignment line qtySold if linked
      if (line.consignmentLineId) {
        await tx.execute(sql`
          UPDATE consignment_lines
          SET qty_sold = qty_sold + ${qty}
          WHERE id = ${line.consignmentLineId}
        `);

        // Get the consignment ID for status check
        const cl = await tx.execute(sql`
          SELECT consignment_id FROM consignment_lines WHERE id = ${line.consignmentLineId}
        `);
        if (cl[0]?.consignment_id) {
          consignmentIdsToCheck.add(cl[0].consignment_id as string);
        }
      }

      result.titlesReconciled.push({
        titleId: line.titleId,
        quantity: qty,
        consignmentLineId: line.consignmentLineId,
      });
    }

    // Check if any consignments are now fully reconciled
    for (const consignmentId of consignmentIdsToCheck) {
      const lines = await tx.query.consignmentLines.findMany({
        where: eq(consignmentLines.consignmentId, consignmentId),
      });

      const fullyAccountedFor = lines.every(
        (l) => l.qtySold + l.qtyReturned + l.qtyDamaged >= l.qtyDispatched,
      );

      if (fullyAccountedFor) {
        await tx.update(consignments).set({
          status: 'RECONCILED',
          updatedAt: new Date(),
        }).where(eq(consignments.id, consignmentId));
        result.consignmentsUpdated.push(consignmentId);
      }
    }
  });

  return result;
}

/**
 * After a remittance is matched, reconcile all linked invoices that are now PAID.
 */
export async function reconcileRemittanceInvoices(
  app: FastifyInstance,
  remittanceId: string,
  userId?: string,
): Promise<ReconciliationResult[]> {
  const ri = await app.db.query.remittanceInvoices.findMany({
    where: eq(remittanceInvoices.remittanceId, remittanceId),
  });

  const results: ReconciliationResult[] = [];

  for (const link of ri) {
    const result = await reconcileInvoiceSales(app, link.invoiceId, userId);
    if (result && result.titlesReconciled.length > 0) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Generate and email a payment receipt + PAID-stamped invoice when an invoice transitions to PAID.
 * Fire-and-forget safe — catches its own errors.
 */
export async function sendPaidInvoiceEmail(
  app: FastifyInstance,
  invoiceId: string,
  remittanceId?: string,
): Promise<void> {
  if (!isEmailConfigured()) return;

  try {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: { lines: true, partner: true },
    });
    if (!invoice || invoice.status !== 'PAID') return;

    const partner = invoice.partner ?? (invoice.partnerId
      ? await app.db.query.channelPartners.findFirst({ where: eq(channelPartners.id, invoice.partnerId) })
      : null);

    const recipientEmail = partner?.financeContactEmail || partner?.contactEmail;
    if (!recipientEmail) return;

    // Build receipt data
    const receiptNumber = `RCP-${invoice.number.replace('INV-', '')}`;
    const receiptHtml = renderReceiptHtml({
      paymentDate: new Date().toISOString(),
      amount: invoice.total,
      paymentMethod: 'EFT',
      bankReference: remittanceId ?? invoice.number,
      partnerName: partner?.name ?? invoice.recipientName ?? 'Partner',
      invoiceAllocations: [{ invoiceNumber: invoice.number, amount: invoice.total }],
    });

    // Build paid-stamp invoice
    const paidInvoiceHtml = renderInvoiceHtml({
      number: invoice.number,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      purchaseOrderNumber: invoice.purchaseOrderNumber ?? null,
      paid: true,
      paidDate: new Date().toISOString(),
      recipient: {
        name: partner?.name ?? invoice.recipientName ?? 'Partner',
        contactEmail: recipientEmail,
      },
      lines: invoice.lines.map((l, i) => ({
        lineNumber: i + 1,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct ?? '0',
        lineTotal: l.lineTotal,
        lineTax: l.lineTax,
      })),
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      total: invoice.total,
    });

    const [receiptPdf, invoicePdf] = await Promise.all([
      generatePdf(receiptHtml),
      generatePdf(paidInvoiceHtml),
    ]);

    await sendEmail({
      to: recipientEmail,
      subject: `Payment Received — ${invoice.number} | Xarra Books`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#166534">Payment Received</h2>
          <p>Dear ${partner?.contactName ?? partner?.name ?? 'Valued Partner'},</p>
          <p>We confirm receipt of your payment of <strong>R ${Number(invoice.total).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 0;color:#555">Invoice:</td><td style="padding:6px 0;font-weight:600">${invoice.number}</td></tr>
            <tr><td style="padding:6px 0;color:#555">Amount:</td><td style="padding:6px 0;font-weight:600">R ${Number(invoice.total).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td></tr>
            <tr><td style="padding:6px 0;color:#555">Date Paid:</td><td style="padding:6px 0;font-weight:600">${new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}</td></tr>
          </table>
          <p>Please find attached your payment receipt (${receiptNumber}) and a copy of your paid invoice.</p>
          <p>Thank you for your business.</p>
          <p style="color:#888;font-size:12px;margin-top:30px">Xarra Books Management System</p>
        </div>
      `,
      attachments: [
        { filename: `${receiptNumber}.pdf`, content: receiptPdf, contentType: 'application/pdf' },
        { filename: `${invoice.number}-PAID.pdf`, content: invoicePdf, contentType: 'application/pdf' },
      ],
    });

    app.log.info({ invoiceId, receiptNumber }, 'Paid invoice email sent');
  } catch (err) {
    app.log.error({ err, invoiceId }, 'Failed to send paid invoice email');
  }
}
