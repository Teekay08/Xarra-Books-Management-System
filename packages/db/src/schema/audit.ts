import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ==========================================
// AUDIT LOGS — Immutable, append-only
// ==========================================

export const auditActionEnum = pgEnum('audit_action', [
  'CREATE', 'UPDATE', 'DELETE', 'VOID', 'APPROVE', 'REJECT',
  'LOGIN', 'LOGOUT', 'EXPORT', 'PDF_GENERATE', 'STATUS_CHANGE',
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  action: auditActionEnum('action').notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(), // e.g. 'invoice', 'payment', 'consignment'
  entityId: uuid('entity_id'),
  changes: jsonb('changes').$type<{
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }>(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_audit_logs_user_id').on(t.userId),
  index('idx_audit_logs_entity').on(t.entityType, t.entityId),
  index('idx_audit_logs_action').on(t.action),
  index('idx_audit_logs_created_at').on(t.createdAt),
]);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

// ==========================================
// DELETION REQUESTS — Two-admin approval
// ==========================================

export const deletionStatusEnum = pgEnum('deletion_status', [
  'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED',
]);

export const deletionRequests = pgTable('deletion_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  rejectedBy: uuid('rejected_by').references(() => users.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  entitySnapshot: jsonb('entity_snapshot').$type<Record<string, unknown>>().notNull(),
  reason: text('reason').notNull(),
  status: deletionStatusEnum('status').notNull().default('PENDING'),
  rejectionReason: text('rejection_reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_deletion_requests_status').on(t.status),
  index('idx_deletion_requests_requested_by').on(t.requestedBy),
  index('idx_deletion_requests_expires_at').on(t.expiresAt),
]);

export const deletionRequestsRelations = relations(deletionRequests, ({ one }) => ({
  requester: one(users, { fields: [deletionRequests.requestedBy], references: [users.id], relationName: 'requester' }),
  approver: one(users, { fields: [deletionRequests.approvedBy], references: [users.id], relationName: 'approver' }),
  rejector: one(users, { fields: [deletionRequests.rejectedBy], references: [users.id], relationName: 'rejector' }),
}));
