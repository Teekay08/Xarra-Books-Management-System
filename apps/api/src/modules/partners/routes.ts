import type { FastifyInstance } from 'fastify';
import { eq, sql, desc, asc } from 'drizzle-orm';
import { channelPartners } from '@xarra/db';
import { createChannelPartnerSchema, updateChannelPartnerSchema, paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

export async function partnerRoutes(app: FastifyInstance) {
  // List partners (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${channelPartners.name} ILIKE ${'%' + search + '%'} OR ${channelPartners.contactName} ILIKE ${'%' + search + '%'} OR ${channelPartners.contactEmail} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db
        .select()
        .from(channelPartners)
        .where(where)
        .orderBy(sortOrder === 'asc' ? asc(channelPartners.name) : desc(channelPartners.createdAt))
        .limit(limit)
        .offset(offset),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(channelPartners)
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

  // Get single partner
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, request.params.id),
    });

    if (!partner) return reply.notFound('Channel partner not found');
    return { data: partner };
  });

  // Create partner
  app.post('/', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const body = createChannelPartnerSchema.parse(request.body);
    const [partner] = await app.db.insert(channelPartners).values({
      ...body,
      discountPct: String(body.discountPct),
    }).returning();
    return reply.status(201).send({ data: partner });
  });

  // Update partner
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const body = updateChannelPartnerSchema.parse(request.body);
    const values: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.discountPct !== undefined) values.discountPct = String(body.discountPct);

    const [updated] = await app.db
      .update(channelPartners)
      .set(values)
      .where(eq(channelPartners.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('Channel partner not found');
    return { data: updated };
  });

  // Deactivate partner
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const [updated] = await app.db
      .update(channelPartners)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(channelPartners.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('Channel partner not found');
    return { data: updated };
  });
}
