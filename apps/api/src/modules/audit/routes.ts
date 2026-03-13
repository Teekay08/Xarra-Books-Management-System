import type { FastifyInstance } from 'fastify';
import { eq, sql, desc, and, gte, lte } from 'drizzle-orm';
import { auditLogs, deletionRequests, users } from '@xarra/db';
import { requirePermission } from '../../middleware/require-auth.js';
import { logAudit } from '../../middleware/audit.js';
import { paginationSchema, DELETION_REQUEST_EXPIRY_HOURS } from '@xarra/shared';
import { z } from 'zod';

export async function auditRoutes(app: FastifyInstance) {
  // ==========================================
  // AUDIT LOGS
  // ==========================================

  // List audit logs (admin + finance only)
  app.get('/logs', { preHandler: requirePermission('auditLogs', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const params = request.query as Record<string, string>;
    const entityType = params.entityType;
    const action = params.action;
    const userId = params.userId;
    const from = params.from;
    const to = params.to;

    const conditions = [];
    if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
    if (action) conditions.push(eq(auditLogs.action, action as any));
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (from) conditions.push(gte(auditLogs.createdAt, new Date(from)));
    if (to) conditions.push(lte(auditLogs.createdAt, new Date(to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      app.db
        .select({
          id: auditLogs.id,
          userId: auditLogs.userId,
          userName: users.name,
          userEmail: users.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          changes: auditLogs.changes,
          ipAddress: auditLogs.ipAddress,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset),
      app.db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
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

  // ==========================================
  // DELETION REQUESTS
  // ==========================================

  // List deletion requests (admin only)
  app.get('/deletion-requests', { preHandler: requirePermission('deletionRequests', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const params = request.query as Record<string, string>;
    const status = params.status;

    const where = status ? eq(deletionRequests.status, status as any) : undefined;

    const items = await app.db
      .select({
        id: deletionRequests.id,
        requestedBy: deletionRequests.requestedBy,
        requesterName: sql<string>`requester.name`,
        approvedBy: deletionRequests.approvedBy,
        approverName: sql<string>`approver.name`,
        rejectedBy: deletionRequests.rejectedBy,
        entityType: deletionRequests.entityType,
        entityId: deletionRequests.entityId,
        entitySnapshot: deletionRequests.entitySnapshot,
        reason: deletionRequests.reason,
        status: deletionRequests.status,
        rejectionReason: deletionRequests.rejectionReason,
        expiresAt: deletionRequests.expiresAt,
        createdAt: deletionRequests.createdAt,
      })
      .from(deletionRequests)
      .leftJoin(
        sql`${users} as requester`,
        sql`requester.id = ${deletionRequests.requestedBy}`,
      )
      .leftJoin(
        sql`${users} as approver`,
        sql`approver.id = ${deletionRequests.approvedBy}`,
      )
      .where(where)
      .orderBy(desc(deletionRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(deletionRequests)
      .where(where);

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

  // Create deletion request (admin only)
  const createDeletionSchema = z.object({
    entityType: z.string().min(1),
    entityId: z.string().uuid(),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
  });

  app.post('/deletion-requests', { preHandler: requirePermission('deletionRequests', 'create') }, async (request, reply) => {
    const body = createDeletionSchema.parse(request.body);
    const userId = request.session!.user!.id;

    // Fetch entity snapshot based on type
    let entitySnapshot: Record<string, unknown> = {};
    try {
      const tableName = body.entityType.replace(/-/g, '_');
      const result = await app.db.execute(
        sql`SELECT * FROM ${sql.identifier(tableName)} WHERE id = ${body.entityId}`,
      ) as unknown as Record<string, unknown>[];
      if (result && result.length > 0) {
        entitySnapshot = result[0] as Record<string, unknown>;
      } else {
        return reply.status(404).send({ error: 'Entity not found' });
      }
    } catch {
      return reply.status(400).send({ error: `Invalid entity type: ${body.entityType}` });
    }

    const expiresAt = new Date(Date.now() + DELETION_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000);

    const [request_] = await app.db.insert(deletionRequests).values({
      requestedBy: userId,
      entityType: body.entityType,
      entityId: body.entityId,
      entitySnapshot,
      reason: body.reason,
      expiresAt,
    }).returning();

    await logAudit(app, request, {
      action: 'CREATE',
      entityType: 'deletion_requests',
      entityId: request_.id,
      changes: { after: request_ as unknown as Record<string, unknown> },
    });

    return reply.status(201).send(request_);
  });

  // Approve deletion request (admin only, different admin)
  app.post<{ Params: { id: string } }>('/deletion-requests/:id/approve', { preHandler: requirePermission('deletionRequests', 'approve') }, async (request, reply) => {
    const userId = request.session!.user!.id;
    const { id } = request.params;

    const dr = await app.db.query.deletionRequests.findFirst({
      where: eq(deletionRequests.id, id),
    });

    if (!dr) return reply.status(404).send({ error: 'Deletion request not found' });
    if (dr.status !== 'PENDING') return reply.status(400).send({ error: `Request is already ${dr.status}` });
    if (new Date(dr.expiresAt) < new Date()) {
      await app.db.update(deletionRequests).set({ status: 'EXPIRED', updatedAt: new Date() }).where(eq(deletionRequests.id, id));
      return reply.status(400).send({ error: 'Deletion request has expired' });
    }
    if (dr.requestedBy === userId) {
      return reply.status(403).send({ error: 'You cannot approve your own deletion request. A different admin must approve.' });
    }

    // Execute the actual deletion
    try {
      const tableName = dr.entityType.replace(/-/g, '_');
      await app.db.execute(
        sql`DELETE FROM ${sql.identifier(tableName)} WHERE id = ${dr.entityId}`,
      );
    } catch (err: any) {
      return reply.status(500).send({ error: `Deletion failed: ${err.message}` });
    }

    // Mark as approved
    const [updated] = await app.db.update(deletionRequests).set({
      status: 'APPROVED',
      approvedBy: userId,
      updatedAt: new Date(),
    }).where(eq(deletionRequests.id, id)).returning();

    await logAudit(app, request, {
      action: 'DELETE',
      entityType: dr.entityType,
      entityId: dr.entityId,
      changes: { before: dr.entitySnapshot as Record<string, unknown> },
      metadata: { deletionRequestId: id, reason: dr.reason, approvedBy: userId },
    });

    return updated;
  });

  // Reject deletion request
  const rejectSchema = z.object({
    reason: z.string().min(1, 'Rejection reason is required'),
  });

  app.post<{ Params: { id: string } }>('/deletion-requests/:id/reject', { preHandler: requirePermission('deletionRequests', 'approve') }, async (request, reply) => {
    const userId = request.session!.user!.id;
    const { id } = request.params;
    const body = rejectSchema.parse(request.body);

    const dr = await app.db.query.deletionRequests.findFirst({
      where: eq(deletionRequests.id, id),
    });

    if (!dr) return reply.status(404).send({ error: 'Deletion request not found' });
    if (dr.status !== 'PENDING') return reply.status(400).send({ error: `Request is already ${dr.status}` });

    const [updated] = await app.db.update(deletionRequests).set({
      status: 'REJECTED',
      rejectedBy: userId,
      rejectionReason: body.reason,
      updatedAt: new Date(),
    }).where(eq(deletionRequests.id, id)).returning();

    await logAudit(app, request, {
      action: 'REJECT',
      entityType: 'deletion_requests',
      entityId: id,
      metadata: { reason: body.reason },
    });

    return updated;
  });
}
