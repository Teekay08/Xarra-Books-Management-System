import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { billetterieSprints, billetterieTasks } from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole, isBilSysAdmin } from '../helpers.js';

const sprintBodySchema = z.object({
  name:      z.string().min(1).max(100),
  goal:      z.string().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status:    z.enum(['PLANNING', 'ACTIVE', 'DEMO_PENDING', 'SIGNED_OFF', 'CANCELLED']).optional(),
});

export async function sprintRoutes(app: FastifyInstance) {
  const db = app.db;

  // List sprints for a project (includes task count summary)
  app.get('/projects/:id/sprints', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };

    const sprints = await db
      .select()
      .from(billetterieSprints)
      .where(eq(billetterieSprints.projectId, id))
      .orderBy(billetterieSprints.startDate);

    // Task counts per sprint
    const taskRows = await db
      .select({ sprintId: billetterieTasks.sprintId, status: billetterieTasks.status })
      .from(billetterieTasks)
      .where(eq(billetterieTasks.projectId, id));

    const taskSummary: Record<string, { total: number; done: number }> = {};
    for (const t of taskRows) {
      if (!t.sprintId) continue;
      if (!taskSummary[t.sprintId]) taskSummary[t.sprintId] = { total: 0, done: 0 };
      taskSummary[t.sprintId].total++;
      if (t.status === 'DONE') taskSummary[t.sprintId].done++;
    }

    const data = sprints.map(s => ({ ...s, taskSummary: taskSummary[s.id] ?? { total: 0, done: 0 } }));
    return { data };
  });

  // Get sprint detail with tasks
  app.get('/projects/:id/sprints/:sprintId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };

    const [sprint] = await db
      .select()
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)));

    if (!sprint) return reply.notFound('Sprint not found');

    const tasks = await db
      .select()
      .from(billetterieTasks)
      .where(and(eq(billetterieTasks.sprintId, sprintId), eq(billetterieTasks.projectId, id)))
      .orderBy(billetterieTasks.position);

    return { data: { ...sprint, tasks } };
  });

  // Create a sprint (PM only)
  app.post('/projects/:id/sprints', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = sprintBodySchema.parse(request.body);
    if (body.startDate >= body.endDate) {
      return reply.badRequest('endDate must be after startDate');
    }

    const [sprint] = await db.insert(billetterieSprints).values({
      projectId: id,
      name:      body.name,
      goal:      body.goal ?? null,
      startDate: body.startDate,
      endDate:   body.endDate,
      status:    (body.status ?? 'PLANNING') as any,
      createdBy: user.id,
    }).returning();

    return reply.status(201).send({ data: sprint });
  });

  // Update a sprint (PM only)
  app.put('/projects/:id/sprints/:sprintId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = sprintBodySchema.partial().parse(request.body);
    if (body.startDate && body.endDate && body.startDate >= body.endDate) {
      return reply.badRequest('endDate must be after startDate');
    }

    const updateData: any = { updatedAt: new Date() };
    if (body.name      !== undefined) updateData.name      = body.name;
    if (body.goal      !== undefined) updateData.goal      = body.goal;
    if (body.startDate !== undefined) updateData.startDate = body.startDate;
    if (body.endDate   !== undefined) updateData.endDate   = body.endDate;
    if (body.status    !== undefined) updateData.status    = body.status;

    const [updated] = await db.update(billetterieSprints)
      .set(updateData)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)))
      .returning();

    if (!updated) return reply.notFound('Sprint not found');
    return { data: updated };
  });

  // Record demo (PM or BA — sets status → DEMO_PENDING)
  app.post('/projects/:id/sprints/:sprintId/demo', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      demoAttachmentUrl: z.string().url().optional().nullable(),
      demoNotes:         z.string().optional().nullable(),
    }).parse(request.body);

    const [sprint] = await db
      .select()
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)));

    if (!sprint) return reply.notFound('Sprint not found');
    if (sprint.status !== 'ACTIVE') return reply.badRequest('Sprint must be ACTIVE to record a demo');

    const [updated] = await db.update(billetterieSprints).set({
      status:            'DEMO_PENDING' as any,
      demoRecordedAt:    new Date(),
      demoAttachmentUrl: body.demoAttachmentUrl ?? null,
      demoNotes:         body.demoNotes ?? null,
      updatedAt:         new Date(),
    }).where(eq(billetterieSprints.id, sprintId)).returning();

    return { data: updated };
  });

  // Sign off sprint (PM only — sets status → SIGNED_OFF)
  app.post('/projects/:id/sprints/:sprintId/sign-off', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const [sprint] = await db
      .select()
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)));

    if (!sprint) return reply.notFound('Sprint not found');
    if (sprint.status !== 'DEMO_PENDING') {
      return reply.badRequest('Demo must be recorded before signing off the sprint');
    }

    const [updated] = await db.update(billetterieSprints).set({
      status:      'SIGNED_OFF' as any,
      signedOffBy: user.id,
      signedOffAt: new Date(),
      updatedAt:   new Date(),
    }).where(eq(billetterieSprints.id, sprintId)).returning();

    return { data: updated };
  });

  // Sponsor approval (SPONSOR role or sys admin)
  app.post('/projects/:id/sprints/:sprintId/sponsor-approve', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };
    const user = request.session!.user as any;

    // Allow SPONSOR project role or system admin
    const deny = await assertBilProjectRole(db, id, user, ['SPONSOR', 'PM']);
    if (deny && !isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only the Project Sponsor can approve a sprint' });
    }

    const [sprint] = await db
      .select()
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)));

    if (!sprint) return reply.notFound('Sprint not found');
    if (sprint.status !== 'SIGNED_OFF') {
      return reply.badRequest('Sprint must be signed off by PM before sponsor approval');
    }

    const [updated] = await db.update(billetterieSprints).set({
      sponsorApproved:   true,
      sponsorApprovedBy: user.id,
      sponsorApprovedAt: new Date(),
      updatedAt:         new Date(),
    }).where(eq(billetterieSprints.id, sprintId)).returning();

    return { data: updated };
  });

  // Activate sprint (PM only — moves PLANNING → ACTIVE)
  app.post('/projects/:id/sprints/:sprintId/activate', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    // Only one sprint ACTIVE at a time
    const [activeSprint] = await db
      .select({ id: billetterieSprints.id })
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.projectId, id), eq(billetterieSprints.status, 'ACTIVE' as any)));

    if (activeSprint) {
      return reply.badRequest('Another sprint is already ACTIVE. Complete it before activating a new one.');
    }

    const [sprint] = await db
      .select()
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)));

    if (!sprint) return reply.notFound('Sprint not found');
    if (sprint.status !== 'PLANNING') return reply.badRequest('Only PLANNING sprints can be activated');

    const [updated] = await db.update(billetterieSprints).set({
      status:    'ACTIVE' as any,
      updatedAt: new Date(),
    }).where(eq(billetterieSprints.id, sprintId)).returning();

    return { data: updated };
  });

  // Cancel sprint (PM only)
  app.post('/projects/:id/sprints/:sprintId/cancel', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const [sprint] = await db
      .select()
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)));

    if (!sprint) return reply.notFound('Sprint not found');
    if (['SIGNED_OFF', 'CANCELLED'].includes(sprint.status)) {
      return reply.badRequest('Cannot cancel a completed or already-cancelled sprint');
    }

    // Unlink tasks from the cancelled sprint
    await db.update(billetterieTasks)
      .set({ sprintId: null, updatedAt: new Date() })
      .where(and(eq(billetterieTasks.sprintId, sprintId), eq(billetterieTasks.projectId, id)));

    const [updated] = await db.update(billetterieSprints).set({
      status:    'CANCELLED' as any,
      updatedAt: new Date(),
    }).where(eq(billetterieSprints.id, sprintId)).returning();

    return { data: updated };
  });

  // Assign / unassign tasks to a sprint (PM or BA)
  app.post('/projects/:id/sprints/:sprintId/tasks', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      taskIds: z.array(z.string().uuid()),
      action:  z.enum(['add', 'remove']).default('add'),
    }).parse(request.body);

    const sprint = await db.select({ id: billetterieSprints.id })
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)))
      .limit(1).then((r: any[]) => r[0]);

    if (!sprint) return reply.notFound('Sprint not found');

    const newSprintId = body.action === 'add' ? sprintId : null;
    for (const taskId of body.taskIds) {
      await db.update(billetterieTasks)
        .set({ sprintId: newSprintId, updatedAt: new Date() })
        .where(and(eq(billetterieTasks.id, taskId), eq(billetterieTasks.projectId, id)));
    }

    return { updated: body.taskIds.length, action: body.action };
  });

  // Delete sprint (PM only — only PLANNING or CANCELLED)
  app.delete('/projects/:id/sprints/:sprintId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, sprintId } = request.params as { id: string; sprintId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const [sprint] = await db
      .select()
      .from(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)));

    if (!sprint) return reply.notFound('Sprint not found');
    if (!['PLANNING', 'CANCELLED'].includes(sprint.status)) {
      return reply.badRequest('Only PLANNING or CANCELLED sprints can be deleted');
    }

    await db.delete(billetterieSprints)
      .where(and(eq(billetterieSprints.id, sprintId), eq(billetterieSprints.projectId, id)));

    return { success: true };
  });
}
