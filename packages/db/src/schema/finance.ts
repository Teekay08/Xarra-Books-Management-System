import { pgTable, uuid, varchar, text, timestamp, decimal, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { channelPartners } from './channels';
import { consignments } from './consignments';
import { users } from './users';

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'OVERDUE', 'VOIDED',
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // INV-YYYY-NNNN
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  consignmentId: uuid('consignment_id').references(() => consignments.id),
  invoiceDate: timestamp('invoice_date', { withTimezone: true }).notNull(), // determines tax period
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  vatAmount: decimal('vat_amount', { precision: 12, scale: 2 }).notNull(),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  status: invoiceStatusEnum('status').notNull().default('DRAFT'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  pdfUrl: varchar('pdf_url', { length: 500 }),
  notes: text('notes'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedReason: text('voided_reason'),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_invoices_partner_id').on(t.partnerId),
  index('idx_invoices_status').on(t.status),
  index('idx_invoices_due_date').on(t.dueDate),
  index('idx_invoices_invoice_date').on(t.invoiceDate),
]);

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  lineNumber: integer('line_number').notNull(),
  titleId: uuid('title_id'),
  consignmentLineId: uuid('consignment_line_id'), // link to consignment line if applicable
  description: varchar('description', { length: 500 }).notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  discountPct: decimal('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  lineTotal: decimal('line_total', { precision: 12, scale: 2 }).notNull(),
  lineTax: decimal('line_tax', { precision: 12, scale: 2 }).notNull().default('0'),
}, (t) => [
  index('idx_invoice_lines_invoice_id').on(t.invoiceId),
]);

export const creditNotes = pgTable('credit_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // CN-YYYY-NNNN
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  vatAmount: decimal('vat_amount', { precision: 12, scale: 2 }).notNull(),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  pdfUrl: varchar('pdf_url', { length: 500 }),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedReason: text('voided_reason'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_credit_notes_invoice_id').on(t.invoiceId),
  index('idx_credit_notes_partner_id').on(t.partnerId),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
  paymentMethod: varchar('payment_method', { length: 30 }).default('BANK_TRANSFER'), // BANK_TRANSFER, EFT, CASH
  bankReference: varchar('bank_reference', { length: 100 }).notNull(),
  notes: text('notes'),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_payments_partner_id').on(t.partnerId),
  index('idx_payments_payment_date').on(t.paymentDate),
]);

export const paymentAllocations = pgTable('payment_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
}, (t) => [
  index('idx_payment_alloc_invoice_id').on(t.invoiceId),
]);

export const remittances = pgTable('remittances', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  partnerRef: varchar('partner_ref', { length: 100 }),
  periodFrom: timestamp('period_from', { withTimezone: true }),
  periodTo: timestamp('period_to', { withTimezone: true }),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  parseMethod: varchar('parse_method', { length: 20 }), // PDF_TEXT, OCR, CSV, MANUAL
  parseConfidence: decimal('parse_confidence', { precision: 3, scale: 2 }),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING, MATCHED, DISPUTED
  sourceDocUrl: varchar('source_doc_url', { length: 500 }),
  matchedBy: uuid('matched_by').references(() => users.id),
  matchedAt: timestamp('matched_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_remittances_partner_id').on(t.partnerId),
  index('idx_remittances_status').on(t.status),
]);

// Relations
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  partner: one(channelPartners, { fields: [invoices.partnerId], references: [channelPartners.id] }),
  consignment: one(consignments, { fields: [invoices.consignmentId], references: [consignments.id] }),
  createdByUser: one(users, { fields: [invoices.createdBy], references: [users.id] }),
  lines: many(invoiceLines),
  creditNotes: many(creditNotes),
}));

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
}));

export const creditNotesRelations = relations(creditNotes, ({ one }) => ({
  invoice: one(invoices, { fields: [creditNotes.invoiceId], references: [invoices.id] }),
  partner: one(channelPartners, { fields: [creditNotes.partnerId], references: [channelPartners.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  partner: one(channelPartners, { fields: [payments.partnerId], references: [channelPartners.id] }),
  allocations: many(paymentAllocations),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  invoice: one(invoices, { fields: [paymentAllocations.invoiceId], references: [invoices.id] }),
}));

export const remittancesRelations = relations(remittances, ({ one }) => ({
  partner: one(channelPartners, { fields: [remittances.partnerId], references: [channelPartners.id] }),
}));
