import { pgTable, uuid, varchar, text, timestamp, decimal, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { channelPartners, partnerBranches } from './channels';

export const statementBatchStatusEnum = pgEnum('statement_batch_status', [
  'DRAFT', 'REVIEWED', 'APPROVED', 'SENDING', 'SENT',
]);

export const statementSendToTypeEnum = pgEnum('statement_send_to_type', [
  'DIRECT', 'BRANCH', 'HQ_CONSOLIDATED',
]);

export const statementItemStatusEnum = pgEnum('statement_item_status', [
  'PENDING', 'EXCLUDED', 'SENT', 'FAILED',
]);

export const statementBatches = pgTable('statement_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  periodLabel: varchar('period_label', { length: 50 }).notNull(),
  status: statementBatchStatusEnum('status').notNull().default('DRAFT'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const statementBatchItems = pgTable('statement_batch_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => statementBatches.id),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  branchId: uuid('branch_id').references(() => partnerBranches.id),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  sendToType: statementSendToTypeEnum('send_to_type').notNull(),
  status: statementItemStatusEnum('status').notNull().default('PENDING'),
  closingBalance: decimal('closing_balance', { precision: 12, scale: 2 }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_statement_batch_items_batch').on(t.batchId),
  index('idx_statement_batch_items_partner').on(t.partnerId),
]);

export const statementBatchesRelations = relations(statementBatches, ({ many }) => ({
  items: many(statementBatchItems),
}));

export const statementBatchItemsRelations = relations(statementBatchItems, ({ one }) => ({
  batch: one(statementBatches, { fields: [statementBatchItems.batchId], references: [statementBatches.id] }),
  partner: one(channelPartners, { fields: [statementBatchItems.partnerId], references: [channelPartners.id] }),
  branch: one(partnerBranches, { fields: [statementBatchItems.branchId], references: [partnerBranches.id] }),
}));
