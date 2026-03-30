import { pgTable, uuid, varchar, text, timestamp, decimal, integer, pgEnum, jsonb, index, boolean } from 'drizzle-orm/pg-core';
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

export const staffPaymentStatusEnum = pgEnum('staff_payment_status', [
  'PENDING', 'APPROVED', 'PAID',
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
  role: varchar('role', { length: 100 }).notNull(), // Editor, Typesetter, Cover Designer, etc.
  skills: jsonb('skills').notNull().default('[]').$type<string[]>(),
  availabilityType: staffAvailabilityEnum('availability_type').notNull().default('FULL_TIME'),
  maxHoursPerWeek: integer('max_hours_per_week').notNull().default(40),
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
  title: varchar('title', { length: 255 }).notNull(), // task title
  description: text('description'),
  status: taskAssignmentStatusEnum('status').notNull().default('DRAFT'),
  priority: varchar('priority', { length: 10 }).notNull().default('MEDIUM'), // LOW, MEDIUM, HIGH, URGENT
  // Time allocation
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
  // Deliverables
  deliverables: jsonb('deliverables').default('[]').$type<Array<{ description: string; completed: boolean }>>(),
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
// RELATIONS
// ==========================================

export const staffMembersRelations = relations(staffMembers, ({ one, many }) => ({
  systemUser: one(user, { fields: [staffMembers.userId], references: [user.id] }),
  projectAssignments: many(staffProjectAssignments),
  taskAssignments: many(taskAssignments),
  timeLogs: many(taskTimeLogs),
  extensionRequests: many(timeExtensionRequests),
  payments: many(staffPayments),
}));

export const staffProjectAssignmentsRelations = relations(staffProjectAssignments, ({ one }) => ({
  staffMember: one(staffMembers, { fields: [staffProjectAssignments.staffMemberId], references: [staffMembers.id] }),
  project: one(projects, { fields: [staffProjectAssignments.projectId], references: [projects.id] }),
}));

export const taskAssignmentsRelations = relations(taskAssignments, ({ one, many }) => ({
  project: one(projects, { fields: [taskAssignments.projectId], references: [projects.id] }),
  milestone: one(projectMilestones, { fields: [taskAssignments.milestoneId], references: [projectMilestones.id] }),
  staffMember: one(staffMembers, { fields: [taskAssignments.staffMemberId], references: [staffMembers.id] }),
  timeLogs: many(taskTimeLogs),
  extensionRequests: many(timeExtensionRequests),
}));

export const taskTimeLogsRelations = relations(taskTimeLogs, ({ one }) => ({
  taskAssignment: one(taskAssignments, { fields: [taskTimeLogs.taskAssignmentId], references: [taskAssignments.id] }),
  staffMember: one(staffMembers, { fields: [taskTimeLogs.staffMemberId], references: [staffMembers.id] }),
}));

export const timeExtensionRequestsRelations = relations(timeExtensionRequests, ({ one }) => ({
  taskAssignment: one(taskAssignments, { fields: [timeExtensionRequests.taskAssignmentId], references: [taskAssignments.id] }),
  staffMember: one(staffMembers, { fields: [timeExtensionRequests.staffMemberId], references: [staffMembers.id] }),
}));

export const staffPaymentsRelations = relations(staffPayments, ({ one }) => ({
  staffMember: one(staffMembers, { fields: [staffPayments.staffMemberId], references: [staffMembers.id] }),
  project: one(projects, { fields: [staffPayments.projectId], references: [projects.id] }),
}));
