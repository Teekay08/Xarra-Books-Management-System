import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, integer, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { titles } from './titles';
import { users } from './users';

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

export const partnerBranchesRelations = relations(partnerBranches, ({ one, many }) => ({
  partner: one(channelPartners, {
    fields: [partnerBranches.partnerId],
    references: [channelPartners.id],
  }),
  portalUsers: many(partnerUsers),
}));

// ==========================================
// PARTNER PORTAL USERS
// ==========================================

export const partnerUserRoleEnum = pgEnum('partner_user_role', [
  'ADMIN', 'BRANCH_MANAGER', 'STAFF',
]);

export const partnerUsers = pgTable('partner_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  branchId: uuid('branch_id').references(() => partnerBranches.id), // null = HQ-level user
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: partnerUserRoleEnum('role').notNull().default('STAFF'),
  phone: varchar('phone', { length: 50 }),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_partner_users_partner_id').on(t.partnerId),
  index('idx_partner_users_branch_id').on(t.branchId),
  index('idx_partner_users_email').on(t.email),
]);

// ==========================================
// PARTNER ORDERS (placed via portal)
// ==========================================

export const partnerOrderStatusEnum = pgEnum('partner_order_status', [
  'DRAFT', 'SUBMITTED', 'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED',
]);

export const partnerOrders = pgTable('partner_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // POR-YYYY-NNNN
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  branchId: uuid('branch_id').references(() => partnerBranches.id),
  placedById: uuid('placed_by_id').notNull().references(() => partnerUsers.id),
  orderDate: timestamp('order_date', { withTimezone: true }).notNull().defaultNow(),
  expectedDeliveryDate: timestamp('expected_delivery_date', { withTimezone: true }),
  deliveryAddress: text('delivery_address'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  vatAmount: decimal('vat_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  total: decimal('total', { precision: 12, scale: 2 }).notNull().default('0'),
  status: partnerOrderStatusEnum('status').notNull().default('DRAFT'),
  // Linked documents (populated by Xarra staff after processing)
  consignmentId: uuid('consignment_id'),
  invoiceId: uuid('invoice_id'),
  quotationId: uuid('quotation_id'),
  // Courier tracking
  courierCompany: varchar('courier_company', { length: 100 }),
  courierWaybill: varchar('courier_waybill', { length: 100 }),
  courierTrackingUrl: varchar('courier_tracking_url', { length: 500 }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  deliverySignedBy: varchar('delivery_signed_by', { length: 255 }),
  // Admin fields
  confirmedById: uuid('confirmed_by_id').references(() => users.id),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  notes: text('notes'),
  internalNotes: text('internal_notes'), // only visible to Xarra staff
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_partner_orders_partner_id').on(t.partnerId),
  index('idx_partner_orders_branch_id').on(t.branchId),
  index('idx_partner_orders_status').on(t.status),
  index('idx_partner_orders_placed_by').on(t.placedById),
]);

export const partnerOrderLines = pgTable('partner_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => partnerOrders.id, { onDelete: 'cascade' }),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(), // RRP at time of order
  discountPct: decimal('discount_pct', { precision: 5, scale: 2 }).notNull(), // partner discount snapshot
  lineTotal: decimal('line_total', { precision: 12, scale: 2 }).notNull(),
  lineTax: decimal('line_tax', { precision: 12, scale: 2 }).notNull().default('0'),
  qtyConfirmed: integer('qty_confirmed'), // may differ from requested qty
  qtyDispatched: integer('qty_dispatched'),
}, (t) => [
  index('idx_partner_order_lines_order_id').on(t.orderId),
  index('idx_partner_order_lines_title_id').on(t.titleId),
]);

// ==========================================
// PARTNER RETURN REQUESTS (via portal)
// ==========================================

export const partnerReturnRequestStatusEnum = pgEnum('partner_return_request_status', [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'AUTHORIZED', 'REJECTED',
  'AWAITING_PICKUP', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'CREDIT_ISSUED',
]);

export const partnerReturnRequests = pgTable('partner_return_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // PRR-YYYY-NNNN
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  branchId: uuid('branch_id').references(() => partnerBranches.id),
  requestedById: uuid('requested_by_id').notNull().references(() => partnerUsers.id),
  consignmentId: uuid('consignment_id'), // original consignment reference
  reason: text('reason').notNull(),
  status: partnerReturnRequestStatusEnum('status').notNull().default('DRAFT'),
  // Processing by Xarra
  reviewedById: uuid('reviewed_by_id').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),
  rejectionReason: text('rejection_reason'),
  // Linked internal return authorization (created by Xarra after approval)
  returnsAuthorizationId: uuid('returns_authorization_id'),
  creditNoteId: uuid('credit_note_id'),
  // Courier for returns
  returnCourierCompany: varchar('return_courier_company', { length: 100 }),
  returnCourierWaybill: varchar('return_courier_waybill', { length: 100 }),
  returnCourierTrackingUrl: varchar('return_courier_tracking_url', { length: 500 }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  inspectedAt: timestamp('inspected_at', { withTimezone: true }),
  inspectionNotes: text('inspection_notes'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_partner_return_requests_partner_id').on(t.partnerId),
  index('idx_partner_return_requests_status').on(t.status),
]);

export const partnerReturnRequestLines = pgTable('partner_return_request_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  returnRequestId: uuid('return_request_id').notNull().references(() => partnerReturnRequests.id, { onDelete: 'cascade' }),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  quantity: integer('quantity').notNull(),
  condition: varchar('condition', { length: 20 }).notNull().default('GOOD'), // GOOD, DAMAGED, UNSALEABLE
  reason: text('reason'),
  qtyAccepted: integer('qty_accepted'), // set after inspection
}, (t) => [
  index('idx_partner_return_lines_request_id').on(t.returnRequestId),
]);

// ==========================================
// COURIER SHIPMENTS (Fastway / other)
// ==========================================

export const courierShipments = pgTable('courier_shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  courierCompany: varchar('courier_company', { length: 100 }).notNull().default('FASTWAY'),
  waybillNumber: varchar('waybill_number', { length: 100 }).notNull(),
  trackingUrl: varchar('tracking_url', { length: 500 }),
  // Linked entity (one of these)
  consignmentId: uuid('consignment_id'),
  partnerOrderId: uuid('partner_order_id'),
  returnRequestId: uuid('return_request_id'),
  // Shipment details
  senderName: varchar('sender_name', { length: 255 }),
  senderAddress: text('sender_address'),
  recipientName: varchar('recipient_name', { length: 255 }),
  recipientAddress: text('recipient_address'),
  recipientPhone: varchar('recipient_phone', { length: 50 }),
  packageCount: integer('package_count').default(1),
  totalWeightKg: decimal('total_weight_kg', { precision: 8, scale: 2 }),
  // Status tracking
  status: varchar('status', { length: 30 }).notNull().default('CREATED'), // CREATED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, FAILED
  estimatedDelivery: timestamp('estimated_delivery', { withTimezone: true }),
  pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  deliverySignedBy: varchar('delivery_signed_by', { length: 255 }),
  deliveryProofUrl: varchar('delivery_proof_url', { length: 500 }),
  failureReason: text('failure_reason'),
  // Metadata
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_courier_shipments_waybill').on(t.waybillNumber),
  index('idx_courier_shipments_consignment').on(t.consignmentId),
  index('idx_courier_shipments_order').on(t.partnerOrderId),
  index('idx_courier_shipments_return').on(t.returnRequestId),
  index('idx_courier_shipments_status').on(t.status),
]);

// ==========================================
// PARTNER PORTAL RELATIONS
// ==========================================

export const partnerUsersRelations = relations(partnerUsers, ({ one }) => ({
  partner: one(channelPartners, { fields: [partnerUsers.partnerId], references: [channelPartners.id] }),
  branch: one(partnerBranches, { fields: [partnerUsers.branchId], references: [partnerBranches.id] }),
}));

export const partnerOrdersRelations = relations(partnerOrders, ({ one, many }) => ({
  partner: one(channelPartners, { fields: [partnerOrders.partnerId], references: [channelPartners.id] }),
  branch: one(partnerBranches, { fields: [partnerOrders.branchId], references: [partnerBranches.id] }),
  placedBy: one(partnerUsers, { fields: [partnerOrders.placedById], references: [partnerUsers.id] }),
  confirmedBy: one(users, { fields: [partnerOrders.confirmedById], references: [users.id] }),
  lines: many(partnerOrderLines),
}));

export const partnerOrderLinesRelations = relations(partnerOrderLines, ({ one }) => ({
  order: one(partnerOrders, { fields: [partnerOrderLines.orderId], references: [partnerOrders.id] }),
  title: one(titles, { fields: [partnerOrderLines.titleId], references: [titles.id] }),
}));

export const partnerReturnRequestsRelations = relations(partnerReturnRequests, ({ one, many }) => ({
  partner: one(channelPartners, { fields: [partnerReturnRequests.partnerId], references: [channelPartners.id] }),
  branch: one(partnerBranches, { fields: [partnerReturnRequests.branchId], references: [partnerBranches.id] }),
  requestedBy: one(partnerUsers, { fields: [partnerReturnRequests.requestedById], references: [partnerUsers.id] }),
  reviewedBy: one(users, { fields: [partnerReturnRequests.reviewedById], references: [users.id] }),
  lines: many(partnerReturnRequestLines),
}));

export const partnerReturnRequestLinesRelations = relations(partnerReturnRequestLines, ({ one }) => ({
  returnRequest: one(partnerReturnRequests, { fields: [partnerReturnRequestLines.returnRequestId], references: [partnerReturnRequests.id] }),
  title: one(titles, { fields: [partnerReturnRequestLines.titleId], references: [titles.id] }),
}));
