import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  billetterieClientTokens, billetterieProjects, billetterieProjectPhases,
  billetterieTasks, billetterieIssues, billetterieMilestones, billetterieMeetings,
} from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { getProjectRole } from '../helpers.js';

const inviteSchema = z.object({
  clientEmail:      z.string().email(),
  clientName:       z.string().min(1),
  expiresInDays:    z.number().int().positive().max(365).default(30),
  permissions:      z.object({
    viewPhases:           z.boolean().default(true),
    viewTasks:            z.boolean().default(false),
    viewIssues:           z.boolean().default(false),
    viewTimeline:         z.boolean().default(false),
    viewMeetings:         z.boolean().default(false),
    approveDeliverables:  z.boolean().default(false),
  }).default({}),
});

export async function clientPortalRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── Generate client invite token ─────────────────────────────────────────────
  app.post('/projects/:id/client-invite', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.session.user.id;
    const sysRole: string = (request.session as any).user?.role ?? '';
    const projectRole = await getProjectRole(db, id, userId);
    const canInvite = ['admin', 'projectmanager'].includes(sysRole.toLowerCase()) || projectRole === 'PM';
    if (!canInvite) return reply.forbidden('Only PM can generate client invite links');

    const body = inviteSchema.parse(request.body);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);

    const [record] = await db.insert(billetterieClientTokens).values({
      projectId:   id,
      token,
      clientEmail: body.clientEmail,
      clientName:  body.clientName,
      permissions: body.permissions as any,
      expiresAt,
      isActive:    true,
      createdBy:   userId,
    }).returning();

    return reply.status(201).send({
      data: record,
      portalUrl: `/billetterie/client/${token}`,
    });
  });

  // ── List client tokens for a project ─────────────────────────────────────────
  app.get('/projects/:id/client-tokens', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.session.user.id;
    const sysRole: string = (request.session as any).user?.role ?? '';
    const projectRole = await getProjectRole(db, id, userId);
    const canView = ['admin', 'projectmanager'].includes(sysRole.toLowerCase()) || projectRole === 'PM';
    if (!canView) return reply.forbidden('Only PM can view client tokens');

    const tokens = await db.select().from(billetterieClientTokens).where(eq(billetterieClientTokens.projectId, id)).orderBy(billetterieClientTokens.createdAt);
    return { data: tokens };
  });

  // ── Deactivate a client token ─────────────────────────────────────────────────
  app.delete('/projects/:id/client-tokens/:tokenId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, tokenId } = request.params as { id: string; tokenId: string };
    const userId = request.session.user.id;
    const sysRole: string = (request.session as any).user?.role ?? '';
    const projectRole = await getProjectRole(db, id, userId);
    const canRevoke = ['admin', 'projectmanager'].includes(sysRole.toLowerCase()) || projectRole === 'PM';
    if (!canRevoke) return reply.forbidden('Only PM can revoke client tokens');

    const [updated] = await db.update(billetterieClientTokens).set({ isActive: false })
      .where(and(eq(billetterieClientTokens.id, tokenId), eq(billetterieClientTokens.projectId, id)))
      .returning();

    if (!updated) return reply.notFound('Token not found');
    return { data: updated };
  });

  // ── Public client portal view (no auth — token is the credential) ─────────────
  app.get('/client-portal/:token', async (request: any, reply) => {
    const { token } = request.params as { token: string };

    const record = await db.select().from(billetterieClientTokens).where(eq(billetterieClientTokens.token, token)).limit(1).then((r: any[]) => r[0]);

    if (!record || !record.isActive || new Date(record.expiresAt) < new Date()) {
      return reply.status(401).send({ error: 'This link has expired or is no longer active.' });
    }

    // Update last accessed
    await db.update(billetterieClientTokens).set({ lastAccessedAt: new Date() }).where(eq(billetterieClientTokens.id, record.id));

    const perm = record.permissions as any;
    const pid  = record.projectId;

    const project = await db.select({
      id: billetterieProjects.id, number: billetterieProjects.number, name: billetterieProjects.name,
      client: billetterieProjects.client, status: billetterieProjects.status,
      currentPhase: billetterieProjects.currentPhase,
      startDate: billetterieProjects.startDate, targetEndDate: billetterieProjects.targetEndDate,
    }).from(billetterieProjects).where(eq(billetterieProjects.id, pid)).limit(1).then((r: any[]) => r[0]);

    if (!project) return reply.notFound('Project not found');

    const result: any = { project, clientName: record.clientName };

    if (perm.viewPhases) {
      result.phases = await db.select().from(billetterieProjectPhases).where(eq(billetterieProjectPhases.projectId, pid));
    }

    if (perm.viewTasks) {
      result.tasks = await db.select({
        id: billetterieTasks.id, title: billetterieTasks.title, status: billetterieTasks.status,
        priority: billetterieTasks.priority, phaseKey: billetterieTasks.phaseKey,
        dueDate: billetterieTasks.dueDate, startDate: billetterieTasks.startDate,
      }).from(billetterieTasks).where(eq(billetterieTasks.projectId, pid));
    }

    if (perm.viewIssues) {
      result.issues = await db.select({
        id: billetterieIssues.id, issueNumber: billetterieIssues.issueNumber,
        title: billetterieIssues.title, type: billetterieIssues.type,
        severity: billetterieIssues.severity, status: billetterieIssues.status,
      }).from(billetterieIssues).where(eq(billetterieIssues.projectId, pid));
    }

    if (perm.viewTimeline) {
      result.milestones = await db.select().from(billetterieMilestones).where(eq(billetterieMilestones.projectId, pid));
    }

    if (perm.viewMeetings) {
      result.meetings = await db.select({
        id: billetterieMeetings.id, title: billetterieMeetings.title,
        meetingDate: billetterieMeetings.meetingDate, attendees: billetterieMeetings.attendees,
        agenda: billetterieMeetings.agenda,
        // excludes minutes and actionItems (internal)
      }).from(billetterieMeetings).where(eq(billetterieMeetings.projectId, pid));
    }

    return { data: result };
  });
}
