import type { FastifyInstance } from 'fastify';
import { eq, sql, desc, ilike, and } from 'drizzle-orm';
import { suppliers } from '@xarra/db';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

export async function supplierRoutes(app: FastifyInstance) {
  // List suppliers (with search support)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = request.query as { search?: string; limit?: string; page?: string };
    const limit = Math.min(Number(query.limit) || 100, 500);
    const page = Number(query.page) || 1;
    const offset = (page - 1) * limit;

    const where = query.search
      ? ilike(suppliers.name, `%${query.search}%`)
      : eq(suppliers.isActive, true);

    const [items, countResult] = await Promise.all([
      app.db.query.suppliers.findMany({
        where,
        orderBy: [desc(suppliers.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(suppliers).where(where),
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

  // Get single supplier
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const supplier = await app.db.query.suppliers.findFirst({
      where: eq(suppliers.id, request.params.id),
    });
    if (!supplier) return reply.notFound('Supplier not found');
    return { data: supplier };
  });

  // Create supplier (inline quick-create from dropdown)
  app.post('/', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const body = request.body as {
      name: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      addressLine1?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      vatNumber?: string;
      notes?: string;
    };

    if (!body.name?.trim()) {
      return reply.badRequest('Supplier name is required');
    }

    const [supplier] = await app.db.insert(suppliers).values({
      name: body.name.trim(),
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      addressLine1: body.addressLine1,
      city: body.city,
      province: body.province,
      postalCode: body.postalCode,
      vatNumber: body.vatNumber,
      notes: body.notes,
    }).returning();

    return reply.status(201).send({ data: supplier });
  });

  // Update supplier
  app.patch<{ Params: { id: string } }>('/:id', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const body = request.body as Partial<{
      name: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      addressLine1: string;
      addressLine2: string;
      city: string;
      province: string;
      postalCode: string;
      vatNumber: string;
      notes: string;
      isActive: boolean;
    }>;

    const [updated] = await app.db.update(suppliers).set({
      ...body,
      updatedAt: new Date(),
    }).where(eq(suppliers.id, request.params.id)).returning();

    if (!updated) return reply.notFound('Supplier not found');
    return { data: updated };
  });
}
