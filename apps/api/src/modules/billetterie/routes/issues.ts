import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, ilike, or, sql, inArray } from 'drizzle-orm';
import { billetterieIssues, billetterieIssueComments, billetterieProjects, staffMembers, billetterieMilestones, billetterieTasks, user as userTable } from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { isBilSysAdmin, assertBilProjectRole, assertBilTeamMember } from '../helpers.js';

const createIssueSchema = z.object({
  title:            z.string().min(1).max(500),
  body:             z.string().optional().nullable(),
  type:             z.enum(['BUG', 'FEATURE', 'IMPROVEMENT', 'QUESTION', 'TASK']).default('BUG'),
  severity:         z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().nullable(),
  milestoneId:      z.string().uuid().optional().nullable(),
  assignees:        z.array(z.string().uuid()).optional().default([]),
  labels:           z.array(z.string()).optional().default([]),
  stepsToReproduce: z.string().optional().nullable(),
  linkedTaskId:     z.string().uuid().optional().nullable(),
});

export async function issueRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── List issues ──────────────────────────────────────────────────────────────
  app.get('/projects/:id/issues', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const q = request.query as any;
    const page   = Math.max(1, Number(q.page ?? 1));
    const limit  = Math.min(100, Number(q.limit ?? 30));
    const offset = (page - 1) * limit;
    const tab      = (q.tab ?? 'open').trim();  // open | closed
    const typeFilter   = (q.type ?? '').trim();
    const searchTerm   = (q.search ?? '').trim();
    const assigneeFilter = (q.assignee ?? '').trim();

    const openStatuses  = ['OPEN', 'IN_PROGRESS'];
    const closedStatuses = ['RESOLVED', 'CLOSED', 'WONT_FIX'];
    const statusSet = tab === 'closed' ? closedStatuses : openStatuses;

    const conditions: any[] = [
      eq(billetterieIssues.projectId, id),
      inArray(billetterieIssues.status, statusSet as any),
    ];
    if (typeFilter) conditions.push(eq(billetterieIssues.type, typeFilter as any));
    if (searchTerm) conditions.push(or(ilike(billetterieIssues.title, `%${searchTerm}%`), ilike(billetterieIssues.body, `%${searchTerm}%`)));
    if (assigneeFilter) conditions.push(sql`${billetterieIssues.assignees} @> ${JSON.stringify([assigneeFilter])}::jsonb`);

    const where = and(...conditions);

    const [issues, countResult, openCount, closedCount] = await Promise.all([
      db.select({
        issue:     billetterieIssues,
        milestone: { id: billetterieMilestones.id, title: billetterieMilestones.title },
        task:      { id: billetterieTasks.id, title: billetterieTasks.title },
      })
        .from(billetterieIssues)
        .leftJoin(billetterieMilestones, eq(billetterieIssues.milestoneId, billetterieMilestones.id))
        .leftJoin(billetterieTasks, eq(billetterieIssues.linkedTaskId, billetterieTasks.id))
        .where(where)
        .orderBy(desc(billetterieIssues.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(billetterieIssues).where(where),
      db.select({ count: sql<number>`COUNT(*)` }).from(billetterieIssues)
        .where(and(eq(billetterieIssues.projectId, id), inArray(billetterieIssues.status, openStatuses as any))),
      db.select({ count: sql<number>`COUNT(*)` }).from(billetterieIssues)
        .where(and(eq(billetterieIssues.projectId, id), inArray(billetterieIssues.status, closedStatuses as any))),
    ]);

    return {
      data: issues.map((r) => ({
        ...r.issue,
        milestone: r.milestone?.id ? r.milestone : null,
        linkedTask: r.task?.id ? r.task : null,
      })),
      meta: {
        openCount:   Number(openCount[0]?.count ?? 0),
        closedCount: Number(closedCount[0]?.count ?? 0),
      },
      pagination: {
        page, limit,
        total: Number(countResult[0]?.count ?? 0),
        totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit),
      },
    };
  });

  // ── Get issue detail ─────────────────────────────────────────────────────────
  app.get('/projects/:id/issues/:issueId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, issueId } = request.params as { id: string; issueId: string };

    const [issueRow] = await db
      .select({
        issue:         billetterieIssues,
        projectName:   billetterieProjects.name,
        projectNumber: billetterieProjects.number,
        reporterName:  userTable.name,
        reporterEmail: userTable.email,
        milestone:     { id: billetterieMilestones.id, title: billetterieMilestones.title },
        linkedTask:    { id: billetterieTasks.id, title: billetterieTasks.title },
      })
      .from(billetterieIssues)
      .leftJoin(billetterieProjects, eq(billetterieIssues.projectId, billetterieProjects.id))
      .leftJoin(userTable, eq(billetterieIssues.reportedBy, userTable.id))
      .leftJoin(billetterieMilestones, eq(billetterieIssues.milestoneId, billetterieMilestones.id))
      .leftJoin(billetterieTasks, eq(billetterieIssues.linkedTaskId, billetterieTasks.id))
      .where(and(eq(billetterieIssues.id, issueId), eq(billetterieIssues.projectId, id)))
      .limit(1);

    if (!issueRow) return reply.notFound('Issue not found');

    // Fetch comments with author names
    const commentsRaw = await db
      .select({
        id:          billetterieIssueComments.id,
        issueId:     billetterieIssueComments.issueId,
        authorId:    billetterieIssueComments.authorId,
        authorName:  userTable.name,
        authorEmail: userTable.email,
        body:        billetterieIssueComments.body,
        isEdited:    billetterieIssueComments.isEdited,
        createdAt:   billetterieIssueComments.createdAt,
        updatedAt:   billetterieIssueComments.updatedAt,
      })
      .from(billetterieIssueComments)
      .leftJoin(userTable, eq(billetterieIssueComments.authorId, userTable.id))
      .where(eq(billetterieIssueComments.issueId, issueId))
      .orderBy(billetterieIssueComments.createdAt);

    // Fetch assignee names from staffMembers
    const assigneeIds: string[] = (issueRow.issue.assignees as string[]) ?? [];
    let assigneeNames: { id: string; name: string }[] = [];
    if (assigneeIds.length > 0) {
      assigneeNames = await db
        .select({ id: staffMembers.id, name: staffMembers.name })
        .from(staffMembers)
        .where(inArray(staffMembers.id, assigneeIds));
    }

    return {
      data: {
        ...issueRow.issue,
        projectName:   issueRow.projectName,
        projectNumber: issueRow.projectNumber,
        reporterName:  issueRow.reporterName,
        reporterEmail: issueRow.reporterEmail,
        milestone:     issueRow.milestone?.id ? issueRow.milestone : null,
        linkedTask:    issueRow.linkedTask?.id ? issueRow.linkedTask : null,
        assigneeNames,
        comments:      commentsRaw,
      },
    };
  });

  // ── Create issue — any team member ──────────────────────────────────────────
  app.post('/projects/:id/issues', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user   = request.session!.user as any;
    const userId = user.id;
    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });
    const body = createIssueSchema.parse(request.body);

    // Auto-increment issue_number per project
    const countResult = await db.select({ count: sql<number>`COUNT(*)` }).from(billetterieIssues).where(eq(billetterieIssues.projectId, id));
    const issueNumber = Number(countResult[0]?.count ?? 0) + 1;

    const [issue] = await db.insert(billetterieIssues).values({
      projectId:        id,
      issueNumber,
      title:            body.title,
      body:             body.body ?? null,
      type:             body.type as any,
      severity:         body.severity as any ?? null,
      milestoneId:      body.milestoneId ?? null,
      assignees:        body.assignees ?? [],
      labels:           body.labels ?? [],
      stepsToReproduce: body.stepsToReproduce ?? null,
      linkedTaskId:     body.linkedTaskId ?? null,
      reportedBy:       userId,
    }).returning();

    return reply.status(201).send({ data: issue });
  });

  // ── Update issue — any team member ──────────────────────────────────────────
  app.put('/projects/:id/issues/:issueId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, issueId } = request.params as { id: string; issueId: string };
    const user   = request.session!.user as any;
    const userId = user.id;
    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = createIssueSchema.partial().extend({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX']).optional(),
    }).parse(request.body);

    const updateData: any = { updatedAt: new Date() };
    if (body.title            !== undefined) updateData.title            = body.title;
    if (body.body             !== undefined) updateData.body             = body.body;
    if (body.type             !== undefined) updateData.type             = body.type;
    if (body.severity         !== undefined) updateData.severity         = body.severity;
    if (body.milestoneId      !== undefined) updateData.milestoneId      = body.milestoneId;
    if (body.assignees        !== undefined) updateData.assignees        = body.assignees;
    if (body.labels           !== undefined) updateData.labels           = body.labels;
    if (body.stepsToReproduce !== undefined) updateData.stepsToReproduce = body.stepsToReproduce;
    if (body.linkedTaskId     !== undefined) updateData.linkedTaskId     = body.linkedTaskId;
    if (body.status           !== undefined) {
      updateData.status = body.status;
      if (['RESOLVED', 'CLOSED', 'WONT_FIX'].includes(body.status)) {
        updateData.closedAt = new Date();
        updateData.closedBy = userId;
      } else {
        updateData.closedAt = null;
        updateData.closedBy = null;
      }
    }

    const [updated] = await db.update(billetterieIssues).set(updateData).where(eq(billetterieIssues.id, issueId)).returning();
    if (!updated) return reply.notFound('Issue not found');
    return { data: updated };
  });

  // ── Delete issue — PM only ───────────────────────────────────────────────────
  app.delete('/projects/:id/issues/:issueId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, issueId } = request.params as { id: string; issueId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieIssues).where(eq(billetterieIssues.id, issueId));
    return { success: true };
  });

  // ── Post comment — any team member ──────────────────────────────────────────
  app.post('/projects/:id/issues/:issueId/comments', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, issueId } = request.params as { id: string; issueId: string };
    const user   = request.session!.user as any;
    const userId = user.id;
    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });
    const { body: commentBody } = z.object({ body: z.string().min(1) }).parse(request.body);

    const issue = await db.select({ id: billetterieIssues.id }).from(billetterieIssues).where(eq(billetterieIssues.id, issueId)).limit(1).then((r: any[]) => r[0]);
    if (!issue) return reply.notFound('Issue not found');

    const [comment] = await db.insert(billetterieIssueComments).values({
      issueId, authorId: userId, body: commentBody,
    }).returning();

    return reply.status(201).send({ data: comment });
  });

  // ── Edit comment — own comment or BIL_ADMIN ──────────────────────────────────
  app.put('/projects/:id/issues/:issueId/comments/:commentId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { commentId } = request.params as any;
    const user   = request.session!.user as any;
    const userId = user.id;
    const { body: commentBody } = z.object({ body: z.string().min(1) }).parse(request.body);

    const comment = await db.select().from(billetterieIssueComments).where(eq(billetterieIssueComments.id, commentId)).limit(1).then((r: any[]) => r[0]);
    if (!comment) return reply.notFound('Comment not found');

    if (comment.authorId !== userId && !isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'You can only edit your own comments' });
    }

    const [updated] = await db.update(billetterieIssueComments)
      .set({ body: commentBody, isEdited: true, updatedAt: new Date() })
      .where(eq(billetterieIssueComments.id, commentId))
      .returning();

    return { data: updated };
  });

  // ── Delete comment — own comment or BIL_ADMIN ────────────────────────────────
  app.delete('/projects/:id/issues/:issueId/comments/:commentId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { commentId } = request.params as any;
    const user   = request.session!.user as any;
    const userId = user.id;

    const comment = await db.select().from(billetterieIssueComments).where(eq(billetterieIssueComments.id, commentId)).limit(1).then((r: any[]) => r[0]);
    if (!comment) return reply.notFound('Comment not found');

    if (comment.authorId !== userId && !isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'You can only delete your own comments' });
    }

    await db.delete(billetterieIssueComments).where(eq(billetterieIssueComments.id, commentId));
    return { success: true };
  });
}
