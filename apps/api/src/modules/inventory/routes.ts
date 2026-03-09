import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import { inventoryMovements, titles } from '@xarra/db';
import { stockAdjustmentSchema, paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { createBroadcastNotification } from '../../services/notifications.js';

export async function inventoryRoutes(app: FastifyInstance) {
  // Stock levels per title (aggregated from movements)
  app.get('/stock', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${titles.title} ILIKE ${'%' + search + '%'} OR ${titles.isbn13} ILIKE ${'%' + search + '%'}`
      : undefined;

    // Net stock per title
    const summaryItems = await app.db.execute<{
      titleId: string;
      title: string;
      isbn13: string | null;
      totalIn: number;
      totalOut: number;
      stockOnHand: number;
    }>(sql`
      SELECT
        t.id AS "titleId",
        t.title,
        t.isbn_13 AS "isbn13",
        COALESCE(SUM(CASE WHEN im.movement_type = 'IN' OR im.movement_type = 'RETURN' THEN im.quantity ELSE 0 END), 0)::int AS "totalIn",
        COALESCE(SUM(CASE WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN im.quantity ELSE 0 END), 0)::int AS "totalOut",
        COALESCE(SUM(
          CASE
            WHEN im.movement_type IN ('IN', 'RETURN') THEN im.quantity
            WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -im.quantity
            WHEN im.movement_type = 'ADJUST' THEN im.quantity
            ELSE 0
          END
        ), 0)::int AS "stockOnHand"
      FROM ${titles} t
      LEFT JOIN ${inventoryMovements} im ON im.title_id = t.id
      ${where ? sql`WHERE ${where}` : sql``}
      GROUP BY t.id, t.title, t.isbn_13
      ORDER BY t.title
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(titles)
      .where(where);

    return {
      data: summaryItems,
      pagination: {
        page,
        limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Movement history for a title
  app.get<{ Params: { titleId: string } }>(
    '/titles/:titleId/movements',
    { preHandler: requireAuth },
    async (request) => {
      const query = paginationSchema.parse(request.query);
      const { page, limit } = query;
      const offset = (page - 1) * limit;

      const where = eq(inventoryMovements.titleId, request.params.titleId);

      const [items, countResult] = await Promise.all([
        app.db
          .select()
          .from(inventoryMovements)
          .where(where)
          .orderBy(desc(inventoryMovements.createdAt))
          .limit(limit)
          .offset(offset),
        app.db
          .select({ count: sql<number>`count(*)` })
          .from(inventoryMovements)
          .where(where),
      ]);

      return {
        data: items,
        pagination: {
          page,
          limit,
          total: Number(countResult[0].count),
          totalPages: Math.ceil(Number(countResult[0].count) / limit),
        },
      };
    }
  );

  // Record stock adjustment
  app.post(
    '/adjustments',
    { preHandler: requireRole('admin', 'operations') },
    async (request, reply) => {
      const body = stockAdjustmentSchema.parse(request.body);
      const userId = request.session?.user?.id;

      const [movement] = await app.db
        .insert(inventoryMovements)
        .values({
          titleId: body.titleId,
          movementType: 'ADJUST',
          toLocation: body.location,
          quantity: body.quantity,
          reason: body.reason,
          notes: body.notes,
          referenceType: 'ADJUSTMENT',
          createdBy: userId,
        })
        .returning();

      return reply.status(201).send({ data: movement });
    }
  );

  // Record stock in (goods received)
  app.post(
    '/receive',
    { preHandler: requireRole('admin', 'operations') },
    async (request, reply) => {
      const body = request.body as {
        titleId: string;
        quantity: number;
        location?: string;
        batchNumber?: string;
        supplierName?: string;
        supplierId?: string;
        receivedDate?: string;
        notes?: string;
      };
      const userId = request.session?.user?.id;

      const [movement] = await app.db
        .insert(inventoryMovements)
        .values({
          titleId: body.titleId,
          movementType: 'IN',
          toLocation: body.location ?? 'XARRA_WAREHOUSE',
          quantity: body.quantity,
          batchNumber: body.batchNumber,
          supplierName: body.supplierName,
          supplierId: body.supplierId,
          receivedDate: body.receivedDate ? new Date(body.receivedDate) : new Date(),
          referenceType: 'PRINT_RUN',
          notes: body.notes,
          createdBy: userId,
        })
        .returning();

      // Get title name for notification
      const title = await app.db.query.titles.findFirst({ where: eq(titles.id, body.titleId) });
      createBroadcastNotification(app, {
        type: 'INVENTORY_RECEIVED',
        title: 'Stock received',
        message: `${body.quantity} units of "${title?.title ?? 'Unknown'}" received at ${body.location ?? 'XARRA_WAREHOUSE'}${body.supplierName ? ` from ${body.supplierName}` : ''}`,
        actionUrl: `/inventory/${body.titleId}/movements`,
        referenceType: 'INVENTORY_MOVEMENT',
        referenceId: movement.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create inventory notification'));

      return reply.status(201).send({ data: movement });
    }
  );
}
