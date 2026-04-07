import type { FastifyInstance } from 'fastify';
import { eq, and, or, isNull, sql, desc, inArray } from 'drizzle-orm';
import { notifications } from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireAuth } from '../../middleware/require-auth.js';

// Map roles to the notification types they should see for broadcast (userId=NULL) notifications.
// Targeted notifications (userId set) always go to the specific user regardless.
const ROLE_NOTIFICATION_TYPES: Record<string, string[]> = {
  admin: [], // admin sees ALL notifications
  finance: [
    'INVOICE_OVERDUE', 'INVOICE_PAID', 'INVOICE_ISSUED', 'INVOICE_VOIDED',
    'PAYMENT_RECEIVED', 'REMITTANCE_MATCHED', 'CREDIT_NOTE_CREATED', 'DEBIT_NOTE_CREATED',
    'EXPENSE_CLAIM_SUBMITTED', 'EXPENSE_CLAIM_APPROVED', 'EXPENSE_CLAIM_REJECTED', 'EXPENSE_CLAIM_PAID',
    'REQUISITION_SUBMITTED', 'REQUISITION_APPROVED',
    'QUOTATION_EXPIRED', 'QUOTATION_CONVERTED', 'CASH_SALE_CREATED',
    'PURCHASE_ORDER_ISSUED', 'PURCHASE_ORDER_RECEIVED', 'PURCHASE_ORDER_CANCELLED',
    'PROJECT_BUDGET_APPROVED', 'PROJECT_OVER_BUDGET',
    'SUSPENSE_CONFIRMED', 'SUSPENSE_REFUND_DUE', 'SUSPENSE_DAILY_SUMMARY',
    'CASHFLOW_RISK_CHANGE', 'SYSTEM',
  ],
  projectmanager: [
    'PROJECT_CREATED', 'PROJECT_BUDGET_APPROVED', 'PROJECT_OVER_BUDGET',
    'TIMESHEET_SUBMITTED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED',
    'SOW_SENT', 'SOW_ACCEPTED',
    'CONSIGNMENT_DISPATCHED', 'CONSIGNMENT_EXPIRING',
    'TASK_ASSIGNED', 'TASK_STARTED', 'TASK_REVIEW_REQUESTED', 'TASK_COMPLETED', 'TASK_SENT_BACK',
    'TASK_REQUEST_SUBMITTED', 'EXTENSION_REQUESTED',
    'SYSTEM',
  ],
  staff: [
    // Staff only see targeted notifications (userId set) — no broadcasts
    'SYSTEM',
  ],
  author: [
    // Authors only see targeted notifications — no broadcasts
    'SYSTEM',
  ],
};

function canonicalRole(role: string): string {
  const map: Record<string, string> = {
    admin: 'admin', finance: 'finance',
    project_manager: 'projectmanager', projectmanager: 'projectmanager',
    staff: 'staff', author: 'author',
    operations: 'projectmanager', editorial: 'staff',
    reports_only: 'staff', reportsonly: 'staff',
  };
  return map[role.toLowerCase().replace(/_/g, '')] ?? map[role.toLowerCase()] ?? 'staff';
}

function buildNotificationFilter(userId: string, userRole: string) {
  const role = canonicalRole(userRole);
  const allowedTypes = ROLE_NOTIFICATION_TYPES[role];

  if (role === 'admin' || !allowedTypes) {
    // Admin sees everything: own + all broadcasts
    return or(eq(notifications.userId, userId), isNull(notifications.userId));
  }

  // Other roles: own targeted notifications + filtered broadcast types
  if (allowedTypes.length === 0) {
    // Only targeted notifications
    return eq(notifications.userId, userId);
  }

  return or(
    eq(notifications.userId, userId),
    and(isNull(notifications.userId), inArray(notifications.type, allowedTypes as any)),
  );
}

export async function notificationRoutes(app: FastifyInstance) {
  // Get unread count
  app.get('/count', { preHandler: requireAuth }, async (request) => {
    const userId = request.session!.user.id;
    const userRole = (request.session!.user as any).role || 'staff';
    const roleFilter = buildNotificationFilter(userId, userRole);

    const result = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(roleFilter, eq(notifications.isRead, false)));

    return { data: { unread: Number(result[0].count) } };
  });

  // List notifications (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const userId = request.session!.user.id;
    const userRole = (request.session!.user as any).role || 'staff';
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const filter = (request.query as any).filter as string | undefined;
    const roleFilter = buildNotificationFilter(userId, userRole);

    const where = filter === 'unread'
      ? and(roleFilter, eq(notifications.isRead, false))
      : roleFilter;

    const [items, countResult] = await Promise.all([
      app.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
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

  // Mark single notification as read
  app.patch<{ Params: { id: string } }>(
    '/:id/read',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.session!.user.id;
      const userRole = (request.session!.user as any).role || 'staff';
      const roleFilter = buildNotificationFilter(userId, userRole);

      const [updated] = await app.db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.id, request.params.id), roleFilter))
        .returning();

      if (!updated) return reply.notFound('Notification not found');
      return { data: updated };
    },
  );

  // Mark all notifications as read
  app.post('/read-all', { preHandler: requireAuth }, async (request) => {
    const userId = request.session!.user.id;
    const userRole = (request.session!.user as any).role || 'staff';
    const roleFilter = buildNotificationFilter(userId, userRole);

    await app.db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(roleFilter, eq(notifications.isRead, false)));

    return { data: { success: true } };
  });

  // Delete a notification
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.session!.user.id;
      const userRole = (request.session!.user as any).role || 'staff';
      const roleFilter = buildNotificationFilter(userId, userRole);

      const [deleted] = await app.db
        .delete(notifications)
        .where(and(eq(notifications.id, request.params.id), roleFilter))
        .returning();

      if (!deleted) return reply.notFound('Notification not found');
      return { data: { success: true } };
    },
  );
}
