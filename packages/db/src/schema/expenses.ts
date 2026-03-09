import { pgTable, uuid, varchar, text, timestamp, decimal, boolean, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth';

export const expenseCategories = pgTable('expense_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').notNull().references(() => expenseCategories.id),
  description: varchar('description', { length: 500 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  taxInclusive: boolean('tax_inclusive').notNull().default(false),
  expenseDate: timestamp('expense_date', { withTimezone: true }).notNull(),
  paymentMethod: varchar('payment_method', { length: 30 }),
  reference: varchar('reference', { length: 100 }),
  receiptUrl: varchar('receipt_url', { length: 500 }),
  notes: text('notes'),
  createdBy: text('created_by'),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_expenses_category_id').on(t.categoryId),
  index('idx_expenses_expense_date').on(t.expenseDate),
]);

export const expenseCategoriesRelations = relations(expenseCategories, ({ many }) => ({
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
  createdByUser: one(user, { fields: [expenses.createdBy], references: [user.id] }),
}));

// ==========================================
// EXPENSE CLAIMS
// ==========================================

export const expenseClaimStatusEnum = pgEnum('expense_claim_status', [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID',
]);

export const expenseClaims = pgTable('expense_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // EC-YYYY-NNNN
  claimantId: text('claimant_id').notNull(),
  claimDate: timestamp('claim_date', { withTimezone: true }).notNull(),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  status: expenseClaimStatusEnum('status').notNull().default('DRAFT'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectedBy: text('rejected_by'),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paidReference: varchar('paid_reference', { length: 100 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_expense_claims_claimant_id').on(t.claimantId),
  index('idx_expense_claims_status').on(t.status),
]);

export const expenseClaimLines = pgTable('expense_claim_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  claimId: uuid('claim_id').notNull().references(() => expenseClaims.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => expenseCategories.id),
  description: varchar('description', { length: 500 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  receiptUrl: varchar('receipt_url', { length: 500 }),
  expenseDate: timestamp('expense_date', { withTimezone: true }).notNull(),
}, (t) => [
  index('idx_expense_claim_lines_claim_id').on(t.claimId),
]);

export const expenseClaimsRelations = relations(expenseClaims, ({ one, many }) => ({
  claimant: one(user, { fields: [expenseClaims.claimantId], references: [user.id], relationName: 'claimant' }),
  approvedByUser: one(user, { fields: [expenseClaims.approvedBy], references: [user.id], relationName: 'approver' }),
  lines: many(expenseClaimLines),
}));

export const expenseClaimLinesRelations = relations(expenseClaimLines, ({ one }) => ({
  claim: one(expenseClaims, { fields: [expenseClaimLines.claimId], references: [expenseClaims.id] }),
  category: one(expenseCategories, { fields: [expenseClaimLines.categoryId], references: [expenseCategories.id] }),
}));

// ==========================================
// REQUISITIONS
// ==========================================

export const requisitionStatusEnum = pgEnum('requisition_status', [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDERED',
]);

export const requisitions = pgTable('requisitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // REQ-YYYY-NNNN
  requestedBy: text('requested_by').notNull(),
  department: varchar('department', { length: 100 }),
  requiredByDate: timestamp('required_by_date', { withTimezone: true }),
  totalEstimate: decimal('total_estimate', { precision: 12, scale: 2 }).notNull(),
  status: requisitionStatusEnum('status').notNull().default('DRAFT'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectedBy: text('rejected_by'),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  convertedPurchaseOrderId: uuid('converted_purchase_order_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_requisitions_requested_by').on(t.requestedBy),
  index('idx_requisitions_status').on(t.status),
]);

export const requisitionLines = pgTable('requisition_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  requisitionId: uuid('requisition_id').notNull().references(() => requisitions.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 500 }).notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  estimatedUnitPrice: decimal('estimated_unit_price', { precision: 10, scale: 2 }).notNull(),
  estimatedTotal: decimal('estimated_total', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
}, (t) => [
  index('idx_requisition_lines_requisition_id').on(t.requisitionId),
]);

export const requisitionsRelations = relations(requisitions, ({ one, many }) => ({
  requester: one(user, { fields: [requisitions.requestedBy], references: [user.id], relationName: 'requester' }),
  approvedByUser: one(user, { fields: [requisitions.approvedBy], references: [user.id], relationName: 'reqApprover' }),
  lines: many(requisitionLines),
}));

export const requisitionLinesRelations = relations(requisitionLines, ({ one }) => ({
  requisition: one(requisitions, { fields: [requisitionLines.requisitionId], references: [requisitions.id] }),
}));
