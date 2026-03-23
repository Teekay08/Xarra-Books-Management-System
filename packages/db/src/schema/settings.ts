import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, index, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { invoices } from './finance';
import { channelPartners, partnerBranches } from './channels';
import { user } from './auth';

export const companySettings = pgTable('company_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  tradingAs: varchar('trading_as', { length: 255 }),
  registrationNumber: varchar('registration_number', { length: 50 }),
  vatNumber: varchar('vat_number', { length: 50 }),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  province: varchar('province', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 100 }).default('South Africa'),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  website: varchar('website', { length: 255 }),
  bankDetails: jsonb('bank_details').$type<{
    bankName: string;
    accountNumber: string;
    branchCode: string;
    accountType: string;
  }>(),
  logoUrl: varchar('logo_url', { length: 500 }),
  logoSmallUrl: varchar('logo_small_url', { length: 500 }),
  invoiceFooterText: text('invoice_footer_text'),
  statementFooterText: text('statement_footer_text'),
  // Operational settings
  lowStockThreshold: integer('low_stock_threshold').default(10), // Show amber warning if stock below this
  sorAlertDays: integer('sor_alert_days').default(30), // Show amber alert when SOR expires within this many days
  exchangeRateSource: varchar('exchange_rate_source', { length: 50 }).default('MANUAL'), // MANUAL, SARB, XE
  minimumOrderQty: integer('minimum_order_qty').default(1), // Minimum total quantity for partner portal orders
  // Email/SMTP settings
  emailSettings: jsonb('email_settings').$type<{
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
    smtpSecure?: boolean;
    sendingDomain?: string;
    replyToEmail?: string;
    fromName?: string;
  }>(),
  // Document series starting numbers
  documentSeries: jsonb('document_series').$type<{
    invoiceStart?: number;
    creditNoteStart?: number;
    debitNoteStart?: number;
    quotationStart?: number;
    purchaseOrderStart?: number;
    cashSaleStart?: number;
    expenseClaimStart?: number;
    requisitionStart?: number;
  }>(),
  // Invoice reminder settings (stored as JSONB)
  invoiceReminders: jsonb('invoice_reminders').$type<{
    enabled: boolean;
    weekBefore: boolean;   // 7 days before due
    dayBefore: boolean;    // 1 day before due
    onDueDate: boolean;    // on due date
    threeDaysAfter: boolean; // 3 days after due
    sevenDaysAfter: boolean; // 7 days after due
  }>(),
  // Automation scheduling settings
  schedulingSettings: jsonb('scheduling_settings').$type<{
    statementGeneration: {
      enabled: boolean;
      dayOfMonth: number;     // 1-28 (day of month to auto-compile statements)
      timeHour: number;       // 0-23 (hour in SAST, default 6)
    };
    sorAutoInvoice: {
      enabled: boolean;
      graceDays: number;      // extra days after SOR expiry before auto-invoicing (default 0)
      timeHour: number;       // 0-23 (hour in SAST, default 8)
    };
    invoiceSending: {
      enabled: boolean;
      dayOfMonth: number;     // 1-28 (day of month to auto-send approved invoices)
      timeHour: number;       // 0-23 (hour in SAST, default 9)
    };
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// User invitations (for email-based user onboarding)
export const userInvitations = pgTable('user_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(), // admin, finance, operations, editorial, reports_only
  token: varchar('token', { length: 100 }).notNull().unique(),
  invitedBy: text('invited_by').notNull().references(() => user.id),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING, ACCEPTED, EXPIRED
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_user_invitations_email').on(t.email),
  index('idx_user_invitations_token').on(t.token),
  index('idx_user_invitations_status').on(t.status),
]);

export const userInvitationsRelations = relations(userInvitations, ({ one }) => ({
  invitedByUser: one(user, { fields: [userInvitations.invitedBy], references: [user.id] }),
}));

// Track sent reminders to avoid duplicates
export const invoiceReminders = pgTable('invoice_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  reminderType: varchar('reminder_type', { length: 30 }).notNull(), // WEEK_BEFORE, DAY_BEFORE, ON_DUE_DATE, THREE_DAYS_AFTER, SEVEN_DAYS_AFTER
  sentTo: varchar('sent_to', { length: 255 }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_invoice_reminders_invoice_id').on(t.invoiceId),
  index('idx_invoice_reminders_type').on(t.invoiceId, t.reminderType),
]);

// Track sent documents (invoices, quotations, POs, etc.)
export const documentEmails = pgTable('document_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentType: varchar('document_type', { length: 30 }).notNull(), // INVOICE, QUOTATION, PURCHASE_ORDER, CREDIT_NOTE, DEBIT_NOTE, STATEMENT
  documentId: uuid('document_id').notNull(),
  sentTo: varchar('sent_to', { length: 255 }).notNull(),
  sentBy: text('sent_by'),
  subject: varchar('subject', { length: 500 }).notNull(),
  message: text('message'),
  status: varchar('status', { length: 20 }).notNull().default('SENT'), // SENT, FAILED
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_document_emails_doc').on(t.documentType, t.documentId),
]);

export const documentEmailsRelations = relations(documentEmails, ({ one }) => ({
  sentByUser: one(user, { fields: [documentEmails.sentBy], references: [user.id] }),
}));

// ==========================================
// MONTHLY STATEMENT BATCHES
// ==========================================

export const statementBatches = pgTable('statement_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  periodLabel: varchar('period_label', { length: 100 }).notNull(), // e.g. "February 2026"
  status: varchar('status', { length: 20 }).notNull().default('DRAFT'), // DRAFT, REVIEWED, APPROVED, SENDING, SENT
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  totalItems: integer('total_items').notNull().default(0),
  totalSent: integer('total_sent').notNull().default(0),
  totalFailed: integer('total_failed').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_statement_batches_period').on(t.periodFrom, t.periodTo),
  index('idx_statement_batches_status').on(t.status),
]);

export const statementBatchItems = pgTable('statement_batch_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => statementBatches.id),
  partnerId: uuid('partner_id').notNull().references(() => channelPartners.id),
  branchId: uuid('branch_id').references(() => partnerBranches.id), // null = consolidated or single-store
  recipientEmail: varchar('recipient_email', { length: 255 }),
  sendToType: varchar('send_to_type', { length: 20 }).notNull(), // DIRECT (single-store), BRANCH (per-branch), HQ_CONSOLIDATED (multi-branch HQ)
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING, EXCLUDED, SENT, FAILED
  closingBalance: varchar('closing_balance', { length: 20 }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_statement_batch_items_batch').on(t.batchId),
  index('idx_statement_batch_items_partner').on(t.partnerId),
]);

export const statementBatchesRelations = relations(statementBatches, ({ one, many }) => ({
  reviewedByUser: one(user, { fields: [statementBatches.reviewedBy], references: [user.id], relationName: 'reviewer' }),
  approvedByUser: one(user, { fields: [statementBatches.approvedBy], references: [user.id], relationName: 'approver' }),
  items: many(statementBatchItems),
}));

export const statementBatchItemsRelations = relations(statementBatchItems, ({ one }) => ({
  batch: one(statementBatches, { fields: [statementBatchItems.batchId], references: [statementBatches.id] }),
  partner: one(channelPartners, { fields: [statementBatchItems.partnerId], references: [channelPartners.id] }),
  branch: one(partnerBranches, { fields: [statementBatchItems.branchId], references: [partnerBranches.id] }),
}));
