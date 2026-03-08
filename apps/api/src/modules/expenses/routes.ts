import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import { expenses, expenseCategories, expenseClaims, expenseClaimLines, requisitions, requisitionLines } from '@xarra/db';
import { createExpenseSchema, createExpenseCategorySchema, createExpenseClaimSchema, createRequisitionSchema, paginationSchema } from '@xarra/shared';
import { VAT_RATE } from '@xarra/shared';
import { requireAuth, requireRole, requirePermission } from '../../middleware/require-auth.js';
import { createBroadcastNotification, createNotification } from '../../services/notifications.js';
import { requireIdempotencyKey, getIdempotencyKey } from '../../middleware/idempotency.js';
import { nextExpenseClaimNumber, nextRequisitionNumber } from '../finance/invoice-number.js';

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

  // Get single expense
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const expense = await app.db.query.expenses.findFirst({
      where: eq(expenses.id, request.params.id),
      with: { category: true },
    });
    if (!expense) return reply.notFound('Expense not found');
    return { data: expense };
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

  // ==========================================
  // EXPENSE CLAIMS
  // ==========================================

  // List expense claims
  app.get('/claims', { preHandler: requirePermission('expenseClaims', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${expenseClaims.number} ILIKE ${'%' + search + '%'}`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.expenseClaims.findMany({
        where: where ? () => where : undefined,
        with: { claimant: true, lines: true },
        orderBy: (ec, { desc: d }) => [d(ec.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(expenseClaims).where(where),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get single expense claim
  app.get<{ Params: { id: string } }>('/claims/:id', { preHandler: requirePermission('expenseClaims', 'read') }, async (request, reply) => {
    const claim = await app.db.query.expenseClaims.findFirst({
      where: eq(expenseClaims.id, request.params.id),
      with: { claimant: true, approvedByUser: true, lines: { with: { category: true } } },
    });
    if (!claim) return reply.notFound('Expense claim not found');
    return { data: claim };
  });

  // Create expense claim
  app.post('/claims', { preHandler: requirePermission('expenseClaims', 'create') }, async (request, reply) => {
    const body = createExpenseClaimSchema.parse(request.body);
    const userId = request.session?.user?.id;
    if (!userId) return reply.unauthorized('Authentication required');

    const number = await nextExpenseClaimNumber(app.db as any);

    // Calculate total from lines
    const totalAmount = body.lines.reduce((sum, l) => sum + l.amount, 0);

    const result = await app.db.transaction(async (tx) => {
      const [claim] = await tx.insert(expenseClaims).values({
        number,
        claimantId: userId,
        claimDate: new Date(body.claimDate),
        totalAmount: String(totalAmount),
        notes: body.notes,
      }).returning();

      const lines = await tx.insert(expenseClaimLines).values(
        body.lines.map((l) => ({
          claimId: claim.id,
          categoryId: l.categoryId,
          description: l.description,
          amount: String(l.amount),
          taxAmount: String(l.taxAmount ?? 0),
          receiptUrl: l.receiptUrl,
          expenseDate: new Date(l.expenseDate),
        }))
      ).returning();

      return { ...claim, lines };
    });

    return reply.status(201).send({ data: result });
  });

  // Submit expense claim (DRAFT → SUBMITTED)
  app.post<{ Params: { id: string } }>('/claims/:id/submit', { preHandler: requirePermission('expenseClaims', 'update') }, async (request, reply) => {
    const claim = await app.db.query.expenseClaims.findFirst({ where: eq(expenseClaims.id, request.params.id) });
    if (!claim) return reply.notFound('Expense claim not found');
    if (claim.status !== 'DRAFT') return reply.badRequest('Only DRAFT claims can be submitted');

    const [updated] = await app.db.update(expenseClaims).set({ status: 'SUBMITTED', updatedAt: new Date() }).where(eq(expenseClaims.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: 'EXPENSE_CLAIM_SUBMITTED',
      title: 'Expense claim submitted for approval',
      message: `Claim ${updated.number} submitted — R ${Number(updated.totalAmount).toFixed(2)}`,
      actionUrl: `/expenses/claims/${updated.id}`,
      referenceType: 'EXPENSE_CLAIM',
      referenceId: updated.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create expense notification'));

    return { data: updated };
  });

  // Approve expense claim
  app.post<{ Params: { id: string } }>('/claims/:id/approve', { preHandler: requirePermission('expenseClaims', 'approve') }, async (request, reply) => {
    const claim = await app.db.query.expenseClaims.findFirst({ where: eq(expenseClaims.id, request.params.id) });
    if (!claim) return reply.notFound('Expense claim not found');
    if (claim.status !== 'SUBMITTED') return reply.badRequest('Only SUBMITTED claims can be approved');

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(expenseClaims).set({
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(expenseClaims.id, request.params.id)).returning();

    if (updated.claimantId) {
      createNotification(app, {
        type: 'EXPENSE_CLAIM_APPROVED',
        title: 'Your expense claim was approved',
        message: `Claim ${updated.number} has been approved`,
        userId: updated.claimantId,
        actionUrl: `/expenses/claims/${updated.id}`,
        referenceType: 'EXPENSE_CLAIM',
        referenceId: updated.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create approval notification'));
    }

    return { data: updated };
  });

  // Reject expense claim
  app.post<{ Params: { id: string } }>('/claims/:id/reject', { preHandler: requirePermission('expenseClaims', 'approve') }, async (request, reply) => {
    const claim = await app.db.query.expenseClaims.findFirst({ where: eq(expenseClaims.id, request.params.id) });
    if (!claim) return reply.notFound('Expense claim not found');
    if (claim.status !== 'SUBMITTED') return reply.badRequest('Only SUBMITTED claims can be rejected');

    const { reason } = request.body as { reason: string };
    if (!reason) return reply.badRequest('Rejection reason is required');

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(expenseClaims).set({
      status: 'REJECTED',
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    }).where(eq(expenseClaims.id, request.params.id)).returning();

    if (updated.claimantId) {
      createNotification(app, {
        type: 'EXPENSE_CLAIM_REJECTED',
        title: 'Your expense claim was rejected',
        message: `Claim ${updated.number} was rejected: ${reason}`,
        userId: updated.claimantId,
        actionUrl: `/expenses/claims/${updated.id}`,
        referenceType: 'EXPENSE_CLAIM',
        referenceId: updated.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create rejection notification'));
    }

    return { data: updated };
  });

  // Mark expense claim as paid
  app.post<{ Params: { id: string } }>('/claims/:id/mark-paid', { preHandler: requirePermission('expenseClaims', 'approve') }, async (request, reply) => {
    const claim = await app.db.query.expenseClaims.findFirst({ where: eq(expenseClaims.id, request.params.id) });
    if (!claim) return reply.notFound('Expense claim not found');
    if (claim.status !== 'APPROVED') return reply.badRequest('Only APPROVED claims can be marked as paid');

    const { reference } = request.body as { reference?: string };
    const [updated] = await app.db.update(expenseClaims).set({
      status: 'PAID',
      paidAt: new Date(),
      paidReference: reference,
      updatedAt: new Date(),
    }).where(eq(expenseClaims.id, request.params.id)).returning();

    // Notify the claimant that their claim has been paid
    if (claim.claimantId) {
      createNotification(app, {
        type: 'EXPENSE_CLAIM_PAID',
        priority: 'NORMAL',
        title: `Expense claim ${claim.number} paid`,
        message: `R ${Number(claim.totalAmount).toFixed(2)}${reference ? ` — ref: ${reference}` : ''}`,
        userId: claim.claimantId,
        actionUrl: `/expenses/claims/${claim.id}`,
        referenceType: 'EXPENSE_CLAIM',
        referenceId: claim.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create expense paid notification'));
    }

    return { data: updated };
  });

  // ==========================================
  // REQUISITIONS
  // ==========================================

  // List requisitions
  app.get('/requisitions', { preHandler: requirePermission('requisitions', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${requisitions.number} ILIKE ${'%' + search + '%'} OR ${requisitions.department} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.requisitions.findMany({
        where: where ? () => where : undefined,
        with: { requester: true, lines: true },
        orderBy: (r, { desc: d }) => [d(r.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(requisitions).where(where),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get single requisition
  app.get<{ Params: { id: string } }>('/requisitions/:id', { preHandler: requirePermission('requisitions', 'read') }, async (request, reply) => {
    const req = await app.db.query.requisitions.findFirst({
      where: eq(requisitions.id, request.params.id),
      with: { requester: true, approvedByUser: true, lines: true },
    });
    if (!req) return reply.notFound('Requisition not found');
    return { data: req };
  });

  // Create requisition
  app.post('/requisitions', { preHandler: requirePermission('requisitions', 'create') }, async (request, reply) => {
    const body = createRequisitionSchema.parse(request.body);
    const userId = request.session?.user?.id;
    if (!userId) return reply.unauthorized('Authentication required');

    const number = await nextRequisitionNumber(app.db as any);

    const totalEstimate = body.lines.reduce((sum, l) => sum + (l.quantity * l.estimatedUnitPrice), 0);

    const result = await app.db.transaction(async (tx) => {
      const [req] = await tx.insert(requisitions).values({
        number,
        requestedBy: userId,
        department: body.department,
        requiredByDate: body.requiredByDate ? new Date(body.requiredByDate) : undefined,
        totalEstimate: String(totalEstimate),
        notes: body.notes,
      }).returning();

      const lines = await tx.insert(requisitionLines).values(
        body.lines.map((l) => ({
          requisitionId: req.id,
          description: l.description,
          quantity: String(l.quantity),
          estimatedUnitPrice: String(l.estimatedUnitPrice),
          estimatedTotal: String(l.quantity * l.estimatedUnitPrice),
          notes: l.notes,
        }))
      ).returning();

      return { ...req, lines };
    });

    return reply.status(201).send({ data: result });
  });

  // Submit requisition (DRAFT → SUBMITTED)
  app.post<{ Params: { id: string } }>('/requisitions/:id/submit', { preHandler: requirePermission('requisitions', 'update') }, async (request, reply) => {
    const req = await app.db.query.requisitions.findFirst({ where: eq(requisitions.id, request.params.id) });
    if (!req) return reply.notFound('Requisition not found');
    if (req.status !== 'DRAFT') return reply.badRequest('Only DRAFT requisitions can be submitted');

    const [updated] = await app.db.update(requisitions).set({ status: 'SUBMITTED', updatedAt: new Date() }).where(eq(requisitions.id, request.params.id)).returning();

    createBroadcastNotification(app, {
      type: 'REQUISITION_SUBMITTED',
      title: 'Requisition submitted for approval',
      message: `Requisition ${updated.number} submitted — estimated R ${Number(updated.totalEstimate).toFixed(2)}`,
      actionUrl: `/procurement/requisitions/${updated.id}`,
      referenceType: 'REQUISITION',
      referenceId: updated.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create requisition notification'));

    return { data: updated };
  });

  // Approve requisition
  app.post<{ Params: { id: string } }>('/requisitions/:id/approve', { preHandler: requirePermission('requisitions', 'approve') }, async (request, reply) => {
    const req = await app.db.query.requisitions.findFirst({ where: eq(requisitions.id, request.params.id) });
    if (!req) return reply.notFound('Requisition not found');
    if (req.status !== 'SUBMITTED') return reply.badRequest('Only SUBMITTED requisitions can be approved');

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(requisitions).set({
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(requisitions.id, request.params.id)).returning();

    if (updated.requestedBy) {
      createNotification(app, {
        type: 'REQUISITION_APPROVED',
        title: 'Your requisition was approved',
        message: `Requisition ${updated.number} has been approved`,
        userId: updated.requestedBy,
        actionUrl: `/procurement/requisitions/${updated.id}`,
        referenceType: 'REQUISITION',
        referenceId: updated.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create requisition approval notification'));
    }

    return { data: updated };
  });

  // Reject requisition
  app.post<{ Params: { id: string } }>('/requisitions/:id/reject', { preHandler: requirePermission('requisitions', 'approve') }, async (request, reply) => {
    const req = await app.db.query.requisitions.findFirst({ where: eq(requisitions.id, request.params.id) });
    if (!req) return reply.notFound('Requisition not found');
    if (req.status !== 'SUBMITTED') return reply.badRequest('Only SUBMITTED requisitions can be rejected');

    const { reason } = request.body as { reason: string };
    if (!reason) return reply.badRequest('Rejection reason is required');

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(requisitions).set({
      status: 'REJECTED',
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    }).where(eq(requisitions.id, request.params.id)).returning();
    return { data: updated };
  });

  // Convert requisition to purchase order
  app.post<{ Params: { id: string } }>('/requisitions/:id/convert-to-po', { preHandler: requirePermission('requisitions', 'approve') }, async (request, reply) => {
    const req = await app.db.query.requisitions.findFirst({
      where: eq(requisitions.id, request.params.id),
      with: { lines: true },
    });
    if (!req) return reply.notFound('Requisition not found');
    if (req.status !== 'APPROVED') return reply.badRequest('Only APPROVED requisitions can be converted to PO');

    // Import purchase order tables and number generator dynamically
    const { purchaseOrders, purchaseOrderLines } = await import('@xarra/db');
    const { nextPurchaseOrderNumber } = await import('../finance/invoice-number.js');

    const poNumber = await nextPurchaseOrderNumber(app.db as any);
    const userId = request.session?.user?.id;

    // Create PO from requisition
    const result = await app.db.transaction(async (tx) => {
      const [po] = await tx.insert(purchaseOrders).values({
        number: poNumber,
        orderDate: new Date(),
        subtotal: req.totalEstimate,
        vatAmount: '0',
        total: req.totalEstimate,
        notes: `Converted from requisition ${req.number}`,
        createdBy: userId,
      }).returning();

      if (req.lines.length > 0) {
        await tx.insert(purchaseOrderLines).values(
          req.lines.map((l, i) => ({
            purchaseOrderId: po.id,
            lineNumber: i + 1,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.estimatedUnitPrice,
            lineTotal: l.estimatedTotal,
          }))
        );
      }

      // Mark requisition as ORDERED
      await tx.update(requisitions).set({
        status: 'ORDERED',
        convertedPurchaseOrderId: po.id,
        updatedAt: new Date(),
      }).where(eq(requisitions.id, request.params.id));

      return po;
    });

    return reply.status(201).send({ data: result });
  });
}
