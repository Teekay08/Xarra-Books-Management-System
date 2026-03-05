import { pgTable, uuid, varchar, text, timestamp, decimal, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { authors, authorContracts, royaltyTriggerEnum } from './authors';
import { titles } from './titles';

export const royaltyLedger = pgTable('royalty_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => authors.id),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  contractId: uuid('contract_id').references(() => authorContracts.id), // which contract rate was applied
  triggerType: royaltyTriggerEnum('trigger_type').notNull(),
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  unitsSold: integer('units_sold').notNull(),
  totalRevenue: decimal('total_revenue', { precision: 12, scale: 2 }).notNull(),
  grossRoyalty: decimal('gross_royalty', { precision: 12, scale: 2 }).notNull(),
  advanceDeducted: decimal('advance_deducted', { precision: 12, scale: 2 }).notNull().default('0'),
  netPayable: decimal('net_payable', { precision: 12, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('CALCULATED'), // CALCULATED, APPROVED, PAID
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentRef: varchar('payment_ref', { length: 100 }), // immutable once set
  statementPdfUrl: varchar('statement_pdf_url', { length: 500 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_royalty_author_id').on(t.authorId),
  index('idx_royalty_title_id').on(t.titleId),
  index('idx_royalty_period').on(t.authorId, t.titleId, t.periodFrom, t.periodTo),
  index('idx_royalty_status').on(t.status),
]);

export const royaltyLedgerRelations = relations(royaltyLedger, ({ one }) => ({
  author: one(authors, { fields: [royaltyLedger.authorId], references: [authors.id] }),
  title: one(titles, { fields: [royaltyLedger.titleId], references: [titles.id] }),
  contract: one(authorContracts, { fields: [royaltyLedger.contractId], references: [authorContracts.id] }),
}));
