import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import {
  invoices, invoiceLines, creditNotes, debitNotes,
  payments, paymentAllocations, channelPartners,
  partnerBranches, remittances, remittanceInvoices, companySettings,
  quotations, quotationLines,
} from '@xarra/db';
import { createInvoiceSchema, recordPaymentSchema, paginationSchema, createRemittanceSchema, createDebitNoteSchema } from '@xarra/shared';
import { VAT_RATE } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { requireIdempotencyKey, getIdempotencyKey } from '../../middleware/idempotency.js';
import { nextInvoiceNumber, nextCreditNoteNumber, nextDebitNoteNumber, nextQuotationNumber } from './invoice-number.js';
import { generatePdf } from '../../services/pdf.js';
import { renderInvoiceHtml } from '../../services/templates/invoice.js';
import { renderDebitNoteHtml } from '../../services/templates/debit-note.js';
import { renderQuotationHtml } from '../../services/templates/quotation.js';
import { renderReceiptHtml } from '../../services/templates/receipt.js';

export async function financeRoutes(app: FastifyInstance) {
  // ==========================================
  // INVOICES
  // ==========================================

  // List invoices (paginated)
  app.get('/invoices', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${invoices.number} ILIKE ${'%' + search + '%'})`
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

  // Get single invoice with lines
  app.get<{ Params: { id: string } }>('/invoices/:id', { preHandler: requireAuth }, async (request, reply) => {
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
      with: { partner: true, lines: true, creditNotes: true },
    });
    if (!invoice) return reply.notFound('Invoice not found');
    return { data: invoice };
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
      const lineSubtotal = line.quantity * line.unitPrice;
      const discountType = line.discountType ?? 'PERCENT';
      const discount = discountType === 'FIXED'
        ? line.discountPct * line.quantity
        : lineSubtotal * (line.discountPct / 100);
      const lineTotal = lineSubtotal - discount;
      // Tax-inclusive: extract VAT from the price. Tax-exclusive: add VAT on top.
      const lineTax = isTaxInclusive
        ? lineTotal - (lineTotal / (1 + VAT_RATE))
        : lineTotal * VAT_RATE;
      const lineExVat = isTaxInclusive ? lineTotal - lineTax : lineTotal;
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

    const vatAmount = totalVat;
    const total = subtotal + vatAmount;

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

    return { data: updated };
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

    const html = renderInvoiceHtml({
      number: invoice.number,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? invoice.invoiceDate.toISOString(),
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

    let subtotal = 0;
    for (const line of lines) {
      const lineSubtotal = line.quantity * line.unitPrice;
      const discount = lineSubtotal * (line.discountPct / 100);
      subtotal += lineSubtotal - discount;
    }
    const vatAmount = subtotal * VAT_RATE;
    const total = subtotal + vatAmount;

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
    for (const line of body.lines) {
      const lineSubtotal = line.quantity * line.unitPrice;
      const discount = lineSubtotal * (line.discountPct / 100);
      subtotal += lineSubtotal - discount;
    }
    const vatAmount = subtotal * VAT_RATE;
    const total = subtotal + vatAmount;

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
      const lineTotal = line.quantity * line.unitPrice * (1 - line.discountPct / 100);
      const lineTax = isTaxInclusive
        ? lineTotal - (lineTotal / (1 + VAT_RATE))
        : lineTotal * VAT_RATE;
      const lineExVat = isTaxInclusive ? lineTotal - lineTax : lineTotal;
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

    const total = subtotal + vatTotal;

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
}
