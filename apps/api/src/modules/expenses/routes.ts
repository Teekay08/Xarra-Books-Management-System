import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import { expenses, expenseCategories } from '@xarra/db';
import { createExpenseSchema, createExpenseCategorySchema, paginationSchema } from '@xarra/shared';
import { VAT_RATE } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { requireIdempotencyKey, getIdempotencyKey } from '../../middleware/idempotency.js';

export async function expenseRoutes(app: FastifyInstance) {
  // ==========================================
  // EXPENSE CATEGORIES
  // ==========================================

  app.get('/categories', { preHandler: requireAuth }, async () => {
    const data = await app.db.query.expenseCategories.findMany({
      orderBy: (c, { asc }) => [asc(c.name)],
    });
    return { data };
  });

  app.post('/categories', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = createExpenseCategorySchema.parse(request.body);
    const [cat] = await app.db.insert(expenseCategories).values(body).returning();
    return reply.status(201).send({ data: cat });
  });

  app.patch<{ Params: { id: string } }>('/categories/:id', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = createExpenseCategorySchema.partial().parse(request.body);
    const [updated] = await app.db.update(expenseCategories)
      .set(body)
      .where(eq(expenseCategories.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Category not found');
    return { data: updated };
  });

  // ==========================================
  // EXPENSES
  // ==========================================

  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${expenses.description} ILIKE ${'%' + search + '%'}`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.expenses.findMany({
        where: where ? () => where : undefined,
        with: { category: true },
        orderBy: (e, { desc }) => [desc(e.expenseDate)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(expenses).where(where),
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

  app.post('/', {
    preHandler: [requireRole('admin', 'finance'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createExpenseSchema.parse(request.body);
    const idempotencyKey = getIdempotencyKey(request)!;
    const userId = request.session?.user?.id;

    const existing = await app.db.query.expenses.findFirst({
      where: eq(expenses.idempotencyKey, idempotencyKey),
    });
    if (existing) return { data: existing };

    // Calculate tax if tax-inclusive
    let taxAmount = body.taxAmount ?? 0;
    if (body.taxInclusive && taxAmount === 0) {
      taxAmount = body.amount - (body.amount / (1 + VAT_RATE));
    }

    const [expense] = await app.db.insert(expenses).values({
      categoryId: body.categoryId,
      description: body.description,
      amount: String(body.amount),
      taxAmount: String(taxAmount),
      taxInclusive: body.taxInclusive,
      expenseDate: new Date(body.expenseDate),
      paymentMethod: body.paymentMethod,
      reference: body.reference,
      notes: body.notes,
      createdBy: userId,
      idempotencyKey,
    }).returning();

    return reply.status(201).send({ data: expense });
  });

  // Get expense totals by category (for dashboard pie chart)
  app.get('/by-category', { preHandler: requireAuth }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };

    let dateFilter = sql`1=1`;
    if (from) dateFilter = sql`${expenses.expenseDate} >= ${new Date(from)}`;
    if (to) dateFilter = sql`${dateFilter} AND ${expenses.expenseDate} <= ${new Date(to)}`;

    const result = await app.db.execute<{ categoryName: string; total: string }>(sql`
      SELECT ec.name AS "categoryName", COALESCE(SUM(e.amount::numeric), 0) AS total
      FROM expense_categories ec
      LEFT JOIN expenses e ON e.category_id = ec.id AND ${dateFilter}
      GROUP BY ec.id, ec.name
      HAVING COALESCE(SUM(e.amount::numeric), 0) > 0
      ORDER BY total DESC
    `);

    return { data: result };
  });
}
