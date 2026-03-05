import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const channelPartners = pgTable('channel_partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  discountPct: decimal('discount_pct', { precision: 5, scale: 2 }).notNull(),
  sorDays: integer('sor_days'),
  paymentTermsDays: integer('payment_terms_days'),
  paymentDay: integer('payment_day'),
  contactName: varchar('contact_name', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  remittanceEmail: varchar('remittance_email', { length: 255 }),
  agreementDocUrl: varchar('agreement_doc_url', { length: 500 }),
  // Address fields
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  province: varchar('province', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 100 }).default('South Africa'),
  vatNumber: varchar('vat_number', { length: 50 }),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_channel_partners_is_active').on(t.isActive),
]);

export const partnerBranches = pgTable('partner_branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }),
  contactName: varchar('contact_name', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  province: varchar('province', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_partner_branches_partner_id').on(t.partnerId),
  index('idx_partner_branches_is_active').on(t.isActive),
]);

// Relations
export const channelPartnersRelations = relations(channelPartners, ({ many }) => ({
  branches: many(partnerBranches),
}));

export const partnerBranchesRelations = relations(partnerBranches, ({ one }) => ({
  partner: one(channelPartners, {
    fields: [partnerBranches.partnerId],
    references: [channelPartners.id],
  }),
}));
