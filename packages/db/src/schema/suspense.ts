import { pgTable, uuid, varchar, text, timestamp, decimal, integer, pgEnum, jsonb, index, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { channelPartners } from './channels';
import { consignments, consignmentLines } from './consignments';
import { invoices, paymentAllocations, creditNotes } from './finance';
import { titles } from './titles';
import { user } from './auth';

// ==========================================
// SUSPENSE ACCOUNTING
// ==========================================

export const suspenseStatusEnum = pgEnum('suspense_status', [
  'SUSPENSE', 'CONFIRMED', 'REFUND_DUE', 'REFUNDED', 'WRITTEN_OFF',
]);

export const suspenseLedger = pgTable('suspense_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentAllocationId: uuid('payment_allocation_id').references(() => paymentAllocations.id),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  consignmentId: uuid('consignment_id').references(() => consignments.id),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  status: suspenseStatusEnum('status').notNull().default('SUSPENSE'),
  sorExpiryDate: timestamp('sor_expiry_date', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmedBy: text('confirmed_by'),
  refundAmount: decimal('refund_amount', { precision: 12, scale: 2 }),
  creditNoteId: uuid('credit_note_id').references(() => creditNotes.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_suspense_consignment').on(t.consignmentId),
  index('idx_suspense_partner').on(t.partnerId),
  index('idx_suspense_status').on(t.status),
  index('idx_suspense_expiry').on(t.sorExpiryDate),
]);

export const suspenseSnapshots = pgTable('suspense_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotDate: date('snapshot_date').notNull().unique(),
  totalSuspense: decimal('total_suspense', { precision: 12, scale: 2 }).notNull().default('0'),
  totalConfirmed: decimal('total_confirmed', { precision: 12, scale: 2 }).notNull().default('0'),
  totalRefundDue: decimal('total_refund_due', { precision: 12, scale: 2 }).notNull().default('0'),
  partnerBreakdown: jsonb('partner_breakdown').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_suspense_snapshots_date').on(t.snapshotDate),
]);

// ==========================================
// CASH FLOW FORECASTS
// ==========================================

export const cashFlowForecasts = pgTable('cash_flow_forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  forecastDate: date('forecast_date').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  projectedInflows: jsonb('projected_inflows').notNull().$type<{
    payments: number; sorConversions: number; cashSales: number;
  }>(),
  projectedOutflows: jsonb('projected_outflows').notNull().$type<{
    production: number; royalties: number; expenses: number; refunds: number;
  }>(),
  netForecast: decimal('net_forecast', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_cashflow_forecast_date').on(t.forecastDate),
]);

// ==========================================
// SELL-THROUGH PREDICTIONS
// ==========================================

export const sellThroughPredictions = pgTable('sell_through_predictions', {
  id: uuid('id').primaryKey().defaultRandom(),
  consignmentId: uuid('consignment_id').notNull().references(() => consignments.id),
  consignmentLineId: uuid('consignment_line_id').references(() => consignmentLines.id),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  predictedSellThroughPct: decimal('predicted_sell_through_pct', { precision: 5, scale: 2 }).notNull(),
  predictedQtySold: integer('predicted_qty_sold').notNull(),
  predictedQtyReturned: integer('predicted_qty_returned').notNull(),
  predictedRevenue: decimal('predicted_revenue', { precision: 12, scale: 2 }).notNull(),
  confidenceLevel: varchar('confidence_level', { length: 10 }).notNull(), // HIGH, MEDIUM, LOW
  confidenceScore: decimal('confidence_score', { precision: 5, scale: 4 }),
  riskLevel: varchar('risk_level', { length: 10 }).notNull(), // LOW, MEDIUM, HIGH
  factors: jsonb('factors').notNull(), // explanation of prediction factors
  modelVersion: varchar('model_version', { length: 20 }).notNull().default('v1-rules'),
  predictedAt: timestamp('predicted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_predictions_consignment').on(t.consignmentId),
  index('idx_predictions_title').on(t.titleId),
  index('idx_predictions_partner').on(t.partnerId),
  index('idx_predictions_risk').on(t.riskLevel),
]);

export const sellThroughActuals = pgTable('sell_through_actuals', {
  id: uuid('id').primaryKey().defaultRandom(),
  consignmentId: uuid('consignment_id').notNull().references(() => consignments.id),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  branchId: uuid('branch_id'),
  dispatchDate: date('dispatch_date'),
  sorExpiryDate: date('sor_expiry_date'),
  qtyDispatched: integer('qty_dispatched').notNull(),
  qtySold: integer('qty_sold').notNull(),
  qtyReturned: integer('qty_returned').notNull(),
  qtyDamaged: integer('qty_damaged').notNull().default(0),
  sellThroughPct: decimal('sell_through_pct', { precision: 5, scale: 2 }).notNull(),
  unitRrp: decimal('unit_rrp', { precision: 10, scale: 2 }).notNull(),
  discountPct: decimal('discount_pct', { precision: 5, scale: 2 }).notNull(),
  daysOnShelf: integer('days_on_shelf'),
  dispatchMonth: integer('dispatch_month'), // 1-12 for seasonality
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_actuals_partner_title').on(t.partnerId, t.titleId),
  index('idx_actuals_title').on(t.titleId),
  index('idx_actuals_dispatch_month').on(t.dispatchMonth),
  index('idx_actuals_consignment').on(t.consignmentId),
]);

// ==========================================
// RELATIONS
// ==========================================

export const suspenseLedgerRelations = relations(suspenseLedger, ({ one }) => ({
  paymentAllocation: one(paymentAllocations, { fields: [suspenseLedger.paymentAllocationId], references: [paymentAllocations.id] }),
  invoice: one(invoices, { fields: [suspenseLedger.invoiceId], references: [invoices.id] }),
  consignment: one(consignments, { fields: [suspenseLedger.consignmentId], references: [consignments.id] }),
  partner: one(channelPartners, { fields: [suspenseLedger.partnerId], references: [channelPartners.id] }),
  creditNote: one(creditNotes, { fields: [suspenseLedger.creditNoteId], references: [creditNotes.id] }),
}));

export const sellThroughPredictionsRelations = relations(sellThroughPredictions, ({ one }) => ({
  consignment: one(consignments, { fields: [sellThroughPredictions.consignmentId], references: [consignments.id] }),
  title: one(titles, { fields: [sellThroughPredictions.titleId], references: [titles.id] }),
  partner: one(channelPartners, { fields: [sellThroughPredictions.partnerId], references: [channelPartners.id] }),
}));

export const sellThroughActualsRelations = relations(sellThroughActuals, ({ one }) => ({
  consignment: one(consignments, { fields: [sellThroughActuals.consignmentId], references: [consignments.id] }),
  title: one(titles, { fields: [sellThroughActuals.titleId], references: [titles.id] }),
  partner: one(channelPartners, { fields: [sellThroughActuals.partnerId], references: [channelPartners.id] }),
}));
