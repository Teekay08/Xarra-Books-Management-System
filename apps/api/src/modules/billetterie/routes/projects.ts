import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, ilike, or, sql, inArray } from 'drizzle-orm';
import {
  billetterieProjects,
  billetterieProjectPhases,
  billetterieMeetings,
  billetterieTasks,
  billetterieIssues,
  billetterieTimeLogs,
  billetteriePhaseDeliverables,
  billetterieMilestones,
  billetterieProjectTeam,
  billetterieSprints,
  billetterieRisks,
  staffMembers,
} from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import {
  getProjectRole,
  getStaffMemberId,
  isSysAdmin,
  isBilSysAdmin,
  isBilSysManager,
  assertBilProjectRole,
} from '../helpers.js';
import { generatePdf } from '../../../services/pdf.js';
import { renderBilProjectSowHtml } from '../../../services/templates/bil-project-sow.js';
import { billetterieOrgSettings } from '@xarra/db';

// Fetches the Billetterie Software org settings row (singleton).
// Returns sensible defaults if the row doesn't exist yet.
async function getBilOrg(db: any) {
  const row = await db
    .select()
    .from(billetterieOrgSettings)
    .limit(1)
    .then((r: any[]) => r[0] ?? null);

  return {
    name:         row?.displayName   ?? 'Billetterie Software',
    tagline:      row?.tagline       ?? null,
    addressLine1: row?.addressLine1  ?? null,
    city:         row?.city          ?? null,
    province:     row?.province      ?? null,
    postalCode:   row?.postalCode    ?? null,
    phone:        row?.phone         ?? null,
    email:        row?.email         ?? null,
    website:      row?.website       ?? null,
    accentColor:  row?.accentColor   ?? '#1d4ed8',
    logoUrl:      row?.logoUrl       ?? '/Billetterie-logo.png',
    sowFooterText:    row?.sowFooterText    ?? null,
    reportFooterText: row?.reportFooterText ?? null,
  };
}

export const PHASE_ORDER = [
  'INITIATION', 'ELICITATION', 'ARCHITECTURE',
  'DEVELOPMENT', 'TESTING', 'SIGN_OFF', 'CLOSURE',
] as const;

export type PhaseKey = typeof PHASE_ORDER[number];

export const PHASE_GATE_DOCS: Record<PhaseKey, string[]> = {
  INITIATION:   ['Project Charter', 'Stakeholder Register', 'Kick-off Meeting Minutes'],
  ELICITATION:  ['Business Requirements Document', 'User Stories / Use Cases', 'Process Diagrams'],
  ARCHITECTURE: ['System Architecture Document', 'Tech Stack Proposal', 'Architecture Review Sign-off'],
  DEVELOPMENT:  ['Development Plan', 'Sprint Reports'],
  TESTING:      ['Test Plan', 'UAT Sign-off', 'Bug Register (closed)'],
  SIGN_OFF:     ['Client Acceptance Certificate', 'Handover Document', 'Final Invoice'],
  CLOSURE:      ['Project Closure Report', 'Lessons Learned Document'],
};

// Default deliverables seeded for each phase on project creation
export const DEFAULT_PHASE_DELIVERABLES: Record<PhaseKey, string[]> = {
  INITIATION:   ['Project Charter approved', 'Stakeholder Register complete', 'Kick-off Meeting held & minuted'],
  ELICITATION:  ['Business Requirements Document signed off', 'User Stories reviewed with client', 'Process diagrams validated'],
  ARCHITECTURE: ['System Architecture Document approved', 'Tech stack agreed', 'Architecture review sign-off obtained'],
  DEVELOPMENT:  ['Development plan agreed', 'All sprint reports submitted', 'Code review completed'],
  TESTING:      ['Test plan executed', 'UAT sign-off from client', 'Bug register closed (zero critical bugs)'],
  SIGN_OFF:     ['Client Acceptance Certificate signed', 'Handover document delivered', 'Final invoice issued'],
  CLOSURE:      ['Project Closure Report accepted', 'Lessons Learned documented & shared'],
};

export async function generateProjectNumber(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.execute(sql`SELECT nextval('billetterie_project_seq') AS seq`);
  const seq = Number(result[0]?.seq ?? 1);
  return `BIL-${year}-${String(seq).padStart(4, '0')}`;
}

export async function createPhaseRecords(db: any, projectId: string, createdBy?: string): Promise<void> {
  for (const [idx, key] of PHASE_ORDER.entries()) {
    await db.insert(billetterieProjectPhases).values({
      projectId,
      phaseKey: key as PhaseKey,
      status: (idx === 0 ? 'ACTIVE' : 'LOCKED') as 'ACTIVE' | 'LOCKED',
      gateDocuments: PHASE_GATE_DOCS[key].map((name) => ({ name, status: 'PENDING' as const })),
    });
    // Seed required deliverables for each phase
    const deliverables = DEFAULT_PHASE_DELIVERABLES[key as PhaseKey];
    for (const title of deliverables) {
      await db.insert(billetteriePhaseDeliverables).values({
        projectId,
        phaseKey: key,
        title,
        isRequired: true,
        status: 'PENDING',
        createdBy: createdBy ?? null,
      });
    }
  }
}

const createProjectSchema = z.object({
  name:          z.string().min(1),
  client:        z.string().optional().nullable(),
  description:   z.string().optional().nullable(),
  startDate:     z.string().optional().nullable(),
  targetEndDate: z.string().optional().nullable(),
  budget:        z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().positive().nullable().optional()),
  contactName:   z.string().optional().nullable(),
  contactEmail:  z.string().email().optional().nullable().or(z.literal('')),
  contactPhone:  z.string().optional().nullable(),
  notes:         z.string().optional().nullable(),
  managerId:     z.string().uuid().optional().nullable(),
  sponsorId:     z.string().uuid().optional().nullable(),
  projectType:   z.enum(['ADAPTIVE', 'CORRECTIVE', 'PERFECTIVE', 'STRATEGIC', 'GLOBAL']).optional().nullable(),
  isAdaptive:    z.boolean().optional(),
});

const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
});

const updatePhaseSchema = z.object({
  notes:         z.string().optional().nullable(),
  gateDocuments: z.array(z.object({
    name:       z.string(),
    status:     z.enum(['PENDING', 'APPROVED']),
    uploadedAt: z.string().optional(),
    notes:      z.string().optional(),
  })).optional(),
});

const createMeetingSchema = z.object({
  phaseKey:    z.enum(PHASE_ORDER).optional().nullable(),
  title:       z.string().min(1),
  meetingDate: z.string().min(1),
  attendees:   z.array(z.string()).default([]),
  agenda:      z.string().optional().nullable(),
  minutes:     z.string().optional().nullable(),
  actionItems: z.array(z.object({
    item:    z.string(),
    owner:   z.string(),
    dueDate: z.string().optional(),
    done:    z.boolean().default(false),
  })).default([]),
});

export async function projectRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── List projects ────────────────────────────────────────────────────────────
  // BIL_ADMIN / BIL_MANAGER / Xarra admin → all projects.
  // Regular team members → only projects where they are on the team.
  app.get('/projects', { preHandler: requireAuth }, async (request: any) => {
    const user   = request.session!.user as any;
    const page   = Math.max(1, Number((request.query as any).page ?? 1));
    const limit  = Math.min(100, Number((request.query as any).limit ?? 20));
    const search = ((request.query as any).search ?? '').trim();
    const status = ((request.query as any).status ?? '').trim();
    const phase  = ((request.query as any).phase ?? '').trim();
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (search) conditions.push(or(ilike(billetterieProjects.name, `%${search}%`), ilike(billetterieProjects.client, `%${search}%`)));
    if (status && ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].includes(status)) conditions.push(eq(billetterieProjects.status, status as any));
    if (phase && PHASE_ORDER.includes(phase as PhaseKey)) conditions.push(eq(billetterieProjects.currentPhase, phase as any));

    // Scope to team projects for non-system users
    if (!isBilSysManager(user)) {
      const staffId = await getStaffMemberId(db, user.id);
      if (!staffId) return { data: [], stats: {}, pagination: { page, limit, total: 0, totalPages: 0 } };
      conditions.push(sql`${billetterieProjects.id} IN (
        SELECT project_id FROM billetterie_project_team WHERE staff_member_id = ${staffId}
      )`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [projects, countResult, statsRaw] = await Promise.all([
      db.select().from(billetterieProjects).where(where).orderBy(desc(billetterieProjects.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(billetterieProjects).where(where),
      db.execute(sql`SELECT status, COUNT(*) as count FROM billetterie_projects GROUP BY status`),
    ]);

    return {
      data: projects,
      stats: Object.fromEntries((statsRaw as any[]).map((r) => [r.status, Number(r.count)])),
      pagination: { page, limit, total: Number(countResult[0]?.count ?? 0), totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit) },
    };
  });

  // ── Create project ───────────────────────────────────────────────────────────
  // Requires BIL_ADMIN, BIL_MANAGER, or Xarra admin.
  app.post('/projects', { preHandler: requireAuth }, async (request: any, reply) => {
    const user = request.session!.user as any;
    if (!isBilSysManager(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Creating projects requires Billetterie Manager or Admin role' });
    }
    const body = createProjectSchema.parse(request.body);
    const userId = request.session.user.id;
    const number = await generateProjectNumber(db);

    const [project] = await db.insert(billetterieProjects).values({
      number, name: body.name, client: body.client ?? null, description: body.description ?? null,
      startDate: body.startDate ?? null, targetEndDate: body.targetEndDate ?? null,
      budget: body.budget ? String(body.budget) : null,
      contactName: body.contactName ?? null, contactEmail: body.contactEmail || null, contactPhone: body.contactPhone ?? null,
      notes: body.notes ?? null, createdBy: userId, currentPhase: 'INITIATION', status: 'ACTIVE',
      managerId: body.managerId ?? null, sponsorId: body.sponsorId ?? null,
      projectType: (body.projectType ?? null) as any,
      isAdaptive: body.isAdaptive ?? false,
    }).returning();

    await createPhaseRecords(db, project.id, userId);

    // Seed default issue labels
    await db.execute(sql`
      INSERT INTO billetterie_issue_labels (project_id, name, color, description, created_by)
      VALUES
        (${project.id}, 'bug',          '#ef4444', 'Something is not working',          ${userId}),
        (${project.id}, 'enhancement',  '#8b5cf6', 'New feature or request',             ${userId}),
        (${project.id}, 'question',     '#3b82f6', 'Further information is requested',   ${userId}),
        (${project.id}, 'blocked',      '#f97316', 'Blocked by dependency or issue',      ${userId}),
        (${project.id}, 'needs-review', '#10b981', 'Requires review before proceeding',  ${userId})
      ON CONFLICT (project_id, name) DO NOTHING
    `);

    return reply.status(201).send({ data: project });
  });

  // ── Get project detail ───────────────────────────────────────────────────────
  app.get('/projects/:id', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;

    // Non-system users may only view projects they're on the team of
    if (!isBilSysManager(user)) {
      const projectRole = await getProjectRole(db, id, user.id);
      if (!projectRole) return reply.status(403).send({ error: 'Access denied', message: 'You are not a member of this project' });
    }

    const [project, phases, meetings] = await Promise.all([
      db.select().from(billetterieProjects).where(eq(billetterieProjects.id, id)).limit(1).then((r: any[]) => r[0]),
      db.select().from(billetterieProjectPhases).where(eq(billetterieProjectPhases.projectId, id)).orderBy(billetterieProjectPhases.phaseKey),
      db.select().from(billetterieMeetings).where(eq(billetterieMeetings.projectId, id)).orderBy(desc(billetterieMeetings.meetingDate)),
    ]);

    if (!project) return reply.notFound('Project not found');
    return { data: { ...project, phases, meetings } };
  });

  // ── Update project ───────────────────────────────────────────────────────────
  // PM on the project team, BIL_ADMIN, or Xarra admin.
  app.put('/projects/:id', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const userId = user.id;
    const body = updateProjectSchema.parse(request.body);
    const updateData: any = { updatedAt: new Date() };
    if (body.name          !== undefined) updateData.name          = body.name;
    if (body.client        !== undefined) updateData.client        = body.client;
    if (body.description   !== undefined) updateData.description   = body.description;
    if (body.startDate     !== undefined) updateData.startDate     = body.startDate;
    if (body.targetEndDate !== undefined) updateData.targetEndDate = body.targetEndDate;
    if (body.budget        !== undefined) updateData.budget        = body.budget ? String(body.budget) : null;
    if (body.contactName   !== undefined) updateData.contactName   = body.contactName;
    if (body.contactEmail  !== undefined) updateData.contactEmail  = body.contactEmail || null;
    if (body.contactPhone  !== undefined) updateData.contactPhone  = body.contactPhone;
    if (body.notes         !== undefined) updateData.notes         = body.notes;
    if (body.managerId     !== undefined) updateData.managerId     = body.managerId;
    if (body.sponsorId     !== undefined) updateData.sponsorId     = body.sponsorId;
    if (body.projectType   !== undefined) updateData.projectType   = body.projectType;
    if (body.isAdaptive    !== undefined) updateData.isAdaptive    = body.isAdaptive;
    if (body.status        !== undefined) {
      updateData.status = body.status;
      if (body.status === 'COMPLETED') updateData.completedAt = new Date();
    }

    const [updated] = await db.update(billetterieProjects).set(updateData).where(eq(billetterieProjects.id, id)).returning();
    if (!updated) return reply.notFound('Project not found');
    return { data: updated };
  });

  // ── Advance phase ─────────────────────────────────────────────────────────────
  // SPONSOR or PM (or BIL_ADMIN / Xarra admin).
  app.post('/projects/:id/phases/advance', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user   = request.session!.user as any;
    const userId = user.id;
    const { force } = request.query as { force?: string };

    const deny = await assertBilProjectRole(db, id, user, ['SPONSOR', 'PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const project = await db.select().from(billetterieProjects).where(eq(billetterieProjects.id, id)).limit(1).then((r: any[]) => r[0]);
    if (!project) return reply.notFound('Project not found');
    if (project.status !== 'ACTIVE') return reply.badRequest('Only active projects can advance phases');

    const currentPhase = project.currentPhase as PhaseKey;
    const currentIdx   = PHASE_ORDER.indexOf(currentPhase);
    if (currentIdx === PHASE_ORDER.length - 1) return reply.badRequest('Project is already in the final phase (CLOSURE)');

    // Gate check: all required deliverables for the current phase must be COMPLETE
    if (force !== 'true') {
      const blocking = await db
        .select({ id: billetteriePhaseDeliverables.id, title: billetteriePhaseDeliverables.title })
        .from(billetteriePhaseDeliverables)
        .where(
          and(
            eq(billetteriePhaseDeliverables.projectId, id),
            eq(billetteriePhaseDeliverables.phaseKey as any, currentPhase),
            eq(billetteriePhaseDeliverables.isRequired, true),
            sql`status != 'COMPLETE'`,
          ),
        );
      if (blocking.length > 0) {
        return reply.status(422).send({
          error:    'Incomplete deliverables',
          message:  `${blocking.length} required deliverable(s) must be marked COMPLETE before advancing`,
          blocking: blocking.map((d: any) => ({ id: d.id, title: d.title })),
        });
      }

      // Adaptive project Day-20 gate: if the project is adaptive and currently in DEVELOPMENT,
      // check that the extension has been approved (or that we are within the 20-day window).
      if (currentPhase === 'DEVELOPMENT' && project.isAdaptive) {
        const devPhase = await db
          .select({ updatedAt: billetterieProjectPhases.updatedAt })
          .from(billetterieProjectPhases)
          .where(and(
            eq(billetterieProjectPhases.projectId, id),
            eq(billetterieProjectPhases.phaseKey, 'DEVELOPMENT' as any),
          ))
          .limit(1)
          .then((r: any[]) => r[0]);

        if (devPhase) {
          const devStart = new Date(devPhase.updatedAt as any);
          const daysSinceDev = Math.floor((Date.now() - devStart.getTime()) / 86_400_000);
          if (daysSinceDev >= 20 && !project.adaptiveExtensionApproved) {
            return reply.status(422).send({
              error:   'Adaptive extension required',
              message: `This adaptive project has been in DEVELOPMENT for ${daysSinceDev} days. ` +
                       `A Day-20 extension must be approved by the Sponsor before advancing.`,
              requiresAdaptiveExtension: true,
            });
          }
        }
      }

      // Lessons Learned gate: required before leaving CLOSURE
      if (currentPhase === 'SIGN_OFF') {
        if (!project.llSubmitted) {
          return reply.status(422).send({
            error:   'Lessons Learned required',
            message: 'Lessons Learned must be submitted and acknowledged before the project can enter CLOSURE.',
            requiresLessonsLearned: true,
          });
        }
        if (!project.llAcknowledgedBy) {
          return reply.status(422).send({
            error:   'Lessons Learned not acknowledged',
            message: 'Lessons Learned has been submitted but not yet acknowledged by the Sponsor.',
            requiresLessonsLearned: true,
          });
        }
      }
    }

    const nextPhase = PHASE_ORDER[currentIdx + 1];

    await db.update(billetterieProjectPhases).set({ status: 'APPROVED', approvedAt: new Date(), approvedBy: userId, updatedAt: new Date() })
      .where(and(eq(billetterieProjectPhases.projectId, id), eq(billetterieProjectPhases.phaseKey, currentPhase as any)));
    await db.update(billetterieProjectPhases).set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(and(eq(billetterieProjectPhases.projectId, id), eq(billetterieProjectPhases.phaseKey, nextPhase as any)));

    const [updated] = await db.update(billetterieProjects).set({ currentPhase: nextPhase as any, updatedAt: new Date() })
      .where(eq(billetterieProjects.id, id)).returning();

    return { data: updated, message: `Project advanced to ${nextPhase}` };
  });

  // ── Update phase ──────────────────────────────────────────────────────────────
  // SPONSOR or PM (or BIL_ADMIN / Xarra admin).
  app.put('/projects/:id/phases/:phaseKey', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, phaseKey } = request.params as { id: string; phaseKey: string };
    if (!PHASE_ORDER.includes(phaseKey as PhaseKey)) return reply.badRequest('Invalid phase key');

    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['SPONSOR', 'PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = updatePhaseSchema.parse(request.body);
    const updateData: any = { updatedAt: new Date() };
    if (body.notes         !== undefined) updateData.notes         = body.notes;
    if (body.gateDocuments !== undefined) updateData.gateDocuments = body.gateDocuments;

    const [updated] = await db.update(billetterieProjectPhases).set(updateData)
      .where(and(eq(billetterieProjectPhases.projectId, id), eq(billetterieProjectPhases.phaseKey, phaseKey as any)))
      .returning();

    if (!updated) return reply.notFound('Phase not found');
    return { data: updated };
  });

  // ── Cancel project ───────────────────────────────────────────────────────────
  // Only BIL_ADMIN or Xarra admin may cancel projects.
  app.delete('/projects/:id', { preHandler: requireAuth }, async (request: any, reply) => {
    const user = request.session!.user as any;
    if (!isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only a Billetterie Admin or Xarra Admin can cancel projects' });
    }
    const { id } = request.params as { id: string };
    const [updated] = await db.update(billetterieProjects).set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(billetterieProjects.id, id)).returning();
    if (!updated) return reply.notFound('Project not found');
    return { data: updated };
  });

  // ── Meetings ─────────────────────────────────────────────────────────────────
  app.get('/projects/:id/meetings', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const meetings = await db.select().from(billetterieMeetings).where(eq(billetterieMeetings.projectId, id)).orderBy(desc(billetterieMeetings.meetingDate));
    return { data: meetings };
  });

  app.post('/projects/:id/meetings', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user   = request.session!.user as any;
    const userId = user.id;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA', 'ADMIN']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = createMeetingSchema.parse(request.body);
    const project = await db.select({ id: billetterieProjects.id }).from(billetterieProjects).where(eq(billetterieProjects.id, id)).limit(1).then((r: any[]) => r[0]);
    if (!project) return reply.notFound('Project not found');

    const [meeting] = await db.insert(billetterieMeetings).values({
      projectId: id, phaseKey: body.phaseKey as any ?? null, title: body.title,
      meetingDate: body.meetingDate, attendees: body.attendees,
      agenda: body.agenda ?? null, minutes: body.minutes ?? null,
      actionItems: body.actionItems, recordedBy: userId,
    }).returning();

    return reply.status(201).send({ data: meeting });
  });

  app.put('/projects/:id/meetings/:meetingId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, meetingId } = request.params as { id: string; meetingId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA', 'ADMIN']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = createMeetingSchema.partial().parse(request.body);
    const updateData: any = {};
    if (body.title       !== undefined) updateData.title       = body.title;
    if (body.phaseKey    !== undefined) updateData.phaseKey    = body.phaseKey;
    if (body.meetingDate !== undefined) updateData.meetingDate = body.meetingDate;
    if (body.attendees   !== undefined) updateData.attendees   = body.attendees;
    if (body.agenda      !== undefined) updateData.agenda      = body.agenda;
    if (body.minutes     !== undefined) updateData.minutes     = body.minutes;
    if (body.actionItems !== undefined) updateData.actionItems = body.actionItems;

    const [updated] = await db.update(billetterieMeetings).set(updateData).where(eq(billetterieMeetings.id, meetingId)).returning();
    if (!updated) return reply.notFound('Meeting not found');
    return { data: updated };
  });

  app.delete('/projects/:id/meetings/:meetingId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, meetingId } = request.params as { id: string; meetingId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieMeetings).where(eq(billetterieMeetings.id, meetingId));
    return { success: true };
  });

  // ── Overview stats ────────────────────────────────────────────────────────────
  app.get('/projects/:id/overview-stats', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const [issueCountRow, taskRows, weekHoursRow] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` })
        .from(billetterieIssues)
        .where(and(eq(billetterieIssues.projectId, id), sql`status IN ('OPEN','IN_PROGRESS')`))
        .then((r: any[]) => r[0]),
      db.select({ status: billetterieTasks.status })
        .from(billetterieTasks)
        .where(and(eq(billetterieTasks.projectId, id), sql`status != 'CANCELLED'`)),
      db.execute(sql`
        SELECT COALESCE(SUM(tl.hours), 0) AS week_hours
        FROM billetterie_time_logs tl
        JOIN billetterie_tasks bt ON bt.id = tl.task_id
        WHERE bt.project_id = ${id}
          AND tl.work_date >= ${monday.toISOString().slice(0, 10)}
      `).then((r: any) => (Array.isArray(r) ? r[0] : r.rows?.[0]) ?? { week_hours: 0 }),
    ]);

    const tasksTotal = taskRows.length;
    const tasksDone  = taskRows.filter((t: any) => t.status === 'DONE').length;

    return {
      data: {
        openIssues:  Number(issueCountRow?.count ?? 0),
        tasksTotal,
        tasksDone,
        weekHours: Number(weekHoursRow?.week_hours ?? 0),
      },
    };
  });

  // ── Health status (R/A/G) ─────────────────────────────────────────────────────
  // PM or SPONSOR may set health; any team member may read (via GET /projects/:id).
  app.patch('/projects/:id/health', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'SPONSOR']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      healthStatus: z.enum(['R', 'A', 'G']),
      healthNotes:  z.string().optional().nullable(),
    }).parse(request.body);

    const [updated] = await db.update(billetterieProjects).set({
      healthStatus:    body.healthStatus as any,
      healthNotes:     body.healthNotes ?? null,
      healthUpdatedAt: new Date(),
      updatedAt:       new Date(),
    }).where(eq(billetterieProjects.id, id)).returning();

    if (!updated) return reply.notFound('Project not found');
    return { data: updated };
  });

  // ── Adaptive Day-20 extension ─────────────────────────────────────────────────
  // SPONSOR or sys admin approves a Day-20 extension for an adaptive project.
  app.post('/projects/:id/adaptive-extension', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['SPONSOR']);
    if (deny && !isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only the Project Sponsor or Billetterie Admin can approve an adaptive extension' });
    }

    const body = z.object({
      reason: z.string().min(1),
    }).parse(request.body);

    const project = await db.select().from(billetterieProjects).where(eq(billetterieProjects.id, id)).limit(1).then((r: any[]) => r[0]);
    if (!project) return reply.notFound('Project not found');
    if (!project.isAdaptive) return reply.badRequest('This project is not marked as adaptive');
    if (project.adaptiveExtensionApproved) return reply.badRequest('Extension has already been approved');

    const [updated] = await db.update(billetterieProjects).set({
      adaptiveExtensionApproved:   true,
      adaptiveExtensionApprovedBy: user.id,
      adaptiveExtensionApprovedAt: new Date(),
      adaptiveExtensionReason:     body.reason,
      updatedAt:                   new Date(),
    }).where(eq(billetterieProjects.id, id)).returning();

    return { data: updated };
  });

  // ── Lessons Learned ───────────────────────────────────────────────────────────
  // PM or BA submits; SPONSOR acknowledges.
  app.post('/projects/:id/lessons-learned', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      whatWentWell:    z.string().min(1),
      whatDidnt:       z.string().min(1),
      recommendations: z.string().min(1),
    }).parse(request.body);

    const [updated] = await db.update(billetterieProjects).set({
      llSubmitted:       true,
      llWhatWentWell:    body.whatWentWell,
      llWhatDidnt:       body.whatDidnt,
      llRecommendations: body.recommendations,
      llSubmittedBy:     user.id,
      llSubmittedAt:     new Date(),
      updatedAt:         new Date(),
    }).where(eq(billetterieProjects.id, id)).returning();

    if (!updated) return reply.notFound('Project not found');
    return { data: updated };
  });

  app.post('/projects/:id/lessons-learned/acknowledge', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['SPONSOR']);
    if (deny && !isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only the Project Sponsor or Billetterie Admin can acknowledge Lessons Learned' });
    }

    const project = await db.select({ llSubmitted: billetterieProjects.llSubmitted }).from(billetterieProjects)
      .where(eq(billetterieProjects.id, id)).limit(1).then((r: any[]) => r[0]);
    if (!project) return reply.notFound('Project not found');
    if (!project.llSubmitted) return reply.badRequest('Lessons Learned must be submitted before it can be acknowledged');

    const [updated] = await db.update(billetterieProjects).set({
      llAcknowledgedBy: user.id,
      llAcknowledgedAt: new Date(),
      updatedAt:        new Date(),
    }).where(eq(billetterieProjects.id, id)).returning();

    return { data: updated };
  });

  // ── Activity feed ─────────────────────────────────────────────────────────────
  // Queries recent changes across project entities (tasks, issues, milestones,
  // meetings, deliverables) — no audit table dependency.
  app.get('/projects/:id/activity', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };

    const project = await db.select({ id: billetterieProjects.id })
      .from(billetterieProjects).where(eq(billetterieProjects.id, id)).limit(1).then((r: any[]) => r[0]);
    if (!project) return reply.notFound('Project not found');

    const rows = await db.execute(sql`
      SELECT 'task'        AS kind, id, title, updated_at AS ts FROM billetterie_tasks       WHERE project_id = ${id}
      UNION ALL
      SELECT 'issue'       AS kind, id::text, title, updated_at AS ts FROM billetterie_issues WHERE project_id = ${id}
      UNION ALL
      SELECT 'milestone'   AS kind, id::text, title, updated_at AS ts FROM billetterie_milestones WHERE project_id = ${id}
      UNION ALL
      SELECT 'meeting'     AS kind, id::text, title, created_at AS ts FROM billetterie_meetings WHERE project_id = ${id}
      UNION ALL
      SELECT 'deliverable' AS kind, id::text, title, updated_at AS ts FROM billetterie_phase_deliverables WHERE project_id = ${id}
      ORDER BY ts DESC
      LIMIT 50
    `);

    const data = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    return {
      data: data.map((r: any) => ({
        id:        r.id,
        kind:      r.kind,
        title:     r.title,
        updatedAt: r.ts,
      })),
    };
  });

  // ── SOW PDF ───────────────────────────────────────────────────────────────────
  // Generates a Statement of Work PDF from the project's current live data.
  app.get('/projects/:id/sow/pdf', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;

    if (!isBilSysManager(user)) {
      const role = await getProjectRole(db, id, user.id);
      if (!role) return reply.status(403).send({ error: 'Access denied' });
    }

    const [project, phases, teamRows, milestones, risks] = await Promise.all([
      db.select().from(billetterieProjects).where(eq(billetterieProjects.id, id)).limit(1).then((r: any[]) => r[0]),
      db.select().from(billetterieProjectPhases).where(eq(billetterieProjectPhases.projectId, id)).orderBy(billetterieProjectPhases.phaseKey),
      db.select({
        id:         billetterieProjectTeam.id,
        role:       billetterieProjectTeam.role,
        name:       staffMembers.name,
        memberRole: staffMembers.role,
      }).from(billetterieProjectTeam)
        .leftJoin(staffMembers, eq(billetterieProjectTeam.staffMemberId, staffMembers.id))
        .where(eq(billetterieProjectTeam.projectId, id)),
      db.select().from(billetterieMilestones).where(eq(billetterieMilestones.projectId, id)).orderBy(billetterieMilestones.dueDate),
      db.select().from(billetterieRisks).where(eq(billetterieRisks.projectId, id)).orderBy(desc(billetterieRisks.probability)),
    ]);

    if (!project) return reply.notFound('Project not found');

    const bilOrg = await getBilOrg(db);

    const html = renderBilProjectSowHtml({
      project: {
        number:       project.number,
        name:         project.name,
        client:       project.client,
        description:  project.description,
        startDate:    project.startDate,
        targetEndDate: project.targetEndDate,
        budget:       project.budget,
        contactName:  project.contactName,
        contactEmail: project.contactEmail,
        contactPhone: project.contactPhone,
        currentPhase: project.currentPhase,
        status:       project.status,
        projectType:  project.projectType,
        healthStatus: project.healthStatus,
      },
      company: {
        name:         bilOrg.name,
        tradingAs:    bilOrg.tagline,
        addressLine1: bilOrg.addressLine1,
        city:         bilOrg.city,
        province:     bilOrg.province,
        postalCode:   bilOrg.postalCode,
        phone:        bilOrg.phone,
        email:        bilOrg.email,
        logoUrl:      bilOrg.logoUrl,
        accentColor:  bilOrg.accentColor,
      },
      team: teamRows.map((m: any) => ({
        name:       m.name ?? 'Unknown',
        role:       m.role,
        memberRole: m.memberRole ?? null,
      })),
      phases: phases.map((p: any) => ({
        phaseKey: p.phaseKey,
        status:   p.status,
        gateDocs: (p.gateDocuments ?? []).map((d: any) => d.name),
      })),
      milestones: milestones.map((m: any) => ({
        title:    m.title,
        phaseKey: m.phaseKey,
        dueDate:  m.dueDate,
        status:   m.status,
      })),
      risks: risks.map((r: any) => ({
        title:       r.title,
        probability: r.probability,
        impact:      r.impact,
        score:       r.probability * r.impact,
        status:      r.status,
        category:    r.category,
      })),
      generatedAt: new Date().toISOString(),
    });

    const pdf = await generatePdf(html);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${project.number}-SOW.pdf"`);
    return reply.send(pdf);
  });

  // ── Reports ───────────────────────────────────────────────────────────────────
  // Three tiers: executive (1-page), status (standard PM), detailed (full audit).
  // All use the same data-gathering pattern; the template controls depth.

  async function gatherReportData(db: any, id: string) {
    const [project, phases, teamRows, milestones, tasks, issues, risks, sprints] = await Promise.all([
      db.select().from(billetterieProjects).where(eq(billetterieProjects.id, id)).limit(1).then((r: any[]) => r[0]),
      db.select().from(billetterieProjectPhases).where(eq(billetterieProjectPhases.projectId, id)),
      db.select({
        role:   billetterieProjectTeam.role,
        name:   staffMembers.name,
      }).from(billetterieProjectTeam)
        .leftJoin(staffMembers, eq(billetterieProjectTeam.staffMemberId, staffMembers.id))
        .where(eq(billetterieProjectTeam.projectId, id)),
      db.select().from(billetterieMilestones).where(eq(billetterieMilestones.projectId, id)).orderBy(billetterieMilestones.dueDate),
      db.select().from(billetterieTasks).where(and(eq(billetterieTasks.projectId, id), sql`status != 'CANCELLED'`)),
      db.select().from(billetterieIssues).where(eq(billetterieIssues.projectId, id)),
      db.select().from(billetterieRisks).where(eq(billetterieRisks.projectId, id)),
      db.select().from(billetterieSprints).where(eq(billetterieSprints.projectId, id)).orderBy(billetterieSprints.startDate),
    ]);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekHoursRow = await db.execute(sql`
      SELECT COALESCE(SUM(tl.hours), 0) AS hrs
      FROM billetterie_time_logs tl
      JOIN billetterie_tasks bt ON bt.id = tl.task_id
      WHERE bt.project_id = ${id}
    `).then((r: any) => (Array.isArray(r) ? r[0] : r.rows?.[0]) ?? { hrs: 0 });

    return { project, phases, teamRows, milestones, tasks, issues, risks, sprints, totalHours: Number(weekHoursRow.hrs) };
  }

  function buildReportHtml(d: any, tier: 'executive' | 'status' | 'detailed', bilOrg: any): string {
    const { project, phases, teamRows, milestones, tasks, issues, risks, sprints, totalHours } = d;
    if (!project) return '<html><body>Project not found</body></html>';

    const company = {
      name:    bilOrg.name    ?? 'Billetterie Software',
      logoUrl: bilOrg.logoUrl ?? '/Billetterie-logo.png',
      accent:  bilOrg.accentColor ?? '#1d4ed8',
    };

    const logo = company.logoUrl ? `<img src="${company.logoUrl}" style="max-height:45px;max-width:160px;">` : '';

    const PHASE_LABELS: Record<string, string> = {
      INITIATION: 'Initiation', ELICITATION: 'Elicitation', ARCHITECTURE: 'Architecture',
      DEVELOPMENT: 'Development', TESTING: 'Testing', SIGN_OFF: 'Sign-off', CLOSURE: 'Closure',
    };

    const openIssues   = issues.filter((i: any) => ['OPEN', 'IN_PROGRESS'].includes(i.status)).length;
    const critIssues   = issues.filter((i: any) => i.severity === 'CRITICAL' && i.status !== 'CLOSED').length;
    const tasksTotal   = tasks.length;
    const tasksDone    = tasks.filter((t: any) => t.status === 'DONE').length;
    const tasksPct     = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
    const highRisks    = risks.filter((r: any) => r.probability * r.impact >= 10 && r.status === 'OPEN').length;
    const nextMilestone = milestones.find((m: any) => m.status === 'PENDING');
    const activeSprint  = sprints.find((s: any) => s.status === 'ACTIVE');

    const healthBg = project.healthStatus === 'R' ? '#dc2626' : project.healthStatus === 'A' ? '#d97706' : project.healthStatus === 'G' ? '#16a34a' : '#6b7280';
    const healthLabel = project.healthStatus === 'R' ? 'RED' : project.healthStatus === 'A' ? 'AMBER' : project.healthStatus === 'G' ? 'GREEN' : 'NOT SET';

    const phaseApproved = phases.filter((p: any) => p.status === 'APPROVED').length;
    const phaseTotal = phases.length;

    const base = `
    <style>
      * { box-sizing:border-box;margin:0;padding:0; }
      body { font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#111827;padding:30px; }
      h1 { font-size:22px;font-weight:900;color:${company.accent}; }
      h2 { font-size:12px;font-weight:800;color:${company.accent};text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid ${company.accent}; }
      table { width:100%;border-collapse:collapse; }
      th { background:${company.accent};color:#fff;text-align:left;padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em; }
      td { padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px; }
      .section { margin-bottom:22px; }
      .stat { background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center; }
      .stat-value { font-size:22px;font-weight:900;color:#0f172a; }
      .stat-label { font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-top:2px; }
      .badge { display:inline-block;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700; }
    </style>`;

    const header = `
    <table style="margin-bottom:20px;">
      <tr>
        <td style="width:50%;vertical-align:top;">${logo}<div style="margin-top:4px;font-weight:700;font-size:12px;">${company.name}</div></td>
        <td style="width:50%;text-align:right;vertical-align:top;">
          <h1>${tier === 'executive' ? 'EXECUTIVE SUMMARY' : tier === 'status' ? 'PROJECT STATUS REPORT' : 'DETAILED PROJECT REPORT'}</h1>
          <div style="font-size:18px;font-weight:800;font-family:monospace;color:${company.accent};">${project.number}</div>
          <div style="color:#6b7280;font-size:10px;margin-top:2px;">${project.name} · Generated ${new Date().toLocaleDateString('en-ZA')}</div>
        </td>
      </tr>
    </table>`;

    const healthBanner = `
    <div style="background:${healthBg};color:white;border-radius:8px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:16px;font-weight:900;">●</span>
      <div>
        <div style="font-size:13px;font-weight:800;">Project Health: ${healthLabel}</div>
        ${project.healthNotes ? `<div style="font-size:10px;opacity:.85;margin-top:2px;">${project.healthNotes}</div>` : ''}
      </div>
      <div style="margin-left:auto;font-size:10px;opacity:.8;">Phase: ${PHASE_LABELS[project.currentPhase] ?? project.currentPhase}</div>
    </div>`;

    const kpiGrid = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
      <div class="stat"><div class="stat-value">${tasksPct}%</div><div class="stat-label">Tasks Complete</div></div>
      <div class="stat"><div class="stat-value" style="color:${openIssues > 0 ? '#dc2626' : '#16a34a'}">${openIssues}</div><div class="stat-label">Open Issues</div></div>
      <div class="stat"><div class="stat-value" style="color:${highRisks > 0 ? '#ea580c' : '#16a34a'}">${highRisks}</div><div class="stat-label">High/Critical Risks</div></div>
      <div class="stat"><div class="stat-value">${totalHours.toFixed(1)}h</div><div class="stat-label">Total Hours Logged</div></div>
    </div>`;

    // Executive = just header + health + KPIs + phase progress + next milestone + top risks
    if (tier === 'executive') {
      const phaseProgress = phases.map((p: any, idx: number) => {
        const bg = p.status === 'APPROVED' ? '#d1fae5' : p.status === 'ACTIVE' ? '#dbeafe' : '#f3f4f6';
        const col = p.status === 'APPROVED' ? '#065f46' : p.status === 'ACTIVE' ? '#1d4ed8' : '#9ca3af';
        const lbl = p.status === 'APPROVED' ? '✓' : p.status === 'ACTIVE' ? '●' : `${idx + 1}`;
        return `<div style="flex:1;text-align:center;">
          <div style="width:28px;height:28px;border-radius:50%;background:${bg};color:${col};font-weight:800;font-size:11px;display:inline-flex;align-items:center;justify-content:center;">${lbl}</div>
          <div style="font-size:8px;color:${col};margin-top:2px;font-weight:600;">${PHASE_LABELS[p.phaseKey]?.split(' ')[0]}</div>
        </div>`;
      }).join('');

      const topRiskRows = risks.filter((r: any) => r.status === 'OPEN').sort((a: any, b: any) => (b.probability * b.impact) - (a.probability * a.impact)).slice(0, 5)
        .map((r: any) => `<tr>
          <td>${r.title}</td>
          <td style="text-align:center;font-weight:700;color:${r.probability * r.impact >= 10 ? '#dc2626' : '#d97706'}">${r.probability * r.impact}</td>
          <td>${r.status}</td>
        </tr>`).join('') || `<tr><td colspan="3" style="color:#9ca3af;text-align:center;">No open risks</td></tr>`;

      return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}</head><body>
        ${header}${healthBanner}${kpiGrid}
        <div class="section">
          <h2>Phase Progress (${phaseApproved}/${phaseTotal} complete)</h2>
          <div style="display:flex;gap:4px;align-items:flex-start;margin-top:8px;">${phaseProgress}</div>
        </div>
        ${nextMilestone ? `<div class="section" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;">
          <div style="font-size:9px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:4px;">Next Milestone</div>
          <div style="font-weight:700;">${nextMilestone.title}</div>
          <div style="color:#6b7280;font-size:10px;">${nextMilestone.dueDate ? new Date(nextMilestone.dueDate).toLocaleDateString('en-ZA') : 'No date set'} · ${PHASE_LABELS[nextMilestone.phaseKey]}</div>
        </div>` : ''}
        ${activeSprint ? `<div class="section" style="margin-top:12px;background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px;">
          <div style="font-size:9px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:4px;">Active Sprint</div>
          <div style="font-weight:700;">${activeSprint.name}</div>
          ${activeSprint.goal ? `<div style="color:#374151;font-size:10px;margin-top:2px;">${activeSprint.goal}</div>` : ''}
        </div>` : ''}
        <div class="section" style="margin-top:12px;"><h2>Top Risks</h2>
          <table><thead><tr><th>Risk</th><th style="text-align:center;">Score</th><th>Status</th></tr></thead>
          <tbody>${topRiskRows}</tbody></table>
        </div>
      </body></html>`;
    }

    // Status report = executive + task breakdown + issue list + sprint status
    const taskStatusBreakdown = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].map(s => {
      const count = tasks.filter((t: any) => t.status === s).length;
      return `<tr><td>${s.replace('_', ' ')}</td><td style="text-align:center;font-weight:700;">${count}</td><td><div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;"><div style="height:100%;background:#3b82f6;width:${tasksTotal ? (count / tasksTotal * 100) : 0}%"></div></div></td></tr>`;
    }).join('');

    const issueRows = issues.filter((i: any) => i.status !== 'CLOSED').slice(0, 15).map((i: any) =>
      `<tr><td>#${i.issueNumber}</td><td>${i.title}</td><td>${i.type}</td><td>${i.severity ?? '—'}</td><td>${i.status}</td></tr>`
    ).join('') || `<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No open issues</td></tr>`;

    const sprintRows = sprints.slice(-3).map((s: any) =>
      `<tr><td>${s.name}</td><td>${new Date(s.startDate).toLocaleDateString('en-ZA')} → ${new Date(s.endDate).toLocaleDateString('en-ZA')}</td><td>${s.status}</td><td>${s.sponsorApproved ? '✓' : '—'}</td></tr>`
    ).join('') || `<tr><td colspan="4" style="text-align:center;color:#9ca3af;">No sprints</td></tr>`;

    if (tier === 'status') {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}</head><body>
        ${header}${healthBanner}${kpiGrid}
        <div class="section"><h2>Task Status Breakdown</h2>
          <table><thead><tr><th>Status</th><th style="text-align:center;">Count</th><th>Distribution</th></tr></thead>
          <tbody>${taskStatusBreakdown}</tbody></table>
        </div>
        <div class="section"><h2>Open Issues (top 15)</h2>
          <table><thead><tr><th>#</th><th>Title</th><th>Type</th><th>Severity</th><th>Status</th></tr></thead>
          <tbody>${issueRows}</tbody></table>
        </div>
        <div class="section"><h2>Sprint Progress</h2>
          <table><thead><tr><th>Sprint</th><th>Dates</th><th>Status</th><th>Sponsor Approved</th></tr></thead>
          <tbody>${sprintRows}</tbody></table>
        </div>
        <div class="section"><h2>Risk Register</h2>
          <table><thead><tr><th>Risk</th><th style="text-align:center;">Score</th><th>Status</th><th>Category</th></tr></thead>
          <tbody>${risks.sort((a: any, b: any) => (b.probability * b.impact) - (a.probability * a.impact)).map((r: any) =>
            `<tr><td>${r.title}</td><td style="text-align:center;font-weight:700;">${r.probability * r.impact}</td><td>${r.status}</td><td>${r.category ?? '—'}</td></tr>`
          ).join('')}</tbody></table>
        </div>
        <div class="section"><h2>Milestones</h2>
          <table><thead><tr><th>Milestone</th><th>Phase</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>${milestones.map((m: any) =>
            `<tr><td>${m.title}</td><td>${PHASE_LABELS[m.phaseKey]}</td><td>${m.dueDate ?? '—'}</td><td>${m.status}</td></tr>`
          ).join('') || `<tr><td colspan="4" style="text-align:center;color:#9ca3af;">No milestones</td></tr>`}</tbody></table>
        </div>
      </body></html>`;
    }

    // Detailed = everything above + all tasks + all issues (no limit)
    const allTaskRows = tasks.map((t: any) =>
      `<tr><td>${t.title}</td><td>${t.phaseKey}</td><td>${t.status}</td><td>${t.priority}</td>
       <td style="text-align:center;">${t.estimatedHours ?? '—'}</td>
       <td style="text-align:center;">${t.loggedHours ?? 0}</td>
       <td>${t.dueDate ?? '—'}</td></tr>`
    ).join('') || `<tr><td colspan="7" style="text-align:center;color:#9ca3af;">No tasks</td></tr>`;

    const allIssueRows = issues.map((i: any) =>
      `<tr><td>#${i.issueNumber}</td><td>${i.title}</td><td>${i.type}</td><td>${i.severity ?? '—'}</td><td>${i.status}</td><td>${i.closedAt ? new Date(i.closedAt).toLocaleDateString('en-ZA') : '—'}</td></tr>`
    ).join('') || `<tr><td colspan="6" style="text-align:center;color:#9ca3af;">No issues</td></tr>`;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}</head><body>
      ${header}${healthBanner}${kpiGrid}
      <div class="section"><h2>Task Status Breakdown</h2>
        <table><thead><tr><th>Status</th><th style="text-align:center;">Count</th><th>Distribution</th></tr></thead>
        <tbody>${taskStatusBreakdown}</tbody></table>
      </div>
      <div class="section"><h2>All Tasks (${tasksTotal})</h2>
        <table><thead><tr><th>Title</th><th>Phase</th><th>Status</th><th>Priority</th><th style="text-align:center;">Est h</th><th style="text-align:center;">Logged h</th><th>Due</th></tr></thead>
        <tbody>${allTaskRows}</tbody></table>
      </div>
      <div class="section"><h2>All Issues (${issues.length})</h2>
        <table><thead><tr><th>#</th><th>Title</th><th>Type</th><th>Severity</th><th>Status</th><th>Closed</th></tr></thead>
        <tbody>${allIssueRows}</tbody></table>
      </div>
      <div class="section"><h2>Risk Register</h2>
        <table><thead><tr><th>Risk</th><th style="text-align:center;">P</th><th style="text-align:center;">I</th><th style="text-align:center;">Score</th><th>Category</th><th>Status</th><th>Mitigation</th></tr></thead>
        <tbody>${risks.map((r: any) =>
          `<tr><td>${r.title}</td><td style="text-align:center;">${r.probability}</td><td style="text-align:center;">${r.impact}</td><td style="text-align:center;font-weight:700;">${r.probability * r.impact}</td><td>${r.category ?? '—'}</td><td>${r.status}</td><td style="font-size:10px;color:#6b7280;">${r.mitigation ?? '—'}</td></tr>`
        ).join('') || `<tr><td colspan="7" style="text-align:center;color:#9ca3af;">No risks</td></tr>`}</tbody></table>
      </div>
      <div class="section"><h2>Sprint History</h2>
        <table><thead><tr><th>Sprint</th><th>Dates</th><th>Status</th><th>Demo</th><th>Signed Off</th><th>Sponsor</th></tr></thead>
        <tbody>${sprints.map((s: any) =>
          `<tr><td>${s.name}</td><td>${new Date(s.startDate).toLocaleDateString('en-ZA')} → ${new Date(s.endDate).toLocaleDateString('en-ZA')}</td>
           <td>${s.status}</td><td>${s.demoRecordedAt ? '✓' : '—'}</td><td>${s.signedOffAt ? '✓' : '—'}</td><td>${s.sponsorApproved ? '✓' : '—'}</td></tr>`
        ).join('') || `<tr><td colspan="6" style="text-align:center;color:#9ca3af;">No sprints</td></tr>`}</tbody></table>
      </div>
      <div class="section"><h2>Milestones</h2>
        <table><thead><tr><th>Milestone</th><th>Phase</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>${milestones.map((m: any) =>
          `<tr><td>${m.title}</td><td>${PHASE_LABELS[m.phaseKey]}</td><td>${m.dueDate ?? '—'}</td><td>${m.status}</td></tr>`
        ).join('') || `<tr><td colspan="4" style="text-align:center;color:#9ca3af;">No milestones</td></tr>`}</tbody></table>
      </div>
      <div class="section"><h2>Project Team</h2>
        <table><thead><tr><th>Name</th><th>Project Role</th></tr></thead>
        <tbody>${teamRows.map((m: any) => `<tr><td>${m.name ?? '—'}</td><td>${m.role}</td></tr>`).join('')}</tbody></table>
      </div>
    </body></html>`;
  }

  async function serveReport(request: any, reply: any, tier: 'executive' | 'status' | 'detailed') {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;

    if (!isBilSysManager(user)) {
      const role = await getProjectRole(db, id, user.id);
      if (!role) return reply.status(403).send({ error: 'Access denied' });
    }

    const data = await gatherReportData(db, id);
    if (!data.project) return reply.notFound('Project not found');

    const bilOrg = await getBilOrg(db);
    const html = buildReportHtml(data, tier, bilOrg);
    const pdf = await generatePdf(html);

    const fname = `${data.project.number}-${tier}-report.pdf`;
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${fname}"`);
    return reply.send(pdf);
  }

  app.get('/projects/:id/reports/executive', { preHandler: requireAuth }, (req, rep) => serveReport(req, rep, 'executive'));
  app.get('/projects/:id/reports/status',    { preHandler: requireAuth }, (req, rep) => serveReport(req, rep, 'status'));
  app.get('/projects/:id/reports/detailed',  { preHandler: requireAuth }, (req, rep) => serveReport(req, rep, 'detailed'));

  // ── Billetterie Org Settings (document branding) ─────────────────────────────
  // GET — any authenticated user can read (used by UI to show current org info)
  app.get('/org-settings', { preHandler: requireAuth }, async () => {
    const settings = await getBilOrg(db);
    return { data: settings };
  });

  // PUT — BIL_ADMIN or Xarra admin only
  app.put('/org-settings', { preHandler: requireAuth }, async (request: any, reply) => {
    const user = request.session!.user as any;
    if (!isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only a Billetterie Admin can update org settings' });
    }

    const body = z.object({
      displayName:       z.string().min(1).max(255).optional(),
      tagline:           z.string().optional().nullable(),
      registrationNumber: z.string().optional().nullable(),
      vatNumber:         z.string().optional().nullable(),
      addressLine1:      z.string().optional().nullable(),
      city:              z.string().optional().nullable(),
      province:          z.string().optional().nullable(),
      postalCode:        z.string().optional().nullable(),
      phone:             z.string().optional().nullable(),
      email:             z.string().email().optional().nullable().or(z.literal('')),
      website:           z.string().optional().nullable(),
      accentColor:       z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      logoUrl:           z.string().optional().nullable(),
      sowFooterText:     z.string().optional().nullable(),
      reportFooterText:  z.string().optional().nullable(),
    }).parse(request.body);

    // Upsert the singleton row
    await db.execute(sql`
      INSERT INTO billetterie_org_settings (display_name, tagline, registration_number, vat_number,
        address_line_1, city, province, postal_code, phone, email, website,
        accent_color, logo_url, sow_footer_text, report_footer_text, singleton)
      VALUES (
        ${body.displayName ?? 'Billetterie Software'},
        ${body.tagline ?? null}, ${body.registrationNumber ?? null}, ${body.vatNumber ?? null},
        ${body.addressLine1 ?? null}, ${body.city ?? null}, ${body.province ?? null},
        ${body.postalCode ?? null}, ${body.phone ?? null}, ${body.email || null},
        ${body.website ?? null}, ${body.accentColor ?? '#1d4ed8'}, ${body.logoUrl ?? null},
        ${body.sowFooterText ?? null}, ${body.reportFooterText ?? null}, TRUE
      )
      ON CONFLICT (singleton) DO UPDATE SET
        display_name        = EXCLUDED.display_name,
        tagline             = EXCLUDED.tagline,
        registration_number = EXCLUDED.registration_number,
        vat_number          = EXCLUDED.vat_number,
        address_line_1      = EXCLUDED.address_line_1,
        city                = EXCLUDED.city,
        province            = EXCLUDED.province,
        postal_code         = EXCLUDED.postal_code,
        phone               = EXCLUDED.phone,
        email               = EXCLUDED.email,
        website             = EXCLUDED.website,
        accent_color        = EXCLUDED.accent_color,
        logo_url            = EXCLUDED.logo_url,
        sow_footer_text     = EXCLUDED.sow_footer_text,
        report_footer_text  = EXCLUDED.report_footer_text,
        updated_at          = NOW()
    `);

    return { data: await getBilOrg(db) };
  });
}
