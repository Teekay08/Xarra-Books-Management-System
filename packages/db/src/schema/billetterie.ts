import {
  pgTable, uuid, varchar, text, timestamp, decimal, pgEnum, smallint,
  jsonb, index, boolean, integer, date, unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth';
import { staffMembers } from './project-management';

// ==========================================
// ENUMS
// ==========================================

export const bilProjectStatusEnum = pgEnum('bil_project_status', [
  'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED',
]);

export const bilPhaseKeyEnum = pgEnum('bil_phase_key', [
  'INITIATION', 'ELICITATION', 'ARCHITECTURE',
  'DEVELOPMENT', 'TESTING', 'SIGN_OFF', 'CLOSURE',
]);

export const bilPhaseStatusEnum = pgEnum('bil_phase_status', [
  'LOCKED', 'ACTIVE', 'APPROVED',
]);

export const bilTeamRoleEnum = pgEnum('bil_team_role', [
  'SPONSOR', 'PM', 'BA', 'ADMIN',
]);

export const bilMilestoneStatusEnum = pgEnum('bil_milestone_status', [
  'PENDING', 'MET', 'MISSED', 'DEFERRED',
]);

export const bilTaskStatusEnum = pgEnum('bil_task_status', [
  'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED',
]);

export const bilTaskPriorityEnum = pgEnum('bil_task_priority', [
  'LOW', 'MEDIUM', 'HIGH', 'URGENT',
]);

export const bilTimeLogStatusEnum = pgEnum('bil_time_log_status', [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED',
]);

export const bilBugSeverityEnum = pgEnum('bil_bug_severity', [
  'LOW', 'MEDIUM', 'HIGH', 'CRITICAL',
]);

export const bilBugStatusEnum = pgEnum('bil_bug_status', [
  'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX',
]);

export const bilIssueTypeEnum = pgEnum('bil_issue_type', [
  'BUG', 'FEATURE', 'IMPROVEMENT', 'QUESTION', 'TASK',
]);

export const bilIssueStatusEnum = pgEnum('bil_issue_status', [
  'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX',
]);

// PMS Phase 1 enums
export const bilRiskStatusEnum    = pgEnum('bil_risk_status',    ['OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED']);
export const bilSprintStatusEnum  = pgEnum('bil_sprint_status',  ['PLANNING', 'ACTIVE', 'DEMO_PENDING', 'SIGNED_OFF', 'CANCELLED']);
export const bilProjectTypeEnum   = pgEnum('bil_project_type',   ['ADAPTIVE', 'CORRECTIVE', 'PERFECTIVE', 'STRATEGIC', 'GLOBAL']);
export const bilHealthStatusEnum  = pgEnum('bil_health_status',  ['R', 'A', 'G']);

// ==========================================
// BILLETTERIE PROJECTS
// ==========================================

export const billetterieProjects = pgTable('billetterie_projects', {
  id:            uuid('id').primaryKey().defaultRandom(),
  number:        varchar('number', { length: 20 }).notNull().unique(),
  name:          varchar('name', { length: 255 }).notNull(),
  client:        varchar('client', { length: 255 }),
  description:   text('description'),
  status:        bilProjectStatusEnum('status').notNull().default('ACTIVE'),
  currentPhase:  bilPhaseKeyEnum('current_phase').notNull().default('INITIATION'),

  // PM shortcut columns
  managerId:     uuid('manager_id').references(() => staffMembers.id),
  sponsorId:     uuid('sponsor_id').references(() => staffMembers.id),

  // Dates
  startDate:     varchar('start_date', { length: 20 }),
  targetEndDate: varchar('target_end_date', { length: 20 }),
  completedAt:   timestamp('completed_at', { withTimezone: true }),

  // Budget
  budget:        decimal('budget', { precision: 14, scale: 2 }),

  // Client contact
  contactName:   varchar('contact_name', { length: 255 }),
  contactEmail:  varchar('contact_email', { length: 255 }),
  contactPhone:  varchar('contact_phone', { length: 50 }),

  // Internal
  notes:         text('notes'),
  createdBy:     text('created_by').references(() => user.id),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // PMS Phase 1: project type + adaptive gate
  projectType:   bilProjectTypeEnum('project_type'),
  isAdaptive:    boolean('is_adaptive').notNull().default(false),

  // Health R/A/G
  healthStatus:  bilHealthStatusEnum('health_status'),
  healthNotes:   text('health_notes'),
  healthUpdatedAt: timestamp('health_updated_at', { withTimezone: true }),

  // Adaptive project Day-20 extension approval
  adaptiveExtensionApproved:   boolean('adaptive_extension_approved').notNull().default(false),
  adaptiveExtensionApprovedBy: text('adaptive_extension_approved_by'),
  adaptiveExtensionApprovedAt: timestamp('adaptive_extension_approved_at', { withTimezone: true }),
  adaptiveExtensionReason:     text('adaptive_extension_reason'),

  // Lessons Learned — required gate before CLOSURE can archive
  llSubmitted:        boolean('ll_submitted').notNull().default(false),
  llWhatWentWell:     text('ll_what_went_well'),
  llWhatDidnt:        text('ll_what_didnt'),
  llRecommendations:  text('ll_recommendations'),
  llSubmittedBy:      text('ll_submitted_by'),
  llSubmittedAt:      timestamp('ll_submitted_at', { withTimezone: true }),
  llAcknowledgedBy:   text('ll_acknowledged_by'),
  llAcknowledgedAt:   timestamp('ll_acknowledged_at', { withTimezone: true }),
}, (t) => [
  index('idx_bil_projects_status').on(t.status),
  index('idx_bil_projects_phase').on(t.currentPhase),
  index('idx_bil_projects_health').on(t.healthStatus),
  index('idx_bil_projects_type').on(t.projectType),
]);

// ==========================================
// PROJECT TEAM
// ==========================================

export const billetterieProjectTeam = pgTable('billetterie_project_team', {
  id:            uuid('id').primaryKey().defaultRandom(),
  projectId:     uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  staffMemberId: uuid('staff_member_id').notNull().references(() => staffMembers.id),
  role:          bilTeamRoleEnum('role').notNull(),
  addedBy:       text('added_by').references(() => user.id),
  addedAt:       timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_team_project').on(t.projectId),
  unique().on(t.projectId, t.staffMemberId),
]);

// ==========================================
// BILLETTERIE PROJECT PHASES
// ==========================================

export const billetterieProjectPhases = pgTable('billetterie_project_phases', {
  id:        uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  phaseKey:  bilPhaseKeyEnum('phase_key').notNull(),
  status:    bilPhaseStatusEnum('status').notNull().default('LOCKED'),

  gateDocuments: jsonb('gate_documents').$type<Array<{
    name: string;
    status: 'PENDING' | 'APPROVED';
    uploadedAt?: string;
    notes?: string;
  }>>().default([]),

  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: text('approved_by').references(() => user.id),
  notes:      text('notes'),

  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_phases_project').on(t.projectId),
]);

// ==========================================
// MILESTONES
// ==========================================

export const billetterieMilestones = pgTable('billetterie_milestones', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  phaseKey:    bilPhaseKeyEnum('phase_key').notNull(),
  title:       varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  dueDate:     varchar('due_date', { length: 20 }),
  status:      bilMilestoneStatusEnum('status').notNull().default('PENDING'),
  createdBy:   text('created_by').references(() => user.id),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_milestones_project').on(t.projectId),
  index('idx_bil_milestones_status').on(t.status),
]);

// ==========================================
// BILLETTERIE TASKS
// ==========================================

export const billetterieTasks = pgTable('billetterie_tasks', {
  id:           uuid('id').primaryKey().defaultRandom(),
  projectId:    uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  phaseKey:     bilPhaseKeyEnum('phase_key').notNull().default('DEVELOPMENT'),
  milestoneId:  uuid('milestone_id').references(() => billetterieMilestones.id, { onDelete: 'set null' }),
  parentTaskId: uuid('parent_task_id'), // self-reference, handled as plain uuid (no FK cycle in Drizzle definition)
  title:        varchar('title', { length: 255 }).notNull(),
  description:  text('description'),
  status:       bilTaskStatusEnum('status').notNull().default('TODO'),
  priority:     bilTaskPriorityEnum('priority').notNull().default('MEDIUM'),
  assignedTo:   uuid('assigned_to').references(() => staffMembers.id),
  estimatedHours: decimal('estimated_hours', { precision: 6, scale: 2 }),
  loggedHours:    decimal('logged_hours', { precision: 6, scale: 2 }).default('0'),
  startDate:    varchar('start_date', { length: 20 }),
  dueDate:      varchar('due_date', { length: 20 }),
  labels:       jsonb('labels').$type<string[]>().default([]),
  position:     integer('position').notNull().default(0),
  storyPoints:  integer('story_points'),
  sprintId:     uuid('sprint_id'), // FK set in migration; forward-ref handled there
  completedAt:  timestamp('completed_at', { withTimezone: true }),
  createdBy:    text('created_by').references(() => user.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_tasks_project').on(t.projectId),
  index('idx_bil_tasks_status').on(t.status),
  index('idx_bil_tasks_position').on(t.projectId, t.status, t.position),
  index('idx_bil_tasks_sprint').on(t.sprintId),
]);

// ==========================================
// TIME LOGS
// ==========================================

export const billetterieTimeLogs = pgTable('billetterie_time_logs', {
  id:             uuid('id').primaryKey().defaultRandom(),
  // Either taskId OR deliverableId must be set (constraint in DB: bil_time_log_entity_check)
  taskId:         uuid('task_id').references(() => billetterieTasks.id, { onDelete: 'cascade' }),
  deliverableId:  uuid('deliverable_id').references(() => billetteriePhaseDeliverables.id, { onDelete: 'cascade' }),
  staffMemberId:  uuid('staff_member_id').notNull().references(() => staffMembers.id),
  workDate:       date('work_date').notNull(),
  hours:          decimal('hours', { precision: 5, scale: 2 }).notNull(),
  description:    text('description'),
  status:         bilTimeLogStatusEnum('status').notNull().default('DRAFT'),
  approvedBy:     text('approved_by').references(() => user.id),
  approvedAt:     timestamp('approved_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_timelogs_task').on(t.taskId),
  index('idx_bil_timelogs_deliverable').on(t.deliverableId),
  index('idx_bil_timelogs_staff_date').on(t.staffMemberId, t.workDate),
  index('idx_bil_timelogs_status').on(t.status),
]);

// ==========================================
// BILLETTERIE CLIENT MEETINGS
// ==========================================

export const billetterieMeetings = pgTable('billetterie_meetings', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  phaseKey:    bilPhaseKeyEnum('phase_key'),
  title:       varchar('title', { length: 255 }).notNull(),
  meetingDate: varchar('meeting_date', { length: 20 }).notNull(),
  attendees:   jsonb('attendees').$type<string[]>().default([]),
  agenda:      text('agenda'),
  minutes:     text('minutes'),
  actionItems: jsonb('action_items').$type<Array<{ item: string; owner: string; dueDate?: string; done: boolean }>>().default([]),
  recordedBy:  text('recorded_by').references(() => user.id),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_meetings_project').on(t.projectId),
]);

// ==========================================
// ISSUES (replaces bugs in UI)
// ==========================================

export const billetterieIssues = pgTable('billetterie_issues', {
  id:               uuid('id').primaryKey().defaultRandom(),
  projectId:        uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  issueNumber:      integer('issue_number').notNull(),
  title:            varchar('title', { length: 500 }).notNull(),
  body:             text('body'),
  type:             bilIssueTypeEnum('type').notNull().default('BUG'),
  severity:         bilBugSeverityEnum('severity'),
  status:           bilIssueStatusEnum('status').notNull().default('OPEN'),
  milestoneId:      uuid('milestone_id').references(() => billetterieMilestones.id, { onDelete: 'set null' }),
  assignees:        jsonb('assignees').$type<string[]>().default([]),
  labels:           jsonb('labels').$type<string[]>().default([]),
  stepsToReproduce: text('steps_to_reproduce'),
  linkedTaskId:     uuid('linked_task_id').references(() => billetterieTasks.id, { onDelete: 'set null' }),
  reportedBy:       text('reported_by').references(() => user.id),
  closedAt:         timestamp('closed_at', { withTimezone: true }),
  closedBy:         text('closed_by').references(() => user.id),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_issues_project').on(t.projectId),
  index('idx_bil_issues_status').on(t.status),
  index('idx_bil_issues_milestone').on(t.milestoneId),
  unique().on(t.projectId, t.issueNumber),
]);

// ==========================================
// ISSUE COMMENTS
// ==========================================

export const billetterieIssueComments = pgTable('billetterie_issue_comments', {
  id:        uuid('id').primaryKey().defaultRandom(),
  issueId:   uuid('issue_id').notNull().references(() => billetterieIssues.id, { onDelete: 'cascade' }),
  authorId:  text('author_id').notNull().references(() => user.id),
  body:      text('body').notNull(),
  isEdited:  boolean('is_edited').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_issue_comments_issue').on(t.issueId),
]);

// ==========================================
// ISSUE LABELS
// ==========================================

export const billetterieIssueLabels = pgTable('billetterie_issue_labels', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 100 }).notNull(),
  color:       varchar('color', { length: 7 }).notNull().default('#6b7280'),
  description: text('description'),
  createdBy:   text('created_by').references(() => user.id),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_labels_project').on(t.projectId),
  unique().on(t.projectId, t.name),
]);

// ==========================================
// CLIENT PORTAL TOKENS
// ==========================================

export const billetterieClientTokens = pgTable('billetterie_client_tokens', {
  id:             uuid('id').primaryKey().defaultRandom(),
  projectId:      uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  token:          varchar('token', { length: 64 }).notNull().unique(),
  clientEmail:    varchar('client_email', { length: 255 }).notNull(),
  clientName:     varchar('client_name', { length: 255 }).notNull(),
  permissions:    jsonb('permissions').$type<{
    viewPhases: boolean;
    viewTasks: boolean;
    viewIssues: boolean;
    viewTimeline: boolean;
    viewMeetings: boolean;
    approveDeliverables: boolean;
  }>().notNull().default({} as any),
  expiresAt:      timestamp('expires_at', { withTimezone: true }).notNull(),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  isActive:       boolean('is_active').notNull().default(true),
  createdBy:      text('created_by').references(() => user.id),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_client_tokens_token').on(t.token),
  index('idx_bil_client_tokens_project').on(t.projectId),
]);

// ==========================================
// PHASE DELIVERABLES
// ==========================================

export const bilDeliverableStatusEnum = pgEnum('bil_deliverable_status', [
  'PENDING', 'IN_PROGRESS', 'COMPLETE',
]);

export const billetteriePhaseDeliverables = pgTable('billetterie_phase_deliverables', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  phaseKey:    bilPhaseKeyEnum('phase_key').notNull(),
  title:       varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status:      bilDeliverableStatusEnum('status').notNull().default('PENDING'),
  assignedTo:  uuid('assigned_to').references(() => staffMembers.id),
  dueDate:     varchar('due_date', { length: 20 }),
  isRequired:  boolean('is_required').notNull().default(true),
  createdBy:   text('created_by').references(() => user.id),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_deliverables_project').on(t.projectId),
  index('idx_bil_deliverables_phase').on(t.projectId, t.phaseKey),
  index('idx_bil_deliverables_status').on(t.status),
]);

// ==========================================
// PROJECT DOCUMENTS
// ==========================================

export const billetterieProjectDocuments = pgTable('billetterie_project_documents', {
  id:             uuid('id').primaryKey().defaultRandom(),
  projectId:      uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  phaseKey:       bilPhaseKeyEnum('phase_key'),
  deliverableId:  uuid('deliverable_id').references(() => billetteriePhaseDeliverables.id, { onDelete: 'set null' }),
  name:           varchar('name', { length: 255 }).notNull(),
  fileKey:        varchar('file_key', { length: 500 }).notNull(),
  fileName:       varchar('file_name', { length: 255 }).notNull(),
  fileSize:       integer('file_size').notNull(),
  mimeType:       varchar('mime_type', { length: 100 }).notNull(),
  uploadedBy:     text('uploaded_by').references(() => user.id),
  uploadedAt:     timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_docs_project').on(t.projectId),
  index('idx_bil_docs_phase').on(t.projectId, t.phaseKey),
  index('idx_bil_docs_deliverable').on(t.deliverableId),
]);

// ==========================================
// PMS PHASE 1 — RACI MATRIX
// ==========================================

export const billetterieProjectRaci = pgTable('billetterie_project_raci', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  area:            varchar('area', { length: 255 }).notNull(),
  responsibleId:   uuid('responsible_id').references(() => staffMembers.id),
  accountableId:   uuid('accountable_id').references(() => staffMembers.id),
  consulted:       jsonb('consulted').$type<string[]>().notNull().default([]),
  informed:        jsonb('informed').$type<string[]>().notNull().default([]),
  phaseKey:        bilPhaseKeyEnum('phase_key'),
  notes:           text('notes'),
  createdBy:       text('created_by'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_raci_project').on(t.projectId),
]);

// ==========================================
// PMS PHASE 1 — RISK MATRIX
// ==========================================

export const billetterieRisks = pgTable('billetterie_risks', {
  id:           uuid('id').primaryKey().defaultRandom(),
  projectId:    uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  title:        varchar('title', { length: 255 }).notNull(),
  description:  text('description'),
  category:     varchar('category', { length: 100 }),
  probability:  smallint('probability').notNull().default(1),
  impact:       smallint('impact').notNull().default(1),
  mitigation:   text('mitigation'),
  ownerId:      uuid('owner_id').references(() => staffMembers.id),
  reviewDate:   date('review_date'),
  status:       bilRiskStatusEnum('status').notNull().default('OPEN'),
  createdBy:    text('created_by'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_risks_project').on(t.projectId),
  index('idx_bil_risks_status').on(t.status),
]);

// ==========================================
// PMS PHASE 1 — SPRINTS / ITERATIONS
// ==========================================

export const billetterieSprints = pgTable('billetterie_sprints', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  projectId:           uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  name:                varchar('name', { length: 100 }).notNull(),
  goal:                text('goal'),
  startDate:           date('start_date').notNull(),
  endDate:             date('end_date').notNull(),
  status:              bilSprintStatusEnum('status').notNull().default('PLANNING'),
  // Demo gate
  demoRecordedAt:      timestamp('demo_recorded_at', { withTimezone: true }),
  demoAttachmentUrl:   varchar('demo_attachment_url', { length: 500 }),
  demoNotes:           text('demo_notes'),
  // PM sign-off
  signedOffBy:         text('signed_off_by'),
  signedOffAt:         timestamp('signed_off_at', { withTimezone: true }),
  // Sponsor approval
  sponsorApproved:     boolean('sponsor_approved').notNull().default(false),
  sponsorApprovedBy:   text('sponsor_approved_by'),
  sponsorApprovedAt:   timestamp('sponsor_approved_at', { withTimezone: true }),
  createdBy:           text('created_by'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_sprints_project').on(t.projectId),
  index('idx_bil_sprints_status').on(t.status),
]);

// ==========================================
// LEGACY BUG REGISTER (kept for data integrity)
// ==========================================

export const billetterieBugs = pgTable('billetterie_bugs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  bugNumber:   integer('bug_number').notNull(),
  title:       varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  stepsToReproduce: text('steps_to_reproduce'),
  severity:    bilBugSeverityEnum('severity').notNull().default('MEDIUM'),
  status:      bilBugStatusEnum('status').notNull().default('OPEN'),
  assignedTo:  uuid('assigned_to').references(() => staffMembers.id),
  reportedBy:  text('reported_by').references(() => user.id),
  resolvedAt:  timestamp('resolved_at', { withTimezone: true }),
  resolution:  text('resolution'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_bugs_project').on(t.projectId),
  index('idx_bil_bugs_status').on(t.status),
]);

// ==========================================
// RELATIONS
// ==========================================

export const billetterieProjectsRelations = relations(billetterieProjects, ({ many, one }) => ({
  phases:        many(billetterieProjectPhases),
  team:          many(billetterieProjectTeam),
  meetings:      many(billetterieMeetings),
  tasks:         many(billetterieTasks),
  bugs:          many(billetterieBugs),
  milestones:    many(billetterieMilestones),
  issues:        many(billetterieIssues),
  issueLabels:   many(billetterieIssueLabels),
  clientTokens:  many(billetterieClientTokens),
  deliverables:  many(billetteriePhaseDeliverables),
  documents:     many(billetterieProjectDocuments),
  raci:           many(billetterieProjectRaci),
  risks:          many(billetterieRisks),
  sprints:        many(billetterieSprints),
  tickets:        many(billetterieSupportTickets),
  slaPolicies:    many(billetterieSLAPolicies),
  changeRequests: many(billetterieChangeRequests),
  testPlans:      many(billetterieTestPlans),
  manager:        one(staffMembers, { fields: [billetterieProjects.managerId], references: [staffMembers.id] }),
  sponsor:       one(staffMembers, { fields: [billetterieProjects.sponsorId], references: [staffMembers.id] }),
}));

export const billetterieProjectTeamRelations = relations(billetterieProjectTeam, ({ one }) => ({
  project:     one(billetterieProjects, { fields: [billetterieProjectTeam.projectId], references: [billetterieProjects.id] }),
  staffMember: one(staffMembers, { fields: [billetterieProjectTeam.staffMemberId], references: [staffMembers.id] }),
}));

export const billetterieProjectPhasesRelations = relations(billetterieProjectPhases, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieProjectPhases.projectId], references: [billetterieProjects.id] }),
}));

export const billetterieMilestonesRelations = relations(billetterieMilestones, ({ one, many }) => ({
  project: one(billetterieProjects, { fields: [billetterieMilestones.projectId], references: [billetterieProjects.id] }),
  tasks:   many(billetterieTasks),
  issues:  many(billetterieIssues),
}));

export const billetterieTasksRelations = relations(billetterieTasks, ({ one, many }) => ({
  project:   one(billetterieProjects, { fields: [billetterieTasks.projectId], references: [billetterieProjects.id] }),
  milestone: one(billetterieMilestones, { fields: [billetterieTasks.milestoneId], references: [billetterieMilestones.id] }),
  sprint:    one(billetterieSprints, { fields: [billetterieTasks.sprintId], references: [billetterieSprints.id] }),
  assignee:  one(staffMembers, { fields: [billetterieTasks.assignedTo], references: [staffMembers.id] }),
  timeLogs:  many(billetterieTimeLogs),
  issues:    many(billetterieIssues),
}));

export const billetterieTimeLogsRelations = relations(billetterieTimeLogs, ({ one }) => ({
  task:         one(billetterieTasks, { fields: [billetterieTimeLogs.taskId], references: [billetterieTasks.id] }),
  deliverable:  one(billetteriePhaseDeliverables, { fields: [billetterieTimeLogs.deliverableId], references: [billetteriePhaseDeliverables.id] }),
  staffMember:  one(staffMembers, { fields: [billetterieTimeLogs.staffMemberId], references: [staffMembers.id] }),
}));

export const billetterieMeetingsRelations = relations(billetterieMeetings, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieMeetings.projectId], references: [billetterieProjects.id] }),
}));

export const billetterieIssuesRelations = relations(billetterieIssues, ({ one, many }) => ({
  project:    one(billetterieProjects, { fields: [billetterieIssues.projectId], references: [billetterieProjects.id] }),
  milestone:  one(billetterieMilestones, { fields: [billetterieIssues.milestoneId], references: [billetterieMilestones.id] }),
  linkedTask: one(billetterieTasks, { fields: [billetterieIssues.linkedTaskId], references: [billetterieTasks.id] }),
  comments:   many(billetterieIssueComments),
}));

export const billetterieIssueCommentsRelations = relations(billetterieIssueComments, ({ one }) => ({
  issue: one(billetterieIssues, { fields: [billetterieIssueComments.issueId], references: [billetterieIssues.id] }),
}));

export const billetterieIssueLabelsRelations = relations(billetterieIssueLabels, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieIssueLabels.projectId], references: [billetterieProjects.id] }),
}));

export const billetterieClientTokensRelations = relations(billetterieClientTokens, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieClientTokens.projectId], references: [billetterieProjects.id] }),
}));

export const billetterieBugsRelations = relations(billetterieBugs, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieBugs.projectId], references: [billetterieProjects.id] }),
}));

export const billetteriePhaseDeliverablesRelations = relations(billetteriePhaseDeliverables, ({ one, many }) => ({
  project:   one(billetterieProjects, { fields: [billetteriePhaseDeliverables.projectId], references: [billetterieProjects.id] }),
  assignee:  one(staffMembers, { fields: [billetteriePhaseDeliverables.assignedTo], references: [staffMembers.id] }),
  documents: many(billetterieProjectDocuments),
  timeLogs:  many(billetterieTimeLogs),
}));

export const billetterieProjectDocumentsRelations = relations(billetterieProjectDocuments, ({ one }) => ({
  project:     one(billetterieProjects, { fields: [billetterieProjectDocuments.projectId], references: [billetterieProjects.id] }),
  deliverable: one(billetteriePhaseDeliverables, { fields: [billetterieProjectDocuments.deliverableId], references: [billetteriePhaseDeliverables.id] }),
}));

export const billetterieProjectRaciRelations = relations(billetterieProjectRaci, ({ one }) => ({
  project:     one(billetterieProjects, { fields: [billetterieProjectRaci.projectId], references: [billetterieProjects.id] }),
  responsible: one(staffMembers, { fields: [billetterieProjectRaci.responsibleId], references: [staffMembers.id], relationName: 'raciResponsible' }),
  accountable: one(staffMembers, { fields: [billetterieProjectRaci.accountableId], references: [staffMembers.id], relationName: 'raciAccountable' }),
}));

export const billetterieRisksRelations = relations(billetterieRisks, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieRisks.projectId], references: [billetterieProjects.id] }),
  owner:   one(staffMembers, { fields: [billetterieRisks.ownerId], references: [staffMembers.id] }),
}));

export const billetterieSprintsRelations = relations(billetterieSprints, ({ one, many }) => ({
  project: one(billetterieProjects, { fields: [billetterieSprints.projectId], references: [billetterieProjects.id] }),
  tasks:   many(billetterieTasks),
}));

// ==========================================
// SUPPORT DESK
// ==========================================

export const bilTicketStatusEnum   = pgEnum('bil_ticket_status',   ['OPEN', 'IN_PROGRESS', 'PENDING_CLIENT', 'RESOLVED', 'CLOSED']);
export const bilTicketPriorityEnum = pgEnum('bil_ticket_priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const bilTicketCategoryEnum = pgEnum('bil_ticket_category', ['BUG', 'FEATURE_REQUEST', 'QUESTION', 'CHANGE_REQUEST', 'INCIDENT', 'OTHER']);

export const billetterieSLAPolicies = pgTable('billetterie_sla_policies', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  priority:        bilTicketPriorityEnum('priority').notNull(),
  responseHours:   integer('response_hours').notNull().default(8),
  resolutionHours: integer('resolution_hours').notNull().default(48),
  isBusinessHours: boolean('is_business_hours').notNull().default(true),
  createdBy:       text('created_by'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const billetterieSupportTickets = pgTable('billetterie_support_tickets', {
  id:               uuid('id').primaryKey().defaultRandom(),
  projectId:        uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  ticketNumber:     integer('ticket_number').notNull(),
  title:            varchar('title', { length: 500 }).notNull(),
  description:      text('description').notNull(),
  category:         bilTicketCategoryEnum('category').notNull().default('OTHER'),
  priority:         bilTicketPriorityEnum('priority').notNull().default('MEDIUM'),
  status:           bilTicketStatusEnum('status').notNull().default('OPEN'),
  slaResponseDue:   timestamp('sla_response_due', { withTimezone: true }),
  slaResolutionDue: timestamp('sla_resolution_due', { withTimezone: true }),
  firstRespondedAt: timestamp('first_responded_at', { withTimezone: true }),
  resolvedAt:       timestamp('resolved_at', { withTimezone: true }),
  slaBreached:      boolean('sla_breached').notNull().default(false),
  reportedBy:       text('reported_by').notNull().references(() => user.id),
  assignedToStaff:  uuid('assigned_to_staff').references(() => staffMembers.id),
  linkedIssueId:    uuid('linked_issue_id').references(() => billetterieIssues.id, { onDelete: 'set null' }),
  tags:             jsonb('tags').$type<string[]>().notNull().default([]),
  resolutionNotes:  text('resolution_notes'),
  closedBy:         text('closed_by').references(() => user.id),
  closedAt:         timestamp('closed_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_tickets_project').on(t.projectId),
  index('idx_bil_tickets_status').on(t.status),
  index('idx_bil_tickets_priority').on(t.priority),
  index('idx_bil_tickets_sla_due').on(t.slaResolutionDue),
  unique().on(t.projectId, t.ticketNumber),
]);

export const billetterieTicketComments = pgTable('billetterie_ticket_comments', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ticketId:   uuid('ticket_id').notNull().references(() => billetterieSupportTickets.id, { onDelete: 'cascade' }),
  authorId:   text('author_id').notNull().references(() => user.id),
  body:       text('body').notNull(),
  isInternal: boolean('is_internal').notNull().default(false),
  isEdited:   boolean('is_edited').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_ticket_comments_ticket').on(t.ticketId),
]);

// Support desk relations
export const billetterieSupportTicketsRelations = relations(billetterieSupportTickets, ({ one, many }) => ({
  project:     one(billetterieProjects, { fields: [billetterieSupportTickets.projectId], references: [billetterieProjects.id] }),
  assignee:    one(staffMembers, { fields: [billetterieSupportTickets.assignedToStaff], references: [staffMembers.id] }),
  linkedIssue: one(billetterieIssues, { fields: [billetterieSupportTickets.linkedIssueId], references: [billetterieIssues.id] }),
  comments:    many(billetterieTicketComments),
}));

export const billetterieTicketCommentsRelations = relations(billetterieTicketComments, ({ one }) => ({
  ticket: one(billetterieSupportTickets, { fields: [billetterieTicketComments.ticketId], references: [billetterieSupportTickets.id] }),
}));

export const billetterieSLAPoliciesRelations = relations(billetterieSLAPolicies, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieSLAPolicies.projectId], references: [billetterieProjects.id] }),
}));

// ==========================================
// CHANGE REQUESTS (CAB)
// ==========================================

export const bilChangeTypeEnum   = pgEnum('bil_change_type',   ['SCOPE', 'TIMELINE', 'BUDGET', 'TECHNICAL', 'PROCESS', 'OTHER']);
export const bilChangeStatusEnum = pgEnum('bil_change_status', ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'WITHDRAWN']);
export const bilChangeImpactEnum = pgEnum('bil_change_impact', ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const billetterieChangeRequests = pgTable('billetterie_change_requests', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  projectId:            uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  crNumber:             integer('cr_number').notNull(),
  title:                varchar('title', { length: 500 }).notNull(),
  description:          text('description').notNull(),
  type:                 bilChangeTypeEnum('type').notNull().default('OTHER'),
  status:               bilChangeStatusEnum('status').notNull().default('DRAFT'),
  impactScope:          bilChangeImpactEnum('impact_scope').notNull().default('NONE'),
  impactTimeline:       bilChangeImpactEnum('impact_timeline').notNull().default('NONE'),
  impactBudget:         bilChangeImpactEnum('impact_budget').notNull().default('NONE'),
  impactRisk:           bilChangeImpactEnum('impact_risk').notNull().default('NONE'),
  justification:        text('justification'),
  alternatives:         text('alternatives'),
  rollbackPlan:         text('rollback_plan'),
  estimatedEffortDays:  decimal('estimated_effort_days', { precision: 6, scale: 1 }),
  estimatedCost:        decimal('estimated_cost', { precision: 14, scale: 2 }),
  proposedStart:        date('proposed_start'),
  proposedEnd:          date('proposed_end'),
  requestedBy:          text('requested_by').notNull().references(() => user.id),
  reviewedBy:           text('reviewed_by').references(() => user.id),
  reviewedAt:           timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes:          text('review_notes'),
  approvedBy:           text('approved_by').references(() => user.id),
  approvedAt:           timestamp('approved_at', { withTimezone: true }),
  approvalNotes:        text('approval_notes'),
  implementedBy:        text('implemented_by').references(() => user.id),
  implementedAt:        timestamp('implemented_at', { withTimezone: true }),
  implementationNotes:  text('implementation_notes'),
  linkedSprintId:       uuid('linked_sprint_id').references(() => billetterieSprints.id, { onDelete: 'set null' }),
  linkedRiskId:         uuid('linked_risk_id').references(() => billetterieRisks.id, { onDelete: 'set null' }),
  tags:                 jsonb('tags').$type<string[]>().notNull().default([]),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_cr_project').on(t.projectId),
  index('idx_bil_cr_status').on(t.status),
  unique().on(t.projectId, t.crNumber),
]);

export const billetterieChangeRequestsRelations = relations(billetterieChangeRequests, ({ one }) => ({
  project:       one(billetterieProjects, { fields: [billetterieChangeRequests.projectId], references: [billetterieProjects.id] }),
  linkedSprint:  one(billetterieSprints,  { fields: [billetterieChangeRequests.linkedSprintId], references: [billetterieSprints.id] }),
  linkedRisk:    one(billetterieRisks,    { fields: [billetterieChangeRequests.linkedRiskId], references: [billetterieRisks.id] }),
}));

// ==========================================
// TESTING PHASE MANAGEMENT
// ==========================================

export const bilTestPlanStatusEnum = pgEnum('bil_test_plan_status', ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);
export const bilTestTypeEnum       = pgEnum('bil_test_type',        ['FUNCTIONAL', 'REGRESSION', 'SMOKE', 'PERFORMANCE', 'SECURITY', 'UAT', 'OTHER']);
export const bilTestResultEnum     = pgEnum('bil_test_result',      ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'NOT_RUN']);

export const billetterieTestPlans = pgTable('billetterie_test_plans', {
  id:                uuid('id').primaryKey().defaultRandom(),
  projectId:         uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  title:             varchar('title', { length: 255 }).notNull(),
  description:       text('description'),
  status:            bilTestPlanStatusEnum('status').notNull().default('DRAFT'),
  testType:          bilTestTypeEnum('test_type').notNull().default('FUNCTIONAL'),
  linkedSprintId:    uuid('linked_sprint_id').references(() => billetterieSprints.id, { onDelete: 'set null' }),
  linkedMilestoneId: uuid('linked_milestone_id').references(() => billetterieMilestones.id, { onDelete: 'set null' }),
  targetPhase:       bilPhaseKeyEnum('target_phase'),
  passThreshold:     smallint('pass_threshold').notNull().default(80),
  createdBy:         text('created_by').references(() => user.id),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_test_plans_project').on(t.projectId),
  index('idx_bil_test_plans_status').on(t.status),
]);

export const billetterieTestCases = pgTable('billetterie_test_cases', {
  id:             uuid('id').primaryKey().defaultRandom(),
  planId:         uuid('plan_id').notNull().references(() => billetterieTestPlans.id, { onDelete: 'cascade' }),
  projectId:      uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  title:          varchar('title', { length: 500 }).notNull(),
  description:    text('description'),
  steps:          jsonb('steps').$type<Array<{ step: string; expected: string }>>().notNull().default([]),
  expectedResult: text('expected_result'),
  priority:       bilTaskPriorityEnum('priority').notNull().default('MEDIUM'),
  latestResult:   bilTestResultEnum('latest_result').notNull().default('NOT_RUN'),
  linkedIssueId:  uuid('linked_issue_id').references(() => billetterieIssues.id, { onDelete: 'set null' }),
  createdBy:      text('created_by').references(() => user.id),
  position:       integer('position').notNull().default(0),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_test_cases_plan').on(t.planId),
  index('idx_bil_test_cases_result').on(t.latestResult),
]);

export const billetterieTestExecutions = pgTable('billetterie_test_executions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  testCaseId:     uuid('test_case_id').notNull().references(() => billetterieTestCases.id, { onDelete: 'cascade' }),
  planId:         uuid('plan_id').notNull().references(() => billetterieTestPlans.id, { onDelete: 'cascade' }),
  result:         bilTestResultEnum('result').notNull(),
  notes:          text('notes'),
  linkedIssueId:  uuid('linked_issue_id').references(() => billetterieIssues.id, { onDelete: 'set null' }),
  executedBy:     text('executed_by').notNull().references(() => user.id),
  executedAt:     timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_executions_case').on(t.testCaseId),
  index('idx_bil_executions_plan').on(t.planId),
]);

export const billetterieTestPlansRelations = relations(billetterieTestPlans, ({ one, many }) => ({
  project:   one(billetterieProjects, { fields: [billetterieTestPlans.projectId], references: [billetterieProjects.id] }),
  sprint:    one(billetterieSprints,  { fields: [billetterieTestPlans.linkedSprintId], references: [billetterieSprints.id] }),
  milestone: one(billetterieMilestones, { fields: [billetterieTestPlans.linkedMilestoneId], references: [billetterieMilestones.id] }),
  testCases: many(billetterieTestCases),
}));

export const billetterieTestCasesRelations = relations(billetterieTestCases, ({ one, many }) => ({
  plan:         one(billetterieTestPlans, { fields: [billetterieTestCases.planId], references: [billetterieTestPlans.id] }),
  project:      one(billetterieProjects,  { fields: [billetterieTestCases.projectId], references: [billetterieProjects.id] }),
  linkedIssue:  one(billetterieIssues,    { fields: [billetterieTestCases.linkedIssueId], references: [billetterieIssues.id] }),
  executions:   many(billetterieTestExecutions),
}));

export const billetterieTestExecutionsRelations = relations(billetterieTestExecutions, ({ one }) => ({
  testCase:    one(billetterieTestCases, { fields: [billetterieTestExecutions.testCaseId], references: [billetterieTestCases.id] }),
  plan:        one(billetterieTestPlans, { fields: [billetterieTestExecutions.planId], references: [billetterieTestPlans.id] }),
  linkedIssue: one(billetterieIssues,   { fields: [billetterieTestExecutions.linkedIssueId], references: [billetterieIssues.id] }),
}));

// ==========================================
// BILLETTERIE ORG SETTINGS (document branding)
// Separate from Xarra Books' company_settings.
// ==========================================

// ==========================================
// CLIENT PORTAL COMMENTS
// ==========================================
// Clients comment via token; PM/BA respond as authenticated users.

export const billetteriePortalComments = pgTable('billetterie_portal_comments', {
  id:             uuid('id').primaryKey().defaultRandom(),
  projectId:      uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  tokenId:        uuid('token_id').references(() => billetterieClientTokens.id, { onDelete: 'set null' }),
  authorUserId:   text('author_user_id').references(() => user.id, { onDelete: 'set null' }),
  itemType:       varchar('item_type', { length: 50 }),
  itemId:         uuid('item_id'),
  parentId:       uuid('parent_id'),
  body:           text('body').notNull(),
  isTeamResponse: boolean('is_team_response').notNull().default(false),
  isInternal:     boolean('is_internal').notNull().default(false),
  isEdited:       boolean('is_edited').notNull().default(false),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_portal_comments_project').on(t.projectId),
  index('idx_portal_comments_token').on(t.tokenId),
  index('idx_portal_comments_parent').on(t.parentId),
]);

export const billetteriePortalCommentsRelations = relations(billetteriePortalComments, ({ one, many }) => ({
  project: one(billetterieProjects, { fields: [billetteriePortalComments.projectId], references: [billetterieProjects.id] }),
  token:   one(billetterieClientTokens, { fields: [billetteriePortalComments.tokenId], references: [billetterieClientTokens.id] }),
  replies: many(billetteriePortalComments, { relationName: 'commentReplies' }),
  parent:  one(billetteriePortalComments, { fields: [billetteriePortalComments.parentId], references: [billetteriePortalComments.id], relationName: 'commentReplies' }),
}));

// ==========================================
// BILLETTERIE ORG SETTINGS (document branding)
// ==========================================

export const billetterieOrgSettings = pgTable('billetterie_org_settings', {
  id:                uuid('id').primaryKey().defaultRandom(),
  displayName:       varchar('display_name', { length: 255 }).notNull().default('Billetterie Software'),
  tagline:           varchar('tagline', { length: 255 }),
  registrationNumber: varchar('registration_number', { length: 50 }),
  vatNumber:         varchar('vat_number', { length: 50 }),
  addressLine1:      varchar('address_line_1', { length: 255 }),
  addressLine2:      varchar('address_line_2', { length: 255 }),
  city:              varchar('city', { length: 100 }),
  province:          varchar('province', { length: 100 }),
  postalCode:        varchar('postal_code', { length: 20 }),
  country:           varchar('country', { length: 100 }).default('South Africa'),
  phone:             varchar('phone', { length: 50 }),
  email:             varchar('email', { length: 255 }),
  website:           varchar('website', { length: 255 }),
  accentColor:       varchar('accent_color', { length: 20 }).notNull().default('#1d4ed8'),
  logoUrl:           varchar('logo_url', { length: 500 }),
  sowFooterText:     text('sow_footer_text'),
  reportFooterText:  text('report_footer_text'),
  singleton:         boolean('singleton').notNull().default(true),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
