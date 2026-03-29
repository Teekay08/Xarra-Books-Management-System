import { pgTable, uuid, varchar, text, timestamp, boolean, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { channelPartners, partnerUsers } from './channels';

export const notificationTypeEnum = pgEnum('notification_type', [
  'PARTNER_ORDER_SUBMITTED',
  'PARTNER_ORDER_CANCELLED',
  'PARTNER_RETURN_SUBMITTED',
  'INVOICE_OVERDUE',
  'INVOICE_PAID',
  'INVOICE_ISSUED',
  'INVOICE_VOIDED',
  'PAYMENT_RECEIVED',
  'INVENTORY_LOW_STOCK',
  'INVENTORY_RECEIVED',
  'CONSIGNMENT_DISPATCHED',
  'CONSIGNMENT_EXPIRING',
  'CONSIGNMENT_RETURNS_PROCESSED',
  'EXPENSE_CLAIM_SUBMITTED',
  'EXPENSE_CLAIM_APPROVED',
  'EXPENSE_CLAIM_REJECTED',
  'EXPENSE_CLAIM_PAID',
  'REQUISITION_SUBMITTED',
  'REQUISITION_APPROVED',
  'QUOTATION_EXPIRED',
  'QUOTATION_CONVERTED',
  'CASH_SALE_CREATED',
  'CREDIT_NOTE_CREATED',
  'DEBIT_NOTE_CREATED',
  'PURCHASE_ORDER_ISSUED',
  'PURCHASE_ORDER_RECEIVED',
  'PURCHASE_ORDER_CANCELLED',
  'REMITTANCE_MATCHED',
  'RETURN_PROCESSED',
  'PROJECT_CREATED',
  'PROJECT_BUDGET_APPROVED',
  'PROJECT_OVER_BUDGET',
  'TIMESHEET_SUBMITTED',
  'TIMESHEET_APPROVED',
  'TIMESHEET_REJECTED',
  'SOW_SENT',
  'SOW_ACCEPTED',
  'SYSTEM',
]);

export const notificationPriorityEnum = pgEnum('notification_priority', [
  'LOW', 'NORMAL', 'HIGH', 'URGENT',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: notificationTypeEnum('type').notNull(),
  priority: notificationPriorityEnum('priority').notNull().default('NORMAL'),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  // Who should see this notification (null = all admins)
  // Uses text type because Better Auth generates string IDs, not UUIDs
  userId: text('user_id'),
  // Optional link to navigate to when clicked
  actionUrl: varchar('action_url', { length: 500 }),
  // Reference to the related entity
  referenceType: varchar('reference_type', { length: 50 }), // PARTNER_ORDER, RETURN_REQUEST, INVOICE, etc.
  referenceId: uuid('reference_id'),
  // Read tracking
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notifications_user_id').on(t.userId),
  index('idx_notifications_is_read').on(t.userId, t.isRead),
  index('idx_notifications_created_at').on(t.createdAt),
  index('idx_notifications_type').on(t.type),
  index('idx_notifications_reference').on(t.referenceType, t.referenceId),
]);

// No relations defined — userId is a Better Auth string ID, not a FK to the app's users table

// ==========================================
// PARTNER NOTIFICATIONS
// ==========================================

export const partnerNotificationTypeEnum = pgEnum('partner_notification_type', [
  'ORDER_STATUS_CHANGED',
  'SHIPMENT_UPDATE',
  'RETURN_STATUS_CHANGED',
  'INVOICE_ISSUED',
  'STATEMENT_AVAILABLE',
  'CONSIGNMENT_DISPATCHED',
  'PAYMENT_CONFIRMED',
  'CREDIT_NOTE_ISSUED',
  'SYSTEM',
]);

export const partnerNotifications = pgTable('partner_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: partnerNotificationTypeEnum('type').notNull(),
  priority: notificationPriorityEnum('priority').notNull().default('NORMAL'),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  // Scoped to partner organization (required)
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  // Specific partner user (null = visible to all users at this partner)
  partnerUserId: uuid('partner_user_id').references(() => partnerUsers.id),
  // Optional link for navigation when clicked
  actionUrl: varchar('action_url', { length: 500 }),
  // Reference to related entity
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  // Read tracking
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_partner_notifications_partner_read').on(t.partnerId, t.isRead),
  index('idx_partner_notifications_user_read').on(t.partnerUserId, t.isRead),
  index('idx_partner_notifications_created').on(t.createdAt),
]);

export const partnerNotificationsRelations = relations(partnerNotifications, ({ one }) => ({
  partner: one(channelPartners, {
    fields: [partnerNotifications.partnerId],
    references: [channelPartners.id],
  }),
  partnerUser: one(partnerUsers, {
    fields: [partnerNotifications.partnerUserId],
    references: [partnerUsers.id],
  }),
}));
