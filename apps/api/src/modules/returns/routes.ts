import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import {
  returnsAuthorizations, returnsAuthorizationLines,
  returnInspectionLines, inventoryMovements, consignmentLines,
} from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { createBroadcastNotification } from '../../services/notifications.js';
import { notifyPartner } from '../../services/partner-notifications.js';
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

async function nextReturnNumber(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `RA-${year}-%`;
  const result = await db.execute(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM returns_authorizations
    WHERE number LIKE ${pattern}
  `);
  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `RA-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function returnRoutes(app: FastifyInstance) {
  // List returns
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${returnsAuthorizations.number} ILIKE ${'%' + search + '%'}`
      : undefined;

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

  // Receive goods at warehouse (sign for delivery)
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

    await app.db.update(returnsAuthorizations).set({
      status: 'RECEIVED',
      receivedAt: new Date(),
      receivedBy: userId,
      deliverySignedBy: body.deliverySignedBy,
      courierCompany: body.courierCompany ?? ra.courierCompany,
      courierWaybill: body.courierWaybill ?? ra.courierWaybill,
    }).where(eq(returnsAuthorizations.id, ra.id));

    // Notify partner that goods have been received
    notifyPartner(app, ra.partnerId, {
      type: 'RETURN_STATUS_CHANGED',
      title: `Return ${ra.number} received at warehouse`,
      message: 'Your returned goods have been received and will be inspected.',
      actionUrl: '/partner/returns',
      referenceType: 'RETURN',
      referenceId: ra.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

    return { data: { message: 'Goods received at warehouse' } };
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

    return { data: { message: 'Return processed, inventory updated' } };
  });
}
