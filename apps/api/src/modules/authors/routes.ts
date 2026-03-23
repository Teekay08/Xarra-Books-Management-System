import type { FastifyInstance } from 'fastify';
import { eq, sql, desc, asc, and } from 'drizzle-orm';
import { authors, authorContracts, contractTemplates, user as authUsers } from '@xarra/db';
import { createAuthorSchema, updateAuthorSchema, createAuthorContractSchema, paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

export async function authorRoutes(app: FastifyInstance) {
  // ==================== Contract Templates ====================

  // List contract templates (optionally filter by authorType)
  app.get('/contract-templates', { preHandler: requireAuth }, async (request) => {
    const { authorType, activeOnly } = request.query as { authorType?: string; activeOnly?: string };

    const conditions = [];
    if (authorType) conditions.push(eq(contractTemplates.authorType, authorType as 'HYBRID' | 'TRADITIONAL'));
    if (activeOnly === 'true') conditions.push(eq(contractTemplates.isActive, true));

    const items = await app.db.query.contractTemplates.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(contractTemplates.updatedAt)],
    });

    return { data: items };
  });

  // Get single contract template
  app.get<{ Params: { templateId: string } }>('/contract-templates/:templateId', { preHandler: requireAuth }, async (request, reply) => {
    const template = await app.db.query.contractTemplates.findFirst({
      where: eq(contractTemplates.id, request.params.templateId),
    });
    if (!template) return reply.notFound('Contract template not found');
    return { data: template };
  });

  // Create contract template (admin only)
  app.post('/contract-templates', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      name: string;
      authorType: 'HYBRID' | 'TRADITIONAL';
      content: string;
      version?: string;
    };
    const userId = request.session?.user?.id;

    const [template] = await app.db.insert(contractTemplates).values({
      name: body.name,
      authorType: body.authorType,
      content: body.content,
      version: body.version || '1.0',
      createdBy: userId,
      updatedBy: userId,
    }).returning();

    return reply.status(201).send({ data: template });
  });

  // Update contract template (admin only)
  app.patch<{ Params: { templateId: string } }>('/contract-templates/:templateId', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body as {
      name?: string;
      content?: string;
      version?: string;
      isActive?: boolean;
    };
    const userId = request.session?.user?.id;

    const [updated] = await app.db
      .update(contractTemplates)
      .set({
        ...body,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(contractTemplates.id, request.params.templateId))
      .returning();

    if (!updated) return reply.notFound('Contract template not found');
    return { data: updated };
  });

  // Delete/deactivate contract template (admin only)
  app.delete<{ Params: { templateId: string } }>('/contract-templates/:templateId', { preHandler: requireRole('admin') }, async (request, reply) => {
    const [updated] = await app.db
      .update(contractTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(contractTemplates.id, request.params.templateId))
      .returning();

    if (!updated) return reply.notFound('Contract template not found');
    return { data: updated };
  });
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

    // Include portal user email if linked
    let portalUser: { email: string; updatedAt: Date | null } | null = null;
    if (author.portalUserId) {
      const [u] = await app.db
        .select({ email: authUsers.email, updatedAt: authUsers.updatedAt })
        .from(authUsers)
        .where(eq(authUsers.id, author.portalUserId))
        .limit(1);
      portalUser = u ?? null;
    }

    return { data: { ...author, portalUser } };
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
    const { contractTemplateId } = request.body as { contractTemplateId?: string };

    // If a template is linked, snapshot its content
    let contractTermsSnapshot: string | undefined;
    if (contractTemplateId) {
      const template = await app.db.query.contractTemplates.findFirst({
        where: eq(contractTemplates.id, contractTemplateId),
      });
      if (template) {
        contractTermsSnapshot = template.content;
      }
    }

    const [contract] = await app.db.insert(authorContracts).values({
      ...body,
      authorId: request.params.id,
      contractTemplateId: contractTemplateId || undefined,
      contractTermsSnapshot,
      royaltyRatePrint: String(body.royaltyRatePrint),
      royaltyRateEbook: String(body.royaltyRateEbook),
      advanceAmount: String(body.advanceAmount),
      triggerValue: body.triggerValue ? String(body.triggerValue) : undefined,
      minimumPayment: body.minimumPayment != null ? String(body.minimumPayment) : undefined,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    }).returning();
    return reply.status(201).send({ data: contract });
  });

  // === Portal Access Provisioning ===

  // Create portal user for an author (admin only)
  app.post<{ Params: { id: string } }>('/:id/portal-access', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { email, name, password } = request.body as { email: string; name: string; password: string };

    const author = await app.db.query.authors.findFirst({
      where: eq(authors.id, request.params.id),
    });
    if (!author) return reply.notFound('Author not found');
    if (author.portalUserId) return reply.badRequest('Author already has portal access');

    // Create user via Better Auth sign-up
    const origin = process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3002}`;
    const response = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ email, name, password }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsed: any;
      try { parsed = JSON.parse(errText); } catch { parsed = null; }
      if (parsed?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
        return reply.badRequest('A user with this email already exists. Use a different email address.');
      }
      return reply.badRequest(`Failed to create portal user: ${errText}`);
    }

    const { user: newUser } = await response.json() as { user: { id: string } };

    // Set user role to AUTHOR in Better Auth user table
    await app.db
      .update(authUsers)
      .set({ role: 'author', updatedAt: new Date() })
      .where(eq(authUsers.id, newUser.id));

    // Link portal user to author
    const [updated] = await app.db
      .update(authors)
      .set({ portalUserId: newUser.id, updatedAt: new Date() })
      .where(eq(authors.id, request.params.id))
      .returning();

    return reply.status(201).send({ data: updated });
  });
}
