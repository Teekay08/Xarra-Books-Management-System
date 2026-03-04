import { pgTable, uuid, varchar, text, timestamp, decimal, integer } from 'drizzle-orm/pg-core';

export const channelPartners = pgTable('channel_partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  discountPct: decimal('discount_pct', { precision: 5, scale: 2 }).notNull(),
  sorDays: integer('sor_days'),
  paymentDay: integer('payment_day'), // day of month
  contactName: varchar('contact_name', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  remittanceEmail: varchar('remittance_email', { length: 255 }),
  agreementDocUrl: varchar('agreement_doc_url', { length: 500 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
