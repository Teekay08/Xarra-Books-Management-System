import type { FastifyInstance } from 'fastify';
import { eq, sql, desc, asc } from 'drizzle-orm';
import { titles, titleProductionCosts } from '@xarra/db';
import { createTitleSchema, updateTitleSchema, paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

export async function titleRoutes(app: FastifyInstance) {
  // List titles (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${titles.title} ILIKE ${'%' + search + '%'} OR ${titles.subtitle} ILIKE ${'%' + search + '%'} OR ${titles.isbn13} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db
        .select()
        .from(titles)
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
}
