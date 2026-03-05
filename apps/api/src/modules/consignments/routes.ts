import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import {
  consignments, consignmentLines, channelPartners,
  inventoryMovements, titles,
} from '@xarra/db';
import { createConsignmentSchema, paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

export async function consignmentRoutes(app: FastifyInstance) {
  // List consignments (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const offset = (page - 1) * limit;

    const items = await app.db.query.consignments.findMany({
      with: { partner: true, lines: { with: { title: true } } },
      orderBy: sortOrder === 'asc'
        ? (c, { asc }) => [asc(c.dispatchDate)]
        : (c, { desc }) => [desc(c.createdAt)],
      limit,
      offset,
    });

    const countResult = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(consignments);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get single consignment with lines
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: { with: { title: true } } },
    });
    if (!consignment) return reply.notFound('Consignment not found');
    return { data: consignment };
  });

  // Create consignment (DRAFT)
  app.post('/', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const body = createConsignmentSchema.parse(request.body);

    // Get partner for discount snapshot
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
    });
    if (!partner) return reply.notFound('Partner not found');

    // Get title RRPs for snapshot
    const titleIds = body.lines.map((l) => l.titleId);
    const titleRows = await app.db
      .select({ id: titles.id, rrpZar: titles.rrpZar })
      .from(titles)
      .where(sql`${titles.id} IN ${titleIds}`);
    const titleMap = new Map(titleRows.map((t) => [t.id, t.rrpZar]));

    const result = await app.db.transaction(async (tx) => {
      const [con] = await tx.insert(consignments).values({
        partnerId: body.partnerId,
        dispatchDate: body.dispatchDate ? new Date(body.dispatchDate) : undefined,
        courierCompany: body.courierCompany,
        courierWaybill: body.courierWaybill,
        status: 'DRAFT',
        notes: body.notes,
      }).returning();

      const lines = await tx.insert(consignmentLines).values(
        body.lines.map((l) => ({
          consignmentId: con.id,
          titleId: l.titleId,
          qtyDispatched: l.qtyDispatched,
          unitRrp: titleMap.get(l.titleId) ?? '0',
          discountPct: partner.discountPct,
        }))
      ).returning();

      return { ...con, lines };
    });

    return reply.status(201).send({ data: result });
  });

  // Dispatch consignment (DRAFT → DISPATCHED) + inventory deduction
  app.post<{ Params: { id: string } }>('/:id/dispatch', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: true },
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (consignment.status !== 'DRAFT') return reply.badRequest('Only DRAFT consignments can be dispatched');

    const userId = request.session?.user?.id;
    const dispatchDate = new Date();

    // Calculate SOR expiry from partner terms
    const sorDays = consignment.partner.sorDays ? Number(consignment.partner.sorDays) : 90;
    const sorExpiryDate = new Date(dispatchDate);
    sorExpiryDate.setDate(sorExpiryDate.getDate() + sorDays);

    await app.db.transaction(async (tx) => {
      // Update consignment status
      await tx.update(consignments).set({
        status: 'DISPATCHED',
        dispatchDate,
        sorExpiryDate,
        updatedAt: new Date(),
      }).where(eq(consignments.id, request.params.id));

      // Create inventory movements (deduction from warehouse)
      for (const line of consignment.lines) {
        await tx.insert(inventoryMovements).values({
          titleId: line.titleId,
          movementType: 'CONSIGN',
          fromLocation: 'XARRA_WAREHOUSE',
          toLocation: `CONSIGNED_${consignment.partner.name.toUpperCase().replace(/\s+/g, '_')}`,
          quantity: line.qtyDispatched,
          referenceId: consignment.id,
          referenceType: 'CONSIGNMENT',
          createdBy: userId,
        });
      }
    });

    const updated = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: { with: { title: true } } },
    });

    return { data: updated };
  });

  // Mark as delivered
  app.post<{ Params: { id: string } }>('/:id/deliver', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (consignment.status !== 'DISPATCHED') return reply.badRequest('Only DISPATCHED consignments can be delivered');

    const [updated] = await app.db.update(consignments).set({
      status: 'DELIVERED',
      deliveryDate: new Date(),
      updatedAt: new Date(),
    }).where(eq(consignments.id, request.params.id)).returning();

    return { data: updated };
  });

  // Acknowledge consignment
  app.post<{ Params: { id: string } }>('/:id/acknowledge', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (consignment.status !== 'DELIVERED') return reply.badRequest('Only DELIVERED consignments can be acknowledged');

    const [updated] = await app.db.update(consignments).set({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(consignments.id, request.params.id)).returning();

    return { data: updated };
  });

  // Report sales against consignment lines
  app.post<{ Params: { id: string } }>('/:id/report-sales', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const { lines } = request.body as {
      lines: { lineId: string; qtySold: number; qtyReturned?: number; qtyDamaged?: number }[];
    };

    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (!['DELIVERED', 'ACKNOWLEDGED'].includes(consignment.status)) {
      return reply.badRequest('Consignment must be DELIVERED or ACKNOWLEDGED to report sales');
    }

    for (const line of lines) {
      await app.db.update(consignmentLines).set({
        qtySold: line.qtySold,
        qtyReturned: line.qtyReturned ?? 0,
        qtyDamaged: line.qtyDamaged ?? 0,
      }).where(eq(consignmentLines.id, line.lineId));
    }

    return { success: true };
  });

  // Process returns
  app.post<{ Params: { id: string } }>('/:id/process-returns', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: true },
    });
    if (!consignment) return reply.notFound('Consignment not found');

    const userId = request.session?.user?.id;
    const hasReturns = consignment.lines.some((l) => l.qtyReturned > 0 || l.qtyDamaged > 0);
    if (!hasReturns) return reply.badRequest('No returns to process');

    await app.db.transaction(async (tx) => {
      // Inventory movements for returns
      for (const line of consignment.lines) {
        const totalReturned = line.qtyReturned + line.qtyDamaged;
        if (totalReturned <= 0) continue;

        // Good returns go back to warehouse
        if (line.qtyReturned > 0) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'RETURN',
            fromLocation: `CONSIGNED_${consignment.partner.name.toUpperCase().replace(/\s+/g, '_')}`,
            toLocation: 'XARRA_WAREHOUSE',
            quantity: line.qtyReturned,
            referenceId: consignment.id,
            referenceType: 'CONSIGNMENT',
            reason: 'SOR return',
            createdBy: userId,
          });
        }

        // Damaged go to damaged location
        if (line.qtyDamaged > 0) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'RETURN',
            fromLocation: `CONSIGNED_${consignment.partner.name.toUpperCase().replace(/\s+/g, '_')}`,
            toLocation: 'DAMAGED',
            quantity: line.qtyDamaged,
            referenceId: consignment.id,
            referenceType: 'CONSIGNMENT',
            reason: 'Damaged return',
            createdBy: userId,
          });
        }
      }

      // Update status
      await tx.update(consignments).set({
        status: 'PARTIAL_RETURN',
        updatedAt: new Date(),
      }).where(eq(consignments.id, request.params.id));
    });

    return { success: true };
  });

  // Reconcile and close consignment
  app.post<{ Params: { id: string } }>('/:id/reconcile', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');

    const [updated] = await app.db.update(consignments).set({
      status: 'RECONCILED',
      reconciledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(consignments.id, request.params.id)).returning();

    return { data: updated };
  });

  // Close consignment
  app.post<{ Params: { id: string } }>('/:id/close', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (consignment.status !== 'RECONCILED') return reply.badRequest('Only RECONCILED consignments can be closed');

    const [updated] = await app.db.update(consignments).set({
      status: 'CLOSED',
      updatedAt: new Date(),
    }).where(eq(consignments.id, request.params.id)).returning();

    return { data: updated };
  });

  // SOR expiry dashboard — active consignments with days remaining
  app.get('/sor/active', { preHandler: requireAuth }, async () => {
    const now = new Date();
    const result = await app.db.execute<{
      id: string;
      partnerId: string;
      partnerName: string;
      dispatchDate: string;
      sorExpiryDate: string;
      daysRemaining: number;
      status: string;
      totalQtyDispatched: number;
      totalQtySold: number;
      totalQtyReturned: number;
    }>(sql`
      SELECT
        c.id,
        c.partner_id AS "partnerId",
        cp.name AS "partnerName",
        c.dispatch_date AS "dispatchDate",
        c.sor_expiry_date AS "sorExpiryDate",
        EXTRACT(DAY FROM c.sor_expiry_date - ${now.toISOString()}::timestamptz)::int AS "daysRemaining",
        c.status,
        COALESCE(SUM(cl.qty_dispatched), 0)::int AS "totalQtyDispatched",
        COALESCE(SUM(cl.qty_sold), 0)::int AS "totalQtySold",
        COALESCE(SUM(cl.qty_returned), 0)::int AS "totalQtyReturned"
      FROM ${consignments} c
      JOIN ${channelPartners} cp ON cp.id = c.partner_id
      LEFT JOIN ${consignmentLines} cl ON cl.consignment_id = c.id
      WHERE c.status IN ('DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN')
      GROUP BY c.id, cp.name
      ORDER BY c.sor_expiry_date ASC
    `);

    return { data: result };
  });
}
