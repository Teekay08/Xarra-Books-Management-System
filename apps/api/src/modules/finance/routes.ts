import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import {
  invoices, invoiceLines, creditNotes, debitNotes,
  payments, paymentAllocations, channelPartners,
  partnerBranches, remittances, remittanceInvoices, companySettings,
  quotations, quotationLines,
  purchaseOrders, purchaseOrderLines,
  inventoryMovements,
} from '@xarra/db';
import { createInvoiceSchema, recordPaymentSchema, paginationSchema, createRemittanceSchema, createDebitNoteSchema, sendDocumentSchema, createPurchaseOrderSchema } from '@xarra/shared';
import { VAT_RATE, roundAmount } from '@xarra/shared';
import { requireAuth, requireRole, requirePermission } from '../../middleware/require-auth.js';
import { requireIdempotencyKey, getIdempotencyKey } from '../../middleware/idempotency.js';
import { nextInvoiceNumber, nextCreditNoteNumber, nextDebitNoteNumber, nextQuotationNumber, nextPurchaseOrderNumber } from './invoice-number.js';
import { generatePdf } from '../../services/pdf.js';
import { renderInvoiceHtml } from '../../services/templates/invoice.js';
import { renderDebitNoteHtml } from '../../services/templates/debit-note.js';
import { renderQuotationHtml } from '../../services/templates/quotation.js';
import { renderReceiptHtml } from '../../services/templates/receipt.js';
import { renderPurchaseOrderHtml } from '../../services/templates/purchase-order.js';
import { createBroadcastNotification } from '../../services/notifications.js';
import { sendDocumentEmail } from '../../services/document-email.js';

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

  // List invoices (paginated)
  app.get('/invoices', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const { status } = request.query as { status?: string };
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof sql>[] = [];
    if (search) conditions.push(sql`(${invoices.number} ILIKE ${'%' + search + '%'})`);
    if (status) conditions.push(sql`${invoices.status} = ${status}`);
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

    // Compute amount paid from payment allocations
    const paidResult = await app.db.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM payment_allocations
      WHERE invoice_id = ${request.params.id}
    `);
    const amountPaid = Number(paidResult[0]?.total ?? 0);
    const amountDue = Math.max(0, Number(invoice.total) - amountPaid);

    // Get payment allocations with payment details
    const allocations = await app.db.execute<{ paymentId: string; amount: string; paymentDate: string; bankReference: string | null; paymentMethod: string | null }>(sql`
      SELECT pa.payment_id as "paymentId", pa.amount, p.payment_date as "paymentDate", p.bank_reference as "bankReference", p.payment_method as "paymentMethod"
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = ${request.params.id}
      ORDER BY p.payment_date DESC
    `);

    return { data: { ...invoice, amountPaid: String(amountPaid.toFixed(2)), amountDue: String(amountDue.toFixed(2)), paymentHistory: allocations } };
  });

  // Create invoice
  app.post('/invoices', {
    preHandler: [requireRole('admin', 'finance'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createInvoiceSchema.parse(request.body);
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
      const discount = roundAmount(
        discountType === 'FIXED'
          ? Math.min(line.discountPct, lineSubtotal) // FIXED: discount amount capped at line subtotal
          : lineSubtotal * (line.discountPct / 100)
      );
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
      dueDate.setDate(dueDate.getDate() + 30); // default 30 days
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

    createBroadcastNotification(app, {
      type: 'INVOICE_ISSUED',
      title: `Invoice ${updated.number} issued`,
      message: `Invoice ${updated.number} for R ${Number(updated.total).toFixed(2)} has been issued`,
      actionUrl: `/invoices/${updated.id}`,
      referenceType: 'INVOICE',
      referenceId: updated.id,
    });

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
      actionUrl: `/finance/invoices/${invoice.id}`,
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
        const discountType = line.discountType ?? 'PERCENT';
        const discount = roundAmount(
          discountType === 'FIXED'
            ? Math.min(line.discountPct, lineSubtotal)
            : lineSubtotal * (line.discountPct / 100)
        );
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
      createdBy: userId,
    }).returning();

    createBroadcastNotification(app, {
      type: 'CREDIT_NOTE_CREATED',
      priority: 'NORMAL',
      title: `Credit note ${number} created`,
      message: `R ${total.toFixed(2)} against invoice ${invoice.number} — ${reason}`,
      actionUrl: `/finance/credit-notes/${cn.id}`,
      referenceType: 'CREDIT_NOTE',
      referenceId: cn.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create credit note notification'));

    return reply.status(201).send({ data: cn });
  });

  // List all credit notes
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
        with: { partner: true, invoice: true },
        orderBy: (cn, { desc: d }) => [d(cn.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(creditNotes).where(where),
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

  // Get single credit note
  app.get<{ Params: { id: string } }>('/credit-notes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const cn = await app.db.query.creditNotes.findFirst({
      where: eq(creditNotes.id, request.params.id),
      with: { partner: true, invoice: true },
    });
    if (!cn) return reply.notFound('Credit note not found');
    return { data: cn };
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

        // Update invoice statuses based on total allocated
        for (const alloc of body.invoiceAllocations) {
          const totalAllocated = await tx.execute<{ total: string }>(sql`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM payment_allocations
            WHERE invoice_id = ${alloc.invoiceId}
          `);

          const invoice = await tx.query.invoices.findFirst({
            where: eq(invoices.id, alloc.invoiceId),
          });

          if (invoice) {
            const paidAmount = Number(totalAllocated[0]?.total ?? 0);
            const invoiceTotal = Number(invoice.total);
            const newStatus = paidAmount >= invoiceTotal ? 'PAID' : 'PARTIAL';

            await tx.update(invoices).set({
              status: newStatus,
              updatedAt: new Date(),
            }).where(eq(invoices.id, alloc.invoiceId));
          }
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

  // Get single remittance with linked invoices
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
      },
    });
    if (!remittance) return reply.notFound('Remittance not found');
    return { data: remittance };
  });

  // Create remittance with optional invoice allocations
  app.post('/remittances', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = createRemittanceSchema.parse(request.body);

    const result = await app.db.transaction(async (tx) => {
      const [remittance] = await tx.insert(remittances).values({
        partnerId: body.partnerId,
        partnerRef: body.partnerRef,
        periodFrom: body.periodFrom ? new Date(body.periodFrom) : undefined,
        periodTo: body.periodTo ? new Date(body.periodTo) : undefined,
        totalAmount: String(body.totalAmount),
        parseMethod: body.parseMethod,
        notes: body.notes,
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
      actionUrl: `/finance/remittances/${remittance.id}`,
      referenceType: 'REMITTANCE',
      referenceId: remittance.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create remittance notification'));

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
      actionUrl: `/finance/debit-notes/${dn.id}`,
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
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${quotations.number} ILIKE ${'%' + search + '%'}`
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
      actionUrl: `/finance/invoices/${invoice.id}`,
      referenceType: 'INVOICE',
      referenceId: invoice.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create quotation conversion notification'));

    return reply.status(201).send({ data: invoice });
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
    if (po.status !== 'DRAFT') return reply.badRequest('Only DRAFT purchase orders can be edited');

    const body = request.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };

    for (const key of ['supplierId', 'supplierName', 'contactName', 'contactEmail', 'deliveryAddress', 'notes'] as const) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.orderDate) updates.orderDate = new Date(body.orderDate);
    if (body.expectedDeliveryDate) updates.expectedDeliveryDate = new Date(body.expectedDeliveryDate);

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
