import { pgTable, uuid, varchar, text, timestamp, decimal, integer, pgEnum, jsonb, index, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { authors } from './authors';

export const titleStatusEnum = pgEnum('title_status', ['PRODUCTION', 'ACTIVE', 'OUT_OF_PRINT']);

export const titles = pgTable('titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  subtitle: varchar('subtitle', { length: 500 }),
  isbn13: varchar('isbn_13', { length: 13 }).unique(),
  asin: varchar('asin', { length: 20 }),
  takealotSku: varchar('takealot_sku', { length: 50 }),
  takealotOfferId: varchar('takealot_offer_id', { length: 50 }),
  primaryAuthorId: uuid('primary_author_id').references(() => authors.id),
  rrpZar: decimal('rrp_zar', { precision: 10, scale: 2 }).notNull(),
  costPriceZar: decimal('cost_price_zar', { precision: 10, scale: 2 }),
  formats: jsonb('formats').notNull().$type<string[]>(),
  status: titleStatusEnum('status').notNull().default('PRODUCTION'),
  description: text('description'),
  publishDate: timestamp('publish_date', { withTimezone: true }),
  pageCount: integer('page_count'),
  weightGrams: integer('weight_grams'),
  dimensions: jsonb('dimensions').$type<{ heightMm: number; widthMm: number; depthMm: number }>(),
  coverImageUrl: varchar('cover_image_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_titles_status').on(t.status),
  index('idx_titles_primary_author').on(t.primaryAuthorId),
  index('idx_titles_asin').on(t.asin),
  index('idx_titles_takealot_sku').on(t.takealotSku),
]);

export const titleProductionCosts = pgTable('title_production_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  category: varchar('category', { length: 50 }).notNull(), // EDITORIAL, TYPESETTING, COVER, PRINT, ISBN, OTHER
  description: varchar('description', { length: 255 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  vendor: varchar('vendor', { length: 255 }),
  paidDate: timestamp('paid_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_title_prod_costs_title_id').on(t.titleId),
]);

export const titlesRelations = relations(titles, ({ one, many }) => ({
  primaryAuthor: one(authors, {
    fields: [titles.primaryAuthorId],
    references: [authors.id],
  }),
  productionCosts: many(titleProductionCosts),
  printRuns: many(titlePrintRuns),
}));

export const titleProductionCostsRelations = relations(titleProductionCosts, ({ one }) => ({
  title: one(titles, {
    fields: [titleProductionCosts.titleId],
    references: [titles.id],
  }),
}));

// === Print Runs ===

export const printRunStatusEnum = pgEnum('print_run_status', ['ORDERED', 'IN_PRODUCTION', 'SHIPPED', 'RECEIVED', 'PARTIAL', 'CANCELLED']);

export const titlePrintRuns = pgTable('title_print_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  printRunNumber: integer('print_run_number').notNull().default(1), // sequential per title (1, 2, 3...)
  number: varchar('number', { length: 50 }).notNull().unique(), // GRN-YYYY-NNNN
  printerName: varchar('printer_name', { length: 255 }).notNull(),
  quantityOrdered: integer('quantity_ordered').notNull(),
  totalCost: decimal('total_cost', { precision: 12, scale: 2 }).notNull(),
  expectedDeliveryDate: timestamp('expected_delivery_date', { withTimezone: true }),
  status: printRunStatusEnum('status').notNull().default('ORDERED'),
  quantityReceived: integer('quantity_received'),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedBy: text('received_by'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_print_runs_title_id').on(t.titleId),
  index('idx_print_runs_status').on(t.status),
]);

export const titlePrintRunsRelations = relations(titlePrintRuns, ({ one }) => ({
  title: one(titles, {
    fields: [titlePrintRuns.titleId],
    references: [titles.id],
  }),
}));
