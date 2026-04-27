import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { billetterieChangeRequests } from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole, assertBilTeamMember, isBilSysAdmin } from '../helpers.js';

const TYPES    = ['SCOPE', 'TIMELINE', 'BUDGET', 'TECHNICAL', 'PROCESS', 'OTHER'] as const;
const STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'WITHDRAWN'] as const;
const IMPACTS  = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const crBodySchema = z.object({
  title:                z.string().min(1).max(500),
  description:          z.string().min(1),
  type:                 z.enum(TYPES).default('OTHER'),
  impactScope:          z.enum(IMPACTS).default('NONE'),
  impactTimeline:       z.enum(IMPACTS).default('NONE'),
  impactBudget:         z.enum(IMPACTS).default('NONE'),
  impactRisk:           z.enum(IMPACTS).default('NONE'),
  justification:        z.string().optional().nullable(),
  alternatives:         z.string().optional().nullable(),
  rollbackPlan:         z.string().optional().nullable(),
  estimatedEffortDays:  z.number().positive().optional().nullable(),
  estimatedCost:        z.number().positive().optional().nullable(),
  proposedStart:        z.string().optional().nullable(),
  proposedEnd:          z.string().optional().nullable(),
  linkedSprintId:       z.string().uuid().optional().nullable(),
  linkedRiskId:         z.string().uuid().optional().nullable(),
  tags:                 z.array(z.string()).optional().default([]),
});

async function nextCRNumber(db: any, projectId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(MAX(cr_number), 0) + 1 AS next FROM billetterie_change_requests WHERE project_id = ${projectId}
  `);
  const rows = Array.isArray(result) ? result : result.rows ?? [];
  return Number(rows[0]?.next ?? 1);
}

export async function changeRequestRoutes(app: FastifyInstance) {
  const db = app.db;

  // List CRs for a project
  app.get('/projects/:id/change-requests', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const q = request.query as any;
    const statusFilter = (q.status ?? '').trim();
    const typeFilter   = (q.type ?? '').trim();

    const conditions: any[] = [eq(billetterieChangeRequests.projectId, id)];
    if (statusFilter) conditions.push(eq(billetterieChangeRequests.status, statusFilter as any));
    if (typeFilter)   conditions.push(eq(billetterieChangeRequests.type, typeFilter as any));

    const crs = await db.select().from(billetterieChangeRequests)
      .where(and(...conditions))
      .orderBy(desc(billetterieChangeRequests.createdAt));

    return { data: crs };
  });

  // Get single CR
  app.get('/projects/:id/change-requests/:crId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, crId } = request.params as { id: string; crId: string };
    const [cr] = await db.select().from(billetterieChangeRequests)
      .where(and(eq(billetterieChangeRequests.id, crId), eq(billetterieChangeRequests.projectId, id)));
    if (!cr) return reply.notFound('Change request not found');
    return { data: cr };
  });

  // Create CR — any team member
  app.post('/projects/:id/change-requests', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;

    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = crBodySchema.parse(request.body);
    const crNumber = await nextCRNumber(db, id);

    const [cr] = await db.insert(billetterieChangeRequests).values({
      projectId:           id,
      crNumber,
      title:               body.title,
      description:         body.description,
      type:                body.type as any,
      impactScope:         body.impactScope as any,
      impactTimeline:      body.impactTimeline as any,
      impactBudget:        body.impactBudget as any,
      impactRisk:          body.impactRisk as any,
      justification:       body.justification ?? null,
      alternatives:        body.alternatives ?? null,
      rollbackPlan:        body.rollbackPlan ?? null,
      estimatedEffortDays: body.estimatedEffortDays ? String(body.estimatedEffortDays) : null,
      estimatedCost:       body.estimatedCost ? String(body.estimatedCost) : null,
      proposedStart:       body.proposedStart ?? null,
      proposedEnd:         body.proposedEnd ?? null,
      linkedSprintId:      body.linkedSprintId ?? null,
      linkedRiskId:        body.linkedRiskId ?? null,
      tags:                body.tags ?? [],
      requestedBy:         user.id,
    }).returning();

    return reply.status(201).send({ data: cr });
  });

  // Update CR — PM or BA (or system admin)
  app.put('/projects/:id/change-requests/:crId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, crId } = request.params as { id: string; crId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = crBodySchema.partial().parse(request.body);
    const updateData: any = { updatedAt: new Date() };
    const fields: Array<keyof typeof body> = ['title', 'description', 'type', 'impactScope', 'impactTimeline',
      'impactBudget', 'impactRisk', 'justification', 'alternatives', 'rollbackPlan', 'proposedStart', 'proposedEnd',
      'linkedSprintId', 'linkedRiskId', 'tags'];
    for (const f of fields) if (body[f] !== undefined) updateData[f] = body[f];
    if (body.estimatedEffortDays !== undefined) updateData.estimatedEffortDays = body.estimatedEffortDays ? String(body.estimatedEffortDays) : null;
    if (body.estimatedCost !== undefined) updateData.estimatedCost = body.estimatedCost ? String(body.estimatedCost) : null;

    const [updated] = await db.update(billetterieChangeRequests).set(updateData)
      .where(and(eq(billetterieChangeRequests.id, crId), eq(billetterieChangeRequests.projectId, id)))
      .returning();
    if (!updated) return reply.notFound('Change request not found');
    return { data: updated };
  });

  // Submit CR for review
  app.post('/projects/:id/change-requests/:crId/submit', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, crId } = request.params as { id: string; crId: string };
    const user = request.session!.user as any;

    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const [cr] = await db.select().from(billetterieChangeRequests)
      .where(and(eq(billetterieChangeRequests.id, crId), eq(billetterieChangeRequests.projectId, id)));
    if (!cr) return reply.notFound('Change request not found');
    if (cr.status !== 'DRAFT') return reply.badRequest('Only DRAFT change requests can be submitted');

    const [updated] = await db.update(billetterieChangeRequests)
      .set({ status: 'SUBMITTED' as any, updatedAt: new Date() })
      .where(eq(billetterieChangeRequests.id, crId)).returning();
    return { data: updated };
  });

  // CAB review (PM or SPONSOR)
  app.post('/projects/:id/change-requests/:crId/review', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, crId } = request.params as { id: string; crId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'SPONSOR']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({ notes: z.string().optional() }).parse(request.body);

    const [updated] = await db.update(billetterieChangeRequests).set({
      status:      'UNDER_REVIEW' as any,
      reviewedBy:  user.id,
      reviewedAt:  new Date(),
      reviewNotes: body.notes ?? null,
      updatedAt:   new Date(),
    }).where(and(eq(billetterieChangeRequests.id, crId), eq(billetterieChangeRequests.projectId, id))).returning();

    if (!updated) return reply.notFound('Change request not found');
    return { data: updated };
  });

  // Approve / Reject (SPONSOR or system admin)
  app.post('/projects/:id/change-requests/:crId/approve', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, crId } = request.params as { id: string; crId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['SPONSOR', 'PM']);
    if (deny && !isBilSysAdmin(user)) return reply.status(403).send({ error: 'Forbidden', message: 'Only Sponsor or Admin can approve change requests' });

    const body = z.object({ approve: z.boolean(), notes: z.string().optional() }).parse(request.body);

    const [updated] = await db.update(billetterieChangeRequests).set({
      status:       (body.approve ? 'APPROVED' : 'REJECTED') as any,
      approvedBy:   user.id,
      approvedAt:   new Date(),
      approvalNotes: body.notes ?? null,
      updatedAt:    new Date(),
    }).where(and(eq(billetterieChangeRequests.id, crId), eq(billetterieChangeRequests.projectId, id))).returning();

    if (!updated) return reply.notFound('Change request not found');
    return { data: updated };
  });

  // Mark implemented (PM or BA)
  app.post('/projects/:id/change-requests/:crId/implement', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, crId } = request.params as { id: string; crId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({ notes: z.string().optional() }).parse(request.body);

    const [cr] = await db.select({ status: billetterieChangeRequests.status }).from(billetterieChangeRequests)
      .where(and(eq(billetterieChangeRequests.id, crId), eq(billetterieChangeRequests.projectId, id)));
    if (!cr) return reply.notFound('Change request not found');
    if (cr.status !== 'APPROVED') return reply.badRequest('Only APPROVED change requests can be marked as implemented');

    const [updated] = await db.update(billetterieChangeRequests).set({
      status:              'IMPLEMENTED' as any,
      implementedBy:       user.id,
      implementedAt:       new Date(),
      implementationNotes: body.notes ?? null,
      updatedAt:           new Date(),
    }).where(eq(billetterieChangeRequests.id, crId)).returning();

    return { data: updated };
  });

  // Withdraw a CR
  app.post('/projects/:id/change-requests/:crId/withdraw', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, crId } = request.params as { id: string; crId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const [updated] = await db.update(billetterieChangeRequests)
      .set({ status: 'WITHDRAWN' as any, updatedAt: new Date() })
      .where(and(eq(billetterieChangeRequests.id, crId), eq(billetterieChangeRequests.projectId, id)))
      .returning();
    if (!updated) return reply.notFound('Change request not found');
    return { data: updated };
  });

  // Delete (PM only, DRAFT only)
  app.delete('/projects/:id/change-requests/:crId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, crId } = request.params as { id: string; crId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const [cr] = await db.select({ status: billetterieChangeRequests.status }).from(billetterieChangeRequests)
      .where(and(eq(billetterieChangeRequests.id, crId), eq(billetterieChangeRequests.projectId, id)));
    if (!cr) return reply.notFound('Change request not found');
    if (cr.status !== 'DRAFT' && cr.status !== 'WITHDRAWN') return reply.badRequest('Only DRAFT or WITHDRAWN CRs can be deleted');

    await db.delete(billetterieChangeRequests).where(eq(billetterieChangeRequests.id, crId));
    return { success: true };
  });
}
