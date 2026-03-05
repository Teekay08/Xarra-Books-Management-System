import { pgTable, uuid, varchar, text, timestamp, integer, decimal, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { channelPartners, partnerBranches } from './channels';
import { titles } from './titles';
import { users } from './users';

export const consignmentStatusEnum = pgEnum('consignment_status', [
  'DRAFT', 'DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN', 'RECONCILED', 'CLOSED',
]);

export const consignments = pgTable('consignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  branchId: uuid('branch_id').references(() => partnerBranches.id),
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

// ==========================================
// RETURNS AUTHORIZATIONS
// ==========================================

export const returnStatusEnum = pgEnum('return_status', [
  'DRAFT', 'AUTHORIZED', 'RECEIVED', 'PROCESSED',
]);

export const returnConditionEnum = pgEnum('return_condition', [
  'GOOD', 'DAMAGED', 'UNSALEABLE',
]);

export const returnsAuthorizations = pgTable('returns_authorizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // RA-YYYY-NNNN
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  branchId: uuid('branch_id').references(() => partnerBranches.id),
  consignmentId: uuid('consignment_id').references(() => consignments.id),
  returnDate: timestamp('return_date', { withTimezone: true }).notNull(),
  reason: text('reason').notNull(),
  status: returnStatusEnum('status').notNull().default('DRAFT'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_returns_auth_partner_id').on(t.partnerId),
  index('idx_returns_auth_status').on(t.status),
]);

export const returnsAuthorizationLines = pgTable('returns_authorization_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  returnsAuthId: uuid('returns_auth_id').notNull().references(() => returnsAuthorizations.id, { onDelete: 'cascade' }),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  quantity: integer('quantity').notNull(),
  condition: returnConditionEnum('condition').notNull().default('GOOD'),
  notes: text('notes'),
}, (t) => [
  index('idx_returns_auth_lines_auth_id').on(t.returnsAuthId),
]);

export const returnsAuthorizationsRelations = relations(returnsAuthorizations, ({ one, many }) => ({
  partner: one(channelPartners, { fields: [returnsAuthorizations.partnerId], references: [channelPartners.id] }),
  consignment: one(consignments, { fields: [returnsAuthorizations.consignmentId], references: [consignments.id] }),
  lines: many(returnsAuthorizationLines),
}));

export const returnsAuthorizationLinesRelations = relations(returnsAuthorizationLines, ({ one }) => ({
  returnsAuth: one(returnsAuthorizations, { fields: [returnsAuthorizationLines.returnsAuthId], references: [returnsAuthorizations.id] }),
  title: one(titles, { fields: [returnsAuthorizationLines.titleId], references: [titles.id] }),
}));
