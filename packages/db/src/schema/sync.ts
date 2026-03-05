import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';

export const syncPlatformEnum = pgEnum('sync_platform', [
  'WOOCOMMERCE', 'TAKEALOT', 'AMAZON_KDP',
]);

export const syncStatusEnum = pgEnum('sync_status', [
  'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL',
]);

export const syncOperations = pgTable('sync_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: syncPlatformEnum('platform').notNull(),
  operationType: varchar('operation_type', { length: 50 }).notNull(), // SALES_IMPORT, STOCK_PUSH, SETTLEMENT_IMPORT
  status: syncStatusEnum('status').notNull().default('RUNNING'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  recordsProcessed: integer('records_processed').default(0),
  recordsCreated: integer('records_created').default(0),
  recordsSkipped: integer('records_skipped').default(0),
  errorCount: integer('error_count').default(0),
  errorDetails: jsonb('error_details').$type<{ message: string; detail?: string }[]>(),
  metadata: jsonb('metadata'), // platform-specific info (cursor, page token, etc.)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sync_platform').on(t.platform),
  index('idx_sync_status').on(t.status),
  index('idx_sync_started_at').on(t.startedAt),
]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'), // null for system actions
  entityType: varchar('entity_type', { length: 50 }).notNull(), // INVOICE, PAYMENT, ROYALTY, etc.
  entityId: uuid('entity_id').notNull(),
  action: varchar('action', { length: 30 }).notNull(), // CREATE, UPDATE, VOID, DELETE
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_audit_entity').on(t.entityType, t.entityId),
  index('idx_audit_user_id').on(t.userId),
  index('idx_audit_created_at').on(t.createdAt),
]);
