import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { auditLogs } from '@xarra/db';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'VOID' | 'APPROVE' | 'REJECT'
  | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'PDF_GENERATE' | 'STATUS_CHANGE';

interface AuditLogEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. Call this from route handlers after mutations.
 */
export async function logAudit(
  app: FastifyInstance,
  request: FastifyRequest,
  entry: AuditLogEntry,
) {
  const userId = request.session?.user?.id;
  if (!userId) return; // skip if no authenticated user

  try {
    await app.db.insert(auditLogs).values({
      userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes: entry.changes,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      metadata: entry.metadata,
    });
  } catch (err) {
    // Audit logging should never break the request — log and continue
    app.log.error({ err, entry }, 'Failed to write audit log');
  }
}

/**
 * Fastify plugin that auto-logs mutating requests (POST/PUT/PATCH/DELETE).
 * Attach to the app for blanket coverage. Individual routes can add
 * more specific audit entries via logAudit().
 */
export function auditPlugin(app: FastifyInstance) {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only log successful mutations from authenticated users
    const method = request.method;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    if (!request.session?.user?.id) return;
    if (reply.statusCode >= 400) return;

    // Skip auth endpoints and health checks
    const url = request.url;
    if (url.includes('/api/auth/') || url === '/health') return;

    // Derive action from HTTP method
    let action: AuditAction = 'CREATE';
    if (method === 'PUT' || method === 'PATCH') action = 'UPDATE';
    if (method === 'DELETE') action = 'DELETE';

    // Derive entity type from URL path
    const segments = url.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
    const entityType = segments[0] ?? 'unknown';

    // Entity ID is typically the second segment if it looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const entityId = segments.find((s) => uuidRegex.test(s));

    try {
      await app.db.insert(auditLogs).values({
        userId: request.session.user.id,
        action,
        entityType,
        entityId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
        metadata: { method, url, statusCode: reply.statusCode },
      });
    } catch (err) {
      app.log.error({ err }, 'Auto audit log failed');
    }
  });
}
