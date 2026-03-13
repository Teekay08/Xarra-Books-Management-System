import type { FastifyInstance } from 'fastify';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { titles, titleProductionCosts, titlePrintRuns, authors, inventoryMovements } from '@xarra/db';
import { createTitleSchema, updateTitleSchema, paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { nextGRNNumber } from '../finance/invoice-number.js';
import { createBroadcastNotification } from '../../services/notifications.js';

export async function titleRoutes(app: FastifyInstance) {
  // List titles (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const offset = (page - 1) * limit;
    const authorId = (request.query as Record<string, string>).authorId;

    const conditions: ReturnType<typeof sql>[] = [];
    if (search) {
      conditions.push(sql`(${titles.title} ILIKE ${'%' + search + '%'} OR ${titles.subtitle} ILIKE ${'%' + search + '%'} OR ${titles.isbn13} ILIKE ${'%' + search + '%'})`);
    }
    if (authorId) {
      conditions.push(sql`${titles.primaryAuthorId} = ${authorId}`);
    }

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db
        .select({
          id: titles.id,
          title: titles.title,
          subtitle: titles.subtitle,
          isbn13: titles.isbn13,
          asin: titles.asin,
          primaryAuthorId: titles.primaryAuthorId,
          rrpZar: titles.rrpZar,
          costPriceZar: titles.costPriceZar,
          formats: titles.formats,
          status: titles.status,
          description: titles.description,
          publishDate: titles.publishDate,
          pageCount: titles.pageCount,
          weightGrams: titles.weightGrams,
          coverImageUrl: titles.coverImageUrl,
          createdAt: titles.createdAt,
          updatedAt: titles.updatedAt,
          authorName: authors.legalName,
          authorPenName: authors.penName,
        })
        .from(titles)
        .leftJoin(authors, eq(titles.primaryAuthorId, authors.id))
        .where(where)
        .orderBy(sortOrder === 'asc' ? asc(titles.title) : desc(titles.createdAt))
        .limit(limit)
        .offset(offset),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(titles)
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
  });

  // Get single title with relations
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const title = await app.db.query.titles.findFirst({
      where: eq(titles.id, request.params.id),
      with: {
        primaryAuthor: true,
        productionCosts: true,
        printRuns: true,
      },
    });

    if (!title) return reply.notFound('Title not found');
    return { data: title };
  });

  // Create title
  app.post('/', { preHandler: requireRole('admin', 'editorial', 'operations') }, async (request, reply) => {
    const body = createTitleSchema.parse(request.body);
    const [title] = await app.db.insert(titles).values({
      ...body,
      rrpZar: String(body.rrpZar),
      costPriceZar: body.costPriceZar ? String(body.costPriceZar) : undefined,
      publishDate: body.publishDate ? new Date(body.publishDate) : undefined,
    }).returning();
    return reply.status(201).send({ data: title });
  });

  // Update title
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin', 'editorial', 'operations') }, async (request, reply) => {
    const body = updateTitleSchema.parse(request.body);
    const values: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.rrpZar !== undefined) values.rrpZar = String(body.rrpZar);
    if (body.costPriceZar !== undefined) values.costPriceZar = String(body.costPriceZar);
    if (body.publishDate !== undefined) values.publishDate = new Date(body.publishDate);

    const [updated] = await app.db
      .update(titles)
      .set(values)
      .where(eq(titles.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('Title not found');
    return { data: updated };
  });

  // Delete title (only if PRODUCTION status)
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const existing = await app.db.query.titles.findFirst({
      where: eq(titles.id, request.params.id),
    });

    if (!existing) return reply.notFound('Title not found');
    if (existing.status !== 'PRODUCTION') {
      return reply.badRequest('Only titles in PRODUCTION status can be deleted');
    }

    await app.db.delete(titles).where(eq(titles.id, request.params.id));
    return { success: true };
  });

  // === Production Costs ===

  app.get<{ Params: { id: string } }>('/:id/costs', { preHandler: requireAuth }, async (request) => {
    const costs = await app.db
      .select()
      .from(titleProductionCosts)
      .where(eq(titleProductionCosts.titleId, request.params.id));
    return { data: costs };
  });

  app.post<{ Params: { id: string } }>('/:id/costs', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const body = request.body as { category: string; description: string; amount: number; vendor?: string; paidDate?: string };
    const title = await app.db.query.titles.findFirst({ where: eq(titles.id, request.params.id), columns: { id: true } });
    if (!title) return reply.notFound('Title not found');
    const [cost] = await app.db.insert(titleProductionCosts).values({
      titleId: request.params.id,
      category: body.category,
      description: body.description,
      amount: String(body.amount),
      vendor: body.vendor,
      paidDate: body.paidDate ? new Date(body.paidDate) : undefined,
    }).returning();
    return reply.status(201).send({ data: cost });
  });

  app.delete<{ Params: { id: string; costId: string } }>('/:id/costs/:costId', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const { id, costId } = request.params;
    const existing = await app.db.select().from(titleProductionCosts)
      .where(and(eq(titleProductionCosts.id, costId), eq(titleProductionCosts.titleId, id)));
    if (!existing.length) return reply.notFound('Cost not found');
    await app.db.delete(titleProductionCosts)
      .where(and(eq(titleProductionCosts.id, costId), eq(titleProductionCosts.titleId, id)));
    return { success: true };
  });

  // === Print Runs ===

  app.get<{ Params: { id: string } }>('/:id/print-runs', { preHandler: requireAuth }, async (request) => {
    const runs = await app.db
      .select()
      .from(titlePrintRuns)
      .where(eq(titlePrintRuns.titleId, request.params.id))
      .orderBy(desc(titlePrintRuns.createdAt));
    return { data: runs };
  });

  app.post<{ Params: { id: string } }>('/:id/print-runs', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const body = request.body as {
      printerName: string;
      quantityOrdered: number;
      totalCost: number;
      expectedDeliveryDate?: string;
      notes?: string;
    };
    const userId = request.session?.user?.id;
    const number = await nextGRNNumber(app.db as any);

    // Calculate next per-title print run number
    const [maxRow] = await app.db
      .select({ maxNum: sql<number>`COALESCE(MAX(${titlePrintRuns.printRunNumber}), 0)` })
      .from(titlePrintRuns)
      .where(eq(titlePrintRuns.titleId, request.params.id));
    const printRunNumber = (maxRow?.maxNum ?? 0) + 1;

    const [run] = await app.db.insert(titlePrintRuns).values({
      titleId: request.params.id,
      printRunNumber,
      number,
      printerName: body.printerName,
      quantityOrdered: body.quantityOrdered,
      totalCost: String(body.totalCost),
      expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined,
      notes: body.notes,
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: run });
  });

  app.post<{ Params: { id: string; runId: string } }>('/:id/print-runs/:runId/receive', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const { id, runId } = request.params;
    const body = request.body as { quantityReceived: number; notes?: string };
    const userId = request.session?.user?.id;

    const run = await app.db.query.titlePrintRuns.findFirst({
      where: and(eq(titlePrintRuns.id, runId), eq(titlePrintRuns.titleId, id)),
    });
    if (!run) return reply.notFound('Print run not found');
    if (run.status === 'RECEIVED' || run.status === 'CANCELLED') {
      return reply.badRequest('Print run is already received or cancelled');
    }

    const status = body.quantityReceived < run.quantityOrdered ? 'PARTIAL' : 'RECEIVED';

    await app.db.update(titlePrintRuns).set({
      status,
      quantityReceived: body.quantityReceived,
      receivedAt: new Date(),
      receivedBy: userId,
      notes: body.notes || run.notes,
      updatedAt: new Date(),
    }).where(eq(titlePrintRuns.id, runId));

    // Create inventory movement to add received stock to warehouse
    const [movement] = await app.db.insert(inventoryMovements).values({
      titleId: id,
      movementType: 'IN',
      toLocation: 'XARRA_WAREHOUSE',
      quantity: body.quantityReceived,
      referenceId: runId,
      referenceType: 'PRINT_RUN',
      supplierName: run.printerName,
      receivedDate: new Date(),
      notes: `Print run ${run.number} received: ${body.quantityReceived} of ${run.quantityOrdered} ordered`,
      createdBy: userId,
    }).returning();

    // Notify about stock receipt
    const title = await app.db.query.titles.findFirst({ where: eq(titles.id, id) });
    createBroadcastNotification(app, {
      type: 'INVENTORY_RECEIVED',
      title: 'Print run received',
      message: `${body.quantityReceived} units of "${title?.title ?? 'Unknown'}" received from ${run.printerName} (${run.number})`,
      actionUrl: `/titles/${id}`,
      referenceType: 'INVENTORY_MOVEMENT',
      referenceId: movement.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create print run notification'));

    return { data: { message: 'Print run marked as received', status, quantityReceived: body.quantityReceived } };
  });

  app.delete<{ Params: { id: string; runId: string } }>('/:id/print-runs/:runId', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id, runId } = request.params;
    const run = await app.db.query.titlePrintRuns.findFirst({
      where: and(eq(titlePrintRuns.id, runId), eq(titlePrintRuns.titleId, id)),
    });
    if (!run) return reply.notFound('Print run not found');
    if (run.status === 'RECEIVED' || run.status === 'PARTIAL') {
      return reply.badRequest('Cannot delete a received print run');
    }
    await app.db.delete(titlePrintRuns).where(eq(titlePrintRuns.id, runId));
    return { success: true };
  });
}
