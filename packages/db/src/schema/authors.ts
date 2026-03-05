import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, pgEnum, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { titles } from './titles';

export const authorTypeEnum = pgEnum('author_type', ['HYBRID', 'TRADITIONAL']);

export const royaltyTriggerEnum = pgEnum('royalty_trigger', ['DATE', 'UNITS', 'REVENUE']);

export const authors = pgTable('authors', {
  id: uuid('id').primaryKey().defaultRandom(),
  legalName: varchar('legal_name', { length: 255 }).notNull(),
  penName: varchar('pen_name', { length: 255 }),
  type: authorTypeEnum('type').notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  province: varchar('province', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 100 }).default('South Africa'),
  bankDetails: jsonb('bank_details'), // { bankName, accountNumber, branchCode, accountType }
  taxNumber: varchar('tax_number', { length: 50 }), // SARS tax number
  isActive: boolean('is_active').notNull().default(true),
  portalUserId: uuid('portal_user_id').references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_authors_type').on(t.type),
  index('idx_authors_is_active').on(t.isActive),
  index('idx_authors_email').on(t.email),
]);

export const authorContracts = pgTable('author_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => authors.id),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  royaltyRatePrint: decimal('royalty_rate_print', { precision: 5, scale: 4 }).notNull(),
  royaltyRateEbook: decimal('royalty_rate_ebook', { precision: 5, scale: 4 }).notNull(),
  triggerType: royaltyTriggerEnum('trigger_type').notNull(),
  triggerValue: decimal('trigger_value', { precision: 12, scale: 2 }),
  advanceAmount: decimal('advance_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  advanceRecovered: decimal('advance_recovered', { precision: 12, scale: 2 }).notNull().default('0'),
  isSigned: boolean('is_signed').notNull().default(false),
  signedDocUrl: varchar('signed_doc_url', { length: 500 }),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uk_author_title_contract').on(t.authorId, t.titleId),
  index('idx_author_contracts_author_id').on(t.authorId),
  index('idx_author_contracts_title_id').on(t.titleId),
]);

export const authorsRelations = relations(authors, ({ many, one }) => ({
  contracts: many(authorContracts),
  portalUser: one(users, {
    fields: [authors.portalUserId],
    references: [users.id],
  }),
}));

export const authorContractsRelations = relations(authorContracts, ({ one }) => ({
  author: one(authors, {
    fields: [authorContracts.authorId],
    references: [authors.id],
  }),
  title: one(titles, {
    fields: [authorContracts.titleId],
    references: [titles.id],
  }),
}));
