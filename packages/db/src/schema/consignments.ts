import { pgTable, uuid, varchar, text, timestamp, integer, decimal, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { channelPartners } from './channels';
import { titles } from './titles';

export const consignmentStatusEnum = pgEnum('consignment_status', [
  'DRAFT', 'DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN', 'RECONCILED', 'CLOSED',
]);

export const consignments = pgTable('consignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  dispatchDate: timestamp('dispatch_date', { withTimezone: true }),
  deliveryDate: timestamp('delivery_date', { withTimezone: true }),
  sorExpiryDate: timestamp('sor_expiry_date', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
  courierCompany: varchar('courier_company', { length: 100 }),
  courierWaybill: varchar('courier_waybill', { length: 100 }),
  status: consignmentStatusEnum('status').notNull().default('DRAFT'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_consignments_partner_id').on(t.partnerId),
  index('idx_consignments_status').on(t.status),
  index('idx_consignments_dispatch_date').on(t.dispatchDate),
]);

export const consignmentLines = pgTable('consignment_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  consignmentId: uuid('consignment_id').notNull().references(() => consignments.id),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  qtyDispatched: integer('qty_dispatched').notNull(),
  qtySold: integer('qty_sold').notNull().default(0),
  qtyReturned: integer('qty_returned').notNull().default(0),
  qtyDamaged: integer('qty_damaged').notNull().default(0),
  unitRrp: decimal('unit_rrp', { precision: 10, scale: 2 }).notNull(), // snapshot at dispatch
  discountPct: decimal('discount_pct', { precision: 5, scale: 2 }).notNull(), // snapshot at dispatch
}, (t) => [
  index('idx_consignment_lines_consignment').on(t.consignmentId),
  index('idx_consignment_lines_title').on(t.titleId),
]);

export const consignmentsRelations = relations(consignments, ({ one, many }) => ({
  partner: one(channelPartners, {
    fields: [consignments.partnerId],
    references: [channelPartners.id],
  }),
  lines: many(consignmentLines),
}));

export const consignmentLinesRelations = relations(consignmentLines, ({ one }) => ({
  consignment: one(consignments, {
    fields: [consignmentLines.consignmentId],
    references: [consignments.id],
  }),
  title: one(titles, {
    fields: [consignmentLines.titleId],
    references: [titles.id],
  }),
}));
