import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, integer, index } from 'drizzle-orm/pg-core';

export const channelPartners = pgTable('channel_partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  discountPct: decimal('discount_pct', { precision: 5, scale: 2 }).notNull(),
  sorDays: integer('sor_days'),
  paymentTermsDays: integer('payment_terms_days'), // net-30, net-60, etc.
  paymentDay: integer('payment_day'), // day of month payment is due
  contactName: varchar('contact_name', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  remittanceEmail: varchar('remittance_email', { length: 255 }),
  agreementDocUrl: varchar('agreement_doc_url', { length: 500 }),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_channel_partners_is_active').on(t.isActive),
]);
