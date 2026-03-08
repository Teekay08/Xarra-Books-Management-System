import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { cashSales, cashSaleLines, companySettings, inventoryMovements } from '@xarra/db';
import { createCashSaleSchema, paginationSchema, VAT_RATE, roundAmount } from '@xarra/shared';
import { requirePermission } from '../../middleware/require-auth.js';
import { nextCashSaleNumber } from '../finance/invoice-number.js';
import { generatePdf } from '../../services/pdf.js';
import { renderCashSaleReceiptHtml } from '../../services/templates/cash-sale-receipt.js';
import { createBroadcastNotification } from '../../services/notifications.js';

export async function salesRoutes(app: FastifyInstance) {
  // List cash sales
  app.get('/cash-sales', { preHandler: requirePermission('cashSales', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${cashSales.number} ILIKE ${'%' + search + '%'} OR ${cashSales.customerName} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.cashSales.findMany({
        where: where ? () => where : undefined,
        with: { lines: true },
        orderBy: (cs, { desc: d }) => [d(cs.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(cashSales).where(where),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get single cash sale
  app.get<{ Params: { id: string } }>('/cash-sales/:id', { preHandler: requirePermission('cashSales', 'read') }, async (request, reply) => {
    const cs = await app.db.query.cashSales.findFirst({
      where: eq(cashSales.id, request.params.id),
      with: { lines: true },
    });
    if (!cs) return reply.notFound('Cash sale not found');
    return { data: cs };
  });

  // Create cash sale (immediately completed, no draft)
  app.post('/cash-sales', { preHandler: requirePermission('cashSales', 'create') }, async (request, reply) => {
    const body = createCashSaleSchema.parse(request.body);
    const userId = request.session?.user?.id;
    const number = await nextCashSaleNumber(app.db as any);

    const isTaxInclusive = body.taxInclusive ?? true;
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
      const [cs] = await tx.insert(cashSales).values({
        number,
        saleDate: new Date(body.saleDate),
        customerName: body.customerName,
        subtotal: String(subtotal),
        vatAmount: String(totalVat),
        total: String(total),
        taxInclusive: isTaxInclusive,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
        notes: body.notes,
        createdBy: userId,
      }).returning();

      const lines = await tx.insert(cashSaleLines).values(
        lineData.map((l) => ({ ...l, cashSaleId: cs.id }))
      ).returning();

      // Create inventory movements for sold titles (deduct stock)
      for (const line of lines) {
        if (line.titleId) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'SELL',
            quantity: Number(line.quantity),
            reason: `Cash sale ${number}`,
            referenceType: 'CASH_SALE',
            referenceId: cs.id,
          });
        }
      }

      return { ...cs, lines };
    });

    createBroadcastNotification(app, {
      type: 'CASH_SALE_CREATED',
      priority: 'LOW',
      title: `Cash sale ${result.number}`,
      message: `R ${Number(result.total).toFixed(2)} — ${body.customerName || 'Walk-in'} (${body.paymentMethod})`,
      actionUrl: `/sales/cash-sales/${result.id}`,
      referenceType: 'CASH_SALE',
      referenceId: result.id,
    });

    return reply.status(201).send({ data: result });
  });

  // Void cash sale
  app.post<{ Params: { id: string } }>('/cash-sales/:id/void', { preHandler: requirePermission('cashSales', 'void') }, async (request, reply) => {
    const cs = await app.db.query.cashSales.findFirst({
      where: eq(cashSales.id, request.params.id),
      with: { lines: true },
    });
    if (!cs) return reply.notFound('Cash sale not found');
    if (cs.voidedAt) return reply.badRequest('Cash sale is already voided');

    const { reason } = request.body as { reason: string };
    if (!reason) return reply.badRequest('Void reason is required');

    const [updated] = await app.db.update(cashSales).set({
      voidedAt: new Date(),
      voidedReason: reason,
    }).where(eq(cashSales.id, request.params.id)).returning();

    // Reverse inventory movements (add stock back)
    for (const line of cs.lines) {
      if (line.titleId) {
        await app.db.insert(inventoryMovements).values({
          titleId: line.titleId,
          movementType: 'RETURN',
          quantity: Number(line.quantity),
          reason: `Voided cash sale ${cs.number}: ${reason}`,
          referenceType: 'CASH_SALE',
          referenceId: cs.id,
        });
      }
    }

    return { data: updated };
  });

  // Generate cash sale receipt PDF
  app.get<{ Params: { id: string } }>('/cash-sales/:id/receipt-pdf', { preHandler: requirePermission('cashSales', 'read') }, async (request, reply) => {
    const cs = await app.db.query.cashSales.findFirst({
      where: eq(cashSales.id, request.params.id),
      with: { lines: true },
    });
    if (!cs) return reply.notFound('Cash sale not found');

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderCashSaleReceiptHtml({
      number: cs.number,
      saleDate: cs.saleDate.toISOString(),
      customerName: cs.customerName,
      paymentMethod: cs.paymentMethod,
      paymentReference: cs.paymentReference,
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      lines: cs.lines,
      subtotal: cs.subtotal, vatAmount: cs.vatAmount, total: cs.total,
      notes: cs.notes,
    });

    const pdf = await generatePdf(html);
    return reply.type('application/pdf')
      .header('Content-Disposition', `inline; filename="${cs.number}.pdf"`)
      .send(pdf);
  });
}
