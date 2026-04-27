import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { billetterieRisks, staffMembers } from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole } from '../helpers.js';

const riskBodySchema = z.object({
  title:       z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  category:    z.string().max(100).optional().nullable(),
  probability: z.number().int().min(1).max(5).default(1),
  impact:      z.number().int().min(1).max(5).default(1),
  mitigation:  z.string().optional().nullable(),
  ownerId:     z.string().uuid().optional().nullable(),
  reviewDate:  z.string().optional().nullable(),
  status:      z.enum(['OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED']).optional(),
});

export async function risksRoutes(app: FastifyInstance) {
  const db = app.db;

  // List risks for a project
  app.get('/projects/:id/risks', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };

    const risks = await db
      .select()
      .from(billetterieRisks)
      .where(eq(billetterieRisks.projectId, id))
      .orderBy(billetterieRisks.createdAt);

    const ownerIds = [...new Set(risks.map(r => r.ownerId).filter(Boolean))] as string[];
    let ownerMap: Record<string, any> = {};
    if (ownerIds.length) {
      const owners = await db
        .select({ id: staffMembers.id, name: staffMembers.name, role: staffMembers.role })
        .from(staffMembers)
        .where(inArray(staffMembers.id, ownerIds));
      for (const o of owners) ownerMap[o.id] = o;
    }

    const data = risks.map(r => ({
      ...r,
      score: r.probability * r.impact,
      owner: r.ownerId ? (ownerMap[r.ownerId] ?? null) : null,
    }));

    return { data };
  });

  // Get a single risk
  app.get('/projects/:id/risks/:riskId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, riskId } = request.params as { id: string; riskId: string };

    const [risk] = await db
      .select()
      .from(billetterieRisks)
      .where(and(eq(billetterieRisks.id, riskId), eq(billetterieRisks.projectId, id)));

    if (!risk) return reply.notFound('Risk not found');

    let owner = null;
    if (risk.ownerId) {
      const [o] = await db
        .select({ id: staffMembers.id, name: staffMembers.name, role: staffMembers.role })
        .from(staffMembers)
        .where(eq(staffMembers.id, risk.ownerId));
      owner = o ?? null;
    }

    return { data: { ...risk, score: risk.probability * risk.impact, owner } };
  });

  // Create a risk (PM or BA)
  app.post('/projects/:id/risks', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = riskBodySchema.parse(request.body);
    const [risk] = await db.insert(billetterieRisks).values({
      projectId:   id,
      title:       body.title,
      description: body.description ?? null,
      category:    body.category ?? null,
      probability: body.probability,
      impact:      body.impact,
      mitigation:  body.mitigation ?? null,
      ownerId:     body.ownerId ?? null,
      reviewDate:  body.reviewDate ?? null,
      status:      (body.status ?? 'OPEN') as any,
      createdBy:   user.id,
    }).returning();

    return reply.status(201).send({ data: { ...risk, score: risk.probability * risk.impact } });
  });

  // Update a risk (PM or BA)
  app.put('/projects/:id/risks/:riskId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, riskId } = request.params as { id: string; riskId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = riskBodySchema.partial().parse(request.body);
    const updateData: any = { updatedAt: new Date() };
    if (body.title       !== undefined) updateData.title       = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category    !== undefined) updateData.category    = body.category;
    if (body.probability !== undefined) updateData.probability = body.probability;
    if (body.impact      !== undefined) updateData.impact      = body.impact;
    if (body.mitigation  !== undefined) updateData.mitigation  = body.mitigation;
    if (body.ownerId     !== undefined) updateData.ownerId     = body.ownerId;
    if (body.reviewDate  !== undefined) updateData.reviewDate  = body.reviewDate;
    if (body.status      !== undefined) updateData.status      = body.status;

    const [updated] = await db.update(billetterieRisks)
      .set(updateData)
      .where(and(eq(billetterieRisks.id, riskId), eq(billetterieRisks.projectId, id)))
      .returning();

    if (!updated) return reply.notFound('Risk not found');
    return { data: { ...updated, score: updated.probability * updated.impact } };
  });

  // Delete a risk (PM only)
  app.delete('/projects/:id/risks/:riskId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, riskId } = request.params as { id: string; riskId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieRisks)
      .where(and(eq(billetterieRisks.id, riskId), eq(billetterieRisks.projectId, id)));

    return { success: true };
  });
}
