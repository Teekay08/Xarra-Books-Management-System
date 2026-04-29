// ─── Audit Logging Service ────────────────────────────────────────────────────
// Provides a single `logAudit()` call that routes consume to record immutable
// before/after events in audit_logs. Covers both Xarra Books and Billetterie.

import { auditLogs } from '@xarra/db';

export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'VOID' | 'APPROVE' | 'REJECT'
  | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'PDF_GENERATE' | 'STATUS_CHANGE'
  | 'PERMISSION_GRANT' | 'PERMISSION_REVOKE'
  | 'PHASE_ADVANCE' | 'SPRINT_SIGNOFF' | 'SPRINT_APPROVED'
  | 'LESSONS_LEARNED' | 'ADAPTIVE_EXTENSION'
  | 'CR_APPROVED' | 'CR_REJECTED'
  | 'TICKET_RESOLVED' | 'TIMESHEET_APPROVED' | 'TIMESHEET_REJECTED'
  | 'USER_ACCESS_CHANGED';

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write an immutable audit record. Call this after the main DB mutation succeeds.
 * Failures are logged to console but never throw — auditing must not break the main flow.
 */
export async function logAudit(db: any, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId:     entry.userId,
      action:     entry.action as any,
      entityType: entry.entityType,
      entityId:   entry.entityId ?? null,
      changes: (entry.before !== undefined || entry.after !== undefined)
        ? { before: entry.before, after: entry.after }
        : null,
      metadata:  entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch (err) {
    // Never allow audit failures to propagate — log and continue
    console.error('[audit] Failed to write audit log entry', { entry, err });
  }
}

/**
 * Extract IP and user-agent from a Fastify request for audit context.
 */
export function requestContext(request: any) {
  return {
    ipAddress: (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? request.socket?.remoteAddress
      ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  };
}

/**
 * Strip sensitive fields from a record before storing in audit log.
 * Removes passwords, tokens, secrets etc.
 */
export function sanitiseForAudit(record: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = new Set(['password', 'token', 'secret', 'apiKey', 'api_key', 'hash', 'salt']);
  return Object.fromEntries(
    Object.entries(record).filter(([k]) => !SENSITIVE.has(k)),
  );
}
