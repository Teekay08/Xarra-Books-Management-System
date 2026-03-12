import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, pgEnum, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth';
import { titles } from './titles';

export const authorTypeEnum = pgEnum('author_type', ['HYBRID', 'TRADITIONAL']);

export const royaltyTriggerEnum = pgEnum('royalty_trigger', ['DATE', 'UNITS', 'REVENUE']);

export const paymentFrequencyEnum = pgEnum('payment_frequency', ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']);

export const contractTemplates = pgTable('contract_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  authorType: authorTypeEnum('author_type').notNull(), // TRADITIONAL or HYBRID
  content: text('content').notNull(), // Rich text / HTML content of the contract terms
  version: varchar('version', { length: 50 }).notNull().default('1.0'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_contract_templates_author_type').on(t.authorType),
  index('idx_contract_templates_is_active').on(t.isActive),
]);

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
  portalUserId: text('portal_user_id'),
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
  contractTemplateId: uuid('contract_template_id').references(() => contractTemplates.id),
  contractTermsSnapshot: text('contract_terms_snapshot'), // Snapshot of template content at time of creation
  royaltyRatePrint: decimal('royalty_rate_print', { precision: 5, scale: 4 }).notNull(),
  royaltyRateEbook: decimal('royalty_rate_ebook', { precision: 5, scale: 4 }).notNull(),
  triggerType: royaltyTriggerEnum('trigger_type').notNull(),
  triggerValue: decimal('trigger_value', { precision: 12, scale: 2 }),
  advanceAmount: decimal('advance_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  advanceRecovered: decimal('advance_recovered', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentFrequency: paymentFrequencyEnum('payment_frequency').notNull().default('QUARTERLY'),
  minimumPayment: decimal('minimum_payment', { precision: 12, scale: 2 }).notNull().default('100'),
  isSigned: boolean('is_signed').notNull().default(false),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signedByIp: varchar('signed_by_ip', { length: 50 }),
  signedDocUrl: varchar('signed_doc_url', { length: 500 }),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uk_author_title_contract').on(t.authorId, t.titleId),
  index('idx_author_contracts_author_id').on(t.authorId),
  index('idx_author_contracts_title_id').on(t.titleId),
  index('idx_author_contracts_template_id').on(t.contractTemplateId),
]);

export const contractTemplatesRelations = relations(contractTemplates, ({ many }) => ({
  contracts: many(authorContracts),
}));

export const authorsRelations = relations(authors, ({ many, one }) => ({
  contracts: many(authorContracts),
  portalUser: one(user, {
    fields: [authors.portalUserId],
    references: [user.id],
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
  template: one(contractTemplates, {
    fields: [authorContracts.contractTemplateId],
    references: [contractTemplates.id],
  }),
}));
