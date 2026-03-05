import type { FastifyInstance } from 'fastify';
import { eq, sql, desc, asc } from 'drizzle-orm';
import { authors, authorContracts } from '@xarra/db';
import { createAuthorSchema, updateAuthorSchema, createAuthorContractSchema, paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

export async function authorRoutes(app: FastifyInstance) {
  // List authors (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${authors.legalName} ILIKE ${'%' + search + '%'} OR ${authors.penName} ILIKE ${'%' + search + '%'} OR ${authors.email} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db
        .select()
        .from(authors)
        .where(where)
        .orderBy(sortOrder === 'asc' ? asc(authors.legalName) : desc(authors.createdAt))
        .limit(limit)
        .offset(offset),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(authors)
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

  // Get single author
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const author = await app.db.query.authors.findFirst({
      where: eq(authors.id, request.params.id),
      with: { contracts: { with: { title: true } } },
    });

    if (!author) return reply.notFound('Author not found');
    return { data: author };
  });

  // Create author
  app.post('/', { preHandler: requireRole('admin', 'editorial') }, async (request, reply) => {
    const body = createAuthorSchema.parse(request.body);
    const [author] = await app.db.insert(authors).values(body).returning();
    return reply.status(201).send({ data: author });
  });

  // Update author
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin', 'editorial') }, async (request, reply) => {
    const body = updateAuthorSchema.parse(request.body);
    const [updated] = await app.db
      .update(authors)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(authors.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('Author not found');
    return { data: updated };
  });

  // Delete author (soft delete via isActive)
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const [updated] = await app.db
      .update(authors)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(authors.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('Author not found');
    return { data: updated };
  });

  // === Author Contracts ===

  app.get<{ Params: { id: string } }>('/:id/contracts', { preHandler: requireAuth }, async (request) => {
    const contracts = await app.db.query.authorContracts.findMany({
      where: eq(authorContracts.authorId, request.params.id),
      with: { title: true },
    });
    return { data: contracts };
  });

  app.post<{ Params: { id: string } }>('/:id/contracts', { preHandler: requireRole('admin', 'editorial') }, async (request, reply) => {
    const body = createAuthorContractSchema.parse(request.body);
    const [contract] = await app.db.insert(authorContracts).values({
      ...body,
      authorId: request.params.id,
      royaltyRatePrint: String(body.royaltyRatePrint),
      royaltyRateEbook: String(body.royaltyRateEbook),
      advanceAmount: String(body.advanceAmount),
      triggerValue: body.triggerValue ? String(body.triggerValue) : undefined,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    }).returning();
    return reply.status(201).send({ data: contract });
  });
}
