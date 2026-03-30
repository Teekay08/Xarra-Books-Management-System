import { pgTable, uuid, varchar, text, timestamp, integer, decimal, jsonb, index, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { partnerOrders, channelPartners, partnerUsers } from './channels';
import { user } from './auth';

// ==========================================
// ORDER STATUS HISTORY
// ==========================================

export const orderStatusHistory = pgTable('order_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => partnerOrders.id, { onDelete: 'cascade' }),
  fromStatus: varchar('from_status', { length: 30 }),
  toStatus: varchar('to_status', { length: 30 }).notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: text('changed_by'),
  changedByPartnerUserId: uuid('changed_by_partner_user_id').references(() => partnerUsers.id),
  source: varchar('source', { length: 20 }).notNull().default('MANUAL'),
  notes: text('notes'),
  courierStatus: varchar('courier_status', { length: 30 }),
  courierLocation: varchar('courier_location', { length: 255 }),
  courierTimestamp: timestamp('courier_timestamp', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_order_status_history_order').on(t.orderId),
  index('idx_order_status_history_order_date').on(t.orderId, t.changedAt),
  index('idx_order_status_history_status').on(t.toStatus),
]);

// ==========================================
// PARTNER MAGIC LINKS
// ==========================================

export const partnerMagicLinks = pgTable('partner_magic_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: varchar('token', { length: 100 }).notNull().unique(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  partnerUserId: uuid('partner_user_id').references(() => partnerUsers.id),
  purpose: varchar('purpose', { length: 30 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_magic_links_partner').on(t.partnerId),
  index('idx_magic_links_expires').on(t.expiresAt),
]);

// ==========================================
// PARTNER DOCUMENT DELIVERIES
// ==========================================

export const partnerDocumentDeliveries = pgTable('partner_document_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  documentType: varchar('document_type', { length: 30 }).notNull(),
  documentId: uuid('document_id').notNull(),
  deliveryMethod: varchar('delivery_method', { length: 20 }).notNull(),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_doc_deliveries_partner').on(t.partnerId),
  index('idx_doc_deliveries_status').on(t.status),
  index('idx_doc_deliveries_doc').on(t.documentType, t.documentId),
]);

// ==========================================
// PARTNER UPLOADED DOCUMENTS
// ==========================================

export const partnerUploadedDocuments = pgTable('partner_uploaded_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  documentType: varchar('document_type', { length: 30 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  mimeType: varchar('mime_type', { length: 50 }),
  linkedEntityType: varchar('linked_entity_type', { length: 30 }),
  linkedEntityId: uuid('linked_entity_id'),
  processingStatus: varchar('processing_status', { length: 20 }).notNull().default('UPLOADED'),
  parsedData: jsonb('parsed_data'),
  uploadedBy: text('uploaded_by').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_uploaded_docs_partner').on(t.partnerId),
  index('idx_uploaded_docs_type').on(t.documentType),
  index('idx_uploaded_docs_linked').on(t.linkedEntityType, t.linkedEntityId),
]);

// ==========================================
// PARTNER ONBOARDING FUNNEL
// ==========================================

export const partnerOnboardingFunnel = pgTable('partner_onboarding_funnel', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id).unique(),
  stage: varchar('stage', { length: 30 }).notNull().default('UNAWARE'),
  stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }).notNull().defaultNow(),
  magicLinksClicked: integer('magic_links_clicked').notNull().default(0),
  portalLogins: integer('portal_logins').notNull().default(0),
  portalOrdersPlaced: integer('portal_orders_placed').notNull().default(0),
  lastMagicLinkClickAt: timestamp('last_magic_link_click_at', { withTimezone: true }),
  lastPortalLoginAt: timestamp('last_portal_login_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_onboarding_partner').on(t.partnerId),
  index('idx_onboarding_stage').on(t.stage),
]);

// ==========================================
// NOTIFICATION EMAIL PREFERENCES (staff)
// ==========================================

export const notificationEmailPreferences = pgTable('notification_email_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  preferences: jsonb('preferences').notNull().default('{}'),
  digestFrequency: varchar('digest_frequency', { length: 20 }).notNull().default('IMMEDIATE'),
  dailyDigestHour: integer('daily_digest_hour').notNull().default(7),
  weeklyDigestDay: integer('weekly_digest_day').notNull().default(1),
  unsubscribeToken: varchar('unsubscribe_token', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notif_prefs_user').on(t.userId),
]);

// ==========================================
// PARTNER NOTIFICATION EMAIL PREFERENCES
// ==========================================

export const partnerNotificationEmailPreferences = pgTable('partner_notification_email_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerUserId: uuid('partner_user_id').notNull().references(() => partnerUsers.id).unique(),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  preferences: jsonb('preferences').notNull().default('{}'),
  unsubscribeToken: varchar('unsubscribe_token', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_partner_notif_prefs_user').on(t.partnerUserId),
  index('idx_partner_notif_prefs_partner').on(t.partnerId),
]);

// ==========================================
// NOTIFICATION EMAIL LOG
// ==========================================

export const notificationEmailLog = pgTable('notification_email_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  notificationId: uuid('notification_id'),
  partnerNotificationId: uuid('partner_notification_id'),
  recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
  recipientType: varchar('recipient_type', { length: 20 }).notNull(),
  subject: varchar('subject', { length: 500 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('QUEUED'),
  resendEmailId: varchar('resend_email_id', { length: 100 }),
  errorMessage: text('error_message'),
  queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => [
  index('idx_notif_email_log_notification').on(t.notificationId),
  index('idx_notif_email_log_partner_notif').on(t.partnerNotificationId),
  index('idx_notif_email_log_status').on(t.status),
]);

// ==========================================
// NOTIFICATION DIGESTS QUEUE
// ==========================================

export const notificationDigests = pgTable('notification_digests', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientType: varchar('recipient_type', { length: 20 }).notNull(),
  recipientId: text('recipient_id').notNull(),
  notificationId: uuid('notification_id'),
  partnerNotificationId: uuid('partner_notification_id'),
  digestFrequency: varchar('digest_frequency', { length: 20 }).notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notif_digests_schedule').on(t.digestFrequency, t.scheduledFor),
  index('idx_notif_digests_recipient').on(t.recipientType, t.recipientId),
]);

// ==========================================
// RELATIONS
// ==========================================

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(partnerOrders, { fields: [orderStatusHistory.orderId], references: [partnerOrders.id] }),
  changedByUser: one(user, { fields: [orderStatusHistory.changedBy], references: [user.id], relationName: 'statusChanger' }),
  changedByPartnerUser: one(partnerUsers, { fields: [orderStatusHistory.changedByPartnerUserId], references: [partnerUsers.id] }),
}));

export const partnerMagicLinksRelations = relations(partnerMagicLinks, ({ one }) => ({
  partner: one(channelPartners, { fields: [partnerMagicLinks.partnerId], references: [channelPartners.id] }),
  partnerUser: one(partnerUsers, { fields: [partnerMagicLinks.partnerUserId], references: [partnerUsers.id] }),
}));

export const partnerDocumentDeliveriesRelations = relations(partnerDocumentDeliveries, ({ one }) => ({
  partner: one(channelPartners, { fields: [partnerDocumentDeliveries.partnerId], references: [channelPartners.id] }),
}));

export const partnerUploadedDocumentsRelations = relations(partnerUploadedDocuments, ({ one }) => ({
  partner: one(channelPartners, { fields: [partnerUploadedDocuments.partnerId], references: [channelPartners.id] }),
}));

export const partnerOnboardingFunnelRelations = relations(partnerOnboardingFunnel, ({ one }) => ({
  partner: one(channelPartners, { fields: [partnerOnboardingFunnel.partnerId], references: [channelPartners.id] }),
}));
