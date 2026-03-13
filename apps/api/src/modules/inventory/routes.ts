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
    const location = (request.query as Record<string, string>).location;

    const conditions: ReturnType<typeof sql>[] = [];
    if (search) {
      conditions.push(sql`(t.title ILIKE ${'%' + search + '%'} OR t.isbn_13 ILIKE ${'%' + search + '%'})`);
    }

    // When filtering by location, calculate stock at that specific location
    const stockCalc = location
      ? sql`
        COALESCE(SUM(
          CASE
            WHEN im.movement_type IN ('IN', 'RETURN') AND im.to_location = ${location} THEN im.quantity
            WHEN im.movement_type = 'ADJUST' AND im.to_location = ${location} THEN im.quantity
            WHEN im.movement_type = 'ADJUST' AND im.from_location = ${location} THEN im.quantity
            WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') AND im.from_location = ${location} THEN -im.quantity
            ELSE 0
          END
        ), 0)::int`
      : sql`
        COALESCE(SUM(
          CASE
            WHEN im.movement_type IN ('IN', 'RETURN') THEN im.quantity
            WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -im.quantity
            WHEN im.movement_type = 'ADJUST' THEN im.quantity
            ELSE 0
          END
        ), 0)::int`;

    const whereClause = conditions.length > 0 ? sql`WHERE ${conditions[0]}` : sql``;

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
        ${stockCalc} AS "stockOnHand"
      FROM ${titles} t
      LEFT JOIN ${inventoryMovements} im ON im.title_id = t.id
      ${whereClause}
      GROUP BY t.id, t.title, t.isbn_13
      ${location ? sql`HAVING ${stockCalc} != 0` : sql``}
      ORDER BY t.title
      LIMIT ${limit} OFFSET ${offset}
    `);

    // For location-filtered queries, count titles with non-zero stock at that location
    const countResult = location
      ? await app.db.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM (
            SELECT t.id
            FROM ${titles} t
            LEFT JOIN ${inventoryMovements} im ON im.title_id = t.id
            ${whereClause}
            GROUP BY t.id
            HAVING ${stockCalc} != 0
          ) sub
        `)
      : await app.db
          .select({ count: sql<number>`count(*)` })
          .from(titles)
          .where(search ? sql`${titles.title} ILIKE ${'%' + search + '%'} OR ${titles.isbn13} ILIKE ${'%' + search + '%'}` : undefined);

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

  // Record stock adjustment (supports RESTOCK, WRITEOFF, TRANSFER, COMPLIMENTARY)
  app.post(
    '/adjustments',
    { preHandler: requireRole('admin', 'operations') },
    async (request, reply) => {
      const body = stockAdjustmentSchema.parse(request.body);
      const userId = request.session?.user?.id;

      const movements: any[] = [];

      switch (body.adjustmentType) {
        case 'WRITEOFF': {
          const [movement] = await app.db
            .insert(inventoryMovements)
            .values({
              titleId: body.titleId,
              movementType: 'WRITEOFF',
              fromLocation: body.location,
              toLocation: 'DAMAGED',
              quantity: body.quantity,
              reason: body.reason,
              notes: body.notes,
              referenceType: 'ADJUSTMENT_WRITEOFF',
              createdBy: userId,
            })
            .returning();
          movements.push(movement);
          break;
        }

        case 'TRANSFER': {
          if (!body.toLocation) {
            return reply.status(400).send({ error: 'toLocation is required for TRANSFER adjustments' });
          }

          // Check available stock at source location
          const stockResult = await app.db.execute<{ available: number }>(sql`
            SELECT COALESCE(SUM(
              CASE
                WHEN movement_type IN ('IN', 'RETURN') AND to_location = ${body.location} THEN quantity
                WHEN movement_type = 'ADJUST' AND to_location = ${body.location} THEN quantity
                WHEN movement_type = 'ADJUST' AND from_location = ${body.location} THEN quantity
                WHEN movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') AND from_location = ${body.location} THEN -quantity
                ELSE 0
              END
            ), 0)::int AS available
            FROM ${inventoryMovements}
            WHERE title_id = ${body.titleId}
          `);
          const available = stockResult[0]?.available ?? 0;
          if (body.quantity > available) {
            return reply.status(400).send({
              error: `Insufficient stock. Only ${available} unit(s) available at ${body.location.replace(/_/g, ' ')}.`,
            });
          }

          // Negative movement from source
          const [outMovement] = await app.db
            .insert(inventoryMovements)
            .values({
              titleId: body.titleId,
              movementType: 'ADJUST',
              fromLocation: body.location,
              quantity: -body.quantity,
              reason: body.reason,
              notes: body.notes ? `[Transfer out] ${body.notes}` : '[Transfer out]',
              referenceType: 'ADJUSTMENT_TRANSFER',
              createdBy: userId,
            })
            .returning();
          // Positive movement to destination
          const [inMovement] = await app.db
            .insert(inventoryMovements)
            .values({
              titleId: body.titleId,
              movementType: 'ADJUST',
              toLocation: body.toLocation,
              quantity: body.quantity,
              reason: body.reason,
              notes: body.notes ? `[Transfer in] ${body.notes}` : '[Transfer in]',
              referenceType: 'ADJUSTMENT_TRANSFER',
              createdBy: userId,
            })
            .returning();
          movements.push(outMovement, inMovement);
          break;
        }

        case 'RESTOCK': {
          const [movement] = await app.db
            .insert(inventoryMovements)
            .values({
              titleId: body.titleId,
              movementType: 'RETURN',
              toLocation: body.location,
              quantity: body.quantity,
              reason: body.reason,
              notes: body.notes,
              referenceType: 'ADJUSTMENT_RESTOCK',
              createdBy: userId,
            })
            .returning();
          movements.push(movement);
          break;
        }

        case 'COMPLIMENTARY': {
          const [movement] = await app.db
            .insert(inventoryMovements)
            .values({
              titleId: body.titleId,
              movementType: 'ADJUST',
              fromLocation: body.location,
              quantity: -body.quantity,
              reason: body.reason,
              notes: body.notes,
              referenceType: 'ADJUSTMENT_COMPLIMENTARY',
              createdBy: userId,
            })
            .returning();
          movements.push(movement);
          break;
        }
      }

      return reply.status(201).send({ data: movements.length === 1 ? movements[0] : movements });
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

  // Edit a stock receipt (IN/PRINT_RUN movements only)
  app.patch<{ Params: { id: string } }>(
    '/movements/:id',
    { preHandler: requireRole('admin', 'operations') },
    async (request, reply) => {
      const movement = await app.db.query.inventoryMovements.findFirst({
        where: eq(inventoryMovements.id, request.params.id),
      });
      if (!movement) return reply.notFound('Movement not found');
      if (movement.movementType !== 'IN' || movement.referenceType !== 'PRINT_RUN') {
        return reply.badRequest('Only stock receipts can be edited');
      }

      const body = request.body as {
        quantity?: number;
        toLocation?: string;
        receivedDate?: string;
        batchNumber?: string | null;
        supplierName?: string | null;
        supplierId?: string | null;
        notes?: string | null;
      };

      const updates: Record<string, unknown> = {};
      if (body.quantity !== undefined) updates.quantity = body.quantity;
      if (body.toLocation !== undefined) updates.toLocation = body.toLocation;
      if (body.receivedDate !== undefined) updates.receivedDate = new Date(body.receivedDate);
      if ('batchNumber' in body) updates.batchNumber = body.batchNumber;
      if ('supplierName' in body) updates.supplierName = body.supplierName;
      if ('supplierId' in body) updates.supplierId = body.supplierId;
      if ('notes' in body) updates.notes = body.notes;

      const [updated] = await app.db
        .update(inventoryMovements)
        .set(updates)
        .where(eq(inventoryMovements.id, request.params.id))
        .returning();

      return { data: updated };
    }
  );

  // Aggregate stock summary metrics
  app.get('/stock/summary', { preHandler: requireAuth }, async () => {
    const result = await app.db.execute<{
      totalInSystem: number;
      availableToDispatch: number;
      atRisk: number;
      soldToDate: number;
    }>(sql`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN movement_type IN ('IN', 'RETURN') THEN quantity
            WHEN movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -quantity
            WHEN movement_type = 'ADJUST' THEN quantity
            ELSE 0
          END
        ), 0)::int AS "totalInSystem",

        COALESCE(SUM(
          CASE
            WHEN movement_type IN ('IN', 'RETURN') AND to_location = 'XARRA_WAREHOUSE' THEN quantity
            WHEN movement_type = 'ADJUST' AND to_location = 'XARRA_WAREHOUSE' THEN quantity
            WHEN movement_type = 'ADJUST' AND from_location = 'XARRA_WAREHOUSE' THEN quantity
            WHEN movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') AND from_location = 'XARRA_WAREHOUSE' THEN -quantity
            ELSE 0
          END
        ), 0)::int AS "availableToDispatch",

        COALESCE(SUM(
          CASE
            WHEN movement_type = 'CONSIGN' THEN quantity
            WHEN movement_type = 'RETURN' AND from_location IS NOT NULL AND from_location != 'XARRA_WAREHOUSE' THEN -quantity
            WHEN movement_type = 'SELL' AND reference_type = 'CONSIGNMENT' THEN -quantity
            ELSE 0
          END
        ), 0)::int AS "atRisk",

        COALESCE(SUM(
          CASE WHEN movement_type = 'SELL' THEN quantity ELSE 0 END
        ), 0)::int AS "soldToDate"

      FROM ${inventoryMovements}
    `);

    return { data: result[0] };
  });

  // Stock levels broken down by location for each title
  app.get('/stock/by-location', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`WHERE t.title ILIKE ${'%' + search + '%'} OR t.isbn_13 ILIKE ${'%' + search + '%'}`
      : sql``;

    const items = await app.db.execute<{
      titleId: string;
      title: string;
      isbn13: string | null;
      warehouseStock: number;
      storeStock: number;
      inTransit: number;
      consigned: number;
      takealot: number;
      returnsPending: number;
      damaged: number;
    }>(sql`
      SELECT
        t.id AS "titleId",
        t.title,
        t.isbn_13 AS "isbn13",

        COALESCE(SUM(CASE
          WHEN im.movement_type IN ('IN', 'RETURN') AND im.to_location = 'XARRA_WAREHOUSE' THEN im.quantity
          WHEN im.movement_type = 'ADJUST' AND im.to_location = 'XARRA_WAREHOUSE' THEN im.quantity
          WHEN im.movement_type = 'ADJUST' AND im.from_location = 'XARRA_WAREHOUSE' THEN im.quantity
          WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') AND im.from_location = 'XARRA_WAREHOUSE' THEN -im.quantity
          ELSE 0
        END), 0)::int AS "warehouseStock",

        COALESCE(SUM(CASE
          WHEN im.movement_type IN ('IN', 'RETURN') AND im.to_location = 'XARRA_STORE' THEN im.quantity
          WHEN im.movement_type = 'ADJUST' AND im.to_location = 'XARRA_STORE' THEN im.quantity
          WHEN im.movement_type = 'ADJUST' AND im.from_location = 'XARRA_STORE' THEN im.quantity
          WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') AND im.from_location = 'XARRA_STORE' THEN -im.quantity
          ELSE 0
        END), 0)::int AS "storeStock",

        COALESCE(SUM(CASE
          WHEN im.to_location = 'IN_TRANSIT' THEN im.quantity
          WHEN im.from_location = 'IN_TRANSIT' THEN -im.quantity
          ELSE 0
        END), 0)::int AS "inTransit",

        COALESCE(SUM(CASE
          WHEN im.movement_type = 'CONSIGN' THEN im.quantity
          WHEN im.movement_type = 'RETURN' AND im.from_location IS NOT NULL AND im.from_location NOT IN ('XARRA_WAREHOUSE', 'XARRA_STORE', 'IN_TRANSIT', 'TAKEALOT', 'DAMAGED') THEN -im.quantity
          WHEN im.movement_type = 'SELL' AND im.reference_type = 'CONSIGNMENT' THEN -im.quantity
          ELSE 0
        END), 0)::int AS "consigned",

        COALESCE(SUM(CASE
          WHEN im.to_location = 'TAKEALOT' THEN im.quantity
          WHEN im.from_location = 'TAKEALOT' THEN -im.quantity
          ELSE 0
        END), 0)::int AS "takealot",

        COALESCE(SUM(CASE
          WHEN im.to_location = 'RETURNS_PENDING' THEN im.quantity
          WHEN im.from_location = 'RETURNS_PENDING' THEN -im.quantity
          ELSE 0
        END), 0)::int AS "returnsPending",

        COALESCE(SUM(CASE
          WHEN im.to_location = 'DAMAGED' THEN im.quantity
          WHEN im.from_location = 'DAMAGED' THEN -im.quantity
          ELSE 0
        END), 0)::int AS "damaged"

      FROM ${titles} t
      LEFT JOIN ${inventoryMovements} im ON im.title_id = t.id
      ${where}
      GROUP BY t.id, t.title, t.isbn_13
      ORDER BY t.title
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(titles)
      .where(search ? sql`${titles.title} ILIKE ${'%' + search + '%'} OR ${titles.isbn13} ILIKE ${'%' + search + '%'}` : undefined);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Stock take - calculate variance report (does not persist)
  app.post(
    '/stock-take',
    { preHandler: requireRole('admin', 'operations') },
    async (request) => {
      const body = request.body as {
        location: string;
        lines: Array<{ titleId: string; countedQty: number }>;
      };

      if (!body.location || !body.lines || body.lines.length === 0) {
        throw new Error('location and at least one line are required');
      }

      // Calculate expected qty at this location for each title
      const varianceLines = await Promise.all(
        body.lines.map(async (line) => {
          const result = await app.db.execute<{ expectedQty: number; titleName: string }>(sql`
            SELECT
              COALESCE(SUM(
                CASE
                  WHEN im.movement_type IN ('IN', 'RETURN') AND im.to_location = ${body.location} THEN im.quantity
                  WHEN im.movement_type = 'ADJUST' AND im.to_location = ${body.location} THEN im.quantity
                  WHEN im.movement_type = 'ADJUST' AND im.from_location = ${body.location} THEN im.quantity
                  WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') AND im.from_location = ${body.location} THEN -im.quantity
                  ELSE 0
                END
              ), 0)::int AS "expectedQty",
              t.title AS "titleName"
            FROM ${titles} t
            LEFT JOIN ${inventoryMovements} im ON im.title_id = t.id
            WHERE t.id = ${line.titleId}
            GROUP BY t.id, t.title
          `);

          const expectedQty = result[0]?.expectedQty ?? 0;
          const titleName = result[0]?.titleName ?? 'Unknown';

          return {
            titleId: line.titleId,
            title: titleName,
            expectedQty,
            countedQty: line.countedQty,
            variance: line.countedQty - expectedQty,
          };
        })
      );

      return {
        data: {
          location: body.location,
          lines: varianceLines,
        },
      };
    }
  );

  // Apply stock take adjustments
  app.post(
    '/stock-take/apply',
    { preHandler: requireRole('admin', 'operations') },
    async (request, reply) => {
      const body = request.body as {
        location: string;
        adjustments: Array<{ titleId: string; variance: number }>;
      };
      const userId = request.session?.user?.id;

      if (!body.location || !body.adjustments || body.adjustments.length === 0) {
        return reply.status(400).send({ error: 'location and at least one adjustment are required' });
      }

      const nonZero = body.adjustments.filter((a) => a.variance !== 0);
      if (nonZero.length === 0) {
        return { data: { applied: 0, movements: [] } };
      }

      const movements = await Promise.all(
        nonZero.map(async (adj) => {
          const [movement] = await app.db
            .insert(inventoryMovements)
            .values({
              titleId: adj.titleId,
              movementType: 'ADJUST',
              toLocation: adj.variance > 0 ? body.location : undefined,
              fromLocation: adj.variance < 0 ? body.location : undefined,
              quantity: adj.variance,
              reason: 'Stock take adjustment',
              referenceType: 'STOCK_TAKE',
              createdBy: userId,
            })
            .returning();
          return movement;
        })
      );

      return reply.status(201).send({
        data: {
          applied: movements.length,
          movements,
        },
      });
    }
  );
}
