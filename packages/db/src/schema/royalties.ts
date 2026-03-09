import { pgTable, uuid, varchar, text, timestamp, decimal, integer, boolean, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { authors, authorContracts, royaltyTriggerEnum } from './authors';
import { titles } from './titles';
import { user } from './auth';

// ==========================================
// ROYALTY LEDGER — append-only calculation entries
// ==========================================

export const royaltyLedger = pgTable('royalty_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => authors.id),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  contractId: uuid('contract_id').references(() => authorContracts.id),
  triggerType: royaltyTriggerEnum('trigger_type').notNull(),
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  unitsSold: integer('units_sold').notNull(),
  totalRevenue: decimal('total_revenue', { precision: 12, scale: 2 }).notNull(),
  grossRoyalty: decimal('gross_royalty', { precision: 12, scale: 2 }).notNull(),
  advanceDeducted: decimal('advance_deducted', { precision: 12, scale: 2 }).notNull().default('0'),
  netPayable: decimal('net_payable', { precision: 12, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('CALCULATED'), // CALCULATED, APPROVED, PAID, VOIDED
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentRef: varchar('payment_ref', { length: 100 }),
  authorPaymentId: uuid('author_payment_id'), // links to the payment run
  statementPdfUrl: varchar('statement_pdf_url', { length: 500 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by'),
}, (t) => [
  index('idx_royalty_author_id').on(t.authorId),
  index('idx_royalty_title_id').on(t.titleId),
  index('idx_royalty_period').on(t.authorId, t.titleId, t.periodFrom, t.periodTo),
  index('idx_royalty_status').on(t.status),
  index('idx_royalty_payment_id').on(t.authorPaymentId),
]);

// ==========================================
// AUTHOR PAYMENTS — actual payments made to authors
// ==========================================

export const authorPaymentStatusEnum = pgEnum('author_payment_status', [
  'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED',
]);

export const authorPayments = pgTable('author_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 30 }).notNull().unique(), // APAY-YYYY-NNNN
  authorId: uuid('author_id').notNull().references(() => authors.id),
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  totalGrossRoyalty: decimal('total_gross_royalty', { precision: 12, scale: 2 }).notNull(),
  totalAdvanceDeducted: decimal('total_advance_deducted', { precision: 12, scale: 2 }).notNull(),
  totalNetPayable: decimal('total_net_payable', { precision: 12, scale: 2 }).notNull(),
  totalPreviouslyPaid: decimal('total_previously_paid', { precision: 12, scale: 2 }).notNull().default('0'),
  amountDue: decimal('amount_due', { precision: 12, scale: 2 }).notNull(), // net after previous
  amountPaid: decimal('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
  status: authorPaymentStatusEnum('status').notNull().default('PENDING'),
  paymentMethod: varchar('payment_method', { length: 30 }).default('EFT'), // EFT, BANK_TRANSFER, CHEQUE
  bankReference: varchar('bank_reference', { length: 100 }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  statementPdfUrl: varchar('statement_pdf_url', { length: 500 }),
  notes: text('notes'),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  processedBy: text('processed_by'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_author_payments_author_id').on(t.authorId),
  index('idx_author_payments_status').on(t.status),
  index('idx_author_payments_period').on(t.authorId, t.periodFrom, t.periodTo),
  index('idx_author_payments_paid_at').on(t.paidAt),
]);

// ==========================================
// AUTHOR PAYMENT LINE ITEMS — per-title breakdown within a payment
// ==========================================

export const authorPaymentLines = pgTable('author_payment_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull().references(() => authorPayments.id),
  royaltyLedgerId: uuid('royalty_ledger_id').notNull().references(() => royaltyLedger.id),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  contractId: uuid('contract_id').references(() => authorContracts.id),
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  unitsSold: integer('units_sold').notNull(),
  totalRevenue: decimal('total_revenue', { precision: 12, scale: 2 }).notNull(),
  grossRoyalty: decimal('gross_royalty', { precision: 12, scale: 2 }).notNull(),
  advanceDeducted: decimal('advance_deducted', { precision: 12, scale: 2 }).notNull(),
  netPayable: decimal('net_payable', { precision: 12, scale: 2 }).notNull(),
}, (t) => [
  index('idx_apl_payment_id').on(t.paymentId),
  index('idx_apl_royalty_ledger_id').on(t.royaltyLedgerId),
  uniqueIndex('uk_apl_royalty_ledger').on(t.royaltyLedgerId), // prevent double-allocating same ledger entry
]);

// ==========================================
// RELATIONS
// ==========================================

export const royaltyLedgerRelations = relations(royaltyLedger, ({ one, many }) => ({
  author: one(authors, { fields: [royaltyLedger.authorId], references: [authors.id] }),
  title: one(titles, { fields: [royaltyLedger.titleId], references: [titles.id] }),
  contract: one(authorContracts, { fields: [royaltyLedger.contractId], references: [authorContracts.id] }),
  authorPayment: one(authorPayments, { fields: [royaltyLedger.authorPaymentId], references: [authorPayments.id] }),
  paymentLine: one(authorPaymentLines, { fields: [royaltyLedger.id], references: [authorPaymentLines.royaltyLedgerId] }),
}));

export const authorPaymentsRelations = relations(authorPayments, ({ one, many }) => ({
  author: one(authors, { fields: [authorPayments.authorId], references: [authors.id] }),
  lines: many(authorPaymentLines),
  ledgerEntries: many(royaltyLedger),
  approvedByUser: one(user, { fields: [authorPayments.approvedBy], references: [user.id] }),
  processedByUser: one(user, { fields: [authorPayments.processedBy], references: [user.id] }),
  createdByUser: one(user, { fields: [authorPayments.createdBy], references: [user.id] }),
}));

export const authorPaymentLinesRelations = relations(authorPaymentLines, ({ one }) => ({
  payment: one(authorPayments, { fields: [authorPaymentLines.paymentId], references: [authorPayments.id] }),
  royaltyEntry: one(royaltyLedger, { fields: [authorPaymentLines.royaltyLedgerId], references: [royaltyLedger.id] }),
  title: one(titles, { fields: [authorPaymentLines.titleId], references: [titles.id] }),
  contract: one(authorContracts, { fields: [authorPaymentLines.contractId], references: [authorContracts.id] }),
}));
