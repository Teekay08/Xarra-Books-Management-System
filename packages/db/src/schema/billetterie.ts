import {
  pgTable, uuid, varchar, text, timestamp, decimal, pgEnum, jsonb, index, boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth';

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
  'LOCKED',   // Not yet reachable
  'ACTIVE',   // Currently in progress
  'APPROVED', // Gate signed off — next phase unlocked
]);

// ==========================================
// BILLETTERIE PROJECTS
// ==========================================

export const billetterieProjects = pgTable('billetterie_projects', {
  id:            uuid('id').primaryKey().defaultRandom(),
  number:        varchar('number', { length: 20 }).notNull().unique(), // BIL-YYYY-NNNN
  name:          varchar('name', { length: 255 }).notNull(),
  client:        varchar('client', { length: 255 }),
  description:   text('description'),
  status:        bilProjectStatusEnum('status').notNull().default('ACTIVE'),
  currentPhase:  bilPhaseKeyEnum('current_phase').notNull().default('INITIATION'),

  // Dates
  startDate:     varchar('start_date', { length: 20 }), // ISO date string
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
}, (t) => [
  index('idx_bil_projects_status').on(t.status),
  index('idx_bil_projects_phase').on(t.currentPhase),
]);

// ==========================================
// BILLETTERIE PROJECT PHASES (one per phase per project)
// ==========================================

export const billetterieProjectPhases = pgTable('billetterie_project_phases', {
  id:        uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  phaseKey:  bilPhaseKeyEnum('phase_key').notNull(),
  status:    bilPhaseStatusEnum('status').notNull().default('LOCKED'),

  // Gate documents — array of { name, status: 'PENDING'|'APPROVED', uploadedAt, notes }
  gateDocuments: jsonb('gate_documents').$type<Array<{
    name: string;
    status: 'PENDING' | 'APPROVED';
    uploadedAt?: string;
    notes?: string;
  }>>().default([]),

  // Approval metadata
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: text('approved_by').references(() => user.id),
  notes:      text('notes'),

  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_phases_project').on(t.projectId),
]);

// ==========================================
// BILLETTERIE CLIENT MEETINGS
// ==========================================

export const billetterieMeetings = pgTable('billetterie_meetings', {
  id:        uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => billetterieProjects.id, { onDelete: 'cascade' }),
  phaseKey:  bilPhaseKeyEnum('phase_key'),
  title:     varchar('title', { length: 255 }).notNull(),
  meetingDate: varchar('meeting_date', { length: 20 }).notNull(), // ISO date
  attendees:   jsonb('attendees').$type<string[]>().default([]),
  agenda:    text('agenda'),
  minutes:   text('minutes'),
  actionItems: jsonb('action_items').$type<Array<{ item: string; owner: string; dueDate?: string; done: boolean }>>().default([]),
  recordedBy: text('recorded_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bil_meetings_project').on(t.projectId),
]);

// ==========================================
// RELATIONS
// ==========================================

export const billetterieProjectsRelations = relations(billetterieProjects, ({ many }) => ({
  phases:   many(billetterieProjectPhases),
  meetings: many(billetterieMeetings),
}));

export const billetterieProjectPhasesRelations = relations(billetterieProjectPhases, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieProjectPhases.projectId], references: [billetterieProjects.id] }),
}));

export const billetterieMeetingsRelations = relations(billetterieMeetings, ({ one }) => ({
  project: one(billetterieProjects, { fields: [billetterieMeetings.projectId], references: [billetterieProjects.id] }),
}));
