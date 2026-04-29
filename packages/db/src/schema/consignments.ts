import { pgTable, uuid, varchar, text, timestamp, integer, decimal, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { channelPartners, partnerBranches } from './channels';
import { titles } from './titles';


export const consignmentStatusEnum = pgEnum('consignment_status', [
  'DRAFT', 'DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN', 'RECONCILED', 'CLOSED',
]);

export const settlementStatusEnum = pgEnum('settlement_status', [
  'SOR_ACTIVE',       // SOR dispatched, sell window running
  'SOR_EXPIRED',      // SOR period ended, awaiting invoice generation
  'INVOICE_PENDING',  // Invoice generated (DRAFT), not yet sent
  'INVOICE_ISSUED',   // Invoice sent to partner
  'AWAITING_PAYMENT', // Invoice open, within payment terms
  'OVERDUE',          // Past due date, no payment
  'PAYMENT_RECEIVED', // Remittance submitted, under review
  'RECONCILING',      // Finance matching payment to invoice
  'PARTIALLY_SETTLED',// Partially paid, balance outstanding
  'SETTLED',          // Fully paid and closed
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
  proformaNumber: varchar('proforma_number', { length: 30 }), // SOR-YYYY-NNNN
  partnerPoNumber: varchar('partner_po_number', { length: 50 }), // partner's purchase order reference
  courierCompany: varchar('courier_company', { length: 100 }),
  courierWaybill: varchar('courier_waybill', { length: 100 }),
  status: consignmentStatusEnum('status').notNull().default('DRAFT'),
  settlementStatus: settlementStatusEnum('settlement_status'),
  invoiceId: uuid('invoice_id'), // linked invoice once generated from this SOR
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
  'DRAFT', 'AUTHORIZED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'VERIFIED', 'PROCESSED',
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
  // Courier details for return shipment
  courierCompany: varchar('courier_company', { length: 100 }),
  courierWaybill: varchar('courier_waybill', { length: 100 }),
  // Warehouse receiving
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedBy: text('received_by'),
  deliverySignedBy: varchar('delivery_signed_by', { length: 255 }),
  // Inspection
  inspectedAt: timestamp('inspected_at', { withTimezone: true }),
  inspectedBy: text('inspected_by'),
  inspectionNotes: text('inspection_notes'),
  // Verification (manager sign-off)
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: text('verified_by'),
  // Goods Return Note — auto-generated when goods are physically received
  grnNumber: varchar('grn_number', { length: 20 }).unique(), // GRN-YYYY-NNNN
  grnIssuedAt: timestamp('grn_issued_at', { withTimezone: true }),
  createdBy: text('created_by'),
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

export const returnInspectionLines = pgTable('return_inspection_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  returnsAuthId: uuid('returns_auth_id').notNull().references(() => returnsAuthorizations.id, { onDelete: 'cascade' }),
  returnsAuthLineId: uuid('returns_auth_line_id').notNull().references(() => returnsAuthorizationLines.id, { onDelete: 'cascade' }),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  qtyReceived: integer('qty_received').notNull(),
  qtyGood: integer('qty_good').notNull().default(0),
  qtyDamaged: integer('qty_damaged').notNull().default(0),
  qtyUnsaleable: integer('qty_unsaleable').notNull().default(0),
  notes: text('notes'),
}, (t) => [
  index('idx_return_inspection_lines_auth').on(t.returnsAuthId),
]);

export const returnsAuthorizationsRelations = relations(returnsAuthorizations, ({ one, many }) => ({
  partner: one(channelPartners, { fields: [returnsAuthorizations.partnerId], references: [channelPartners.id] }),
  consignment: one(consignments, { fields: [returnsAuthorizations.consignmentId], references: [consignments.id] }),
  lines: many(returnsAuthorizationLines),
  inspectionLines: many(returnInspectionLines),
}));

export const returnsAuthorizationLinesRelations = relations(returnsAuthorizationLines, ({ one }) => ({
  returnsAuth: one(returnsAuthorizations, { fields: [returnsAuthorizationLines.returnsAuthId], references: [returnsAuthorizations.id] }),
  title: one(titles, { fields: [returnsAuthorizationLines.titleId], references: [titles.id] }),
}));

export const returnInspectionLinesRelations = relations(returnInspectionLines, ({ one }) => ({
  returnsAuth: one(returnsAuthorizations, { fields: [returnInspectionLines.returnsAuthId], references: [returnsAuthorizations.id] }),
  returnsAuthLine: one(returnsAuthorizationLines, { fields: [returnInspectionLines.returnsAuthLineId], references: [returnsAuthorizationLines.id] }),
  title: one(titles, { fields: [returnInspectionLines.titleId], references: [titles.id] }),
}));
