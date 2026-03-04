import { pgTable, uuid, varchar, timestamp, decimal, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { authors } from './authors';
import { titles } from './titles';

export const royaltyLedger = pgTable('royalty_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => authors.id),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  unitsSold: integer('units_sold').notNull(),
  grossRoyalty: decimal('gross_royalty', { precision: 12, scale: 2 }).notNull(),
  advanceDeducted: decimal('advance_deducted', { precision: 12, scale: 2 }).notNull().default('0'),
  netPayable: decimal('net_payable', { precision: 12, scale: 2 }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentRef: varchar('payment_ref', { length: 100 }), // immutable once set
  statementPdfUrl: varchar('statement_pdf_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const royaltyLedgerRelations = relations(royaltyLedger, ({ one }) => ({
  author: one(authors, { fields: [royaltyLedger.authorId], references: [authors.id] }),
  title: one(titles, { fields: [royaltyLedger.titleId], references: [titles.id] }),
}));
