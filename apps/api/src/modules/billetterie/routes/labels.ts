import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { billetterieIssueLabels } from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole } from '../helpers.js';

const labelSchema = z.object({
  name:        z.string().min(1).max(100),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6b7280'),
  description: z.string().optional().nullable(),
});

export async function labelRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── List labels ──────────────────────────────────────────────────────────────
  app.get('/projects/:id/labels', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const labels = await db.select().from(billetterieIssueLabels).where(eq(billetterieIssueLabels.projectId, id)).orderBy(billetterieIssueLabels.name);
    return { data: labels };
  });

  // PM only — label management
  app.post('/projects/:id/labels', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user   = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = labelSchema.parse(request.body);
    const [label] = await db.insert(billetterieIssueLabels).values({
      projectId: id, name: body.name, color: body.color, description: body.description ?? null, createdBy: user.id,
    }).returning();

    return reply.status(201).send({ data: label });
  });

  app.put('/projects/:id/labels/:lid', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, lid } = request.params as { id: string; lid: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = labelSchema.partial().parse(request.body);
    const updateData: any = {};
    if (body.name        !== undefined) updateData.name        = body.name;
    if (body.color       !== undefined) updateData.color       = body.color;
    if (body.description !== undefined) updateData.description = body.description;

    const [updated] = await db.update(billetterieIssueLabels).set(updateData)
      .where(and(eq(billetterieIssueLabels.id, lid), eq(billetterieIssueLabels.projectId, id)))
      .returning();

    if (!updated) return reply.notFound('Label not found');
    return { data: updated };
  });

  app.delete('/projects/:id/labels/:lid', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, lid } = request.params as { id: string; lid: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieIssueLabels).where(and(eq(billetterieIssueLabels.id, lid), eq(billetterieIssueLabels.projectId, id)));
    return { success: true };
  });
}
