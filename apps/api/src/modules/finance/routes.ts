import type { FastifyInstance } from 'fastify';
import { eq, sql, desc, inArray } from 'drizzle-orm';
import {


  invoices, invoiceLines, creditNotes, creditNoteLines, debitNotes,
  payments, paymentAllocations, channelPartners,
  partnerBranches, remittances, remittanceInvoices, remittanceCreditNotes, companySettings,
  quotations, quotationLines,
  purchaseOrders, purchaseOrderLines,
  inventoryMovements, partnerOrders,
} from '@xarra/db';
import { createInvoiceSchema, recordPaymentSchema, paginationSchema, createRemittanceSchema, createDebitNoteSchema, sendDocumentSchema, createPurchaseOrderSchema } from '@xarra/shared';
import { VAT_RATE, roundAmount, calculateLineDiscount, DEFAULT_PAYMENT_TERMS_DAYS } from '@xarra/shared';
import { requireAuth, requireRole, requirePermission } from '../../middleware/require-auth.js';
import { requireIdempotencyKey, getIdempotencyKey } from '../../middleware/idempotency.js';
import { nextInvoiceNumber, nextCreditNoteNumber, nextDebitNoteNumber, nextQuotationNumber, nextPurchaseOrderNumber } from './invoice-number.js';
import { generatePdf } from '../../services/pdf.js';
import { renderInvoiceHtml } from '../../services/templates/invoice.js';
import { renderDebitNoteHtml } from '../../services/templates/debit-note.js';
import { renderQuotationHtml } from '../../services/templates/quotation.js';
import { renderCreditNoteHtml } from '../../services/templates/credit-note.js';
import { renderReceiptHtml } from '../../services/templates/receipt.js';
import { renderPurchaseOrderHtml } from '../../services/templates/purchase-order.js';
import { createBroadcastNotification } from '../../services/notifications.js';
import { sendDocumentEmail } from '../../services/document-email.js';
import { reconcileInvoiceSales, reconcileRemittanceInvoices, sendPaidInvoiceEmail } from '../../services/reconciliation.js';
import { notifyPartner } from '../../services/partner-notifications.js';

/**
 * Compute the total of active (non-voided) credit notes for an invoice.
 */
async function totalCreditNotesForInvoice(db: any, invoiceId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(total::numeric), 0) AS total
    FROM credit_notes
    WHERE invoice_id = ${invoiceId} AND voided_at IS NULL
  `);
  return Number(result[0]?.total ?? 0);
}

/**
 * Compute the effective amount due on an invoice after payments and credit notes.
 * effectiveTotal = invoice.total - creditNotes
 * amountDue = effectiveTotal - amountPaid
 */
async function computeInvoiceBalance(db: any, invoiceId: string, invoiceTotal: number) {
  const [paidResult, creditTotal, remittancePaidResult] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM payment_allocations
      WHERE invoice_id = ${invoiceId}
    `),
    totalCreditNotesForInvoice(db, invoiceId),
    db.execute(sql`
      SELECT COALESCE(SUM(ri.amount::numeric), 0) AS total
      FROM remittance_invoices ri
      JOIN remittances r ON r.id = ri.remittance_id
      WHERE ri.invoice_id = ${invoiceId}
        AND r.status IN ('APPROVED', 'MATCHED')
    `),
  ]);
  const amountPaid = roundAmount(
    Number(paidResult[0]?.total ?? 0) + Number(remittancePaidResult[0]?.total ?? 0),
  );
  const effectiveTotal = Math.max(0, roundAmount(invoiceTotal - creditTotal));
  const amountDue = Math.max(0, roundAmount(effectiveTotal - amountPaid));
  return { amountPaid, creditTotal, effectiveTotal, amountDue };
}

type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'VOIDED';

/**
 * Determine invoice status based on payments + credit notes.
 */
function deriveInvoiceStatus(amountPaid: number, effectiveTotal: number): InvoiceStatus {
  if (effectiveTotal <= 0) return 'PAID'; // fully credited
  if (amountPaid >= effectiveTotal) return 'PAID';
  if (amountPaid > 0) return 'PARTIAL';
  return 'ISSUED';
}

export async function financeRoutes(app: FastifyInstance) {
  // ==========================================
  // NEXT DOCUMENT NUMBER (suggested / preview)
  // ==========================================
  app.get<{ Params: { type: string } }>('/next-number/:type', { preHandler: requireAuth }, async (request, reply) => {
    const generators: Record<string, () => Promise<string>> = {
      invoice: () => nextInvoiceNumber(app.db as any),
      quotation: () => nextQuotationNumber(app.db as any),
      'credit-note': () => nextCreditNoteNumber(app.db as any),
      'debit-note': () => nextDebitNoteNumber(app.db as any),
      'purchase-order': () => nextPurchaseOrderNumber(app.db as any),
    };
    const gen = generators[request.params.type];
    if (!gen) return reply.badRequest('Invalid document type');
    const number = await gen();
    return { data: { number } };
  });

  // ==========================================
  // INVOICES
  // ==========================================

  // Available credit notes for a partner (used by remittance create)
  app.get('/credit-notes/available', { preHandler: requireAuth }, async (request) => {
    const { partnerId } = request.query as { partnerId?: string };
    if (!partnerId) return { data: [] };

    const items = await app.db.query.creditNotes.findMany({
      where: sql`${creditNotes.partnerId} = ${partnerId} AND ${creditNotes.voidedAt} IS NULL`,
      with: { invoice: true },
      orderBy: [desc(creditNotes.createdAt)],
    });

    // Calculate how much of each credit note has already been applied in approved remittances
    const result = await Promise.all(items.map(async (cn) => {
      const appliedResult = await app.db.execute(sql`
        SELECT COALESCE(SUM(rcn.amount::numeric), 0) AS applied
        FROM remittance_credit_notes rcn
        JOIN remittances r ON r.id = rcn.remittance_id
        WHERE rcn.credit_note_id = ${cn.id}
          AND r.status IN ('APPROVED', 'MATCHED', 'UNDER_REVIEW', 'PENDING')
      `);
      const applied = Number(appliedResult[0]?.applied ?? 0);
      const available = roundAmount(Number(cn.total) - applied);
      return {
        id: cn.id,
        number: cn.number,
        invoiceId: cn.invoiceId,
        invoiceNumber: cn.invoice?.number,
        total: cn.total,
        applied: applied.toFixed(2),
        available: available.toFixed(2),
        reason: cn.reason,
        createdAt: cn.createdAt,
      };
    }));

    // Only return credit notes that have remaining balance
    return { data: result.filter((cn) => Number(cn.available) > 0) };
  });

  // Outstanding balances for a partner (used by remittance create)
  app.get<{ Querystring: { partnerId: string } }>('/invoices/outstanding', { preHandler: requireAuth }, async (request) => {
    const { partnerId } = request.query as { partnerId: string };
    if (!partnerId) return { data: [] };

    // Get all ISSUED or PARTIAL invoices for this partner
    const items = await app.db.query.invoices.findMany({
      where: sql`${invoices.partnerId} = ${partnerId} AND ${invoices.status} IN ('ISSUED', 'PARTIAL', 'OVERDUE')`,
      orderBy: [desc(invoices.invoiceDate)],
    });

    // Compute balance for each
    const result = await Promise.all(items.map(async (inv) => {
      const { amountPaid, creditTotal, effectiveTotal, amountDue } = await computeInvoiceBalance(
        app.db, inv.id, Number(inv.total),
      );
      return {
        id: inv.id,
        number: inv.number,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        status: inv.status,
        total: inv.total,
        creditNotesTotal: creditTotal.toFixed(2),
        amountPaid: amountPaid.toFixed(2),
        effectiveTotal: effectiveTotal.toFixed(2),
        amountDue: amountDue.toFixed(2),
      };
    }));

    // Only return invoices that still have a balance
    return { data: result.filter((inv) => Number(inv.amountDue) > 0) };
  });

  // List invoices (paginated)
  app.get('/invoices', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const { status } = request.query as { status?: string };
    const offset = (page - 1) * limit;

    const { partnerId } = request.query as { partnerId?: string };
    const conditions: ReturnType<typeof sql>[] = [];
    if (search) conditions.push(sql`(${invoices.number} ILIKE ${'%' + search + '%'})`);
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(inArray(invoices.status, statuses as any[]) as any);
      }
    }
    if (partnerId) conditions.push(sql`${invoices.partnerId} = ${partnerId}`);
    const where = conditions.length > 0
      ? sql.join(conditions, sql` AND `)
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.invoices.findMany({
        where: where ? () => where : undefined,
        with: { partner: true },
        orderBy: sortOrder === 'asc' ? (inv, { asc }) => [asc(inv.invoiceDate)] : (inv, { desc }) => [desc(inv.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(invoices).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get single invoice with lines, payments, and computed amounts
  app.get<{ Params: { id: string } }>('/invoices/:id', { preHandler: requireAuth }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
      with: { partner: true, lines: true, creditNotes: true },
    });
    if (!invoice) return reply.notFound('Invoice not found');

    // Compute balance: invoice total − credit notes − payments
    const { amountPaid, creditTotal, effectiveTotal, amountDue } = await computeInvoiceBalance(
      app.db, request.params.id, Number(invoice.total),
    );

    // Get payment allocations with payment details
    const allocations = await app.db.execute<{ paymentId: string; amount: string; paymentDate: string; bankReference: string | null; paymentMethod: string | null }>(sql`
      SELECT pa.payment_id as "paymentId", pa.amount, p.payment_date as "paymentDate", p.bank_reference as "bankReference", p.payment_method as "paymentMethod"
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = ${request.params.id}
      ORDER BY p.payment_date DESC
    `);

    return {
      data: {
        ...invoice,
        amountPaid: String(amountPaid.toFixed(2)),
        creditNotesTotal: String(creditTotal.toFixed(2)),
        effectiveTotal: String(effectiveTotal.toFixed(2)),
        amountDue: String(amountDue.toFixed(2)),
        paymentHistory: allocations,
      },
    };
  });

  // Create invoice
  app.post('/invoices', {
    preHandler: [requireRole('admin', 'finance'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createInvoiceSchema.parse(request.body);
    const { partnerOrderId } = request.body as { partnerOrderId?: string };
    const idempotencyKey = getIdempotencyKey(request)!;
    const userId = request.session?.user?.id;

    // Check idempotency — return existing if already created
    const existing = await app.db.query.invoices.findFirst({
      where: eq(invoices.idempotencyKey, idempotencyKey),
      with: { lines: true },
    });
    if (existing) return { data: existing };

    // Get partner for payment terms
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
    });
    if (!partner) return reply.notFound('Partner not found');

    // Calculate line totals and invoice totals
    const isTaxInclusive = body.taxInclusive ?? false;
    let subtotal = 0;
    let totalVat = 0;
    const lineData = body.lines.map((line, i) => {
      const lineSubtotal = roundAmount(line.quantity * line.unitPrice);
      const discountType = line.discountType ?? 'PERCENT';
      const discount = calculateLineDiscount(lineSubtotal, line.discountPct, discountType);
      const lineTotal = roundAmount(lineSubtotal - discount);
      // Tax-inclusive: extract VAT from the price. Tax-exclusive: add VAT on top.
      const lineTax = roundAmount(isTaxInclusive
        ? lineTotal - (lineTotal / (1 + VAT_RATE))
        : lineTotal * VAT_RATE);
      const lineExVat = roundAmount(isTaxInclusive ? lineTotal - lineTax : lineTotal);
      subtotal += lineExVat;
      totalVat += lineTax;
      return {
        lineNumber: i + 1,
        titleId: line.titleId,
        description: line.description ?? `${line.quantity} x units`,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        discountPct: String(line.discountPct),
        discountType,
        lineTotal: String(lineTotal),
        lineTax: String(lineTax),
      };
    });

    subtotal = roundAmount(subtotal);
    totalVat = roundAmount(totalVat);
    const vatAmount = totalVat;
    const total = roundAmount(subtotal + vatAmount);

    // Generate invoice number
    const number = await nextInvoiceNumber(app.db as any);

    // Calculate due date from partner payment terms
    const invoiceDate = new Date(body.invoiceDate);
    const dueDate = new Date(invoiceDate);
    if (partner.paymentTermsDays) {
      dueDate.setDate(dueDate.getDate() + partner.paymentTermsDays);
    } else {
      dueDate.setDate(dueDate.getDate() + DEFAULT_PAYMENT_TERMS_DAYS);
    }

    // Insert invoice + lines in transaction
    const result = await app.db.transaction(async (tx) => {
      const [inv] = await tx.insert(invoices).values({
        number,
        partnerId: body.partnerId,
        branchId: body.branchId,
        consignmentId: body.consignmentId,
        invoiceDate,
        subtotal: String(subtotal),
        vatAmount: String(vatAmount),
        total: String(total),
        taxInclusive: isTaxInclusive,
        status: 'DRAFT',
        dueDate,
        purchaseOrderNumber: body.purchaseOrderNumber,
        customerReference: body.customerReference,
        paymentTermsText: body.paymentTermsText,
        notes: body.notes,
        idempotencyKey,
        createdBy: userId,
      }).returning();

      const lines = await tx.insert(invoiceLines).values(
        lineData.map((l) => ({ ...l, invoiceId: inv.id }))
      ).returning();

      return { ...inv, lines };
    });

    // Auto-link back to partner order if created from one
    if (partnerOrderId) {
      await app.db.update(partnerOrders).set({
        invoiceId: result.id,
        updatedAt: new Date(),
      }).where(eq(partnerOrders.id, partnerOrderId));
    }

    return reply.status(201).send({ data: result });
  });

  // Issue invoice (DRAFT → ISSUED)
  app.post<{ Params: { id: string } }>('/invoices/:id/issue', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
    });
    if (!invoice) return reply.notFound('Invoice not found');
    if (invoice.status !== 'DRAFT') return reply.badRequest('Only DRAFT invoices can be issued');

    const [updated] = await app.db.update(invoices).set({
      status: 'ISSUED',
      issuedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(invoices.id, request.params.id)).returning();

    // Notify the partner, not Xarra staff
    notifyPartner(app, updated.partnerId, {
      type: 'INVOICE_ISSUED',
      title: `Invoice ${updated.number} issued`,
      message: `Invoice ${updated.number} for R ${Number(updated.total).toFixed(2)} has been issued.`,
      actionUrl: `/partner/invoices`,
      referenceType: 'INVOICE',
      referenceId: updated.id,
    }).catch((err) => app.log.error({ err }, 'Failed to notify partner of invoice issue'));

    return { data: updated };
  });

  // Void invoice
  app.post<{ Params: { id: string } }>('/invoices/:id/void', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const { reason } = request.body as { reason: string };
    if (!reason) return reply.badRequest('Void reason is required');

    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
    });
    if (!invoice) return reply.notFound('Invoice not found');
    if (invoice.status === 'VOIDED') return reply.badRequest('Invoice is already voided');

    const [updated] = await app.db.update(invoices).set({
      status: 'VOIDED',
      voidedAt: new Date(),
      voidedReason: reason,
      updatedAt: new Date(),
    }).where(eq(invoices.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: 'INVOICE_VOIDED',
      priority: 'HIGH',
      title: `Invoice ${invoice.number} voided`,
      message: `R ${Number(invoice.total).toFixed(2)} — ${reason}`,
      actionUrl: `/invoices/${invoice.id}`,
      referenceType: 'INVOICE',
      referenceId: invoice.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create void notification'));

    return { data: updated };
  });

  // Edit DRAFT invoice
  app.patch<{ Params: { id: string } }>('/invoices/:id', {
    preHandler: requirePermission('invoices', 'update'),
  }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
    });
    if (!invoice) return reply.notFound('Invoice not found');
    if (invoice.status !== 'DRAFT') return reply.badRequest('Only DRAFT invoices can be edited');

    const body = request.body as {
      partnerId?: string;
      branchId?: string | null;
      invoiceDate?: string;
      dueDate?: string;
      purchaseOrderNumber?: string | null;
      customerReference?: string | null;
      paymentTermsText?: string | null;
      taxInclusive?: boolean;
      notes?: string | null;
      lines?: { titleId?: string; description: string; quantity: number; unitPrice: number; discountPct: number; discountType?: string }[];
    };

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.partnerId !== undefined) updates.partnerId = body.partnerId;
    if (body.branchId !== undefined) updates.branchId = body.branchId;
    if (body.invoiceDate !== undefined) updates.invoiceDate = new Date(body.invoiceDate);
    if (body.dueDate !== undefined) updates.dueDate = new Date(body.dueDate);
    if (body.purchaseOrderNumber !== undefined) updates.purchaseOrderNumber = body.purchaseOrderNumber;
    if (body.customerReference !== undefined) updates.customerReference = body.customerReference;
    if (body.paymentTermsText !== undefined) updates.paymentTermsText = body.paymentTermsText;
    if (body.notes !== undefined) updates.notes = body.notes;

    // If lines are provided, recalculate totals
    if (body.lines) {
      const isTaxInclusive = body.taxInclusive ?? invoice.taxInclusive ?? false;
      let subtotal = 0;
      let totalVat = 0;
      const lineData = body.lines.map((line, i) => {
        const lineSubtotal = roundAmount(line.quantity * line.unitPrice);
        const discountType = (line.discountType ?? 'PERCENT') as 'PERCENT' | 'FIXED';
        const discount = calculateLineDiscount(lineSubtotal, line.discountPct, discountType);
        const lineTotal = roundAmount(lineSubtotal - discount);
        const lineTax = roundAmount(isTaxInclusive
          ? lineTotal - (lineTotal / (1 + VAT_RATE))
          : lineTotal * VAT_RATE);
        const lineExVat = roundAmount(isTaxInclusive ? lineTotal - lineTax : lineTotal);
        subtotal += lineExVat;
        totalVat += lineTax;
        return {
          lineNumber: i + 1,
          titleId: line.titleId,
          description: line.description ?? `${line.quantity} x units`,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          discountPct: String(line.discountPct),
          discountType,
          lineTotal: String(lineTotal),
          lineTax: String(lineTax),
        };
      });

      subtotal = roundAmount(subtotal);
      totalVat = roundAmount(totalVat);
      updates.subtotal = String(subtotal);
      updates.vatAmount = String(totalVat);
      updates.total = String(roundAmount(subtotal + totalVat));
      if (body.taxInclusive !== undefined) updates.taxInclusive = body.taxInclusive;

      // Replace lines in transaction
      const result = await app.db.transaction(async (tx) => {
        await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, request.params.id));
        const [updated] = await tx.update(invoices).set(updates).where(eq(invoices.id, request.params.id)).returning();
        const lines = await tx.insert(invoiceLines).values(
          lineData.map((l) => ({ ...l, invoiceId: request.params.id }))
        ).returning();
        return { ...updated, lines };
      });

      return { data: result };
    }

    const [updated] = await app.db.update(invoices).set(updates).where(eq(invoices.id, request.params.id)).returning();
    return { data: updated };
  });

  // Duplicate invoice as new DRAFT
  app.post<{ Params: { id: string } }>('/invoices/:id/duplicate', {
    preHandler: requirePermission('invoices', 'create'),
  }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
      with: { lines: true },
    });
    if (!invoice) return reply.notFound('Invoice not found');

    const number = await nextInvoiceNumber(app.db as any);
    const userId = request.session?.user?.id;

    const result = await app.db.transaction(async (tx) => {
      const [newInv] = await tx.insert(invoices).values({
        number,
        partnerId: invoice.partnerId,
        branchId: invoice.branchId,
        invoiceDate: new Date(),
        subtotal: invoice.subtotal,
        vatAmount: invoice.vatAmount,
        total: invoice.total,
        taxInclusive: invoice.taxInclusive,
        status: 'DRAFT',
        dueDate: new Date(Date.now() + 30 * 86400000),
        purchaseOrderNumber: invoice.purchaseOrderNumber,
        customerReference: invoice.customerReference,
        paymentTermsText: invoice.paymentTermsText,
        notes: invoice.notes,
        createdBy: userId,
      }).returning();

      if (invoice.lines.length > 0) {
        await tx.insert(invoiceLines).values(
          invoice.lines.map((l) => ({
            invoiceId: newInv.id,
            titleId: l.titleId,
            lineNumber: l.lineNumber,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct,
            discountType: l.discountType,
            lineTotal: l.lineTotal,
            lineTax: l.lineTax,
          }))
        );
      }

      return newInv;
    });

    return reply.status(201).send({ data: result });
  });

  // Send invoice via email
  app.post<{ Params: { id: string } }>('/invoices/:id/send', {
    preHandler: requirePermission('invoices', 'create'),
  }, async (request, reply) => {
    const body = sendDocumentSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
      with: { partner: { with: { branches: true } }, lines: true },
    });
    if (!invoice) return reply.notFound('Invoice not found');

    const settings = await app.db.query.companySettings.findFirst();
    let branch = null;
    if (invoice.branchId) {
      branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, invoice.branchId),
      });
    }

    const html = renderInvoiceHtml({
      number: invoice.number,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? invoice.invoiceDate.toISOString(),
      purchaseOrderNumber: invoice.purchaseOrderNumber,
      customerReference: invoice.customerReference,
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl, bankDetails: settings.bankDetails ?? undefined,
      } : undefined,
      recipient: {
        name: invoice.partner.name, branchName: branch?.name,
        contactName: invoice.partner.contactName, contactEmail: invoice.partner.contactEmail,
        addressLine1: invoice.partner.addressLine1, addressLine2: invoice.partner.addressLine2,
        city: invoice.partner.city, province: invoice.partner.province,
        postalCode: invoice.partner.postalCode, vatNumber: invoice.partner.vatNumber,
      },
      lines: invoice.lines,
      subtotal: invoice.subtotal, vatAmount: invoice.vatAmount, total: invoice.total,
      notes: invoice.notes, paymentTermsText: invoice.paymentTermsText,
    });

    const result = await sendDocumentEmail({
      app,
      documentType: 'INVOICE',
      documentId: request.params.id,
      recipientEmail: body.recipientEmail,
      subject: body.subject ?? `Invoice ${invoice.number} from Xarra Books`,
      message: body.message,
      html,
      documentNumber: invoice.number,
      sentBy: userId,
    });

    if (result.success) {
      // Update invoice sentAt and sentTo, and auto-issue if DRAFT
      const updateData: Record<string, any> = {
        sentAt: new Date(),
        sentTo: body.recipientEmail,
        updatedAt: new Date(),
      };
      if (invoice.status === 'DRAFT') {
        updateData.status = 'ISSUED';
        updateData.issuedAt = new Date();
      }
      await app.db.update(invoices).set(updateData).where(eq(invoices.id, request.params.id));
    }

    return { data: result };
  });

  // Mark invoice as sent (without email)
  app.post<{ Params: { id: string } }>('/invoices/:id/mark-sent', {
    preHandler: requirePermission('invoices', 'update'),
  }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
    });
    if (!invoice) return reply.notFound('Invoice not found');

    const updateData: Record<string, any> = {
      sentAt: new Date(),
      updatedAt: new Date(),
    };
    if (invoice.status === 'DRAFT') {
      updateData.status = 'ISSUED';
      updateData.issuedAt = new Date();
    }

    const [updated] = await app.db.update(invoices).set(updateData).where(eq(invoices.id, request.params.id)).returning();
    return { data: updated };
  });

  // Delete DRAFT invoice
  app.delete<{ Params: { id: string } }>('/invoices/:id', {
    preHandler: requirePermission('invoices', 'delete'),
  }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
    });
    if (!invoice) return reply.notFound('Invoice not found');
    if (invoice.status !== 'DRAFT') return reply.badRequest('Only DRAFT invoices can be deleted');

    await app.db.transaction(async (tx) => {
      await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, request.params.id));
      await tx.delete(invoices).where(eq(invoices.id, request.params.id));
    });

    return { success: true };
  });

  // Generate invoice PDF
  app.get<{ Params: { id: string } }>('/invoices/:id/pdf', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
      with: { partner: { with: { branches: true } }, lines: true },
    });
    if (!invoice) return reply.notFound('Invoice not found');

    // Fetch company settings for sender details
    const settings = await app.db.query.companySettings.findFirst();

    // Fetch branch if applicable
    let branch = null;
    if (invoice.branchId) {
      branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, invoice.branchId),
      });
    }

    // Compute amount paid for PDF
    const paidResult = await app.db.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM payment_allocations
      WHERE invoice_id = ${request.params.id}
    `);
    const amountPaid = Number(paidResult[0]?.total ?? 0);

    const html = renderInvoiceHtml({
      number: invoice.number,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? invoice.invoiceDate.toISOString(),
      purchaseOrderNumber: invoice.purchaseOrderNumber,
      customerReference: invoice.customerReference,
      amountPaid: amountPaid > 0 ? amountPaid : undefined,
      company: settings ? {
        name: settings.companyName,
        tradingAs: settings.tradingAs,
        vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
        addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
        bankDetails: settings.bankDetails ?? undefined,
      } : undefined,
      recipient: {
        name: invoice.partner.name,
        branchName: branch?.name,
        contactName: invoice.partner.contactName,
        contactEmail: invoice.partner.contactEmail,
        addressLine1: invoice.partner.addressLine1,
        addressLine2: invoice.partner.addressLine2,
        city: invoice.partner.city,
        province: invoice.partner.province,
        postalCode: invoice.partner.postalCode,
        vatNumber: invoice.partner.vatNumber,
      },
      lines: invoice.lines,
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      total: invoice.total,
      notes: invoice.notes,
      paymentTermsText: invoice.paymentTermsText,
    });

    const pdf = await generatePdf(html);

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${invoice.number}.pdf"`)
      .send(pdf);
  });

  // Generate receipt PDF for a PAID invoice
  app.get<{ Params: { id: string } }>('/invoices/:id/receipt', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
      with: { partner: true, lines: true },
    });
    if (!invoice) return reply.notFound('Invoice not found');
    if (invoice.status !== 'PAID') return reply.badRequest('Receipt is only available for paid invoices');

    const { renderReceiptHtml } = await import('../../services/templates/receipt.js');
    const receiptNumber = `RCP-${invoice.number.replace('INV-', '')}`;
    const html = renderReceiptHtml({
      paymentDate: new Date().toISOString(),
      amount: invoice.total,
      paymentMethod: 'EFT',
      bankReference: invoice.number,
      partnerName: invoice.partner?.name ?? invoice.recipientName ?? 'Partner',
      invoiceAllocations: [{ invoiceNumber: invoice.number, amount: invoice.total }],
    });

    const pdf = await generatePdf(html);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${receiptNumber}.pdf"`)
      .send(pdf);
  });

  // ==========================================
  // CREDIT NOTES
  // ==========================================

  app.post<{ Params: { invoiceId: string } }>('/invoices/:invoiceId/credit-notes', {
    preHandler: [requireRole('admin', 'finance'), requireIdempotencyKey],
  }, async (request, reply) => {
    const { reason, lines } = request.body as {
      reason: string;
      lines: { titleId?: string; description: string; quantity: number; unitPrice: number; discountPct: number }[];
    };

    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.invoiceId),
    });
    if (!invoice) return reply.notFound('Invoice not found');
    if (invoice.status === 'VOIDED') return reply.badRequest('Cannot credit a voided invoice');

    // Inherit tax mode from the original invoice
    const isTaxInclusive = invoice.taxInclusive ?? false;
    let subtotal = 0;
    let totalVat = 0;
    for (const line of lines) {
      const lineSubtotal = roundAmount(line.quantity * line.unitPrice);
      const discount = roundAmount(lineSubtotal * (line.discountPct / 100));
      const lineTotal = roundAmount(lineSubtotal - discount);
      const lineTax = roundAmount(isTaxInclusive
        ? lineTotal - (lineTotal / (1 + VAT_RATE))
        : lineTotal * VAT_RATE);
      const lineExVat = roundAmount(isTaxInclusive ? lineTotal - lineTax : lineTotal);
      subtotal += lineExVat;
      totalVat += lineTax;
    }
    subtotal = roundAmount(subtotal);
    totalVat = roundAmount(totalVat);
    const vatAmount = totalVat;
    const total = roundAmount(subtotal + vatAmount);

    // Validate credit note doesn't exceed invoice total
    const existingCredits = await app.db.select({
      total: sql<string>`COALESCE(SUM(total::numeric), 0)`,
    }).from(creditNotes).where(sql`${creditNotes.invoiceId} = ${request.params.invoiceId} AND ${creditNotes.voidedAt} IS NULL`);
    const priorCredits = Number(existingCredits[0]?.total ?? 0);
    if (roundAmount(priorCredits + total) > Number(invoice.total)) {
      return reply.badRequest('Credit note total would exceed the invoice total');
    }

    const number = await nextCreditNoteNumber(app.db as any);
    const userId = request.session?.user?.id;

    const [cn] = await app.db.insert(creditNotes).values({
      number,
      invoiceId: request.params.invoiceId,
      partnerId: invoice.partnerId,
      subtotal: String(subtotal),
      vatAmount: String(vatAmount),
      total: String(total),
      reason,
      status: 'DRAFT',
      createdBy: userId,
    }).returning();

    // Persist line items
    if (lines.length > 0) {
      await app.db.insert(creditNoteLines).values(
        lines.map((line, idx) => {
          const lineSubtotal = roundAmount(line.quantity * line.unitPrice);
          const discount = roundAmount(lineSubtotal * (line.discountPct / 100));
          const lineTotal = roundAmount(lineSubtotal - discount);
          const lineTax = roundAmount(isTaxInclusive
            ? lineTotal - (lineTotal / (1 + VAT_RATE))
            : lineTotal * VAT_RATE);
          return {
            creditNoteId: cn.id,
            lineNumber: idx + 1,
            titleId: line.titleId || null,
            description: line.description,
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
            lineTotal: String(lineTotal),
            lineTax: String(lineTax),
          };
        }),
      );
    }

    // Recalculate invoice status now that credit note is applied
    const { amountPaid, effectiveTotal } = await computeInvoiceBalance(
      app.db, request.params.invoiceId, Number(invoice.total),
    );
    const newStatus = deriveInvoiceStatus(amountPaid, effectiveTotal);
    if (newStatus !== invoice.status) {
      await app.db.update(invoices).set({
        status: newStatus,
        updatedAt: new Date(),
      }).where(eq(invoices.id, request.params.invoiceId));
    }

    createBroadcastNotification(app, {
      type: 'CREDIT_NOTE_CREATED',
      priority: 'NORMAL',
      title: `Credit note ${number} created`,
      message: `R ${total.toFixed(2)} against invoice ${invoice.number} — ${reason}`,
      actionUrl: `/credit-notes/${cn.id}`,
      referenceType: 'CREDIT_NOTE',
      referenceId: cn.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create credit note notification'));

    // Notify partner about the credit note
    notifyPartner(app, invoice.partnerId, {
      type: 'CREDIT_NOTE_ISSUED',
      title: `Credit note ${number} issued`,
      message: `A credit note of R ${total.toFixed(2)} has been issued against invoice ${invoice.number}.`,
      actionUrl: '/partner/credit-notes',
      referenceType: 'CREDIT_NOTE',
      referenceId: cn.id,
    }).catch((err) => app.log.error({ err }, 'Failed to notify partner of credit note'));

    return reply.status(201).send({ data: cn });
  });

  // ==========================================
  // PAYMENTS
  // ==========================================

  // List payments
  app.get('/payments', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${payments.bankReference} ILIKE ${'%' + search + '%'}`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.payments.findMany({
        where: where ? () => where : undefined,
        with: { partner: true, allocations: true },
        orderBy: (p, { desc }) => [desc(p.paymentDate)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(payments).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get single payment with allocations
  app.get<{ Params: { id: string } }>('/payments/:id', { preHandler: requireAuth }, async (request, reply) => {
    const payment = await app.db.query.payments.findFirst({
      where: eq(payments.id, request.params.id),
      with: { partner: true, allocations: { with: { invoice: true } } },
    });
    if (!payment) return reply.notFound('Payment not found');
    return { data: payment };
  });

  // Record payment
  app.post('/payments', {
    preHandler: [requireRole('admin', 'finance'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = recordPaymentSchema.parse(request.body);
    const idempotencyKey = getIdempotencyKey(request)!;
    const userId = request.session?.user?.id;

    // Check idempotency
    const existing = await app.db.query.payments.findFirst({
      where: eq(payments.idempotencyKey, idempotencyKey),
    });
    if (existing) return { data: existing };

    const result = await app.db.transaction(async (tx) => {
      const [payment] = await tx.insert(payments).values({
        partnerId: body.partnerId,
        amount: String(body.amount),
        paymentDate: new Date(body.paymentDate),
        paymentMethod: body.paymentMethod ?? 'BANK_TRANSFER',
        bankReference: body.bankReference,
        notes: body.notes,
        idempotencyKey,
        createdBy: userId,
      }).returning();

      // Allocate to invoices if provided
      if (body.invoiceAllocations?.length) {
        await tx.insert(paymentAllocations).values(
          body.invoiceAllocations.map((a) => ({
            paymentId: payment.id,
            invoiceId: a.invoiceId,
            amount: String(a.amount),
          }))
        );

        // Update invoice statuses — batch fetch then update sequentially
        const allocInvoiceIds = body.invoiceAllocations.map((a) => a.invoiceId);
        const allocInvoiceBatch = await tx.query.invoices.findMany({
          where: inArray(invoices.id, allocInvoiceIds),
          columns: { id: true, total: true },
        });
        for (const invoice of allocInvoiceBatch) {
          const { amountPaid, effectiveTotal } = await computeInvoiceBalance(
            tx, invoice.id, Number(invoice.total),
          );
          const newStatus = deriveInvoiceStatus(amountPaid, effectiveTotal);
          await tx.update(invoices).set({
            status: newStatus,
            updatedAt: new Date(),
          }).where(eq(invoices.id, invoice.id));
        }
      }

      return payment;
    });

    // Get partner name for notification
    const partner = body.partnerId
      ? await app.db.query.channelPartners.findFirst({ where: eq(channelPartners.id, body.partnerId) })
      : null;
    createBroadcastNotification(app, {
      type: 'PAYMENT_RECEIVED',
      title: 'Payment recorded',
      message: `R ${Number(body.amount).toFixed(2)} received${partner ? ` from ${partner.name}` : ''}${body.bankReference ? ` (Ref: ${body.bankReference})` : ''}`,
      actionUrl: '/payments',
      referenceType: 'PAYMENT',
      referenceId: result.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create payment notification'));

    // Reconcile any invoices that are now PAID (fire-and-forget)
    if (body.invoiceAllocations?.length) {
      Promise.all(
        body.invoiceAllocations.map(async (a) => {
          await reconcileInvoiceSales(app, a.invoiceId, userId).catch((err) =>
            app.log.error({ err, invoiceId: a.invoiceId }, 'Failed to reconcile invoice sales'),
          );
          // Auto-send receipt + paid-stamp invoice email
          sendPaidInvoiceEmail(app, a.invoiceId);
        }),
      ).catch(() => {});
    }

    return reply.status(201).send({ data: result });
  });

  // ==========================================
  // REMITTANCES
  // ==========================================

  // List remittances
  app.get('/remittances', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${remittances.partnerRef} ILIKE ${'%' + search + '%'} OR ${remittances.status} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.remittances.findMany({
        where: where ? () => where : undefined,
        with: { partner: true },
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(remittances).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get single remittance with linked invoices and credit notes
  app.get<{ Params: { id: string } }>('/remittances/:id', { preHandler: requireAuth }, async (request, reply) => {
    const remittance = await app.db.query.remittances.findFirst({
      where: eq(remittances.id, request.params.id),
      with: {
        partner: true,
        invoiceAllocations: {
          with: {
            invoice: {
              with: { lines: true },
            },
          },
        },
        creditNoteAllocations: {
          with: {
            creditNote: true,
            invoice: true,
          },
        },
      },
    });
    if (!remittance) return reply.notFound('Remittance not found');
    return { data: remittance };
  });

  // Create remittance with optional invoice and credit note allocations
  app.post('/remittances', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = createRemittanceSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const result = await app.db.transaction(async (tx) => {
      const [remittance] = await tx.insert(remittances).values({
        partnerId: body.partnerId,
        partnerRef: body.partnerRef,
        periodFrom: body.periodFrom ? new Date(body.periodFrom) : undefined,
        periodTo: body.periodTo ? new Date(body.periodTo) : undefined,
        totalAmount: String(body.totalAmount),
        parseMethod: body.parseMethod,
        notes: body.notes,
        createdBy: userId,
      }).returning();

      if (body.invoiceAllocations?.length) {
        await tx.insert(remittanceInvoices).values(
          body.invoiceAllocations.map((a) => ({
            remittanceId: remittance.id,
            invoiceId: a.invoiceId,
            amount: String(a.amount),
          }))
        );
      }

      if (body.creditNoteAllocations?.length) {
        await tx.insert(remittanceCreditNotes).values(
          body.creditNoteAllocations.map((a) => ({
            remittanceId: remittance.id,
            creditNoteId: a.creditNoteId,
            invoiceId: a.invoiceId,
            amount: String(a.amount),
          }))
        );
      }

      return remittance;
    });

    return reply.status(201).send({ data: result });
  });

  // Match remittance to payment
  app.post<{ Params: { id: string } }>('/remittances/:id/match', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const { paymentId } = request.body as { paymentId: string };
    const userId = request.session?.user?.id;

    const remittance = await app.db.query.remittances.findFirst({
      where: eq(remittances.id, request.params.id),
    });
    if (!remittance) return reply.notFound('Remittance not found');

    const [updated] = await app.db.update(remittances).set({
      status: 'MATCHED',
      matchedBy: userId,
      matchedAt: new Date(),
    }).where(eq(remittances.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: 'REMITTANCE_MATCHED',
      priority: 'LOW',
      title: `Remittance ${remittance.partnerRef ?? remittance.id.slice(0, 8)} matched`,
      message: `R ${Number(remittance.totalAmount).toFixed(2)} matched to payment`,
      actionUrl: `/remittances/${remittance.id}`,
      referenceType: 'REMITTANCE',
      referenceId: remittance.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create remittance notification'));

    // Reconcile sales for all linked invoices that are now PAID + send receipt emails
    reconcileRemittanceInvoices(app, request.params.id, userId).then(async (results) => {
      for (const r of results) {
        sendPaidInvoiceEmail(app, r.invoiceId, request.params.id);
      }
    }).catch((err) =>
      app.log.error({ err }, 'Failed to reconcile remittance invoices'),
    );

    return { data: updated };
  });

  // Get reconciliation summary for a remittance
  app.get<{ Params: { id: string } }>('/remittances/:id/reconciliation', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const remittance = await app.db.query.remittances.findFirst({
      where: eq(remittances.id, request.params.id),
      with: { invoiceAllocations: { with: { invoice: { with: { lines: true } } } } },
    });
    if (!remittance) return reply.notFound('Remittance not found');

    // Gather all title sales from linked invoices
    const titleSales: Record<string, { titleId: string; description: string; quantity: number; consignmentLineIds: string[] }> = {};

    for (const ri of remittance.invoiceAllocations) {
      const inv = ri.invoice;
      if (!inv) continue;
      for (const line of inv.lines) {
        if (!line.titleId) continue;
        const qty = Math.floor(Number(line.quantity));
        if (!titleSales[line.titleId]) {
          titleSales[line.titleId] = { titleId: line.titleId, description: line.description, quantity: 0, consignmentLineIds: [] };
        }
        titleSales[line.titleId].quantity += qty;
        if (line.consignmentLineId) {
          titleSales[line.titleId].consignmentLineIds.push(line.consignmentLineId);
        }
      }
    }

    // Check which invoices are paid vs partial
    const invoiceStatuses = remittance.invoiceAllocations.map((ri) => ({
      invoiceId: ri.invoice?.id,
      invoiceNumber: ri.invoice?.number,
      status: ri.invoice?.status,
      amount: ri.amount,
    }));

    return {
      data: {
        remittanceId: remittance.id,
        status: remittance.status,
        titleSales: Object.values(titleSales),
        invoiceStatuses,
      },
    };
  });

  // Review remittance (finance staff verifies the remittance details)
  app.post<{ Params: { id: string } }>('/remittances/:id/review', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const body = request.body as { reviewNotes?: string };

    const remittance = await app.db.query.remittances.findFirst({
      where: eq(remittances.id, request.params.id),
    });
    if (!remittance) return reply.notFound('Remittance not found');
    if (remittance.status !== 'PENDING') {
      return reply.badRequest('Remittance must be in PENDING status to review');
    }

    const [updated] = await app.db.update(remittances).set({
      status: 'UNDER_REVIEW',
      reviewedBy: userId,
      reviewedAt: new Date(),
      reviewNotes: body.reviewNotes,
    }).where(eq(remittances.id, request.params.id)).returning();

    return { data: updated };
  });

  // Approve remittance (manager sign-off — applies credit notes and reconciles)
  app.post<{ Params: { id: string } }>('/remittances/:id/approve', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const userId = request.session?.user?.id;

    const remittance = await app.db.query.remittances.findFirst({
      where: eq(remittances.id, request.params.id),
      with: {
        invoiceAllocations: true,
        creditNoteAllocations: true,
      },
    });
    if (!remittance) return reply.notFound('Remittance not found');
    if (!['UNDER_REVIEW', 'PENDING', 'MATCHED'].includes(remittance.status)) {
      return reply.badRequest('Remittance must be pending or under review to approve');
    }

    // Validate: total invoices - total credit notes should equal totalAmount (with tolerance)
    const invoiceTotal = remittance.invoiceAllocations.reduce((s, a) => s + Number(a.amount), 0);
    const cnTotal = remittance.creditNoteAllocations.reduce((s, a) => s + Number(a.amount), 0);
    const netAmount = roundAmount(invoiceTotal - cnTotal);
    const declaredAmount = Number(remittance.totalAmount);

    // Allow R 1.00 tolerance for rounding
    if (Math.abs(netAmount - declaredAmount) > 1) {
      return reply.badRequest(
        `Net amount (R ${netAmount.toFixed(2)}) does not match declared total (R ${declaredAmount.toFixed(2)}). ` +
        `Invoices: R ${invoiceTotal.toFixed(2)}, Credit Notes: R ${cnTotal.toFixed(2)}.`
      );
    }

    const [updated] = await app.db.update(remittances).set({
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
    }).where(eq(remittances.id, request.params.id)).returning();

    // Now that remittance is APPROVED, recompute invoice statuses.
    // computeInvoiceBalance now includes approved remittance allocations so each
    // invoice correctly reflects the remittance payment and may transition to PAID.
    for (const allocation of remittance.invoiceAllocations) {
      const inv = await app.db.query.invoices.findFirst({
        where: eq(invoices.id, allocation.invoiceId),
        columns: { id: true, total: true, status: true },
      });
      if (!inv || inv.status === 'PAID' || inv.status === 'VOIDED') continue;
      const { amountPaid, effectiveTotal } = await computeInvoiceBalance(app.db, inv.id, Number(inv.total));
      const newStatus = deriveInvoiceStatus(amountPaid, effectiveTotal);
      if (newStatus !== inv.status) {
        await app.db.update(invoices).set({ status: newStatus, updatedAt: new Date() }).where(eq(invoices.id, inv.id));
      }
    }

    // Fire reconciliation for all linked invoices that are now PAID
    reconcileRemittanceInvoices(app, request.params.id, userId).catch((err) =>
      app.log.error({ err }, 'Failed to reconcile remittance invoices'),
    );

    createBroadcastNotification(app, {
      type: 'REMITTANCE_MATCHED',
      priority: 'NORMAL',
      title: `Remittance ${remittance.partnerRef ?? remittance.id.slice(0, 8)} approved`,
      message: `R ${declaredAmount.toFixed(2)} remittance approved — reconciliation in progress`,
      actionUrl: `/remittances/${remittance.id}`,
      referenceType: 'REMITTANCE',
      referenceId: remittance.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create remittance notification'));

    // Notify partner
    notifyPartner(app, remittance.partnerId, {
      type: 'PAYMENT_CONFIRMED',
      title: 'Remittance approved',
      message: `Your remittance of R ${declaredAmount.toFixed(2)} has been reviewed and approved.`,
      actionUrl: '/partner/invoices',
      referenceType: 'REMITTANCE',
      referenceId: remittance.id,
    }).catch((err) => app.log.error({ err }, 'Failed to notify partner of remittance approval'));

    return { data: updated };
  });

  // Dispute remittance
  app.post<{ Params: { id: string } }>('/remittances/:id/dispute', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const body = request.body as { reason: string };

    const remittance = await app.db.query.remittances.findFirst({
      where: eq(remittances.id, request.params.id),
    });
    if (!remittance) return reply.notFound('Remittance not found');

    const [updated] = await app.db.update(remittances).set({
      status: 'DISPUTED',
      reviewedBy: userId,
      reviewedAt: new Date(),
      reviewNotes: body.reason,
    }).where(eq(remittances.id, request.params.id)).returning();

    return { data: updated };
  });

  // ==========================================
  // DEBIT NOTES
  // ==========================================

  // List debit notes
  app.get('/debit-notes', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${debitNotes.number} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.debitNotes.findMany({
        where: where ? () => where : undefined,
        with: { partner: true },
        orderBy: (dn, { desc }) => [desc(dn.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(debitNotes).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get single debit note
  app.get<{ Params: { id: string } }>('/debit-notes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const dn = await app.db.query.debitNotes.findFirst({
      where: eq(debitNotes.id, request.params.id),
      with: { partner: true, invoice: true },
    });
    if (!dn) return reply.notFound('Debit note not found');
    return { data: dn };
  });

  // Create debit note
  app.post('/debit-notes', {
    preHandler: [requireRole('admin', 'finance'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createDebitNoteSchema.parse(request.body);
    const userId = request.session?.user?.id;

    let subtotal = 0;
    let totalVat = 0;
    for (const line of body.lines) {
      const lineSubtotal = roundAmount(line.quantity * line.unitPrice);
      const discount = roundAmount(lineSubtotal * (line.discountPct / 100));
      const lineTotal = roundAmount(lineSubtotal - discount);
      const lineTax = roundAmount(lineTotal * VAT_RATE);
      subtotal += roundAmount(lineTotal);
      totalVat += lineTax;
    }
    subtotal = roundAmount(subtotal);
    totalVat = roundAmount(totalVat);
    const vatAmount = totalVat;
    const total = roundAmount(subtotal + vatAmount);

    const number = await nextDebitNoteNumber(app.db as any);

    const [dn] = await app.db.insert(debitNotes).values({
      number,
      invoiceId: body.invoiceId,
      partnerId: body.partnerId,
      subtotal: String(subtotal),
      vatAmount: String(vatAmount),
      total: String(total),
      reason: body.reason,
      createdBy: userId,
    }).returning();

    createBroadcastNotification(app, {
      type: 'DEBIT_NOTE_CREATED',
      priority: 'NORMAL',
      title: `Debit note ${number} created`,
      message: `R ${total.toFixed(2)} — ${body.reason}`,
      actionUrl: `/debit-notes/${dn.id}`,
      referenceType: 'DEBIT_NOTE',
      referenceId: dn.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create debit note notification'));

    return reply.status(201).send({ data: dn });
  });

  // Void debit note
  app.post<{ Params: { id: string } }>('/debit-notes/:id/void', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const { reason } = request.body as { reason: string };
    if (!reason) return reply.badRequest('Void reason is required');

    const dn = await app.db.query.debitNotes.findFirst({
      where: eq(debitNotes.id, request.params.id),
    });
    if (!dn) return reply.notFound('Debit note not found');
    if (dn.voidedAt) return reply.badRequest('Debit note is already voided');

    const [updated] = await app.db.update(debitNotes).set({
      voidedAt: new Date(),
      voidedReason: reason,
    }).where(eq(debitNotes.id, request.params.id)).returning();

    return { data: updated };
  });

  // ==========================================
  // QUOTATIONS / PRO-FORMA
  // ==========================================

  // List quotations
  app.get('/quotations', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const { partnerId } = request.query as { partnerId?: string };
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof sql>[] = [];
    if (search) conditions.push(sql`${quotations.number} ILIKE ${'%' + search + '%'}`);
    if (partnerId) conditions.push(sql`${quotations.partnerId} = ${partnerId}`);
    const where = conditions.length > 0
      ? sql.join(conditions, sql` AND `)
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.quotations.findMany({
        where: where ? () => where : undefined,
        with: { partner: true },
        orderBy: (q, { desc: d }) => [d(q.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(quotations).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get quotation detail
  app.get<{ Params: { id: string } }>('/quotations/:id', { preHandler: requireAuth }, async (request, reply) => {
    const quotation = await app.db.query.quotations.findFirst({
      where: eq(quotations.id, request.params.id),
      with: { partner: true, lines: true, convertedInvoice: true },
    });
    if (!quotation) return reply.notFound('Quotation not found');
    return { data: quotation };
  });

  // Create quotation
  app.post('/quotations', {
    preHandler: [requireRole('admin', 'finance'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = request.body as {
      partnerId: string;
      branchId?: string;
      quotationDate: string;
      validUntil?: string;
      taxInclusive?: boolean;
      lines: { titleId?: string; description: string; quantity: number; unitPrice: number; discountPct: number }[];
      notes?: string;
    };

    const isTaxInclusive = body.taxInclusive ?? false;
    const number = await nextQuotationNumber(app.db as any);
    const userId = request.session?.user?.id;

    let subtotal = 0;
    let vatTotal = 0;
    const lineInserts = body.lines.map((line, i) => {
      const lineGross = roundAmount(line.quantity * line.unitPrice * (1 - line.discountPct / 100));
      const lineTax = roundAmount(isTaxInclusive
        ? lineGross - (lineGross / (1 + VAT_RATE))
        : lineGross * VAT_RATE);
      const lineExVat = roundAmount(isTaxInclusive ? lineGross - lineTax : lineGross);
      subtotal += lineExVat;
      vatTotal += lineTax;
      return {
        titleId: line.titleId,
        lineNumber: i + 1,
        description: line.description || 'Item',
        quantity: line.quantity,
        unitPrice: String(line.unitPrice),
        discountPct: String(line.discountPct),
        lineTotal: String(lineExVat),
        lineTax: String(lineTax),
      };
    });

    subtotal = roundAmount(subtotal);
    vatTotal = roundAmount(vatTotal);
    const total = roundAmount(subtotal + vatTotal);

    const [quotation] = await app.db.insert(quotations).values({
      number,
      partnerId: body.partnerId,
      branchId: body.branchId,
      quotationDate: new Date(body.quotationDate),
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      subtotal: String(subtotal),
      vatAmount: String(vatTotal),
      total: String(total),
      taxInclusive: isTaxInclusive,
      notes: body.notes,
      createdBy: userId,
    }).returning();

    if (lineInserts.length > 0) {
      await app.db.insert(quotationLines).values(
        lineInserts.map((l) => ({ ...l, quotationId: quotation.id })),
      );
    }

    return reply.status(201).send({ data: quotation });
  });

  // Convert quotation to invoice
  app.post<{ Params: { id: string } }>('/quotations/:id/convert', {
    preHandler: [requireRole('admin', 'finance'), requireIdempotencyKey],
  }, async (request, reply) => {
    const quotation = await app.db.query.quotations.findFirst({
      where: eq(quotations.id, request.params.id),
      with: { lines: true },
    });
    if (!quotation) return reply.notFound('Quotation not found');
    if (quotation.status === 'CONVERTED') return reply.badRequest('Quotation already converted');

    const invoiceNumber = await nextInvoiceNumber(app.db as any);
    const userId = request.session?.user?.id;

    // Create invoice from quotation data
    const [invoice] = await app.db.insert(invoices).values({
      number: invoiceNumber,
      partnerId: quotation.partnerId,
      branchId: quotation.branchId,
      invoiceDate: new Date(),
      subtotal: quotation.subtotal,
      vatAmount: quotation.vatAmount,
      total: quotation.total,
      taxInclusive: quotation.taxInclusive,
      notes: quotation.notes,
      createdBy: userId,
    }).returning();

    // Copy line items
    if (quotation.lines.length > 0) {
      await app.db.insert(invoiceLines).values(
        quotation.lines.map((l) => ({
          invoiceId: invoice.id,
          titleId: l.titleId,
          lineNumber: l.lineNumber,
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
          lineTotal: l.lineTotal,
          lineTax: l.lineTax,
        })),
      );
    }

    // Mark quotation as converted
    await app.db.update(quotations).set({
      status: 'CONVERTED',
      convertedInvoiceId: invoice.id,
      updatedAt: new Date(),
    }).where(eq(quotations.id, quotation.id));

    createBroadcastNotification(app, {
      type: 'QUOTATION_CONVERTED',
      priority: 'NORMAL',
      title: `Quotation ${quotation.number} converted`,
      message: `Created invoice ${invoiceNumber} — R ${Number(quotation.total).toFixed(2)}`,
      actionUrl: `/invoices/${invoice.id}`,
      referenceType: 'INVOICE',
      referenceId: invoice.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create quotation conversion notification'));

    return reply.status(201).send({ data: invoice });
  });

  // Delete a DRAFT quotation
  app.delete<{ Params: { id: string } }>('/quotations/:id', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const quotation = await app.db.query.quotations.findFirst({
      where: eq(quotations.id, request.params.id),
    });
    if (!quotation) return reply.notFound('Quotation not found');
    if (quotation.status !== 'DRAFT') return reply.badRequest('Only DRAFT quotations can be deleted');

    await app.db.transaction(async (tx) => {
      await tx.delete(quotationLines).where(eq(quotationLines.quotationId, quotation.id));
      await tx.delete(quotations).where(eq(quotations.id, quotation.id));
    });

    return { success: true };
  });

  // Generate quotation PDF
  app.get<{ Params: { id: string } }>('/quotations/:id/pdf', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const quotation = await app.db.query.quotations.findFirst({
      where: eq(quotations.id, request.params.id),
      with: { partner: { with: { branches: true } }, lines: true },
    });
    if (!quotation) return reply.notFound('Quotation not found');

    const settings = await app.db.query.companySettings.findFirst();
    let branch = null;
    if (quotation.branchId) {
      branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, quotation.branchId),
      });
    }

    const html = renderQuotationHtml({
      number: quotation.number,
      quotationDate: quotation.quotationDate.toISOString(),
      validUntil: quotation.validUntil?.toISOString(),
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl, bankDetails: settings.bankDetails ?? undefined,
      } : undefined,
      recipient: {
        name: quotation.partner.name, branchName: branch?.name,
        contactName: quotation.partner.contactName, contactEmail: quotation.partner.contactEmail,
        addressLine1: quotation.partner.addressLine1, addressLine2: quotation.partner.addressLine2,
        city: quotation.partner.city, province: quotation.partner.province,
        postalCode: quotation.partner.postalCode, vatNumber: quotation.partner.vatNumber,
      },
      lines: quotation.lines,
      subtotal: quotation.subtotal, vatAmount: quotation.vatAmount, total: quotation.total,
      notes: quotation.notes,
    });

    const pdf = await generatePdf(html);
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${quotation.number}.pdf"`)
      .send(pdf);
  });

  // Generate debit note PDF
  app.get<{ Params: { id: string } }>('/debit-notes/:id/pdf', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const dn = await app.db.query.debitNotes.findFirst({
      where: eq(debitNotes.id, request.params.id),
      with: { partner: true, invoice: true },
    });
    if (!dn) return reply.notFound('Debit note not found');

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderDebitNoteHtml({
      number: dn.number,
      createdAt: dn.createdAt.toISOString(),
      reason: dn.reason,
      invoiceNumber: dn.invoice?.number,
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      recipient: {
        name: dn.partner.name, contactName: dn.partner.contactName,
        contactEmail: dn.partner.contactEmail, addressLine1: dn.partner.addressLine1,
        addressLine2: dn.partner.addressLine2, city: dn.partner.city,
        province: dn.partner.province, postalCode: dn.partner.postalCode,
        vatNumber: dn.partner.vatNumber,
      },
      subtotal: dn.subtotal, vatAmount: dn.vatAmount, total: dn.total,
    });

    const pdf = await generatePdf(html);
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${dn.number}.pdf"`)
      .send(pdf);
  });

  // Generate payment receipt PDF
  app.get<{ Params: { id: string } }>('/payments/:id/receipt-pdf', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const payment = await app.db.query.payments.findFirst({
      where: eq(payments.id, request.params.id),
      with: { partner: true, allocations: { with: { invoice: true } } },
    });
    if (!payment) return reply.notFound('Payment not found');

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderReceiptHtml({
      paymentDate: payment.paymentDate.toISOString(),
      amount: payment.amount,
      paymentMethod: payment.paymentMethod ?? 'BANK_TRANSFER',
      bankReference: payment.bankReference,
      partnerName: payment.partner.name,
      invoiceAllocations: (payment.allocations ?? []).map((a: any) => ({
        invoiceNumber: a.invoice?.number ?? 'N/A',
        amount: a.amount,
      })),
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
    });

    const pdf = await generatePdf(html);
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="receipt-${payment.bankReference}.pdf"`)
      .send(pdf);
  });

  // ==========================================
  // PURCHASE ORDERS
  // ==========================================

  // List purchase orders
  app.get('/purchase-orders', { preHandler: requirePermission('purchaseOrders', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${purchaseOrders.number} ILIKE ${'%' + search + '%'} OR ${purchaseOrders.supplierName} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.purchaseOrders.findMany({
        where: where ? () => where : undefined,
        with: { supplier: true },
        orderBy: (po, { desc: d }) => [d(po.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(purchaseOrders).where(where),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get single purchase order with lines
  app.get<{ Params: { id: string } }>('/purchase-orders/:id', { preHandler: requirePermission('purchaseOrders', 'read') }, async (request, reply) => {
    const po = await app.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, request.params.id),
      with: { supplier: true, lines: true },
    });
    if (!po) return reply.notFound('Purchase order not found');
    return { data: po };
  });

  // Create purchase order
  app.post('/purchase-orders', { preHandler: requirePermission('purchaseOrders', 'create') }, async (request, reply) => {
    const body = createPurchaseOrderSchema.parse(request.body);
    const userId = request.session?.user?.id;
    const number = await nextPurchaseOrderNumber(app.db as any);

    const isTaxInclusive = body.taxInclusive ?? false;
    let subtotal = 0;
    let totalVat = 0;
    const lineData = body.lines.map((line, i) => {
      const lineSubtotal = roundAmount(line.quantity * line.unitPrice);
      const discount = roundAmount(lineSubtotal * (line.discountPct / 100));
      const lineTotal = roundAmount(lineSubtotal - discount);
      const lineTax = roundAmount(isTaxInclusive
        ? lineTotal - (lineTotal / (1 + VAT_RATE))
        : lineTotal * VAT_RATE);
      const lineExVat = roundAmount(isTaxInclusive ? lineTotal - lineTax : lineTotal);
      subtotal += lineExVat;
      totalVat += lineTax;
      return {
        lineNumber: i + 1,
        titleId: line.titleId,
        description: line.description,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        discountPct: String(line.discountPct),
        lineTotal: String(lineTotal),
        lineTax: String(lineTax),
      };
    });

    subtotal = roundAmount(subtotal);
    totalVat = roundAmount(totalVat);
    const total = roundAmount(subtotal + totalVat);

    const result = await app.db.transaction(async (tx) => {
      const [po] = await tx.insert(purchaseOrders).values({
        number,
        supplierId: body.supplierId,
        supplierName: body.supplierName,
        contactName: body.contactName,
        contactEmail: body.contactEmail,
        orderDate: new Date(body.orderDate),
        expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined,
        deliveryAddress: body.deliveryAddress,
        subtotal: String(subtotal),
        vatAmount: String(totalVat),
        total: String(total),
        taxInclusive: isTaxInclusive,
        notes: body.notes,
        createdBy: userId,
      }).returning();

      const lines = await tx.insert(purchaseOrderLines).values(
        lineData.map((l) => ({ ...l, purchaseOrderId: po.id }))
      ).returning();

      return { ...po, lines };
    });

    return reply.status(201).send({ data: result });
  });

  // Edit DRAFT purchase order
  app.patch<{ Params: { id: string } }>('/purchase-orders/:id', { preHandler: requirePermission('purchaseOrders', 'update') }, async (request, reply) => {
    const po = await app.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, request.params.id),
    });
    if (!po) return reply.notFound('Purchase order not found');
    if (po.status === 'CANCELLED') return reply.badRequest('Cancelled purchase orders cannot be edited');

    const body = request.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (po.status === 'DRAFT') {
      // Full edit: all header fields + line items allowed
      for (const key of ['supplierId', 'supplierName', 'contactName', 'contactEmail', 'deliveryAddress', 'notes'] as const) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (body.orderDate) updates.orderDate = new Date(body.orderDate);
      if (body.expectedDeliveryDate !== undefined) updates.expectedDeliveryDate = body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null;
    } else if (['ISSUED', 'PARTIAL'].includes(po.status)) {
      // Limited edit: logistics & contact fields only (no line items, no supplier change)
      for (const key of ['contactName', 'contactEmail', 'deliveryAddress', 'notes'] as const) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (body.expectedDeliveryDate !== undefined) updates.expectedDeliveryDate = body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null;
    } else if (['RECEIVED', 'CLOSED'].includes(po.status)) {
      // Notes only
      if (body.notes !== undefined) updates.notes = body.notes;
    }

    const [updated] = await app.db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.id, request.params.id)).returning();
    return { data: updated };
  });

  // Issue purchase order (DRAFT → ISSUED)
  app.post<{ Params: { id: string } }>('/purchase-orders/:id/issue', { preHandler: requirePermission('purchaseOrders', 'update') }, async (request, reply) => {
    const po = await app.db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, request.params.id) });
    if (!po) return reply.notFound('Purchase order not found');
    if (po.status !== 'DRAFT') return reply.badRequest('Only DRAFT purchase orders can be issued');

    const [updated] = await app.db.update(purchaseOrders).set({ status: 'ISSUED', updatedAt: new Date() }).where(eq(purchaseOrders.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: 'PURCHASE_ORDER_ISSUED',
      priority: 'NORMAL',
      title: `PO ${po.number} issued`,
      message: `R ${Number(po.total).toFixed(2)}`,
      actionUrl: `/finance/purchase-orders/${po.id}`,
      referenceType: 'PURCHASE_ORDER',
      referenceId: po.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create PO issue notification'));

    return { data: updated };
  });

  // ==========================================
  // CREDIT NOTE WORKFLOW
  // ==========================================

  // List credit notes with line items
  app.get('/credit-notes', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${creditNotes.number} ILIKE ${'%' + search + '%'}`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.creditNotes.findMany({
        where: where ? () => where : undefined,
        with: {
          partner: true,
          invoice: true,
          lines: { orderBy: (l, { asc }) => [asc(l.lineNumber)] },
        },
        orderBy: (cn, { desc: d }) => [d(cn.createdAt)],
        limit,
        offset,
      }),
      app.db.execute(sql`SELECT COUNT(*) AS count FROM ${creditNotes} ${where ? sql`WHERE ${where}` : sql``}`),
    ]);

    const count = Number(countResult[0]?.count ?? 0);
    return { data: { items, total: count, page, limit } };
  });

  // Get single credit note with lines
  app.get<{ Params: { id: string } }>('/credit-notes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const cn = await app.db.query.creditNotes.findFirst({
      where: eq(creditNotes.id, request.params.id),
      with: {
        partner: true,
        invoice: true,
        lines: { with: { title: true }, orderBy: (l, { asc }) => [asc(l.lineNumber)] },
      },
    });
    if (!cn) return reply.notFound('Credit note not found');

    // Compute applied and remaining balance
    const appliedResult = await app.db.execute(sql`
      SELECT COALESCE(SUM(rcn.amount::numeric), 0) AS applied
      FROM remittance_credit_notes rcn
      JOIN remittances r ON r.id = rcn.remittance_id
      WHERE rcn.credit_note_id = ${cn.id}
        AND r.status IN ('APPROVED', 'MATCHED', 'UNDER_REVIEW', 'PENDING')
    `);
    const applied = roundAmount(Number(appliedResult[0]?.applied ?? 0));
    const available = cn.voidedAt ? 0 : Math.max(0, roundAmount(Number(cn.total) - applied));

    return { data: { ...cn, applied: applied.toFixed(2), available: available.toFixed(2) } };
  });

  // Generate credit note PDF
  app.get<{ Params: { id: string } }>('/credit-notes/:id/pdf', { preHandler: requireAuth }, async (request, reply) => {
    const cn = await app.db.query.creditNotes.findFirst({
      where: eq(creditNotes.id, request.params.id),
      with: {
        partner: true,
        invoice: true,
        lines: { orderBy: (l, { asc }) => [asc(l.lineNumber)] },
      },
    });
    if (!cn) return reply.notFound('Credit note not found');

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderCreditNoteHtml({
      number: cn.number,
      createdAt: cn.createdAt.toISOString(),
      reason: cn.reason,
      invoiceNumber: cn.invoice?.number,
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      recipient: {
        name: cn.partner.name, contactName: cn.partner.contactName,
        contactEmail: cn.partner.contactEmail, addressLine1: cn.partner.addressLine1,
        addressLine2: cn.partner.addressLine2, city: cn.partner.city,
        province: cn.partner.province, postalCode: cn.partner.postalCode,
        vatNumber: cn.partner.vatNumber,
      },
      lines: cn.lines.map((l) => ({
        lineNumber: l.lineNumber,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
      subtotal: cn.subtotal, vatAmount: cn.vatAmount, total: cn.total,
    });

    const pdf = await generatePdf(html);
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${cn.number}.pdf"`)
      .send(pdf);
  });

  // Edit draft credit note (DRAFT only)
  app.patch<{ Params: { id: string } }>('/credit-notes/:id', { preHandler: requirePermission('finance', 'update') }, async (request, reply) => {
    const cn = await app.db.query.creditNotes.findFirst({ where: eq(creditNotes.id, request.params.id) });
    if (!cn) return reply.notFound('Credit note not found');
    if (cn.status !== 'DRAFT') return reply.badRequest('Only DRAFT credit notes can be edited');

    const body = request.body as Record<string, any>;
    
    await app.db.transaction(async (tx) => {
      // Update header
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (body.reason !== undefined) updates.reason = body.reason;
      if (body.subtotal !== undefined) updates.subtotal = String(body.subtotal);
      if (body.vatAmount !== undefined) updates.vatAmount = String(body.vatAmount);
      if (body.total !== undefined) updates.total = String(body.total);
      
      await tx.update(creditNotes).set(updates).where(eq(creditNotes.id, request.params.id));

      // Update lines if provided
      if (body.lines && Array.isArray(body.lines)) {
        // Delete existing lines
        await tx.delete(creditNoteLines).where(eq(creditNoteLines.creditNoteId, request.params.id));
        
        // Insert new lines
        if (body.lines.length > 0) {
          await tx.insert(creditNoteLines).values(
            body.lines.map((line: any, idx: number) => ({
              creditNoteId: request.params.id,
              lineNumber: idx + 1,
              titleId: line.titleId || null,
              description: line.description,
              quantity: String(line.quantity),
              unitPrice: String(line.unitPrice),
              lineTotal: String(line.lineTotal),
              lineTax: String(line.lineTax || 0),
            }))
          );
        }
      }
    });

    const updated = await app.db.query.creditNotes.findFirst({
      where: eq(creditNotes.id, request.params.id),
      with: { lines: { orderBy: (l, { asc }) => [asc(l.lineNumber)] } },
    });

    return { data: updated };
  });

  // Submit credit note for review (DRAFT → PENDING_REVIEW)
  app.post<{ Params: { id: string } }>('/credit-notes/:id/submit', { preHandler: requirePermission('finance', 'update') }, async (request, reply) => {
    const cn = await app.db.query.creditNotes.findFirst({ where: eq(creditNotes.id, request.params.id) });
    if (!cn) return reply.notFound('Credit note not found');
    if (cn.status !== 'DRAFT') return reply.badRequest('Only DRAFT credit notes can be submitted for review');

    const [updated] = await app.db.update(creditNotes).set({
      status: 'PENDING_REVIEW',
      updatedAt: new Date(),
    }).where(eq(creditNotes.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: 'CREDIT_NOTE_REVIEW',
      priority: 'HIGH',
      title: `Credit note ${cn.number} needs review`,
      message: `R ${Number(cn.total).toFixed(2)}`,
      actionUrl: `/credit-notes/${cn.id}`,
      referenceType: 'CREDIT_NOTE',
      referenceId: cn.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create credit note review notification'));

    return { data: updated };
  });

  // Review credit note (PENDING_REVIEW → DRAFT or APPROVED)
  app.post<{ Params: { id: string } }>('/credit-notes/:id/review', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const body = request.body as { approve: boolean; notes?: string };
    const cn = await app.db.query.creditNotes.findFirst({ where: eq(creditNotes.id, request.params.id) });
    if (!cn) return reply.notFound('Credit note not found');
    if (cn.status !== 'PENDING_REVIEW') return reply.badRequest('Credit note is not in PENDING_REVIEW status');

    const userId = request.session?.user?.id;
    const newStatus = body.approve ? 'APPROVED' : 'DRAFT';
    const updates: Record<string, any> = {
      status: newStatus,
      reviewedBy: userId,
      reviewedAt: new Date(),
      reviewNotes: body.notes || null,
      updatedAt: new Date(),
    };

    if (body.approve) {
      updates.approvedBy = userId;
      updates.approvedAt = new Date();

      // Recalculate invoice status after approval
      const invoice = await app.db.query.invoices.findFirst({ where: eq(invoices.id, cn.invoiceId) });
      if (invoice) {
        const { amountPaid, effectiveTotal } = await computeInvoiceBalance(app.db, cn.invoiceId, Number(invoice.total));
        const newInvoiceStatus = deriveInvoiceStatus(amountPaid, effectiveTotal);
        if (newInvoiceStatus !== invoice.status) {
          await app.db.update(invoices).set({ status: newInvoiceStatus, updatedAt: new Date() }).where(eq(invoices.id, cn.invoiceId));
        }
      }
    }

    const [updated] = await app.db.update(creditNotes).set(updates).where(eq(creditNotes.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: body.approve ? 'CREDIT_NOTE_APPROVED' : 'CREDIT_NOTE_RETURNED',
      priority: 'NORMAL',
      title: `Credit note ${cn.number} ${body.approve ? 'approved' : 'returned to draft'}`,
      message: body.notes || '',
      actionUrl: `/credit-notes/${cn.id}`,
      referenceType: 'CREDIT_NOTE',
      referenceId: cn.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create credit note review result notification'));

    return { data: updated };
  });

  // Mark credit note as sent (APPROVED → SENT)
  app.post<{ Params: { id: string } }>('/credit-notes/:id/send', { preHandler: requirePermission('finance', 'update') }, async (request, reply) => {
    const body = request.body as { sentTo?: string };
    const cn = await app.db.query.creditNotes.findFirst({ where: eq(creditNotes.id, request.params.id) });
    if (!cn) return reply.notFound('Credit note not found');
    if (cn.status !== 'APPROVED') return reply.badRequest('Only APPROVED credit notes can be marked as sent');

    const [updated] = await app.db.update(creditNotes).set({
      status: 'SENT',
      sentAt: new Date(),
      sentTo: body.sentTo || null,
      updatedAt: new Date(),
    }).where(eq(creditNotes.id, request.params.id)).returning();

    return { data: updated };
  });

  // Void credit note (any status except already VOIDED)
  app.post<{ Params: { id: string } }>('/credit-notes/:id/void', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const body = request.body as { reason: string };
    if (!body.reason) return reply.badRequest('Void reason is required');

    const cn = await app.db.query.creditNotes.findFirst({ where: eq(creditNotes.id, request.params.id) });
    if (!cn) return reply.notFound('Credit note not found');
    if (cn.status === 'VOIDED') return reply.badRequest('Credit note is already voided');

    await app.db.transaction(async (tx) => {
      await tx.update(creditNotes).set({
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedReason: body.reason,
        updatedAt: new Date(),
      }).where(eq(creditNotes.id, request.params.id));

      // Recalculate invoice status
      const invoice = await tx.query.invoices.findFirst({ where: eq(invoices.id, cn.invoiceId) });
      if (invoice) {
        const { amountPaid, effectiveTotal } = await computeInvoiceBalance(tx as any, cn.invoiceId, Number(invoice.total));
        const newStatus = deriveInvoiceStatus(amountPaid, effectiveTotal);
        if (newStatus !== invoice.status) {
          await tx.update(invoices).set({ status: newStatus, updatedAt: new Date() }).where(eq(invoices.id, cn.invoiceId));
        }
      }
    });

    const updated = await app.db.query.creditNotes.findFirst({ where: eq(creditNotes.id, request.params.id) });
    return { data: updated };
  });

  // Receive goods (update quantityReceived per line)
  app.post<{ Params: { id: string } }>('/purchase-orders/:id/receive', { preHandler: requirePermission('purchaseOrders', 'update') }, async (request, reply) => {
    const po = await app.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, request.params.id),
      with: { lines: true },
    });
    if (!po) return reply.notFound('Purchase order not found');
    if (!['ISSUED', 'PARTIAL'].includes(po.status)) return reply.badRequest('Purchase order must be ISSUED or PARTIAL to receive goods');

    const { lineReceives } = request.body as { lineReceives: { lineId: string; quantityReceived: number }[] };
    if (!lineReceives?.length) return reply.badRequest('lineReceives is required');

    // Track previous quantities to compute deltas for inventory
    const previousLines = new Map(po.lines.map((l) => [l.id, Number(l.quantityReceived ?? 0)]));

    await app.db.transaction(async (tx) => {
      for (const lr of lineReceives) {
        await tx.update(purchaseOrderLines).set({
          quantityReceived: String(lr.quantityReceived),
        }).where(eq(purchaseOrderLines.id, lr.lineId));
      }

      // Create inventory movements for newly received quantities
      for (const lr of lineReceives) {
        const line = po.lines.find((l) => l.id === lr.lineId);
        if (!line?.titleId) continue;
        const prevQty = previousLines.get(lr.lineId) ?? 0;
        const delta = lr.quantityReceived - prevQty;
        if (delta > 0) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'IN',
            quantity: delta,
            toLocation: 'WAREHOUSE',
            reason: `Received from PO ${po.number}`,
            referenceType: 'PURCHASE_ORDER',
            referenceId: po.id,
          });
        }
      }
    });

    // Check if fully received
    const updatedLines = await app.db.query.purchaseOrderLines.findMany({
      where: eq(purchaseOrderLines.purchaseOrderId, request.params.id),
    });
    const allReceived = updatedLines.every((l) => Number(l.quantityReceived) >= Number(l.quantity));
    const anyReceived = updatedLines.some((l) => Number(l.quantityReceived) > 0);

    const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : po.status;

    const [updated] = await app.db.update(purchaseOrders).set({
      status: newStatus,
      receivedAt: allReceived ? new Date() : undefined,
      updatedAt: new Date(),
    }).where(eq(purchaseOrders.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: 'PURCHASE_ORDER_RECEIVED',
      priority: 'NORMAL',
      title: `PO ${po.number} — goods ${allReceived ? 'fully' : 'partially'} received`,
      message: `R ${Number(po.total).toFixed(2)}`,
      actionUrl: `/finance/purchase-orders/${po.id}`,
      referenceType: 'PURCHASE_ORDER',
      referenceId: po.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create PO receive notification'));

    return { data: { ...updated, lines: updatedLines } };
  });

  // Cancel purchase order
  app.post<{ Params: { id: string } }>('/purchase-orders/:id/cancel', { preHandler: requirePermission('purchaseOrders', 'update') }, async (request, reply) => {
    const po = await app.db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, request.params.id) });
    if (!po) return reply.notFound('Purchase order not found');
    if (['RECEIVED', 'CLOSED', 'CANCELLED'].includes(po.status)) return reply.badRequest('Cannot cancel this purchase order');

    const { reason } = request.body as { reason?: string };
    const [updated] = await app.db.update(purchaseOrders).set({
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason,
      updatedAt: new Date(),
    }).where(eq(purchaseOrders.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: 'PURCHASE_ORDER_CANCELLED',
      priority: 'HIGH',
      title: `PO ${po.number} cancelled`,
      message: reason ? `R ${Number(po.total).toFixed(2)} — ${reason}` : `R ${Number(po.total).toFixed(2)}`,
      actionUrl: `/finance/purchase-orders/${po.id}`,
      referenceType: 'PURCHASE_ORDER',
      referenceId: po.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create PO cancel notification'));

    return { data: updated };
  });

  // Duplicate purchase order
  app.post<{ Params: { id: string } }>('/purchase-orders/:id/duplicate', { preHandler: requirePermission('purchaseOrders', 'create') }, async (request, reply) => {
    const po = await app.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, request.params.id),
      with: { lines: true },
    });
    if (!po) return reply.notFound('Purchase order not found');

    const number = await nextPurchaseOrderNumber(app.db as any);
    const userId = request.session?.user?.id;

    const result = await app.db.transaction(async (tx) => {
      const [newPo] = await tx.insert(purchaseOrders).values({
        number,
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        contactName: po.contactName,
        contactEmail: po.contactEmail,
        orderDate: new Date(),
        expectedDeliveryDate: po.expectedDeliveryDate,
        deliveryAddress: po.deliveryAddress,
        subtotal: po.subtotal,
        vatAmount: po.vatAmount,
        total: po.total,
        taxInclusive: po.taxInclusive,
        notes: po.notes,
        createdBy: userId,
      }).returning();

      if (po.lines.length > 0) {
        await tx.insert(purchaseOrderLines).values(
          po.lines.map((l) => ({
            purchaseOrderId: newPo.id,
            titleId: l.titleId,
            lineNumber: l.lineNumber,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct,
            lineTotal: l.lineTotal,
            lineTax: l.lineTax,
          }))
        );
      }

      return newPo;
    });

    return reply.status(201).send({ data: result });
  });

  // Send purchase order via email
  app.post<{ Params: { id: string } }>('/purchase-orders/:id/send', { preHandler: requirePermission('purchaseOrders', 'create') }, async (request, reply) => {
    const body = sendDocumentSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const po = await app.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, request.params.id),
      with: { supplier: true, lines: true },
    });
    if (!po) return reply.notFound('Purchase order not found');

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderPurchaseOrderHtml({
      number: po.number,
      orderDate: po.orderDate.toISOString(),
      expectedDeliveryDate: po.expectedDeliveryDate?.toISOString(),
      deliveryAddress: po.deliveryAddress,
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      supplier: {
        name: po.supplier?.name ?? po.supplierName ?? 'Supplier',
        contactName: po.contactName ?? po.supplier?.contactName,
        contactEmail: po.contactEmail ?? po.supplier?.contactEmail,
        addressLine1: po.supplier?.addressLine1,
        addressLine2: po.supplier?.addressLine2,
        city: po.supplier?.city,
        province: po.supplier?.province,
        postalCode: po.supplier?.postalCode,
        vatNumber: po.supplier?.vatNumber,
      },
      lines: po.lines,
      subtotal: po.subtotal, vatAmount: po.vatAmount, total: po.total,
      notes: po.notes,
    });

    const result = await sendDocumentEmail({
      app,
      documentType: 'PURCHASE_ORDER',
      documentId: request.params.id,
      recipientEmail: body.recipientEmail,
      subject: body.subject ?? `Purchase Order ${po.number} from Xarra Books`,
      message: body.message,
      html,
      documentNumber: po.number,
      sentBy: userId,
    });

    if (result.success) {
      const updateData: Record<string, any> = { sentAt: new Date(), sentTo: body.recipientEmail, updatedAt: new Date() };
      if (po.status === 'DRAFT') {
        updateData.status = 'ISSUED';
      }
      await app.db.update(purchaseOrders).set(updateData).where(eq(purchaseOrders.id, request.params.id));
    }

    return { data: result };
  });

  // Generate purchase order PDF
  app.get<{ Params: { id: string } }>('/purchase-orders/:id/pdf', { preHandler: requirePermission('purchaseOrders', 'read') }, async (request, reply) => {
    const po = await app.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, request.params.id),
      with: { supplier: true, lines: true },
    });
    if (!po) return reply.notFound('Purchase order not found');

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderPurchaseOrderHtml({
      number: po.number,
      orderDate: po.orderDate.toISOString(),
      expectedDeliveryDate: po.expectedDeliveryDate?.toISOString(),
      deliveryAddress: po.deliveryAddress,
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      supplier: {
        name: po.supplier?.name ?? po.supplierName ?? 'Supplier',
        contactName: po.contactName ?? po.supplier?.contactName,
        contactEmail: po.contactEmail ?? po.supplier?.contactEmail,
        addressLine1: po.supplier?.addressLine1,
        addressLine2: po.supplier?.addressLine2,
        city: po.supplier?.city,
        province: po.supplier?.province,
        postalCode: po.supplier?.postalCode,
        vatNumber: po.supplier?.vatNumber,
      },
      lines: po.lines,
      subtotal: po.subtotal, vatAmount: po.vatAmount, total: po.total,
      notes: po.notes,
    });

    const pdf = await generatePdf(html);
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${po.number}.pdf"`)
      .send(pdf);
  });
}
