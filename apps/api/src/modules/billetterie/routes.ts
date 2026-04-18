import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, ilike, or, sql } from 'drizzle-orm';
import {
  billetterieProjects,
  billetterieProjectPhases,
  billetterieMeetings,
} from '@xarra/db';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

// ─── Phase definitions (ordered) ─────────────────────────────────────────────

const PHASE_ORDER = [
  'INITIATION', 'ELICITATION', 'ARCHITECTURE',
  'DEVELOPMENT', 'TESTING', 'SIGN_OFF', 'CLOSURE',
] as const;

type PhaseKey = typeof PHASE_ORDER[number];

// Gate documents required per phase
const PHASE_GATE_DOCS: Record<PhaseKey, string[]> = {
  INITIATION:   ['Project Charter', 'Stakeholder Register', 'Kick-off Meeting Minutes'],
  ELICITATION:  ['Business Requirements Document', 'User Stories / Use Cases', 'Process Diagrams'],
  ARCHITECTURE: ['System Architecture Document', 'Tech Stack Proposal', 'Architecture Review Sign-off'],
  DEVELOPMENT:  ['Development Plan', 'Sprint Reports'],
  TESTING:      ['Test Plan', 'UAT Sign-off', 'Bug Register (closed)'],
  SIGN_OFF:     ['Client Acceptance Certificate', 'Handover Document', 'Final Invoice'],
  CLOSURE:      ['Project Closure Report', 'Lessons Learned Document'],
};

// ─── Zod schemas ──────────────────────────────────────────────────────────────

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

// ─── Helper: generate project number ─────────────────────────────────────────

async function generateProjectNumber(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.execute(
    sql`SELECT nextval('billetterie_project_seq') AS seq`,
  );
  const seq = Number(result[0]?.seq ?? 1);
  return `BIL-${year}-${String(seq).padStart(4, '0')}`;
}

// ─── Helper: create phase records for a new project ──────────────────────────

async function createPhaseRecords(db: any, projectId: string): Promise<void> {
  const phaseRows = PHASE_ORDER.map((key, idx) => ({
    projectId,
    phaseKey: key as PhaseKey,
    status: (idx === 0 ? 'ACTIVE' : 'LOCKED') as 'ACTIVE' | 'LOCKED',
    gateDocuments: PHASE_GATE_DOCS[key].map((name) => ({
      name,
      status: 'PENDING' as const,
    })),
  }));

  for (const row of phaseRows) {
    await db.insert(billetterieProjectPhases).values(row);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function billetterieRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── GET /billetterie/projects — list ───────────────────────────────────────
  app.get('/projects', { preHandler: requireAuth }, async (request: any, reply) => {
    const page   = Math.max(1, Number((request.query as any).page ?? 1));
    const limit  = Math.min(100, Number((request.query as any).limit ?? 20));
    const search = ((request.query as any).search ?? '').trim();
    const status = ((request.query as any).status ?? '').trim();
    const phase  = ((request.query as any).phase ?? '').trim();
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(billetterieProjects.name, `%${search}%`),
          ilike(billetterieProjects.client, `%${search}%`),
        ),
      );
    }
    if (status && ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].includes(status)) {
      conditions.push(eq(billetterieProjects.status, status as any));
    }
    if (phase && PHASE_ORDER.includes(phase as PhaseKey)) {
      conditions.push(eq(billetterieProjects.currentPhase, phase as any));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [projects, countResult] = await Promise.all([
      db
        .select()
        .from(billetterieProjects)
        .where(where)
        .orderBy(desc(billetterieProjects.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(billetterieProjects)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    // Stats
    const statsRaw = await db.execute(sql`
      SELECT status, COUNT(*) as count FROM billetterie_projects GROUP BY status
    `);
    const stats = Object.fromEntries(
      (statsRaw as any[]).map((r) => [r.status, Number(r.count)]),
    );

    return {
      data: projects,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // ── POST /billetterie/projects — create ────────────────────────────────────
  app.post('/projects', { preHandler: requireRole('ADMIN', 'PROJECT_MANAGER') }, async (request: any, reply) => {
    const body = createProjectSchema.parse(request.body);
    const userId = request.session.user.id;

    const number = await generateProjectNumber(db);

    const [project] = await db
      .insert(billetterieProjects)
      .values({
        number,
        name:          body.name,
        client:        body.client ?? null,
        description:   body.description ?? null,
        startDate:     body.startDate ?? null,
        targetEndDate: body.targetEndDate ?? null,
        budget:        body.budget ? String(body.budget) : null,
        contactName:   body.contactName ?? null,
        contactEmail:  body.contactEmail || null,
        contactPhone:  body.contactPhone ?? null,
        notes:         body.notes ?? null,
        createdBy:     userId,
        currentPhase:  'INITIATION',
        status:        'ACTIVE',
      })
      .returning();

    // Auto-create all 7 phase records
    await createPhaseRecords(db, project.id);

    return reply.status(201).send({ data: project });
  });

  // ── GET /billetterie/projects/:id — detail ─────────────────────────────────
  app.get('/projects/:id', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };

    const project = await db
      .select()
      .from(billetterieProjects)
      .where(eq(billetterieProjects.id, id))
      .limit(1)
      .then((r: any[]) => r[0]);

    if (!project) return reply.notFound('Project not found');

    const phases = await db
      .select()
      .from(billetterieProjectPhases)
      .where(eq(billetterieProjectPhases.projectId, id))
      .orderBy(billetterieProjectPhases.phaseKey);

    const meetings = await db
      .select()
      .from(billetterieMeetings)
      .where(eq(billetterieMeetings.projectId, id))
      .orderBy(desc(billetterieMeetings.meetingDate));

    return { data: { ...project, phases, meetings } };
  });

  // ── PUT /billetterie/projects/:id — update ─────────────────────────────────
  app.put('/projects/:id', { preHandler: requireRole('ADMIN', 'PROJECT_MANAGER') }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = updateProjectSchema.parse(request.body);

    const existing = await db
      .select()
      .from(billetterieProjects)
      .where(eq(billetterieProjects.id, id))
      .limit(1)
      .then((r: any[]) => r[0]);

    if (!existing) return reply.notFound('Project not found');

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
    if (body.status        !== undefined) {
      updateData.status = body.status;
      if (body.status === 'COMPLETED') updateData.completedAt = new Date();
    }

    const [updated] = await db
      .update(billetterieProjects)
      .set(updateData)
      .where(eq(billetterieProjects.id, id))
      .returning();

    return { data: updated };
  });

  // ── POST /billetterie/projects/:id/phases/advance — gate advance ────────────
  app.post('/projects/:id/phases/advance', { preHandler: requireRole('ADMIN', 'PROJECT_MANAGER') }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.session.user.id;

    const project = await db
      .select()
      .from(billetterieProjects)
      .where(eq(billetterieProjects.id, id))
      .limit(1)
      .then((r: any[]) => r[0]);

    if (!project) return reply.notFound('Project not found');
    if (project.status !== 'ACTIVE') {
      return reply.badRequest('Only active projects can advance phases');
    }

    const currentPhase = project.currentPhase as PhaseKey;
    const currentIdx   = PHASE_ORDER.indexOf(currentPhase);

    if (currentIdx === PHASE_ORDER.length - 1) {
      return reply.badRequest('Project is already in the final phase (CLOSURE). Mark it complete instead.');
    }

    const nextPhase = PHASE_ORDER[currentIdx + 1];

    // Mark current phase as APPROVED
    await db
      .update(billetterieProjectPhases)
      .set({
        status:     'APPROVED',
        approvedAt: new Date(),
        approvedBy: userId,
        updatedAt:  new Date(),
      })
      .where(
        and(
          eq(billetterieProjectPhases.projectId, id),
          eq(billetterieProjectPhases.phaseKey, currentPhase as any),
        ),
      );

    // Unlock the next phase
    await db
      .update(billetterieProjectPhases)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(
        and(
          eq(billetterieProjectPhases.projectId, id),
          eq(billetterieProjectPhases.phaseKey, nextPhase as any),
        ),
      );

    // Advance project's current phase
    const [updated] = await db
      .update(billetterieProjects)
      .set({ currentPhase: nextPhase as any, updatedAt: new Date() })
      .where(eq(billetterieProjects.id, id))
      .returning();

    // If advancing to CLOSURE, auto-mark it completed
    if (nextPhase === 'CLOSURE') {
      // Just flag for awareness — actual completion still requires manual confirmation
    }

    return {
      data: updated,
      message: `Project advanced to ${nextPhase}`,
    };
  });

  // ── PUT /billetterie/projects/:id/phases/:phaseKey — update phase ──────────
  app.put('/projects/:id/phases/:phaseKey', { preHandler: requireRole('ADMIN', 'PROJECT_MANAGER') }, async (request: any, reply) => {
    const { id, phaseKey } = request.params as { id: string; phaseKey: string };

    if (!PHASE_ORDER.includes(phaseKey as PhaseKey)) {
      return reply.badRequest('Invalid phase key');
    }

    const body = updatePhaseSchema.parse(request.body);

    const phase = await db
      .select()
      .from(billetterieProjectPhases)
      .where(
        and(
          eq(billetterieProjectPhases.projectId, id),
          eq(billetterieProjectPhases.phaseKey, phaseKey as any),
        ),
      )
      .limit(1)
      .then((r: any[]) => r[0]);

    if (!phase) return reply.notFound('Phase not found');

    const updateData: any = { updatedAt: new Date() };
    if (body.notes         !== undefined) updateData.notes         = body.notes;
    if (body.gateDocuments !== undefined) updateData.gateDocuments = body.gateDocuments;

    const [updated] = await db
      .update(billetterieProjectPhases)
      .set(updateData)
      .where(
        and(
          eq(billetterieProjectPhases.projectId, id),
          eq(billetterieProjectPhases.phaseKey, phaseKey as any),
        ),
      )
      .returning();

    return { data: updated };
  });

  // ── GET /billetterie/projects/:id/meetings — list meetings ─────────────────
  app.get('/projects/:id/meetings', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };

    const meetings = await db
      .select()
      .from(billetterieMeetings)
      .where(eq(billetterieMeetings.projectId, id))
      .orderBy(desc(billetterieMeetings.meetingDate));

    return { data: meetings };
  });

  // ── POST /billetterie/projects/:id/meetings — add meeting ──────────────────
  app.post('/projects/:id/meetings', { preHandler: requireRole('ADMIN', 'PROJECT_MANAGER') }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = createMeetingSchema.parse(request.body);
    const userId = request.session.user.id;

    const project = await db
      .select({ id: billetterieProjects.id })
      .from(billetterieProjects)
      .where(eq(billetterieProjects.id, id))
      .limit(1)
      .then((r: any[]) => r[0]);

    if (!project) return reply.notFound('Project not found');

    const [meeting] = await db
      .insert(billetterieMeetings)
      .values({
        projectId:   id,
        phaseKey:    body.phaseKey as any ?? null,
        title:       body.title,
        meetingDate: body.meetingDate,
        attendees:   body.attendees,
        agenda:      body.agenda ?? null,
        minutes:     body.minutes ?? null,
        actionItems: body.actionItems,
        recordedBy:  userId,
      })
      .returning();

    return reply.status(201).send({ data: meeting });
  });

  // ── PUT /billetterie/projects/:id/meetings/:meetingId — update meeting ─────
  app.put('/projects/:id/meetings/:meetingId', { preHandler: requireRole('ADMIN', 'PROJECT_MANAGER') }, async (request: any, reply) => {
    const { meetingId } = request.params as { id: string; meetingId: string };
    const body = createMeetingSchema.partial().parse(request.body);

    const updateData: any = {};
    if (body.title       !== undefined) updateData.title       = body.title;
    if (body.phaseKey    !== undefined) updateData.phaseKey    = body.phaseKey;
    if (body.meetingDate !== undefined) updateData.meetingDate = body.meetingDate;
    if (body.attendees   !== undefined) updateData.attendees   = body.attendees;
    if (body.agenda      !== undefined) updateData.agenda      = body.agenda;
    if (body.minutes     !== undefined) updateData.minutes     = body.minutes;
    if (body.actionItems !== undefined) updateData.actionItems = body.actionItems;

    const [updated] = await db
      .update(billetterieMeetings)
      .set(updateData)
      .where(eq(billetterieMeetings.id, meetingId))
      .returning();

    if (!updated) return reply.notFound('Meeting not found');
    return { data: updated };
  });

  // ── DELETE /billetterie/projects/:id — cancel project ─────────────────────
  app.delete('/projects/:id', { preHandler: requireRole('ADMIN') }, async (request: any, reply) => {
    const { id } = request.params as { id: string };

    const [updated] = await db
      .update(billetterieProjects)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(billetterieProjects.id, id))
      .returning();

    if (!updated) return reply.notFound('Project not found');
    return { data: updated };
  });
}
