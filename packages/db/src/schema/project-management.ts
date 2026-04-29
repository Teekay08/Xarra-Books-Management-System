import { pgTable, uuid, varchar, text, timestamp, decimal, integer, pgEnum, jsonb, index, uniqueIndex, boolean, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects, projectMilestones } from './budgeting';
import { user } from './auth';

// ==========================================
// ENUMS
// ==========================================

export const taskAssignmentStatusEnum = pgEnum('task_assignment_status', [
  'DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED',
]);

export const timeExtensionStatusEnum = pgEnum('time_extension_status', [
  'PENDING', 'APPROVED', 'DECLINED',
]);

export const staffAvailabilityEnum = pgEnum('staff_availability_type', [
  'FULL_TIME', 'PART_TIME', 'CONTRACT',
]);

export const staffJobFunctionEnum = pgEnum('staff_job_function', [
  'ceo', 'cto', 'coo', 'finance_director', 'managing_director',
  'project_manager', 'programme_manager', 'portfolio_manager',
  'developer', 'senior_developer', 'tech_lead', 'architect', 'devops_engineer',
  'business_analyst', 'systems_analyst', 'data_analyst',
  'qa_engineer', 'test_analyst', 'uat_coordinator',
  'ux_designer', 'ui_designer', 'graphic_designer',
  'editor', 'typesetter', 'copywriter', 'proofreader', 'cover_designer',
  'project_admin', 'executive_assistant',
  'client_representative', 'consultant', 'contractor',
  'other',
]);

export const staffPaymentStatusEnum = pgEnum('staff_payment_status', [
  'PENDING', 'APPROVED', 'PAID',
]);

export const taskRequestStatusEnum = pgEnum('task_request_status', [
  'PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO',
]);

export const deliverableStatusEnum = pgEnum('deliverable_status', [
  'NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED',
]);

// ==========================================
// TASK CODES (categorize tasks for reporting + timesheets)
// ==========================================

export const taskCodes = pgTable('task_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }).notNull().unique(), // e.g. XAR-PUB
  name: varchar('name', { length: 100 }).notNull(), // e.g. Publishing
  category: varchar('category', { length: 50 }).notNull(), // e.g. Production, Operations
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_task_codes_code').on(t.code),
  index('idx_task_codes_active').on(t.isActive),
]);

// ==========================================
// STAFF MEMBERS
// ==========================================

export const staffMembers = pgTable('staff_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.id), // links to Xarra system user account (nullable for external contractors)
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 100 }).notNull(), // legacy free-text job title (kept for backward compat)
  jobFunction: staffJobFunctionEnum('job_function'), // structured function — drives Billetterie role suggestions
  displayTitle: varchar('display_title', { length: 100 }), // optional formatted title shown in UI
  skills: jsonb('skills').notNull().default('[]').$type<string[]>(),
  availabilityType: staffAvailabilityEnum('availability_type').notNull().default('FULL_TIME'),
  maxHoursPerMonth: integer('max_hours_per_month').notNull().default(160),
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('ZAR'),
  isInternal: boolean('is_internal').notNull().default(true), // false = external contractor
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_staff_user_id').on(t.userId),
  index('idx_staff_email').on(t.email),
  index('idx_staff_role').on(t.role),
  index('idx_staff_active').on(t.isActive),
]);

// ==========================================
// STAFF PROJECT ASSIGNMENTS
// ==========================================

export const staffProjectAssignments = pgTable('staff_project_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 100 }).notNull(), // their role on this project
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  totalAllocatedHours: decimal('total_allocated_hours', { precision: 10, scale: 2 }).notNull().default('0'),
  totalLoggedHours: decimal('total_logged_hours', { precision: 10, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  assignedBy: text('assigned_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_staff_project_staff').on(t.staffMemberId),
  index('idx_staff_project_project').on(t.projectId),
  index('idx_staff_project_active').on(t.isActive),
]);

// ==========================================
// TASK ASSIGNMENTS
// ==========================================

export const taskAssignments = pgTable('task_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 20 }).notNull().unique(), // TA-YYYY-NNNN
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  milestoneId: uuid('milestone_id').references(() => projectMilestones.id),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id),
  taskCodeId: uuid('task_code_id').references(() => taskCodes.id), // XAR-PUB, XAR-MKT, etc.
  title: varchar('title', { length: 255 }).notNull(), // task title
  description: text('description'),
  status: taskAssignmentStatusEnum('status').notNull().default('DRAFT'),
  priority: varchar('priority', { length: 10 }).notNull().default('MEDIUM'), // LOW, MEDIUM, HIGH, URGENT
  // Time allocation
  estimatedHours: decimal('estimated_hours', { precision: 10, scale: 2 }), // PM's original estimate
  allocatedHours: decimal('allocated_hours', { precision: 10, scale: 2 }).notNull(),
  loggedHours: decimal('logged_hours', { precision: 10, scale: 2 }).notNull().default('0'),
  remainingHours: decimal('remaining_hours', { precision: 10, scale: 2 }).notNull(),
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull(),
  totalCost: decimal('total_cost', { precision: 12, scale: 2 }).notNull(), // allocatedHours * hourlyRate
  // Dates
  startDate: timestamp('start_date', { withTimezone: true }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  // SOW link (if a formal SOW was issued for this task)
  sowDocumentId: uuid('sow_document_id'),
  // Workflow
  assignedBy: text('assigned_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: text('approved_by'),
  timeExhausted: boolean('time_exhausted').notNull().default(false), // true when logged >= allocated
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_task_assign_project').on(t.projectId),
  index('idx_task_assign_milestone').on(t.milestoneId),
  index('idx_task_assign_staff').on(t.staffMemberId),
  index('idx_task_assign_status').on(t.status),
]);

// ==========================================
// STAFF TASK PLANNER ENTRIES
// ==========================================

export const staffTaskPlannerEntries = pgTable('staff_task_planner_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id, { onDelete: 'cascade' }),
  taskAssignmentId: uuid('task_assignment_id').notNull().references(() => taskAssignments.id, { onDelete: 'cascade' }),
  plannedDate: timestamp('planned_date', { withTimezone: true }).notNull(), // span start date
  endDate: timestamp('end_date', { withTimezone: true }), // span end date (null = single day)
  slotStart: timestamp('slot_start', { withTimezone: true }),
  slotEnd: timestamp('slot_end', { withTimezone: true }),
  plannedHours: decimal('planned_hours', { precision: 5, scale: 2 }), // total hours across the span
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_staff_planner_staff_date').on(t.staffMemberId, t.plannedDate),
  index('idx_staff_planner_task').on(t.taskAssignmentId),
  uniqueIndex('ux_staff_planner_staff_task_day').on(t.staffMemberId, t.taskAssignmentId, t.plannedDate),
]);

// ==========================================
// TASK TIME LOGS (employee enters actual hours)
// ==========================================

export const taskTimeLogs = pgTable('task_time_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskAssignmentId: uuid('task_assignment_id').notNull().references(() => taskAssignments.id, { onDelete: 'cascade' }),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id),
  workDate: timestamp('work_date', { withTimezone: true }).notNull(),
  hours: decimal('hours', { precision: 5, scale: 2 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('LOGGED'), // LOGGED, APPROVED, REJECTED
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_time_logs_task').on(t.taskAssignmentId),
  index('idx_time_logs_staff').on(t.staffMemberId),
  index('idx_time_logs_date').on(t.workDate),
  index('idx_time_logs_status').on(t.status),
]);

// ==========================================
// TIME EXTENSION REQUESTS
// ==========================================

export const timeExtensionRequests = pgTable('time_extension_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskAssignmentId: uuid('task_assignment_id').notNull().references(() => taskAssignments.id),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id),
  requestedHours: decimal('requested_hours', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  status: timeExtensionStatusEnum('status').notNull().default('PENDING'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ext_requests_task').on(t.taskAssignmentId),
  index('idx_ext_requests_staff').on(t.staffMemberId),
  index('idx_ext_requests_status').on(t.status),
]);

// ==========================================
// STAFF PAYMENTS
// ==========================================

export const staffPayments = pgTable('staff_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id),
  projectId: uuid('project_id').references(() => projects.id),
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  totalHours: decimal('total_hours', { precision: 10, scale: 2 }).notNull(),
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull(),
  grossAmount: decimal('gross_amount', { precision: 12, scale: 2 }).notNull(),
  status: staffPaymentStatusEnum('status').notNull().default('PENDING'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentReference: varchar('payment_reference', { length: 100 }),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_staff_payments_staff').on(t.staffMemberId),
  index('idx_staff_payments_project').on(t.projectId),
  index('idx_staff_payments_status').on(t.status),
]);

// ==========================================
// TASK REQUESTS (staff/contractor asks PM to add a task)
// ==========================================

export const taskRequests = pgTable('task_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  requestedByStaffId: uuid('requested_by_staff_id').notNull().references(() => staffMembers.id),
  linkedTaskId: uuid('linked_task_id').references(() => taskAssignments.id), // optional: the task that uncovered the need
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  justification: text('justification').notNull(),
  estimatedHours: decimal('estimated_hours', { precision: 10, scale: 2 }).notNull(),
  status: taskRequestStatusEnum('status').notNull().default('PENDING'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),
  createdTaskId: uuid('created_task_id').references(() => taskAssignments.id), // set on approval
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_task_requests_project').on(t.projectId),
  index('idx_task_requests_staff').on(t.requestedByStaffId),
  index('idx_task_requests_status').on(t.status),
]);

// ==========================================
// CONTRACTOR ACCESS TOKENS (magic links for external workers)
// ==========================================

export const contractorAccessTokens = pgTable('contractor_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: varchar('token', { length: 100 }).notNull().unique(),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_contractor_tokens_token').on(t.token),
  index('idx_contractor_tokens_staff').on(t.staffMemberId),
  index('idx_contractor_tokens_expires').on(t.expiresAt),
]);

// ==========================================
// TASK DELIVERABLES
// ==========================================

export const taskDeliverables = pgTable('task_deliverables', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskAssignmentId: uuid('task_assignment_id').notNull().references(() => taskAssignments.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  estimatedHours: decimal('estimated_hours', { precision: 10, scale: 2 }),
  status: deliverableStatusEnum('status').notNull().default('NOT_STARTED'),
  sortOrder: integer('sort_order').notNull().default(0),
  rejectionReason: text('rejection_reason'),
  reviewedBy: text('reviewed_by').references(() => user.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_deliverables_task').on(t.taskAssignmentId),
  index('idx_deliverables_status').on(t.status),
]);

// ==========================================
// DELIVERABLE LOGS
// ==========================================

export const deliverableLogs = pgTable('deliverable_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliverableId: uuid('deliverable_id').notNull().references(() => taskDeliverables.id, { onDelete: 'cascade' }),
  taskAssignmentId: uuid('task_assignment_id').notNull().references(() => taskAssignments.id, { onDelete: 'cascade' }),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id),
  workDate: date('work_date').notNull(),
  hours: decimal('hours', { precision: 5, scale: 2 }).notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_del_logs_deliverable').on(t.deliverableId),
  index('idx_del_logs_task').on(t.taskAssignmentId),
  index('idx_del_logs_staff').on(t.staffMemberId),
  index('idx_del_logs_date').on(t.workDate),
]);

// ==========================================
// RELATIONS
// ==========================================

export const staffMembersRelations = relations(staffMembers, ({ one, many }) => ({
  systemUser: one(user, { fields: [staffMembers.userId], references: [user.id] }),
  projectAssignments: many(staffProjectAssignments),
  taskAssignments: many(taskAssignments),
  plannerEntries: many(staffTaskPlannerEntries),
  timeLogs: many(taskTimeLogs),
  extensionRequests: many(timeExtensionRequests),
  payments: many(staffPayments),
  deliverableLogs: many(deliverableLogs),
}));

export const staffProjectAssignmentsRelations = relations(staffProjectAssignments, ({ one }) => ({
  staffMember: one(staffMembers, { fields: [staffProjectAssignments.staffMemberId], references: [staffMembers.id] }),
  project: one(projects, { fields: [staffProjectAssignments.projectId], references: [projects.id] }),
}));

export const taskCodesRelations = relations(taskCodes, ({ many }) => ({
  taskAssignments: many(taskAssignments),
}));

export const taskAssignmentsRelations = relations(taskAssignments, ({ one, many }) => ({
  project: one(projects, { fields: [taskAssignments.projectId], references: [projects.id] }),
  milestone: one(projectMilestones, { fields: [taskAssignments.milestoneId], references: [projectMilestones.id] }),
  staffMember: one(staffMembers, { fields: [taskAssignments.staffMemberId], references: [staffMembers.id] }),
  taskCode: one(taskCodes, { fields: [taskAssignments.taskCodeId], references: [taskCodes.id] }),
  plannerEntries: many(staffTaskPlannerEntries),
  timeLogs: many(taskTimeLogs),
  extensionRequests: many(timeExtensionRequests),
  deliverables: many(taskDeliverables),
}));

export const taskDeliverablesRelations = relations(taskDeliverables, ({ one, many }) => ({
  taskAssignment: one(taskAssignments, { fields: [taskDeliverables.taskAssignmentId], references: [taskAssignments.id] }),
  reviewer: one(user, { fields: [taskDeliverables.reviewedBy], references: [user.id], relationName: 'deliverableReviewer' }),
  creator: one(user, { fields: [taskDeliverables.createdBy], references: [user.id], relationName: 'deliverableCreator' }),
  logs: many(deliverableLogs),
}));

export const deliverableLogsRelations = relations(deliverableLogs, ({ one }) => ({
  deliverable: one(taskDeliverables, { fields: [deliverableLogs.deliverableId], references: [taskDeliverables.id] }),
  taskAssignment: one(taskAssignments, { fields: [deliverableLogs.taskAssignmentId], references: [taskAssignments.id] }),
  staffMember: one(staffMembers, { fields: [deliverableLogs.staffMemberId], references: [staffMembers.id] }),
}));

export const staffTaskPlannerEntriesRelations = relations(staffTaskPlannerEntries, ({ one }) => ({
  staffMember: one(staffMembers, { fields: [staffTaskPlannerEntries.staffMemberId], references: [staffMembers.id] }),
  taskAssignment: one(taskAssignments, { fields: [staffTaskPlannerEntries.taskAssignmentId], references: [taskAssignments.id] }),
}));

export const taskTimeLogsRelations = relations(taskTimeLogs, ({ one }) => ({
  taskAssignment: one(taskAssignments, { fields: [taskTimeLogs.taskAssignmentId], references: [taskAssignments.id] }),
  staffMember: one(staffMembers, { fields: [taskTimeLogs.staffMemberId], references: [staffMembers.id] }),
}));

export const timeExtensionRequestsRelations = relations(timeExtensionRequests, ({ one }) => ({
  taskAssignment: one(taskAssignments, { fields: [timeExtensionRequests.taskAssignmentId], references: [taskAssignments.id] }),
  staffMember: one(staffMembers, { fields: [timeExtensionRequests.staffMemberId], references: [staffMembers.id] }),
}));

export const taskRequestsRelations = relations(taskRequests, ({ one }) => ({
  project: one(projects, { fields: [taskRequests.projectId], references: [projects.id] }),
  requestedBy: one(staffMembers, { fields: [taskRequests.requestedByStaffId], references: [staffMembers.id] }),
  linkedTask: one(taskAssignments, { fields: [taskRequests.linkedTaskId], references: [taskAssignments.id], relationName: 'linkedTask' }),
  createdTask: one(taskAssignments, { fields: [taskRequests.createdTaskId], references: [taskAssignments.id], relationName: 'createdTask' }),
}));

export const contractorAccessTokensRelations = relations(contractorAccessTokens, ({ one }) => ({
  staffMember: one(staffMembers, { fields: [contractorAccessTokens.staffMemberId], references: [staffMembers.id] }),
  project: one(projects, { fields: [contractorAccessTokens.projectId], references: [projects.id] }),
}));

export const staffPaymentsRelations = relations(staffPayments, ({ one }) => ({
  staffMember: one(staffMembers, { fields: [staffPayments.staffMemberId], references: [staffMembers.id] }),
  project: one(projects, { fields: [staffPayments.projectId], references: [projects.id] }),
}));
