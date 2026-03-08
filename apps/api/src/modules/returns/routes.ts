import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { returnsAuthorizations, returnsAuthorizationLines, inventoryMovements } from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { createBroadcastNotification } from '../../services/notifications.js';
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

  // Get return detail
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: { partner: true, lines: { with: { title: true } }, consignment: true },
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

  // Process return (creates inventory movements for returned stock)
  app.post<{ Params: { id: string } }>('/:id/process', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const ra = await app.db.query.returnsAuthorizations.findFirst({
      where: eq(returnsAuthorizations.id, request.params.id),
      with: { lines: true },
    });
    if (!ra) return reply.notFound('Return authorization not found');
    if (ra.status === 'PROCESSED') return reply.badRequest('Already processed');

    // Create inventory movements for each line
    for (const line of ra.lines) {
      await app.db.insert(inventoryMovements).values({
        titleId: line.titleId,
        movementType: 'RETURN',
        quantity: line.quantity,
        toLocation: 'WAREHOUSE',
        reason: `Return from RA ${ra.number} (${line.condition})`,
        referenceType: 'RETURN',
        referenceId: ra.id,
      });
    }

    // Mark as processed
    await app.db.update(returnsAuthorizations).set({
      status: 'PROCESSED',
      processedAt: new Date(),
    }).where(eq(returnsAuthorizations.id, ra.id));

    const totalQty = ra.lines.reduce((s, l) => s + l.quantity, 0);
    createBroadcastNotification(app, {
      type: 'RETURN_PROCESSED',
      priority: 'NORMAL',
      title: `Return ${ra.number} processed`,
      message: `${totalQty} items returned to warehouse`,
      actionUrl: `/returns/${ra.id}`,
      referenceType: 'RETURN',
      referenceId: ra.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create return processed notification'));

    return { data: { message: 'Return processed, inventory updated' } };
  });
}
