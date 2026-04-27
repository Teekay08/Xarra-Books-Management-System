import type { FastifyInstance } from 'fastify';
import { eq, sql, and, inArray } from 'drizzle-orm';
import {
  returnsAuthorizations, returnsAuthorizationLines,
  returnInspectionLines, inventoryMovements, consignmentLines,
  invoices, creditNotes, creditNoteLines, titles, channelPartners, consignments,
} from '@xarra/db';
import { paginationSchema, VAT_RATE, roundAmount } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { createBroadcastNotification } from '../../services/notifications.js';
import { notifyPartner } from '../../services/partner-notifications.js';
import { nextCreditNoteNumber, nextReturnNumber, nextGRNNumber } from '../finance/invoice-number.js';
import { generatePdf } from '../../services/pdf.js';
import { renderReturnAuthorisationHtml } from '../../services/templates/return-authorisation.js';
import { renderGRNHtml } from '../../services/templates/grn.js';
import { sendDocumentEmail } from '../../services/document-email.js';
import { z } from 'zod';

const createReturnSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  consignmentId: z.string().uuid().optional(),
  returnDate: z.string().or(z.date()),
  reason: z.string().min(1),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    quantity: z.number().int().positive(),
    condition: z.enum(['GOOD', 'DAMAGED', 'UNSALEABLE']).default('GOOD'),
    notes: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
  courierCompany: z.string().optional(),
  courierWaybill: z.string().optional(),
});


export async function returnRoutes(app: FastifyInstance) {
  // List returns  (supports ?status=X or ?status=X,Y  and ?search=)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const { status } = request.query as { status?: string };
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (search) {
      conditions.push(sql`${returnsAuthorizations.number} ILIKE ${'%' + search + '%'}`);
    }
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(returnsAuthorizations.status, statuses[0] as any));
      } else if (statuses.length > 1) {
        conditions.push(inArray(returnsAuthorizations.status, statuses as any[]));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.returnsAuthorizations.findMany({
        where: where ? () => where : undefined,
        with: { partner: true, lines: { with: { title: true } } },
        orderBy: (r, { desc: d }) => [d(r.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(returnsAuthorizations).where(where),
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

  // Get return detail (with inspection lines if available)
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: {
        partner: true,
        lines: { with: { title: true } },
        consignment: true,
        inspectionLines: { with: { title: true } },
      },
    });
    if (!ra) return reply.notFound('Return authorization not found');
    return { data: ra };
  });

  // Create return authorization
  app.post('/', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const body = createReturnSchema.parse(request.body);
    const number = await nextReturnNumber(app.db);
    const userId = request.session?.user?.id;

    const [ra] = await app.db.insert(returnsAuthorizations).values({
      number,
      partnerId: body.partnerId,
      branchId: body.branchId,
      consignmentId: body.consignmentId,
      returnDate: new Date(body.returnDate),
      reason: body.reason,
      notes: body.notes,
      courierCompany: body.courierCompany,
      courierWaybill: body.courierWaybill,
      createdBy: userId,
    }).returning();

    await app.db.insert(returnsAuthorizationLines).values(
      body.lines.map((l) => ({
        returnsAuthId: ra.id,
        titleId: l.titleId,
        quantity: l.quantity,
        condition: l.condition,
        notes: l.notes,
      })),
    );

    return reply.status(201).send({ data: ra });
  });

  // Mark as IN_TRANSIT (set courier details)
  app.post<{ Params: { id: string } }>('/:id/in-transit', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (ra.status !== 'AUTHORIZED') return reply.badRequest('Return must be authorized first');

    const body = request.body as { courierCompany?: string; courierWaybill?: string };

    await app.db.update(returnsAuthorizations).set({
      status: 'IN_TRANSIT',
      courierCompany: body.courierCompany ?? ra.courierCompany,
      courierWaybill: body.courierWaybill ?? ra.courierWaybill,
    }).where(eq(returnsAuthorizations.id, ra.id));

    return { data: { message: 'Return marked as in transit' } };
  });

  // Receive goods at warehouse — auto-generates a GRN
  app.post<{ Params: { id: string } }>('/:id/receive', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (!['AUTHORIZED', 'IN_TRANSIT'].includes(ra.status)) {
      return reply.badRequest('Return must be authorized or in transit to receive');
    }

    const body = request.body as { deliverySignedBy?: string; courierCompany?: string; courierWaybill?: string };
    const userId = request.session?.user?.id;
    const now = new Date();

    // Auto-generate GRN number on first receipt
    const grnNumber = await nextGRNNumber(app.db as any);

    const [updated] = await app.db.update(returnsAuthorizations).set({
      status: 'RECEIVED',
      receivedAt: now,
      receivedBy: userId,
      deliverySignedBy: body.deliverySignedBy ?? null,
      courierCompany: body.courierCompany ?? ra.courierCompany,
      courierWaybill: body.courierWaybill ?? ra.courierWaybill,
      grnNumber,
      grnIssuedAt: now,
    }).where(eq(returnsAuthorizations.id, ra.id)).returning();

    notifyPartner(app, ra.partnerId, {
      type: 'RETURN_STATUS_CHANGED',
      title: `Return ${ra.number} received at warehouse (${grnNumber})`,
      message: `Your returned goods have been received and a Goods Return Note (${grnNumber}) has been issued. Inspection will follow shortly.`,
      actionUrl: '/partner/returns',
      referenceType: 'RETURN',
      referenceId: ra.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

    return { data: { message: 'Goods received at warehouse', grnNumber } };
  });

  // Download Goods Return Note PDF
  app.get<{ Params: { id: string } }>('/:id/grn', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: {
        partner: true,
        lines: { with: { title: true } },
      },
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (!ra.grnNumber) {
      return reply.badRequest('GRN not yet generated — goods must be received at the warehouse first');
    }

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderGRNHtml({
      grnNumber: ra.grnNumber,
      raNumber: ra.number,
      receivedAt: ra.grnIssuedAt?.toISOString() ?? ra.receivedAt?.toISOString() ?? new Date().toISOString(),
      receivedBy: ra.receivedBy ?? null,
      deliverySignedBy: ra.deliverySignedBy ?? null,
      courierCompany: ra.courierCompany ?? null,
      courierWaybill: ra.courierWaybill ?? null,
      reason: ra.reason,
      notes: ra.notes ?? null,
      partner: { name: ra.partner.name },
      lines: ra.lines.map((l: any) => ({
        title: l.title?.title ?? 'Unknown',
        isbn: l.title?.isbn13 ?? null,
        quantityAuthorized: l.quantity,
        condition: l.condition,
        notes: l.notes ?? null,
      })),
      company: settings ? {
        name: settings.companyName ?? 'Xarra Books',
        tradingAs: settings.tradingAs ?? null,
        addressLine1: settings.addressLine1 ?? null,
        city: settings.city ?? null,
        province: settings.province ?? null,
        postalCode: settings.postalCode ?? null,
        phone: settings.phone ?? null,
        email: settings.email ?? null,
        logoUrl: settings.logoUrl ?? null,
      } : { name: 'Xarra Books', tradingAs: null, addressLine1: null, city: null, province: null, postalCode: null, phone: null, email: null, logoUrl: null },
    });

    const pdfBuffer = await generatePdf(html);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${ra.grnNumber}.pdf"`);
    return reply.send(pdfBuffer);
  });

  // Inspect returned goods (record per-line condition breakdown)
  app.post<{ Params: { id: string } }>('/:id/inspect', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: { lines: true },
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (ra.status !== 'RECEIVED') return reply.badRequest('Return must be received before inspection');

    const body = request.body as {
      inspectionNotes?: string;
      lines: Array<{
        returnsAuthLineId: string;
        qtyReceived: number;
        qtyGood: number;
        qtyDamaged: number;
        qtyUnsaleable: number;
        notes?: string;
      }>;
    };

    // Validate each line
    for (const line of body.lines) {
      const total = line.qtyGood + line.qtyDamaged + line.qtyUnsaleable;
      if (total !== line.qtyReceived) {
        return reply.badRequest(
          `Condition quantities (${total}) must equal received quantity (${line.qtyReceived}) for line ${line.returnsAuthLineId}`
        );
      }
      // Verify the RA line exists
      const raLine = ra.lines.find((l) => l.id === line.returnsAuthLineId);
      if (!raLine) {
        return reply.badRequest(`RA line ${line.returnsAuthLineId} not found`);
      }
    }

    const userId = request.session?.user?.id;

    // Insert inspection results
    await app.db.insert(returnInspectionLines).values(
      body.lines.map((line) => {
        const raLine = ra.lines.find((l) => l.id === line.returnsAuthLineId)!;
        return {
          returnsAuthId: ra.id,
          returnsAuthLineId: line.returnsAuthLineId,
          titleId: raLine.titleId,
          qtyReceived: line.qtyReceived,
          qtyGood: line.qtyGood,
          qtyDamaged: line.qtyDamaged,
          qtyUnsaleable: line.qtyUnsaleable,
          notes: line.notes,
        };
      }),
    );

    await app.db.update(returnsAuthorizations).set({
      status: 'INSPECTED',
      inspectedAt: new Date(),
      inspectedBy: userId,
      inspectionNotes: body.inspectionNotes,
    }).where(eq(returnsAuthorizations.id, ra.id));

    // Notify admin/manager to verify
    createBroadcastNotification(app, {
      type: 'RETURN_PROCESSED',
      priority: 'HIGH',
      title: `Return ${ra.number} inspected — awaiting verification`,
      message: 'A return inspection has been completed and needs manager sign-off.',
      actionUrl: `/returns/${ra.id}`,
      referenceType: 'RETURN',
      referenceId: ra.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create inspection notification'));

    return { data: { message: 'Inspection recorded, awaiting verification' } };
  });

  // Verify inspection (manager sign-off)
  app.post<{ Params: { id: string } }>('/:id/verify', {
    preHandler: requireRole('admin'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (ra.status !== 'INSPECTED') return reply.badRequest('Return must be inspected before verification');

    const userId = request.session?.user?.id;

    await app.db.update(returnsAuthorizations).set({
      status: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedBy: userId,
    }).where(eq(returnsAuthorizations.id, ra.id));

    return { data: { message: 'Inspection verified by manager' } };
  });

  // Process return (final step — creates inventory movements from verified inspection data)
  app.post<{ Params: { id: string } }>('/:id/process', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: { inspectionLines: true, partner: true },
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (ra.status !== 'VERIFIED') return reply.badRequest('Return must be verified before processing');

    const userId = request.session?.user?.id;

    let creditNote: any = null;
    await app.db.transaction(async (tx) => {
      for (const line of ra.inspectionLines) {
        // Good items → back to warehouse
        if (line.qtyGood > 0) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'RETURN',
            quantity: line.qtyGood,
            toLocation: 'XARRA_WAREHOUSE',
            reason: `Return ${ra.number} — good condition`,
            referenceType: 'RETURN',
            referenceId: ra.id,
            createdBy: userId,
          });
        }

        // Damaged items → damaged location
        if (line.qtyDamaged > 0) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'RETURN',
            quantity: line.qtyDamaged,
            toLocation: 'DAMAGED',
            reason: `Return ${ra.number} — damaged`,
            referenceType: 'RETURN',
            referenceId: ra.id,
            createdBy: userId,
          });
        }

        // Unsaleable items → writeoff
        if (line.qtyUnsaleable > 0) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'WRITEOFF',
            quantity: line.qtyUnsaleable,
            reason: `Return ${ra.number} — unsaleable`,
            referenceType: 'RETURN',
            referenceId: ra.id,
            createdBy: userId,
          });
        }
      }

      // Update linked consignment lines if applicable
      if (ra.consignmentId) {
        for (const line of ra.inspectionLines) {
          // Update qtyReturned and qtyDamaged on the consignment line
          await tx.execute(sql`
            UPDATE consignment_lines
            SET qty_returned = qty_returned + ${line.qtyGood},
                qty_damaged = qty_damaged + ${line.qtyDamaged + line.qtyUnsaleable}
            WHERE consignment_id = ${ra.consignmentId}
              AND title_id = ${line.titleId}
          `);
        }
      }

      // Mark as processed
      await tx.update(returnsAuthorizations).set({
        status: 'PROCESSED',
        processedAt: new Date(),
      }).where(eq(returnsAuthorizations.id, ra.id));

      // Auto-create credit note if linked to a consignment with an invoice
      if (ra.consignmentId) {
        const invoice = await tx.query.invoices.findFirst({
          where: eq(invoices.consignmentId, ra.consignmentId),
        });

        if (invoice && invoice.status !== 'VOIDED') {
          // Get partner discount to calculate credit at invoiced price
          const partner = await tx.query.channelPartners.findFirst({
            where: eq(channelPartners.id, ra.partnerId),
          });
          const discountPct = Number(partner?.discountPct ?? 0);

          // Get title prices for credit calculation
          const titleIds = ra.inspectionLines.map((l) => l.titleId);
          const titleRecords = await tx.select().from(titles)
            .where(sql`${titles.id} IN (${sql.join(titleIds.map(id => sql`${id}`), sql`, `)})`);
          const titleMap = new Map(titleRecords.map((t) => [t.id, t]));

          // Only credit good + damaged items (unsaleable = writeoff, no credit)
          let subtotal = 0;
          const creditLineItems: Array<{
            titleId: string;
            description: string;
            quantity: number;
            unitPrice: number;
            lineTotal: number;
          }> = [];
          
          for (const line of ra.inspectionLines) {
            const creditQty = line.qtyGood + line.qtyDamaged;
            if (creditQty <= 0) continue;
            const title = titleMap.get(line.titleId);
            if (!title) continue;

            const rrp = Number(title.rrpZar);
            const unitPrice = roundAmount(rrp * (1 - discountPct / 100));
            const lineTotal = roundAmount(unitPrice * creditQty);
            subtotal += lineTotal;
            
            creditLineItems.push({
              titleId: line.titleId,
              description: `${title.title} (ISBN: ${title.isbn || 'N/A'})`,
              quantity: creditQty,
              unitPrice,
              lineTotal,
            });
          }

          if (subtotal > 0) {
            subtotal = roundAmount(subtotal);
            const isTaxInclusive = invoice.taxInclusive ?? false;
            const vatAmount = roundAmount(isTaxInclusive
              ? subtotal - (subtotal / (1 + VAT_RATE))
              : subtotal * VAT_RATE);
            const creditSubtotal = roundAmount(isTaxInclusive ? subtotal - vatAmount : subtotal);
            const total = roundAmount(creditSubtotal + vatAmount);

            const cnNumber = await nextCreditNoteNumber(tx as any);
            const [cn] = await tx.insert(creditNotes).values({
              number: cnNumber,
              invoiceId: invoice.id,
              partnerId: ra.partnerId,
              returnsAuthId: ra.id,
              subtotal: String(creditSubtotal),
              vatAmount: String(vatAmount),
              total: String(total),
              reason: `Auto-generated from return ${ra.number}`,
              status: 'DRAFT', // Start as draft for review
              createdBy: userId,
            }).returning();
            creditNote = cn;

            // Insert credit note line items
            const lineInserts = creditLineItems.map((item, idx) => ({
              creditNoteId: cn.id,
              lineNumber: idx + 1,
              titleId: item.titleId,
              description: item.description,
              quantity: String(item.quantity),
              unitPrice: String(item.unitPrice),
              lineTotal: String(item.lineTotal),
              lineTax: String(roundAmount(item.lineTotal * (isTaxInclusive ? 0 : VAT_RATE))),
            }));

            await tx.insert(creditNoteLines).values(lineInserts);

            // Update invoice status after credit note
            const paidResult = await tx.execute(sql`
              SELECT COALESCE(SUM(amount::numeric), 0) AS total
              FROM payment_allocations WHERE invoice_id = ${invoice.id}
            `);
            const amountPaid = Number(paidResult[0]?.total ?? 0);
            const creditTotal = await tx.execute(sql`
              SELECT COALESCE(SUM(total::numeric), 0) AS total
              FROM credit_notes WHERE invoice_id = ${invoice.id} AND voided_at IS NULL
            `);
            const effectiveTotal = Math.max(0, roundAmount(Number(invoice.total) - Number(creditTotal[0]?.total ?? 0)));
            let newStatus = invoice.status;
            if (effectiveTotal <= 0) newStatus = 'PAID';
            else if (amountPaid >= effectiveTotal) newStatus = 'PAID';
            else if (amountPaid > 0) newStatus = 'PARTIAL';
            if (newStatus !== invoice.status) {
              await tx.update(invoices).set({ status: newStatus, updatedAt: new Date() })
                .where(eq(invoices.id, invoice.id));
            }
          }
        }
      }
    });

    const totalQty = ra.inspectionLines.reduce((s, l) => s + l.qtyReceived, 0);
    createBroadcastNotification(app, {
      type: 'RETURN_PROCESSED',
      priority: 'NORMAL',
      title: `Return ${ra.number} processed`,
      message: `${totalQty} items processed — inventory updated`,
      actionUrl: `/returns/${ra.id}`,
      referenceType: 'RETURN',
      referenceId: ra.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create return processed notification'));

    // Notify partner
    notifyPartner(app, ra.partnerId, {
      type: 'RETURN_STATUS_CHANGED',
      title: `Return ${ra.number} processed`,
      message: 'Your return has been fully processed and inventory has been updated.',
      actionUrl: '/partner/returns',
      referenceType: 'RETURN',
      referenceId: ra.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

    // If credit note was created, send separate notification
    if (creditNote) {
      notifyPartner(app, ra.partnerId, {
        type: 'CREDIT_NOTE_ISSUED',
        title: `Credit note ${creditNote.number} issued`,
        message: `R ${Number(creditNote.total).toFixed(2)} credited for return ${ra.number}. Apply this to your next remittance.`,
        actionUrl: '/partner/credit-notes',
        referenceType: 'CREDIT_NOTE',
        referenceId: creditNote.id,
      }).catch((err) => app.log.error({ err }, 'Failed to notify partner of credit note'));

      createBroadcastNotification(app, {
        type: 'CREDIT_NOTE_CREATED',
        priority: 'NORMAL',
        title: `Credit note ${creditNote.number} auto-created`,
        message: `R ${Number(creditNote.total).toFixed(2)} against return ${ra.number}`,
        actionUrl: `/credit-notes/${creditNote.id}`,
        referenceType: 'CREDIT_NOTE',
        referenceId: creditNote.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create credit note notification'));
    }

    return { data: { message: 'Return processed, inventory updated', creditNoteId: creditNote?.id ?? null } };
  });

  // Regenerate credit note with line items for existing processed returns
  app.post<{ Params: { id: string } }>('/:id/regenerate-credit-note', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const userId = request.session?.user?.id;
    
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: {
        partner: true,
        inspectionLines: { with: { title: true } },
      },
    });

    if (!ra) return reply.notFound('Return not found');
    if (ra.status !== 'PROCESSED') return reply.badRequest('Only PROCESSED returns can have credit notes regenerated');
    if (!ra.consignmentId) return reply.badRequest('Return must be linked to a consignment to regenerate credit note');

    // Find existing credit note
    const existingCN = await app.db.query.creditNotes.findFirst({
      where: eq(creditNotes.returnsAuthId, ra.id),
      with: { lines: true },
    });

    if (!existingCN) return reply.notFound('No existing credit note found for this return');
    if (existingCN.status === 'VOIDED') return reply.badRequest('Cannot regenerate voided credit note');

    // Get invoice
    const invoice = await app.db.query.invoices.findFirst({
      where: eq(invoices.consignmentId, ra.consignmentId),
    });

    if (!invoice) return reply.badRequest('No invoice found for this return\'s consignment');

    await app.db.transaction(async (tx) => {
      // Delete existing line items if any
      if (existingCN.lines && existingCN.lines.length > 0) {
        await tx.delete(creditNoteLines).where(eq(creditNoteLines.creditNoteId, existingCN.id));
      }

      // Recalculate line items
      const discountPct = Number(ra.partner?.discountPct ?? 0);
      let subtotal = 0;
      const creditLineItems: Array<{
        titleId: string;
        description: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }> = [];

      for (const line of ra.inspectionLines) {
        const creditQty = line.qtyGood + line.qtyDamaged;
        if (creditQty <= 0) continue;
        const title = line.title;
        if (!title) continue;

        const rrp = Number(title.rrpZar);
        const unitPrice = roundAmount(rrp * (1 - discountPct / 100));
        const lineTotal = roundAmount(unitPrice * creditQty);
        subtotal += lineTotal;

        creditLineItems.push({
          titleId: line.titleId,
          description: `${title.title} (ISBN: ${title.isbn || 'N/A'})`,
          quantity: creditQty,
          unitPrice,
          lineTotal,
        });
      }

      if (creditLineItems.length === 0) return reply.badRequest('No creditable items found in return');

      subtotal = roundAmount(subtotal);
      const isTaxInclusive = invoice.taxInclusive ?? false;
      const vatAmount = roundAmount(isTaxInclusive
        ? subtotal - (subtotal / (1 + VAT_RATE))
        : subtotal * VAT_RATE);
      const creditSubtotal = roundAmount(isTaxInclusive ? subtotal - vatAmount : subtotal);
      const total = roundAmount(creditSubtotal + vatAmount);

      // Update credit note header
      await tx.update(creditNotes).set({
        subtotal: String(creditSubtotal),
        vatAmount: String(vatAmount),
        total: String(total),
        reason: `Auto-generated from return ${ra.number} (regenerated)`,
        status: existingCN.status === 'APPROVED' || existingCN.status === 'SENT' ? existingCN.status : 'DRAFT',
        updatedAt: new Date(),
      }).where(eq(creditNotes.id, existingCN.id));

      // Insert new line items
      const lineInserts = creditLineItems.map((item, idx) => ({
        creditNoteId: existingCN.id,
        lineNumber: idx + 1,
        titleId: item.titleId,
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        lineTotal: String(item.lineTotal),
        lineTax: String(roundAmount(item.lineTotal * (isTaxInclusive ? 0 : VAT_RATE))),
      }));

      await tx.insert(creditNoteLines).values(lineInserts);
    });

    const updated = await app.db.query.creditNotes.findFirst({
      where: eq(creditNotes.id, existingCN.id),
      with: { lines: { orderBy: (l, { asc }) => [asc(l.lineNumber)] } },
    });

    createBroadcastNotification(app, {
      type: 'CREDIT_NOTE_UPDATED',
      priority: 'NORMAL',
      title: `Credit note ${existingCN.number} regenerated`,
      message: `Line items added for return ${ra.number}`,
      actionUrl: `/credit-notes/${existingCN.id}`,
      referenceType: 'CREDIT_NOTE',
      referenceId: existingCN.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create credit note regen notification'));

    return { data: { message: 'Credit note regenerated with line items', creditNote: updated } };
  });

  // ==========================================
  // RETURN AUTHORISATION WORKFLOW
  // ==========================================

  // Authorise a return (DRAFT → AUTHORIZED) and optionally send RA PDF to partner
  app.post<{ Params: { id: string } }>('/:id/authorise', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: {
        partner: true,
        lines: { with: { title: true } },
        consignment: true,
      },
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (!['DRAFT', 'SUBMITTED'].includes(ra.status)) {
      return reply.badRequest('Return must be in DRAFT or SUBMITTED state to authorise');
    }

    const { sendEmail: sendRaEmail, notes, validUntilDays } = z.object({
      sendEmail: z.boolean().default(true),
      notes: z.string().optional(),
      validUntilDays: z.number().int().min(1).max(90).default(30),
    }).parse(request.body ?? {});

    const userId = request.session?.user?.id;

    // Compute valid-until date
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validUntilDays);

    const [updated] = await app.db.update(returnsAuthorizations).set({
      status: 'AUTHORIZED',
      authorisedBy: userId,
      authorisedAt: new Date(),
      notes: notes ?? ra.notes,
    }).where(eq(returnsAuthorizations.id, ra.id)).returning();

    // Resolve linked invoice and SOR numbers for cross-references
    let invoiceNumber: string | null = null;
    let sorNumber: string | null = null;

    if (ra.consignment?.number) sorNumber = ra.consignment.number;
    if (ra.invoiceId) {
      const inv = await app.db.query.invoices.findFirst({ where: eq(invoices.id, ra.invoiceId) });
      invoiceNumber = inv?.number ?? null;
    }

    // Fetch company settings for sender details
    const settings = await app.db.query.companySettings.findFirst().catch(() => null);
    const authorisedByUser = userId
      ? await app.db.query.user.findFirst({ where: (u: any) => eq(u.id, userId) }).catch(() => null)
      : null;

    // Build RA PDF HTML
    const raHtml = renderReturnAuthorisationHtml({
      raNumber: ra.number,
      raDate: new Date().toISOString(),
      sorNumber,
      invoiceNumber,
      partnerPoNumber: null,
      partnerName: ra.partner.name,
      returnReason: ra.reason,
      lines: ra.lines.map(l => ({
        title: l.title?.title ?? 'Unknown',
        isbn13: l.title?.isbn13 ?? null,
        quantity: l.quantity,
        reason: l.notes ?? null,
      })),
      authorisedByName: (authorisedByUser as any)?.name ?? 'Xarra Books',
      validUntil: validUntil.toISOString(),
      company: settings ? {
        name: settings.companyName,
        addressLine1: settings.addressLine1,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        vatNumber: settings.vatNumber,
        logoUrl: settings.logoUrl,
      } : undefined,
    });

    // Send RA PDF to partner if requested
    if (sendRaEmail) {
      const recipientEmail = ra.partner.orderContactEmail || ra.partner.contactEmail;
      if (recipientEmail) {
        sendDocumentEmail({
          app,
          documentType: 'RETURN_AUTHORISATION',
          documentId: ra.id,
          recipientEmail,
          subject: `Return Authorised — ${ra.number} | Xarra Books`,
          message: `Your return request has been authorised. Please see the attached Return Authorisation document and follow the instructions to send the goods back to us. Reference <strong>${ra.number}</strong> on all correspondence and packaging.`,
          html: raHtml,
          documentNumber: ra.number,
          sentBy: userId,
        }).catch((err) => app.log.error({ err }, 'Failed to send RA email'));
      }
    }

    createBroadcastNotification(app, {
      type: 'RETURN_PROCESSED',
      priority: 'NORMAL',
      title: `Return ${ra.number} authorised`,
      message: `Return from ${ra.partner.name} has been authorised`,
      actionUrl: `/returns/${ra.id}`,
      referenceType: 'RETURN',
      referenceId: ra.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create return notification'));

    return { data: updated };
  });

  // Download Return Authorisation PDF
  app.get<{ Params: { id: string } }>('/:id/pdf', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: {
        partner: true,
        lines: { with: { title: true } },
        consignment: true,
      },
    });
    if (!ra) return reply.notFound('Return authorization not found');

    let invoiceNumber: string | null = null;
    let sorNumber: string | null = null;
    if (ra.consignment?.number) sorNumber = ra.consignment.number;
    if (ra.invoiceId) {
      const inv = await app.db.query.invoices.findFirst({ where: eq(invoices.id, ra.invoiceId) });
      invoiceNumber = inv?.number ?? null;
    }

    const settings = await app.db.query.companySettings.findFirst().catch(() => null);

    const html = renderReturnAuthorisationHtml({
      raNumber: ra.number,
      raDate: (ra.authorisedAt ?? ra.createdAt).toISOString(),
      sorNumber,
      invoiceNumber,
      partnerPoNumber: null,
      partnerName: ra.partner.name,
      returnReason: ra.reason,
      lines: ra.lines.map(l => ({
        title: l.title?.title ?? 'Unknown',
        isbn13: l.title?.isbn13 ?? null,
        quantity: l.quantity,
        reason: l.notes ?? null,
      })),
      company: settings ? {
        name: settings.companyName,
        addressLine1: settings.addressLine1,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        vatNumber: settings.vatNumber,
        logoUrl: settings.logoUrl,
      } : undefined,
    });

    const pdf = await generatePdf(html);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${ra.number}.pdf"`)
      .send(pdf);
  });

  // Reject a return
  app.post<{ Params: { id: string } }>('/:id/reject', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (!['DRAFT', 'SUBMITTED'].includes(ra.status)) {
      return reply.badRequest('Return must be in DRAFT or SUBMITTED state to reject');
    }

    const { reason } = z.object({ reason: z.string().min(1) }).parse(request.body);

    const [updated] = await app.db.update(returnsAuthorizations).set({
      status: 'REJECTED',
      rejectionReason: reason,
    }).where(eq(returnsAuthorizations.id, ra.id)).returning();

    return { data: updated };
  });
}
