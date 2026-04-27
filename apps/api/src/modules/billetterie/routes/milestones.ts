import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { billetterieMilestones } from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole } from '../helpers.js';
import { PHASE_ORDER } from './projects.js';

const createMilestoneSchema = z.object({
  phaseKey:    z.enum(PHASE_ORDER),
  title:       z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  dueDate:     z.string().optional().nullable(),
  status:      z.enum(['PENDING', 'MET', 'MISSED', 'DEFERRED']).optional(),
});

export async function milestoneRoutes(app: FastifyInstance) {
  const db = app.db;

  app.get('/projects/:id/milestones', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const milestones = await db
      .select()
      .from(billetterieMilestones)
      .where(eq(billetterieMilestones.projectId, id))
      .orderBy(billetterieMilestones.dueDate, desc(billetterieMilestones.createdAt));
    return { data: milestones };
  });

  // PM or BA
  app.post('/projects/:id/milestones', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user   = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = createMilestoneSchema.parse(request.body);
    const [milestone] = await db.insert(billetterieMilestones).values({
      projectId:   id,
      phaseKey:    body.phaseKey as any,
      title:       body.title,
      description: body.description ?? null,
      dueDate:     body.dueDate ?? null,
      status:      (body.status ?? 'PENDING') as any,
      createdBy:   user.id,
    }).returning();

    return reply.status(201).send({ data: milestone });
  });

  // PM or BA
  app.put('/projects/:id/milestones/:mid', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, mid } = request.params as { id: string; mid: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = createMilestoneSchema.partial().parse(request.body);
    const updateData: any = { updatedAt: new Date() };
    if (body.phaseKey    !== undefined) updateData.phaseKey    = body.phaseKey;
    if (body.title       !== undefined) updateData.title       = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.dueDate     !== undefined) updateData.dueDate     = body.dueDate;
    if (body.status      !== undefined) updateData.status      = body.status;

    const [updated] = await db.update(billetterieMilestones).set(updateData)
      .where(and(eq(billetterieMilestones.id, mid), eq(billetterieMilestones.projectId, id)))
      .returning();

    if (!updated) return reply.notFound('Milestone not found');
    return { data: updated };
  });

  // PM only
  app.delete('/projects/:id/milestones/:mid', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, mid } = request.params as { id: string; mid: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieMilestones).where(and(eq(billetterieMilestones.id, mid), eq(billetterieMilestones.projectId, id)));
    return { success: true };
  });
}
