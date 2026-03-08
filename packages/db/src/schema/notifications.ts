import { pgTable, uuid, varchar, text, timestamp, boolean, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

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
  userId: uuid('user_id').references(() => users.id),
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

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
