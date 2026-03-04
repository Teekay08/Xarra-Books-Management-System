import { pgTable, uuid, varchar, timestamp, decimal, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { titles } from './titles';
import { channelPartners } from './channels';

export const saleRecords = pgTable('sale_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: varchar('external_id', { length: 100 }), // dedup key for webhook/import
  titleId: uuid('title_id').notNull().references(() => titles.id),
  channel: varchar('channel', { length: 30 }).notNull(), // XARRA_WEBSITE, XARRA_STORE, AMAZON_KDP, TAKEALOT, PARTNER
  partnerId: uuid('partner_id').references(() => channelPartners.id),
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  commission: decimal('commission', { precision: 10, scale: 2 }),
  netRevenue: decimal('net_revenue', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 3 }).notNull().default('ZAR'),
  exchangeRate: decimal('exchange_rate', { precision: 10, scale: 4 }),
  orderRef: varchar('order_ref', { length: 100 }),
  customerName: varchar('customer_name', { length: 255 }),
  saleDate: timestamp('sale_date', { withTimezone: true }).notNull(),
  source: varchar('source', { length: 30 }).notNull(), // WEBHOOK, CSV_IMPORT, MANUAL, POLLING
  fulfilmentType: varchar('fulfilment_type', { length: 20 }), // SHIP, DIGITAL, LEAD_TIME, DROP_SHIP
  status: varchar('status', { length: 20 }).notNull().default('CONFIRMED'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saleRecordsRelations = relations(saleRecords, ({ one }) => ({
  title: one(titles, { fields: [saleRecords.titleId], references: [titles.id] }),
  partner: one(channelPartners, { fields: [saleRecords.partnerId], references: [channelPartners.id] }),
}));
