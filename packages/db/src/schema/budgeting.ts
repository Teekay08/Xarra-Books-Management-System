import { pgTable, uuid, varchar, text, timestamp, decimal, integer, pgEnum, jsonb, index, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { titles } from './titles';
import { authors } from './authors';
import { suppliers } from './suppliers';
import { user } from './auth';

// ==========================================
// ENUMS
// ==========================================

export const projectStatusEnum = pgEnum('project_status', [
  'PLANNING', 'BUDGETED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
]);

export const projectTypeEnum = pgEnum('project_type', [
  'NEW_TITLE', 'REPRINT', 'REVISED_EDITION', 'TRANSLATION', 'ANTHOLOGY', 'CUSTOM',
]);

export const contractTypeEnum = pgEnum('contract_type', [
  'TRADITIONAL', 'HYBRID',
]);

export const milestoneStatusEnum = pgEnum('milestone_status', [
  'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
]);

export const sourceTypeEnum = pgEnum('source_type', [
  'INTERNAL', 'EXTERNAL',
]);

export const costClassificationEnum = pgEnum('cost_classification', [
  'PUBLISHING', 'OPERATIONAL', 'LAUNCH', 'MARKETING',
]);

export const rateCardTypeEnum = pgEnum('rate_card_type', [
  'INTERNAL', 'EXTERNAL',
]);

export const timesheetStatusEnum = pgEnum('timesheet_status', [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED',
]);

export const sowStatusEnum = pgEnum('sow_status', [
  'DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED',
]);

// ==========================================
// PROJECTS (top-level entity)
// ==========================================

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // PRJ-YYYY-NNNN
  name: varchar('name', { length: 255 }).notNull(),
  titleId: uuid('title_id').references(() => titles.id),
  authorId: uuid('author_id').references(() => authors.id),
  projectManager: text('project_manager').references(() => user.id),
  projectType: projectTypeEnum('project_type').notNull().default('NEW_TITLE'),
  contractType: contractTypeEnum('contract_type').notNull().default('TRADITIONAL'),
  authorContribution: decimal('author_contribution', { precision: 12, scale: 2 }).default('0'),
  status: projectStatusEnum('status').notNull().default('PLANNING'),
  description: text('description'),
  startDate: timestamp('start_date', { withTimezone: true }),
  targetCompletionDate: timestamp('target_completion_date', { withTimezone: true }),
  actualCompletionDate: timestamp('actual_completion_date', { withTimezone: true }),
  totalBudget: decimal('total_budget', { precision: 12, scale: 2 }).default('0'),
  totalActual: decimal('total_actual', { precision: 12, scale: 2 }).default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('ZAR'),
  notes: text('notes'),
  createdBy: text('created_by').references(() => user.id),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_projects_title_id').on(t.titleId),
  index('idx_projects_author_id').on(t.authorId),
  index('idx_projects_status').on(t.status),
  index('idx_projects_project_type').on(t.projectType),
]);

// ==========================================
// PROJECT MILESTONES
// ==========================================

export const projectMilestones = pgTable('project_milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 50 }).notNull(), // EDITING, TYPESETTING, COVER_DESIGN, etc.
  name: varchar('name', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: milestoneStatusEnum('status').notNull().default('NOT_STARTED'),
  plannedStartDate: timestamp('planned_start_date', { withTimezone: true }),
  plannedEndDate: timestamp('planned_end_date', { withTimezone: true }),
  actualStartDate: timestamp('actual_start_date', { withTimezone: true }),
  actualEndDate: timestamp('actual_end_date', { withTimezone: true }),
  notes: text('notes'),
  createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_milestones_project_id').on(t.projectId),
  uniqueIndex('idx_milestones_project_code').on(t.projectId, t.code),
]);

// ==========================================
// BUDGET LINE ITEMS
// ==========================================

export const budgetLineItems = pgTable('budget_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  milestoneId: uuid('milestone_id').references(() => projectMilestones.id), // nullable for ad-hoc costs
  category: varchar('category', { length: 50 }).notNull(), // EDITORIAL, TYPESETTING, COVER, LABOR, etc.
  costClassification: costClassificationEnum('cost_classification').notNull().default('PUBLISHING'),
  customCategory: varchar('custom_category', { length: 100 }), // for MISCELLANEOUS / ad-hoc items
  description: varchar('description', { length: 500 }).notNull(),
  sourceType: sourceTypeEnum('source_type').notNull().default('INTERNAL'),
  estimatedHours: decimal('estimated_hours', { precision: 10, scale: 2 }), // nullable (flat-rate items)
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }), // nullable
  estimatedAmount: decimal('estimated_amount', { precision: 12, scale: 2 }).notNull(),
  rateCardId: uuid('rate_card_id').references(() => rateCards.id),
  staffUserId: text('staff_user_id').references(() => user.id), // assigned internal staff
  contractorId: uuid('contractor_id').references(() => suppliers.id), // assigned external contractor
  externalQuote: decimal('external_quote', { precision: 12, scale: 2 }), // vendor quote for comparison
  notes: text('notes'),
  createdBy: text('created_by').references(() => user.id),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_budget_lines_project_id').on(t.projectId),
  index('idx_budget_lines_milestone_id').on(t.milestoneId),
  index('idx_budget_lines_classification').on(t.costClassification),
]);

// ==========================================
// ACTUAL COST ENTRIES
// ==========================================

export const actualCostEntries = pgTable('actual_cost_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  milestoneId: uuid('milestone_id').references(() => projectMilestones.id),
  budgetLineItemId: uuid('budget_line_item_id').references(() => budgetLineItems.id), // links actual to estimate
  category: varchar('category', { length: 50 }).notNull(),
  costClassification: costClassificationEnum('cost_classification').notNull().default('PUBLISHING'),
  customCategory: varchar('custom_category', { length: 100 }),
  description: varchar('description', { length: 500 }).notNull(),
  sourceType: sourceTypeEnum('source_type').notNull().default('INTERNAL'),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  vendor: varchar('vendor', { length: 255 }),
  invoiceRef: varchar('invoice_ref', { length: 100 }),
  paidDate: timestamp('paid_date', { withTimezone: true }),
  receiptUrl: varchar('receipt_url', { length: 500 }),
  staffUserId: text('staff_user_id').references(() => user.id),
  contractorId: uuid('contractor_id').references(() => suppliers.id),
  notes: text('notes'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedReason: text('voided_reason'),
  createdBy: text('created_by').references(() => user.id),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_actual_costs_project_id').on(t.projectId),
  index('idx_actual_costs_milestone_id').on(t.milestoneId),
  index('idx_actual_costs_budget_line_id').on(t.budgetLineItemId),
]);

// ==========================================
// RATE CARDS
// ==========================================

export const rateCards = pgTable('rate_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  type: rateCardTypeEnum('type').notNull(),
  role: varchar('role', { length: 100 }).notNull(), // Editor, Typesetter, Cover Designer, Proofreader, etc.
  hourlyRateZar: decimal('hourly_rate_zar', { precision: 10, scale: 2 }).notNull(),
  dailyRateZar: decimal('daily_rate_zar', { precision: 10, scale: 2 }), // convenience = hourly * 8
  staffUserId: text('staff_user_id').references(() => user.id), // link to specific internal user
  supplierId: uuid('supplier_id').references(() => suppliers.id), // link to specific external contractor
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }), // null = currently active
  currency: varchar('currency', { length: 3 }).notNull().default('ZAR'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_rate_cards_type').on(t.type),
  index('idx_rate_cards_role').on(t.role),
  index('idx_rate_cards_active').on(t.isActive),
]);

// ==========================================
// TIMESHEETS
// ==========================================

export const timesheets = pgTable('timesheets', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // TS-YYYY-NNNN
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id), // person working
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  status: timesheetStatusEnum('status').notNull().default('DRAFT'),
  totalHours: decimal('total_hours', { precision: 10, scale: 2 }).notNull().default('0'),
  approvedBy: text('approved_by').references(() => user.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectedBy: text('rejected_by').references(() => user.id),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_timesheets_project_id').on(t.projectId),
  index('idx_timesheets_user_id').on(t.userId),
  index('idx_timesheets_status').on(t.status),
]);

export const timesheetEntries = pgTable('timesheet_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  timesheetId: uuid('timesheet_id').notNull().references(() => timesheets.id, { onDelete: 'cascade' }),
  milestoneId: uuid('milestone_id').notNull().references(() => projectMilestones.id),
  budgetLineItemId: uuid('budget_line_item_id').references(() => budgetLineItems.id),
  taskCodeId: uuid('task_code_id'),
  taskAssignmentId: uuid('task_assignment_id'),
  taskTimeLogId: uuid('task_time_log_id'),
  workDate: timestamp('work_date', { withTimezone: true }).notNull(),
  hours: decimal('hours', { precision: 5, scale: 2 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
}, (t) => [
  index('idx_timesheet_entries_timesheet_id').on(t.timesheetId),
  index('idx_timesheet_entries_milestone_id').on(t.milestoneId),
  index('idx_timesheet_entries_work_date').on(t.workDate),
  index('idx_timesheet_entries_task_code').on(t.taskCodeId),
  index('idx_timesheet_entries_task_assignment').on(t.taskAssignmentId),
  index('idx_timesheet_entries_task_time_log').on(t.taskTimeLogId),
]);

// ==========================================
// SOW DOCUMENTS
// ==========================================

export const sowDocuments = pgTable('sow_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // SOW-YYYY-NNNN
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  contractorId: uuid('contractor_id').references(() => suppliers.id),
  staffUserId: text('staff_user_id').references(() => user.id),
  version: integer('version').notNull().default(1),
  status: sowStatusEnum('status').notNull().default('DRAFT'),
  scope: text('scope').notNull(),
  deliverables: jsonb('deliverables').notNull().$type<Array<{ description: string; dueDate: string; acceptanceCriteria: string }>>(),
  timeline: jsonb('timeline').notNull().$type<{ startDate: string; endDate: string; milestones: Array<{ name: string; date: string }> }>(),
  costBreakdown: jsonb('cost_breakdown').notNull().$type<Array<{ description: string; hours: number; rate: number; total: number }>>(),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  terms: text('terms'),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sentTo: varchar('sent_to', { length: 255 }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  pdfUrl: varchar('pdf_url', { length: 500 }),
  notes: text('notes'),
  createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sow_documents_project_id').on(t.projectId),
  index('idx_sow_documents_contractor_id').on(t.contractorId),
  index('idx_sow_documents_status').on(t.status),
]);

export const sowDocumentVersions = pgTable('sow_document_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sowDocumentId: uuid('sow_document_id').notNull().references(() => sowDocuments.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshotJson: jsonb('snapshot_json').notNull(),
  changedBy: text('changed_by').references(() => user.id),
  changeNotes: text('change_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sow_versions_document_id').on(t.sowDocumentId),
  uniqueIndex('idx_sow_versions_doc_version').on(t.sowDocumentId, t.version),
]);

// ==========================================
// COST ESTIMATION HISTORY (ML training data)
// ==========================================

export const costEstimationHistory = pgTable('cost_estimation_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  milestoneCode: varchar('milestone_code', { length: 50 }).notNull(),
  taskCategory: varchar('task_category', { length: 50 }).notNull(),
  pageCount: integer('page_count'),
  wordCount: integer('word_count'),
  complexityScore: integer('complexity_score'), // 1-5
  estimatedHours: decimal('estimated_hours', { precision: 10, scale: 2 }),
  actualHours: decimal('actual_hours', { precision: 10, scale: 2 }),
  estimatedCost: decimal('estimated_cost', { precision: 12, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 12, scale: 2 }),
  sourceType: sourceTypeEnum('source_type'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_estimation_history_milestone').on(t.milestoneCode, t.taskCategory),
  index('idx_estimation_history_project').on(t.projectId),
]);

// ==========================================
// RELATIONS
// ==========================================

export const projectsRelations = relations(projects, ({ one, many }) => ({
  title: one(titles, { fields: [projects.titleId], references: [titles.id] }),
  author: one(authors, { fields: [projects.authorId], references: [authors.id] }),
  manager: one(user, { fields: [projects.projectManager], references: [user.id], relationName: 'projectManager' }),
  createdByUser: one(user, { fields: [projects.createdBy], references: [user.id], relationName: 'projectCreator' }),
  milestones: many(projectMilestones),
  budgetLineItems: many(budgetLineItems),
  actualCostEntries: many(actualCostEntries),
  timesheets: many(timesheets),
  sowDocuments: many(sowDocuments),
  estimationHistory: many(costEstimationHistory),
}));

export const projectMilestonesRelations = relations(projectMilestones, ({ one, many }) => ({
  project: one(projects, { fields: [projectMilestones.projectId], references: [projects.id] }),
  createdByUser: one(user, { fields: [projectMilestones.createdBy], references: [user.id], relationName: 'milestoneCreator' }),
  budgetLineItems: many(budgetLineItems),
  actualCostEntries: many(actualCostEntries),
  timesheetEntries: many(timesheetEntries),
}));

export const budgetLineItemsRelations = relations(budgetLineItems, ({ one }) => ({
  project: one(projects, { fields: [budgetLineItems.projectId], references: [projects.id] }),
  milestone: one(projectMilestones, { fields: [budgetLineItems.milestoneId], references: [projectMilestones.id] }),
  rateCard: one(rateCards, { fields: [budgetLineItems.rateCardId], references: [rateCards.id] }),
  staffUser: one(user, { fields: [budgetLineItems.staffUserId], references: [user.id], relationName: 'budgetStaff' }),
  contractor: one(suppliers, { fields: [budgetLineItems.contractorId], references: [suppliers.id] }),
  createdByUser: one(user, { fields: [budgetLineItems.createdBy], references: [user.id], relationName: 'budgetLineCreator' }),
}));

export const actualCostEntriesRelations = relations(actualCostEntries, ({ one }) => ({
  project: one(projects, { fields: [actualCostEntries.projectId], references: [projects.id] }),
  milestone: one(projectMilestones, { fields: [actualCostEntries.milestoneId], references: [projectMilestones.id] }),
  budgetLineItem: one(budgetLineItems, { fields: [actualCostEntries.budgetLineItemId], references: [budgetLineItems.id] }),
  staffUser: one(user, { fields: [actualCostEntries.staffUserId], references: [user.id], relationName: 'actualStaff' }),
  contractor: one(suppliers, { fields: [actualCostEntries.contractorId], references: [suppliers.id] }),
  createdByUser: one(user, { fields: [actualCostEntries.createdBy], references: [user.id], relationName: 'actualCostCreator' }),
}));

export const rateCardsRelations = relations(rateCards, ({ one }) => ({
  staffUser: one(user, { fields: [rateCards.staffUserId], references: [user.id], relationName: 'rateCardStaff' }),
  supplier: one(suppliers, { fields: [rateCards.supplierId], references: [suppliers.id] }),
  createdByUser: one(user, { fields: [rateCards.createdBy], references: [user.id], relationName: 'rateCardCreator' }),
}));

export const timesheetsRelations = relations(timesheets, ({ one, many }) => ({
  project: one(projects, { fields: [timesheets.projectId], references: [projects.id] }),
  worker: one(user, { fields: [timesheets.userId], references: [user.id], relationName: 'timesheetWorker' }),
  approvedByUser: one(user, { fields: [timesheets.approvedBy], references: [user.id], relationName: 'timesheetApprover' }),
  rejectedByUser: one(user, { fields: [timesheets.rejectedBy], references: [user.id], relationName: 'timesheetRejecter' }),
  entries: many(timesheetEntries),
}));

export const timesheetEntriesRelations = relations(timesheetEntries, ({ one }) => ({
  timesheet: one(timesheets, { fields: [timesheetEntries.timesheetId], references: [timesheets.id] }),
  milestone: one(projectMilestones, { fields: [timesheetEntries.milestoneId], references: [projectMilestones.id] }),
  budgetLineItem: one(budgetLineItems, { fields: [timesheetEntries.budgetLineItemId], references: [budgetLineItems.id] }),
}));

export const sowDocumentsRelations = relations(sowDocuments, ({ one, many }) => ({
  project: one(projects, { fields: [sowDocuments.projectId], references: [projects.id] }),
  contractor: one(suppliers, { fields: [sowDocuments.contractorId], references: [suppliers.id] }),
  staffUser: one(user, { fields: [sowDocuments.staffUserId], references: [user.id], relationName: 'sowStaff' }),
  createdByUser: one(user, { fields: [sowDocuments.createdBy], references: [user.id], relationName: 'sowCreator' }),
  versions: many(sowDocumentVersions),
}));

export const sowDocumentVersionsRelations = relations(sowDocumentVersions, ({ one }) => ({
  sowDocument: one(sowDocuments, { fields: [sowDocumentVersions.sowDocumentId], references: [sowDocuments.id] }),
  changedByUser: one(user, { fields: [sowDocumentVersions.changedBy], references: [user.id], relationName: 'sowVersionChanger' }),
}));

export const costEstimationHistoryRelations = relations(costEstimationHistory, ({ one }) => ({
  project: one(projects, { fields: [costEstimationHistory.projectId], references: [projects.id] }),
}));
