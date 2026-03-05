import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { invoices } from './finance';
import { channelPartners } from './channels';
import { users } from './users';

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
  // Invoice reminder settings (stored as JSONB)
  invoiceReminders: jsonb('invoice_reminders').$type<{
    enabled: boolean;
    weekBefore: boolean;   // 7 days before due
    dayBefore: boolean;    // 1 day before due
    onDueDate: boolean;    // on due date
    threeDaysAfter: boolean; // 3 days after due
    sevenDaysAfter: boolean; // 7 days after due
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  sentBy: uuid('sent_by').references(() => users.id),
  subject: varchar('subject', { length: 500 }).notNull(),
  message: text('message'),
  status: varchar('status', { length: 20 }).notNull().default('SENT'), // SENT, FAILED
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_document_emails_doc').on(t.documentType, t.documentId),
]);

export const documentEmailsRelations = relations(documentEmails, ({ one }) => ({
  sentByUser: one(users, { fields: [documentEmails.sentBy], references: [users.id] }),
}));
