import { pgTable, uuid, varchar, text, timestamp, decimal, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const titleStatusEnum = pgEnum('title_status', ['PRODUCTION', 'ACTIVE', 'OUT_OF_PRINT']);

export const titles = pgTable('titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  isbn13: varchar('isbn_13', { length: 13 }).unique(),
  asin: varchar('asin', { length: 20 }),
  takealotSku: varchar('takealot_sku', { length: 50 }),
  takealotOfferId: varchar('takealot_offer_id', { length: 50 }),
  rrpZar: decimal('rrp_zar', { precision: 10, scale: 2 }).notNull(),
  formats: jsonb('formats').notNull().$type<string[]>(),
  status: titleStatusEnum('status').notNull().default('PRODUCTION'),
  description: text('description'),
  publishDate: timestamp('publish_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const titleProductionCosts = pgTable('title_production_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  category: varchar('category', { length: 50 }).notNull(), // EDITORIAL, TYPESETTING, COVER, PRINT, ISBN, OTHER
  description: varchar('description', { length: 255 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  vendor: varchar('vendor', { length: 255 }),
  paidDate: timestamp('paid_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const titlesRelations = relations(titles, ({ many }) => ({
  productionCosts: many(titleProductionCosts),
}));

export const titleProductionCostsRelations = relations(titleProductionCosts, ({ one }) => ({
  title: one(titles, {
    fields: [titleProductionCosts.titleId],
    references: [titles.id],
  }),
}));
