import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  billetterieTestPlans,
  billetterieTestCases,
  billetterieTestExecutions,
  billetterieIssues,
} from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole, assertBilTeamMember } from '../helpers.js';
import { PHASE_ORDER } from './projects.js';

const TEST_TYPES   = ['FUNCTIONAL', 'REGRESSION', 'SMOKE', 'PERFORMANCE', 'SECURITY', 'UAT', 'OTHER'] as const;
const TEST_RESULTS = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'] as const;
const PRIORITIES   = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const planSchema = z.object({
  title:             z.string().min(1).max(255),
  description:       z.string().optional().nullable(),
  testType:          z.enum(TEST_TYPES).default('FUNCTIONAL'),
  linkedSprintId:    z.string().uuid().optional().nullable(),
  linkedMilestoneId: z.string().uuid().optional().nullable(),
  targetPhase:       z.enum(PHASE_ORDER).optional().nullable(),
  passThreshold:     z.number().int().min(1).max(100).default(80),
});

const caseSchema = z.object({
  title:          z.string().min(1).max(500),
  description:    z.string().optional().nullable(),
  steps:          z.array(z.object({ step: z.string(), expected: z.string() })).optional().default([]),
  expectedResult: z.string().optional().nullable(),
  priority:       z.enum(PRIORITIES).default('MEDIUM'),
  position:       z.number().int().optional(),
});

export async function testingRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── Test Plans ────────────────────────────────────────────────────────────────

  app.get('/projects/:id/test-plans', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };

    const plans = await db.select().from(billetterieTestPlans)
      .where(eq(billetterieTestPlans.projectId, id))
      .orderBy(desc(billetterieTestPlans.createdAt));

    // Enrich each plan with case counts + result summary
    const enriched = await Promise.all(plans.map(async (p: any) => {
      const cases = await db
        .select({ result: billetterieTestCases.latestResult })
        .from(billetterieTestCases)
        .where(eq(billetterieTestCases.planId, p.id));

      const total   = cases.length;
      const pass    = cases.filter((c: any) => c.result === 'PASS').length;
      const fail    = cases.filter((c: any) => c.result === 'FAIL').length;
      const blocked = cases.filter((c: any) => c.result === 'BLOCKED').length;
      const notRun  = cases.filter((c: any) => c.result === 'NOT_RUN').length;
      const skipped = cases.filter((c: any) => c.result === 'SKIPPED').length;
      const pct     = total > 0 ? Math.round((pass / total) * 100) : 0;

      return { ...p, summary: { total, pass, fail, blocked, notRun, skipped, passPct: pct } };
    }));

    return { data: enriched };
  });

  app.post('/projects/:id/test-plans', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = planSchema.parse(request.body);
    const [plan] = await db.insert(billetterieTestPlans).values({
      projectId:         id,
      title:             body.title,
      description:       body.description ?? null,
      testType:          body.testType as any,
      linkedSprintId:    body.linkedSprintId ?? null,
      linkedMilestoneId: body.linkedMilestoneId ?? null,
      targetPhase:       (body.targetPhase ?? null) as any,
      passThreshold:     body.passThreshold,
      createdBy:         user.id,
    }).returning();

    return reply.status(201).send({ data: plan });
  });

  app.put('/projects/:id/test-plans/:planId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, planId } = request.params as { id: string; planId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = planSchema.partial().extend({
      status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
    }).parse(request.body);

    const updateData: any = { updatedAt: new Date() };
    const fields = ['title', 'description', 'testType', 'linkedSprintId', 'linkedMilestoneId', 'targetPhase', 'passThreshold', 'status'] as const;
    for (const f of fields) if ((body as any)[f] !== undefined) updateData[f] = (body as any)[f];

    const [updated] = await db.update(billetterieTestPlans).set(updateData)
      .where(and(eq(billetterieTestPlans.id, planId), eq(billetterieTestPlans.projectId, id)))
      .returning();

    if (!updated) return reply.notFound('Test plan not found');
    return { data: updated };
  });

  app.delete('/projects/:id/test-plans/:planId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, planId } = request.params as { id: string; planId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieTestPlans)
      .where(and(eq(billetterieTestPlans.id, planId), eq(billetterieTestPlans.projectId, id)));
    return { success: true };
  });

  // ── Test Cases ────────────────────────────────────────────────────────────────

  app.get('/projects/:id/test-plans/:planId/cases', { preHandler: requireAuth }, async (request: any) => {
    const { planId } = request.params as { id: string; planId: string };

    const cases = await db.select().from(billetterieTestCases)
      .where(eq(billetterieTestCases.planId, planId))
      .orderBy(billetterieTestCases.position, billetterieTestCases.createdAt);

    return { data: cases };
  });

  app.post('/projects/:id/test-plans/:planId/cases', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, planId } = request.params as { id: string; planId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    // Verify plan belongs to project
    const plan = await db.select({ id: billetterieTestPlans.id }).from(billetterieTestPlans)
      .where(and(eq(billetterieTestPlans.id, planId), eq(billetterieTestPlans.projectId, id)))
      .limit(1).then((r: any[]) => r[0]);
    if (!plan) return reply.notFound('Test plan not found');

    const body = caseSchema.parse(request.body);

    // Auto-position at end of plan
    const maxPos = await db.execute(sql`
      SELECT COALESCE(MAX(position), -1) + 1 AS next FROM billetterie_test_cases WHERE plan_id = ${planId}
    `).then((r: any) => Number((Array.isArray(r) ? r[0] : r.rows?.[0])?.next ?? 0));

    const [tc] = await db.insert(billetterieTestCases).values({
      planId,
      projectId:      id,
      title:          body.title,
      description:    body.description ?? null,
      steps:          body.steps,
      expectedResult: body.expectedResult ?? null,
      priority:       body.priority as any,
      position:       body.position ?? maxPos,
      createdBy:      user.id,
    }).returning();

    return reply.status(201).send({ data: tc });
  });

  app.put('/projects/:id/test-plans/:planId/cases/:caseId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, planId, caseId } = request.params as { id: string; planId: string; caseId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = caseSchema.partial().extend({
      linkedIssueId: z.string().uuid().optional().nullable(),
    }).parse(request.body);

    const updateData: any = { updatedAt: new Date() };
    const fields = ['title', 'description', 'steps', 'expectedResult', 'priority', 'position', 'linkedIssueId'] as const;
    for (const f of fields) if ((body as any)[f] !== undefined) updateData[f] = (body as any)[f];

    const [updated] = await db.update(billetterieTestCases).set(updateData)
      .where(and(eq(billetterieTestCases.id, caseId), eq(billetterieTestCases.planId, planId)))
      .returning();

    if (!updated) return reply.notFound('Test case not found');
    return { data: updated };
  });

  app.delete('/projects/:id/test-plans/:planId/cases/:caseId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, planId, caseId } = request.params as { id: string; planId: string; caseId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieTestCases)
      .where(and(eq(billetterieTestCases.id, caseId), eq(billetterieTestCases.planId, planId)));
    return { success: true };
  });

  // ── Test Execution ────────────────────────────────────────────────────────────

  app.post('/projects/:id/test-plans/:planId/cases/:caseId/execute', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, planId, caseId } = request.params as { id: string; planId: string; caseId: string };
    const user = request.session!.user as any;

    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      result:        z.enum(TEST_RESULTS),
      notes:         z.string().optional().nullable(),
      linkedIssueId: z.string().uuid().optional().nullable(),
    }).parse(request.body);

    const tc = await db.select({ id: billetterieTestCases.id }).from(billetterieTestCases)
      .where(and(eq(billetterieTestCases.id, caseId), eq(billetterieTestCases.planId, planId)))
      .limit(1).then((r: any[]) => r[0]);
    if (!tc) return reply.notFound('Test case not found');

    const [execution] = await db.insert(billetterieTestExecutions).values({
      testCaseId:    caseId,
      planId,
      result:        body.result as any,
      notes:         body.notes ?? null,
      linkedIssueId: body.linkedIssueId ?? null,
      executedBy:    user.id,
    }).returning();

    // Update denormalized latest_result on the test case
    const updateData: any = { latestResult: body.result as any, updatedAt: new Date() };
    if (body.linkedIssueId) updateData.linkedIssueId = body.linkedIssueId;
    await db.update(billetterieTestCases).set(updateData).where(eq(billetterieTestCases.id, caseId));

    // Auto-complete plan if pass threshold met
    const allCases = await db
      .select({ result: billetterieTestCases.latestResult })
      .from(billetterieTestCases)
      .where(eq(billetterieTestCases.planId, planId));

    const plan = await db.select({ passThreshold: billetterieTestPlans.passThreshold, status: billetterieTestPlans.status })
      .from(billetterieTestPlans).where(eq(billetterieTestPlans.id, planId)).limit(1).then((r: any[]) => r[0]);

    if (plan && plan.status === 'ACTIVE') {
      const total = allCases.length;
      const pass  = allCases.filter((c: any) => c.result === 'PASS').length;
      const pct   = total > 0 ? Math.round((pass / total) * 100) : 0;
      const allExecuted = allCases.every((c: any) => c.result !== 'NOT_RUN');

      if (allExecuted && pct >= plan.passThreshold) {
        await db.update(billetterieTestPlans).set({ status: 'COMPLETED' as any, updatedAt: new Date() })
          .where(eq(billetterieTestPlans.id, planId));
      }
    }

    return reply.status(201).send({ data: execution });
  });

  // ── Execution history for a test case ────────────────────────────────────────
  app.get('/projects/:id/test-plans/:planId/cases/:caseId/history', { preHandler: requireAuth }, async (request: any) => {
    const { caseId } = request.params as { id: string; planId: string; caseId: string };

    const executions = await db.select().from(billetterieTestExecutions)
      .where(eq(billetterieTestExecutions.testCaseId, caseId))
      .orderBy(desc(billetterieTestExecutions.executedAt))
      .limit(20);

    return { data: executions };
  });

  // ── Plan summary (used by Overview stats) ────────────────────────────────────
  app.get('/projects/:id/testing-summary', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };

    const plans = await db.select({ id: billetterieTestPlans.id, status: billetterieTestPlans.status })
      .from(billetterieTestPlans).where(eq(billetterieTestPlans.projectId, id));

    const cases = await db.select({ result: billetterieTestCases.latestResult })
      .from(billetterieTestCases).where(eq(billetterieTestCases.projectId, id));

    const total   = cases.length;
    const pass    = cases.filter((c: any) => c.result === 'PASS').length;
    const fail    = cases.filter((c: any) => c.result === 'FAIL').length;
    const notRun  = cases.filter((c: any) => c.result === 'NOT_RUN').length;
    const passPct = total > 0 ? Math.round((pass / total) * 100) : 0;

    return {
      data: {
        plans: plans.length,
        activePlans: plans.filter((p: any) => p.status === 'ACTIVE').length,
        total, pass, fail, notRun, passPct,
      },
    };
  });
}
