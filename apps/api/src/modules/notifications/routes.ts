import type { FastifyInstance } from 'fastify';
import { eq, and, or, isNull, sql, desc } from 'drizzle-orm';
import { notifications } from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireAuth } from '../../middleware/require-auth.js';

export async function notificationRoutes(app: FastifyInstance) {
  // Get unread count
  app.get('/count', { preHandler: requireAuth }, async (request) => {
    const userId = request.session!.user.id;

    const result = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          or(eq(notifications.userId, userId), isNull(notifications.userId)),
          eq(notifications.isRead, false),
        ),
      );

    return { data: { unread: Number(result[0].count) } };
  });

  // List notifications (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const userId = request.session!.user.id;
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const filter = (request.query as any).filter as string | undefined; // 'unread' | 'all'

    const baseWhere = or(eq(notifications.userId, userId), isNull(notifications.userId));
    const where = filter === 'unread'
      ? and(baseWhere, eq(notifications.isRead, false))
      : baseWhere;

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

      const [updated] = await app.db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.id, request.params.id),
            or(eq(notifications.userId, userId), isNull(notifications.userId)),
          ),
        )
        .returning();

      if (!updated) return reply.notFound('Notification not found');
      return { data: updated };
    },
  );

  // Mark all notifications as read
  app.post('/read-all', { preHandler: requireAuth }, async (request) => {
    const userId = request.session!.user.id;

    const result = await app.db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          or(eq(notifications.userId, userId), isNull(notifications.userId)),
          eq(notifications.isRead, false),
        ),
      );

    return { data: { success: true } };
  });

  // Delete a notification
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.session!.user.id;

      const [deleted] = await app.db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, request.params.id),
            or(eq(notifications.userId, userId), isNull(notifications.userId)),
          ),
        )
        .returning();

      if (!deleted) return reply.notFound('Notification not found');
      return { data: { success: true } };
    },
  );
}
