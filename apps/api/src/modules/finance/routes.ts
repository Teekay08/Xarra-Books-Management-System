import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import {
  invoices, invoiceLines, creditNotes,
  payments, paymentAllocations, channelPartners,
} from '@xarra/db';
import { createInvoiceSchema, recordPaymentSchema, paginationSchema } from '@xarra/shared';
import { VAT_RATE } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { requireIdempotencyKey, getIdempotencyKey } from '../../middleware/idempotency.js';
import { nextInvoiceNumber, nextCreditNoteNumber } from './invoice-number.js';
import { generatePdf } from '../../services/pdf.js';
import { renderInvoiceHtml } from '../../services/templates/invoice.js';

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
    let subtotal = 0;
    const lineData = body.lines.map((line, i) => {
      const lineSubtotal = line.quantity * line.unitPrice;
      const discount = lineSubtotal * (line.discountPct / 100);
      const lineTotal = lineSubtotal - discount;
      subtotal += lineTotal;
      return {
        lineNumber: i + 1,
        titleId: line.titleId,
        description: line.description ?? `${line.quantity} x units`,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        discountPct: String(line.discountPct),
        lineTotal: String(lineTotal),
        lineTax: String(lineTotal * VAT_RATE),
      };
    });

    const vatAmount = subtotal * VAT_RATE;
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
        consignmentId: body.consignmentId,
        invoiceDate,
        subtotal: String(subtotal),
        vatAmount: String(vatAmount),
        total: String(total),
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
      with: { partner: true, lines: true },
    });
    if (!invoice) return reply.notFound('Invoice not found');

    const html = renderInvoiceHtml({
      number: invoice.number,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? invoice.invoiceDate.toISOString(),
      partner: invoice.partner,
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
}
