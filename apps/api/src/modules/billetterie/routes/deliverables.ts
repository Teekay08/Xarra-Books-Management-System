import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sum } from 'drizzle-orm';
import { z } from 'zod';
import {
  billetterieProjects,
  billetterieProjectPhases,
  billetteriePhaseDeliverables,
  billetterieTimeLogs,
  staffMembers,
} from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole, assertBilTeamMember, isBilSysAdmin } from '../helpers.js';
import { PHASE_ORDER, type PhaseKey } from './projects.js';

const logTimeSchema = z.object({
  workDate:    z.string().min(1),
  hours:       z.number().positive().max(24),
  description: z.string().optional().nullable(),
});

const createDeliverableSchema = z.object({
  phaseKey:    z.enum(['INITIATION','ELICITATION','ARCHITECTURE','DEVELOPMENT','TESTING','SIGN_OFF','CLOSURE']),
  title:       z.string().min(1).max(255),
  description: z.string().optional(),
  assignedTo:  z.string().uuid().optional().nullable(),
  dueDate:     z.string().max(20).optional().nullable(),
  isRequired:  z.boolean().default(true),
});

const updateDeliverableSchema = z.object({
  title:       z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  status:      z.enum(['PENDING','IN_PROGRESS','COMPLETE']).optional(),
  assignedTo:  z.string().uuid().optional().nullable(),
  dueDate:     z.string().max(20).optional().nullable(),
  isRequired:  z.boolean().optional(),
});

export async function deliverablesRoutes(app: FastifyInstance) {
  // GET /projects/:id/deliverables?phaseKey=INITIATION
  app.get('/projects/:id/deliverables', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { phaseKey } = request.query as { phaseKey?: string };

    const project = await app.db.query.billetterieProjects.findFirst({
      where: eq(billetterieProjects.id, id),
    });
    if (!project) return reply.notFound('Project not found');

    const conditions: any[] = [eq(billetteriePhaseDeliverables.projectId, id)];
    if (phaseKey) conditions.push(eq(billetteriePhaseDeliverables.phaseKey as any, phaseKey));

    const deliverables = await app.db
      .select({
        id:          billetteriePhaseDeliverables.id,
        projectId:   billetteriePhaseDeliverables.projectId,
        phaseKey:    billetteriePhaseDeliverables.phaseKey,
        title:       billetteriePhaseDeliverables.title,
        description: billetteriePhaseDeliverables.description,
        status:      billetteriePhaseDeliverables.status,
        assignedTo:  billetteriePhaseDeliverables.assignedTo,
        assigneeName: staffMembers.name,
        dueDate:     billetteriePhaseDeliverables.dueDate,
        isRequired:  billetteriePhaseDeliverables.isRequired,
        createdBy:   billetteriePhaseDeliverables.createdBy,
        createdAt:   billetteriePhaseDeliverables.createdAt,
        updatedAt:   billetteriePhaseDeliverables.updatedAt,
      })
      .from(billetteriePhaseDeliverables)
      .leftJoin(staffMembers, eq(billetteriePhaseDeliverables.assignedTo, staffMembers.id))
      .where(and(...conditions))
      .orderBy(billetteriePhaseDeliverables.createdAt);

    return { data: deliverables };
  });

  // POST /projects/:id/deliverables
  // PM or BA
  app.post('/projects/:id/deliverables', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user   = request.session!.user as any;
    const userId = user.id;

    const deny = await assertBilProjectRole(app.db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const project = await app.db.query.billetterieProjects.findFirst({ where: eq(billetterieProjects.id, id) });
    if (!project) return reply.notFound('Project not found');

    const body = createDeliverableSchema.parse(request.body);

    const [created] = await app.db
      .insert(billetteriePhaseDeliverables)
      .values({
        ...body,
        projectId: id,
        createdBy: userId,
      })
      .returning();

    return { data: created };
  });

  // PM, BA, or ADMIN
  app.put('/projects/:id/deliverables/:deliverableId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, deliverableId } = request.params as { id: string; deliverableId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(app.db, id, user, ['PM', 'BA', 'ADMIN']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const deliv = await app.db.query.billetteriePhaseDeliverables.findFirst({
      where: and(
        eq(billetteriePhaseDeliverables.id, deliverableId),
        eq(billetteriePhaseDeliverables.projectId, id),
      ),
    });
    if (!deliv) return reply.notFound('Deliverable not found');

    const body = updateDeliverableSchema.parse(request.body);

    const [updated] = await app.db
      .update(billetteriePhaseDeliverables)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(billetteriePhaseDeliverables.id, deliverableId))
      .returning();

    return { data: updated };
  });

  // PM only
  app.delete('/projects/:id/deliverables/:deliverableId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, deliverableId } = request.params as { id: string; deliverableId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(app.db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const deliv = await app.db.query.billetteriePhaseDeliverables.findFirst({
      where: and(
        eq(billetteriePhaseDeliverables.id, deliverableId),
        eq(billetteriePhaseDeliverables.projectId, id),
      ),
    });
    if (!deliv) return reply.notFound('Deliverable not found');

    await app.db
      .delete(billetteriePhaseDeliverables)
      .where(eq(billetteriePhaseDeliverables.id, deliverableId));

    return { success: true };
  });

  // ── Log time against a deliverable — any team member ────────────────────────
  app.post('/projects/:id/deliverables/:deliverableId/log-time', { preHandler: requireAuth }, async (request, reply) => {
    const { id, deliverableId } = request.params as { id: string; deliverableId: string };
    const user   = request.session!.user as any;
    const userId = user.id;

    const deny = await assertBilTeamMember(app.db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const deliv = await app.db.query.billetteriePhaseDeliverables.findFirst({
      where: and(eq(billetteriePhaseDeliverables.id, deliverableId), eq(billetteriePhaseDeliverables.projectId, id)),
    });
    if (!deliv) return reply.notFound('Deliverable not found');

    const staffMember = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.userId, userId),
    });
    if (!staffMember) return reply.badRequest('No staff profile found for your account. Ask your admin to create one.');

    const body = logTimeSchema.parse(request.body);

    const [log] = await app.db.insert(billetterieTimeLogs).values({
      deliverableId,
      staffMemberId: staffMember.id,
      workDate:      body.workDate,
      hours:         String(body.hours),
      description:   body.description ?? null,
      status:        'DRAFT',
    }).returning();

    // Auto-advance deliverable PENDING → IN_PROGRESS when first log is made
    if (deliv.status === 'PENDING') {
      await app.db.update(billetteriePhaseDeliverables)
        .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
        .where(eq(billetteriePhaseDeliverables.id, deliverableId));
    }

    return reply.status(201).send({ data: log });
  });

  // GET /projects/:id/deliverables/:deliverableId/time-logs
  app.get('/projects/:id/deliverables/:deliverableId/time-logs', { preHandler: requireAuth }, async (request, reply) => {
    const { id, deliverableId } = request.params as { id: string; deliverableId: string };

    const deliv = await app.db.query.billetteriePhaseDeliverables.findFirst({
      where: and(eq(billetteriePhaseDeliverables.id, deliverableId), eq(billetteriePhaseDeliverables.projectId, id)),
    });
    if (!deliv) return reply.notFound('Deliverable not found');

    const logs = await app.db
      .select({
        id:              billetterieTimeLogs.id,
        workDate:        billetterieTimeLogs.workDate,
        hours:           billetterieTimeLogs.hours,
        description:     billetterieTimeLogs.description,
        status:          billetterieTimeLogs.status,
        staffMemberId:   billetterieTimeLogs.staffMemberId,
        staffMemberName: staffMembers.name,
      })
      .from(billetterieTimeLogs)
      .leftJoin(staffMembers, eq(billetterieTimeLogs.staffMemberId, staffMembers.id))
      .where(eq(billetterieTimeLogs.deliverableId, deliverableId))
      .orderBy(desc(billetterieTimeLogs.workDate));

    const totalHours = logs.reduce((acc, l) => acc + Number(l.hours), 0);
    return { data: logs, totalHours: parseFloat(totalHours.toFixed(2)) };
  });

  // DELETE /projects/:id/deliverables/:deliverableId/time-logs/:logId
  app.delete('/projects/:id/deliverables/:deliverableId/time-logs/:logId', { preHandler: requireAuth }, async (request, reply) => {
    const { deliverableId, logId } = request.params as { id: string; deliverableId: string; logId: string };
    const user   = request.session!.user as any;
    const userId = user.id;

    const log = await app.db.query.billetterieTimeLogs.findFirst({
      where: and(eq(billetterieTimeLogs.id, logId), eq(billetterieTimeLogs.deliverableId, deliverableId)),
    });
    if (!log) return reply.notFound('Time log not found');
    if (log.status !== 'DRAFT') return reply.badRequest('Only DRAFT time logs can be deleted');
    const staffMember = await app.db.query.staffMembers.findFirst({ where: eq(staffMembers.userId, userId) });
    const isOwn = staffMember && log.staffMemberId === staffMember.id;
    if (!isBilSysAdmin(user) && !isOwn) {
      return reply.status(403).send({ error: 'Forbidden', message: 'You can only delete your own time logs' });
    }

    await app.db.delete(billetterieTimeLogs).where(eq(billetterieTimeLogs.id, logId));
    return { success: true };
  });

  // POST /projects/:id/phases/:phaseKey/advance — validate all required deliverables COMPLETE
  // This replaces / overrides the plain advance in projects.ts — register here to add gate check
  app.post('/projects/:id/phases/:phaseKey/check-advance', { preHandler: requireAuth }, async (request, reply) => {
    const { id, phaseKey } = request.params as { id: string; phaseKey: string };

    const deliverables = await app.db
      .select()
      .from(billetteriePhaseDeliverables)
      .where(
        and(
          eq(billetteriePhaseDeliverables.projectId, id),
          eq(billetteriePhaseDeliverables.phaseKey as any, phaseKey),
        ),
      );

    const requiredIncomplete = deliverables.filter(
      (d) => d.isRequired && d.status !== 'COMPLETE',
    );

    return {
      canAdvance: requiredIncomplete.length === 0,
      blocking: requiredIncomplete.map((d) => ({ id: d.id, title: d.title })),
      total: deliverables.length,
      complete: deliverables.filter((d) => d.status === 'COMPLETE').length,
    };
  });
}

/**
 * Check whether all required deliverables for a given phase are COMPLETE.
 * Called by projects.ts advance-phase endpoint before allowing the advance.
 */
export async function checkPhaseDeliverables(
  db: any,
  projectId: string,
  phaseKey: string,
): Promise<{ canAdvance: boolean; blocking: { id: string; title: string }[] }> {
  const deliverables = await db
    .select()
    .from(billetteriePhaseDeliverables)
    .where(
      and(
        eq(billetteriePhaseDeliverables.projectId, projectId),
        eq(billetteriePhaseDeliverables.phaseKey as any, phaseKey),
      ),
    );

  const blocking = deliverables
    .filter((d: any) => d.isRequired && d.status !== 'COMPLETE')
    .map((d: any) => ({ id: d.id, title: d.title }));

  return { canAdvance: blocking.length === 0, blocking };
}
