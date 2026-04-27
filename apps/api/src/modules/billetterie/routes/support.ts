import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, or, ilike, sql, inArray } from 'drizzle-orm';
import {
  billetterieSupportTickets,
  billetterieTicketComments,
  billetterieSLAPolicies,
  staffMembers,
  billetterieIssues,
} from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole, assertBilTeamMember, isBilSysAdmin } from '../helpers.js';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const CATEGORIES = ['BUG', 'FEATURE_REQUEST', 'QUESTION', 'CHANGE_REQUEST', 'INCIDENT', 'OTHER'] as const;
const STATUSES   = ['OPEN', 'IN_PROGRESS', 'PENDING_CLIENT', 'RESOLVED', 'CLOSED'] as const;

const createTicketSchema = z.object({
  title:         z.string().min(1).max(500),
  description:   z.string().min(1),
  category:      z.enum(CATEGORIES).default('OTHER'),
  priority:      z.enum(PRIORITIES).default('MEDIUM'),
  assignedToStaff: z.string().uuid().optional().nullable(),
  linkedIssueId: z.string().uuid().optional().nullable(),
  tags:          z.array(z.string()).optional().default([]),
});

// Add business hours offset to a date (Mon–Fri 08:00–17:00 SAST)
function addBusinessHours(from: Date, hours: number): Date {
  let remaining = hours;
  const dt = new Date(from);
  while (remaining > 0) {
    dt.setHours(dt.getHours() + 1);
    const day = dt.getDay();
    const h = dt.getHours();
    if (day > 0 && day < 6 && h >= 8 && h < 17) remaining--;
  }
  return dt;
}

async function getSLAPolicy(db: any, projectId: string, priority: string) {
  // Project-specific policy first, fallback to global
  const [projectPolicy] = await db
    .select()
    .from(billetterieSLAPolicies)
    .where(and(eq(billetterieSLAPolicies.projectId, projectId), eq(billetterieSLAPolicies.priority, priority as any)))
    .limit(1);

  if (projectPolicy) return projectPolicy;

  const [globalPolicy] = await db
    .select()
    .from(billetterieSLAPolicies)
    .where(and(sql`project_id IS NULL`, eq(billetterieSLAPolicies.priority, priority as any)))
    .limit(1);

  return globalPolicy ?? { responseHours: 8, resolutionHours: 48, isBusinessHours: true };
}

async function nextTicketNumber(db: any, projectId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next
    FROM billetterie_support_tickets
    WHERE project_id = ${projectId}
  `);
  const rows = Array.isArray(result) ? result : result.rows ?? [];
  return Number(rows[0]?.next ?? 1);
}

export async function supportRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── List tickets ─────────────────────────────────────────────────────────────
  app.get('/projects/:id/tickets', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const q = request.query as any;
    const statusFilter   = (q.status ?? '').trim();
    const priorityFilter = (q.priority ?? '').trim();
    const search         = (q.search ?? '').trim();
    const page   = Math.max(1, Number(q.page ?? 1));
    const limit  = Math.min(50, Number(q.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: any[] = [eq(billetterieSupportTickets.projectId, id)];
    if (statusFilter)   conditions.push(eq(billetterieSupportTickets.status, statusFilter as any));
    if (priorityFilter) conditions.push(eq(billetterieSupportTickets.priority, priorityFilter as any));
    if (search) conditions.push(ilike(billetterieSupportTickets.title, `%${search}%`));

    const now = new Date();

    const [tickets, countResult] = await Promise.all([
      db.select({
        ticket:   billetterieSupportTickets,
        assignee: { id: staffMembers.id, name: staffMembers.name },
      })
        .from(billetterieSupportTickets)
        .leftJoin(staffMembers, eq(billetterieSupportTickets.assignedToStaff, staffMembers.id))
        .where(and(...conditions))
        .orderBy(desc(billetterieSupportTickets.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(billetterieSupportTickets).where(and(...conditions)),
    ]);

    const data = tickets.map((r: any) => ({
      ...r.ticket,
      assignee: r.assignee?.id ? r.assignee : null,
      slaOverdue: r.ticket.slaResolutionDue ? new Date(r.ticket.slaResolutionDue) < now : false,
      slaResponseOverdue: r.ticket.slaResponseDue && !r.ticket.firstRespondedAt ? new Date(r.ticket.slaResponseDue) < now : false,
    }));

    return {
      data,
      pagination: { page, limit, total: Number(countResult[0]?.count ?? 0), totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit) },
    };
  });

  // ── Get ticket detail ─────────────────────────────────────────────────────────
  app.get('/projects/:id/tickets/:ticketId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, ticketId } = request.params as { id: string; ticketId: string };

    const [ticket] = await db.select().from(billetterieSupportTickets)
      .where(and(eq(billetterieSupportTickets.id, ticketId), eq(billetterieSupportTickets.projectId, id)));
    if (!ticket) return reply.notFound('Ticket not found');

    const [comments, assignee] = await Promise.all([
      db.select().from(billetterieTicketComments)
        .where(eq(billetterieTicketComments.ticketId, ticketId))
        .orderBy(billetterieTicketComments.createdAt),
      ticket.assignedToStaff
        ? db.select({ id: staffMembers.id, name: staffMembers.name, role: staffMembers.role })
            .from(staffMembers).where(eq(staffMembers.id, ticket.assignedToStaff)).limit(1).then((r: any[]) => r[0] ?? null)
        : Promise.resolve(null),
    ]);

    const now = new Date();
    return {
      data: {
        ...ticket,
        assignee,
        comments,
        slaOverdue: ticket.slaResolutionDue ? new Date(ticket.slaResolutionDue as any) < now : false,
        slaResponseOverdue: ticket.slaResponseDue && !ticket.firstRespondedAt ? new Date(ticket.slaResponseDue as any) < now : false,
      },
    };
  });

  // ── Create ticket — any team member ─────────────────────────────────────────
  app.post('/projects/:id/tickets', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;

    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = createTicketSchema.parse(request.body);
    const policy = await getSLAPolicy(db, id, body.priority);
    const now = new Date();

    const addFn = policy.isBusinessHours ? addBusinessHours : (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
    const slaResponseDue   = addFn(now, policy.responseHours);
    const slaResolutionDue = addFn(now, policy.resolutionHours);
    const ticketNumber     = await nextTicketNumber(db, id);

    const [ticket] = await db.insert(billetterieSupportTickets).values({
      projectId:        id,
      ticketNumber,
      title:            body.title,
      description:      body.description,
      category:         body.category as any,
      priority:         body.priority as any,
      status:           'OPEN' as any,
      slaResponseDue,
      slaResolutionDue,
      reportedBy:       user.id,
      assignedToStaff:  body.assignedToStaff ?? null,
      linkedIssueId:    body.linkedIssueId ?? null,
      tags:             body.tags ?? [],
    }).returning();

    return reply.status(201).send({ data: ticket });
  });

  // ── Update ticket — PM, BA, or ticket assignee ────────────────────────────
  app.put('/projects/:id/tickets/:ticketId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, ticketId } = request.params as { id: string; ticketId: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA', 'ADMIN']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      title:           z.string().min(1).max(500).optional(),
      description:     z.string().optional(),
      category:        z.enum(CATEGORIES).optional(),
      priority:        z.enum(PRIORITIES).optional(),
      status:          z.enum(STATUSES).optional(),
      assignedToStaff: z.string().uuid().optional().nullable(),
      linkedIssueId:   z.string().uuid().optional().nullable(),
      tags:            z.array(z.string()).optional(),
      resolutionNotes: z.string().optional().nullable(),
    }).parse(request.body);

    const existing = await db.select().from(billetterieSupportTickets)
      .where(and(eq(billetterieSupportTickets.id, ticketId), eq(billetterieSupportTickets.projectId, id)))
      .limit(1).then((r: any[]) => r[0]);
    if (!existing) return reply.notFound('Ticket not found');

    const updateData: any = { updatedAt: new Date() };
    if (body.title           !== undefined) updateData.title           = body.title;
    if (body.description     !== undefined) updateData.description     = body.description;
    if (body.category        !== undefined) updateData.category        = body.category;
    if (body.assignedToStaff !== undefined) updateData.assignedToStaff = body.assignedToStaff;
    if (body.linkedIssueId   !== undefined) updateData.linkedIssueId   = body.linkedIssueId;
    if (body.tags            !== undefined) updateData.tags            = body.tags;
    if (body.resolutionNotes !== undefined) updateData.resolutionNotes = body.resolutionNotes;

    if (body.priority && body.priority !== existing.priority) {
      // Recalculate SLA on priority change
      const policy = await getSLAPolicy(db, id, body.priority);
      const addFn = policy.isBusinessHours ? addBusinessHours : (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
      updateData.priority         = body.priority;
      updateData.slaResponseDue   = addFn(new Date(existing.createdAt as any), policy.responseHours);
      updateData.slaResolutionDue = addFn(new Date(existing.createdAt as any), policy.resolutionHours);
    }

    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === 'RESOLVED' && !existing.resolvedAt) updateData.resolvedAt = new Date();
      if (body.status === 'CLOSED')   { updateData.closedAt = new Date(); updateData.closedBy = user.id; }
    }

    // Check SLA breach
    if (updateData.status !== 'RESOLVED' && updateData.status !== 'CLOSED') {
      const resDue = existing.slaResolutionDue ? new Date(existing.slaResolutionDue as any) : null;
      if (resDue && resDue < new Date()) updateData.slaBreached = true;
    }

    const [updated] = await db.update(billetterieSupportTickets).set(updateData)
      .where(eq(billetterieSupportTickets.id, ticketId)).returning();

    return { data: updated };
  });

  // ── Delete ticket — PM only ───────────────────────────────────────────────
  app.delete('/projects/:id/tickets/:ticketId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, ticketId } = request.params as { id: string; ticketId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieSupportTickets)
      .where(and(eq(billetterieSupportTickets.id, ticketId), eq(billetterieSupportTickets.projectId, id)));
    return { success: true };
  });

  // ── Comments ─────────────────────────────────────────────────────────────────
  app.post('/projects/:id/tickets/:ticketId/comments', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, ticketId } = request.params as { id: string; ticketId: string };
    const user = request.session!.user as any;

    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      body:       z.string().min(1),
      isInternal: z.boolean().default(false),
    }).parse(request.body);

    const ticket = await db.select({ id: billetterieSupportTickets.id, firstRespondedAt: billetterieSupportTickets.firstRespondedAt })
      .from(billetterieSupportTickets)
      .where(and(eq(billetterieSupportTickets.id, ticketId), eq(billetterieSupportTickets.projectId, id)))
      .limit(1).then((r: any[]) => r[0]);

    if (!ticket) return reply.notFound('Ticket not found');

    const [comment] = await db.insert(billetterieTicketComments).values({
      ticketId,
      authorId: user.id,
      body:     body.body,
      isInternal: body.isInternal,
    }).returning();

    // Record first response time (non-reporter first comment)
    if (!ticket.firstRespondedAt) {
      await db.update(billetterieSupportTickets).set({
        firstRespondedAt: new Date(),
        status: 'IN_PROGRESS' as any,
        updatedAt: new Date(),
      }).where(eq(billetterieSupportTickets.id, ticketId));
    }

    return reply.status(201).send({ data: comment });
  });

  app.put('/projects/:id/tickets/:ticketId/comments/:commentId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { commentId } = request.params as { id: string; ticketId: string; commentId: string };
    const user = request.session!.user as any;

    const comment = await db.select().from(billetterieTicketComments).where(eq(billetterieTicketComments.id, commentId)).limit(1).then((r: any[]) => r[0]);
    if (!comment) return reply.notFound('Comment not found');
    if (comment.authorId !== user.id && !isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'You can only edit your own comments' });
    }

    const body = z.object({ body: z.string().min(1) }).parse(request.body);
    const [updated] = await db.update(billetterieTicketComments).set({
      body: body.body, isEdited: true, updatedAt: new Date(),
    }).where(eq(billetterieTicketComments.id, commentId)).returning();

    return { data: updated };
  });

  app.delete('/projects/:id/tickets/:ticketId/comments/:commentId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { commentId } = request.params as { id: string; ticketId: string; commentId: string };
    const user = request.session!.user as any;

    const comment = await db.select().from(billetterieTicketComments).where(eq(billetterieTicketComments.id, commentId)).limit(1).then((r: any[]) => r[0]);
    if (!comment) return reply.notFound('Comment not found');
    if (comment.authorId !== user.id && !isBilSysAdmin(user)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'You can only delete your own comments' });
    }

    await db.delete(billetterieTicketComments).where(eq(billetterieTicketComments.id, commentId));
    return { success: true };
  });

  // ── SLA Policies ─────────────────────────────────────────────────────────────
  app.get('/projects/:id/sla-policies', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };

    const [projectPolicies, globalPolicies] = await Promise.all([
      db.select().from(billetterieSLAPolicies).where(eq(billetterieSLAPolicies.projectId, id)),
      db.select().from(billetterieSLAPolicies).where(sql`project_id IS NULL`),
    ]);

    // Merge: project overrides global
    const merged = globalPolicies.map((gp: any) => {
      const override = projectPolicies.find((pp: any) => pp.priority === gp.priority);
      return override ? { ...gp, ...override, isOverride: true } : { ...gp, isOverride: false };
    });

    return { data: merged };
  });

  app.put('/projects/:id/sla-policies/:priority', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, priority } = request.params as { id: string; priority: string };
    const user = request.session!.user as any;

    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      responseHours:   z.number().int().positive(),
      resolutionHours: z.number().int().positive(),
      isBusinessHours: z.boolean().optional(),
    }).parse(request.body);

    // Delete existing project-specific policy and re-insert (avoids partial index ON CONFLICT complexity)
    await db.execute(sql`
      DELETE FROM billetterie_sla_policies
      WHERE project_id = ${id} AND priority = ${priority}::bil_ticket_priority
    `);
    await db.execute(sql`
      INSERT INTO billetterie_sla_policies (project_id, priority, response_hours, resolution_hours, is_business_hours, created_by)
      VALUES (${id}, ${priority}::bil_ticket_priority, ${body.responseHours}, ${body.resolutionHours}, ${body.isBusinessHours ?? true}, ${user.id})
    `);

    return { success: true };
  });

  // ── SLA dashboard — tickets breaching or at risk ──────────────────────────
  app.get('/projects/:id/sla-dashboard', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const now = new Date();

    const openTickets = await db.select({
      ticket: billetterieSupportTickets,
      assignee: { id: staffMembers.id, name: staffMembers.name },
    })
      .from(billetterieSupportTickets)
      .leftJoin(staffMembers, eq(billetterieSupportTickets.assignedToStaff, staffMembers.id))
      .where(and(
        eq(billetterieSupportTickets.projectId, id),
        sql`status NOT IN ('RESOLVED', 'CLOSED')`,
      ))
      .orderBy(billetterieSupportTickets.slaResolutionDue);

    const data = openTickets.map((r: any) => {
      const resDue   = r.ticket.slaResolutionDue ? new Date(r.ticket.slaResolutionDue) : null;
      const respDue  = r.ticket.slaResponseDue   ? new Date(r.ticket.slaResponseDue)  : null;
      const msLeft   = resDue ? resDue.getTime() - now.getTime() : null;
      const hoursLeft = msLeft !== null ? msLeft / 3_600_000 : null;

      return {
        ...r.ticket,
        assignee: r.assignee?.id ? r.assignee : null,
        hoursUntilBreach: hoursLeft,
        breached: r.ticket.slaBreached || (resDue ? resDue < now : false),
        atRisk:   hoursLeft !== null && hoursLeft > 0 && hoursLeft < 4,
        responseBreached: respDue && !r.ticket.firstRespondedAt ? respDue < now : false,
      };
    });

    const breached = data.filter(t => t.breached).length;
    const atRisk   = data.filter(t => t.atRisk).length;
    const healthy  = data.filter(t => !t.breached && !t.atRisk).length;

    return { data, summary: { breached, atRisk, healthy, total: data.length } };
  });
}
