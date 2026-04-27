import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  billetterieTasks, billetterieTimeLogs, staffMembers, billetterieMilestones,
  billetterieIssues, billetterieProjects, billetterieSupportTickets,
} from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import {
  getProjectRole, getStaffMemberId,
  isBilSysAdmin, assertBilProjectRole, assertBilTeamMember,
} from '../helpers.js';
import { PHASE_ORDER } from './projects.js';

const createTaskSchema = z.object({
  phaseKey:       z.enum(PHASE_ORDER).default('DEVELOPMENT'),
  milestoneId:    z.string().uuid().optional().nullable(),
  sprintId:       z.string().uuid().optional().nullable(),
  parentTaskId:   z.string().uuid().optional().nullable(),
  title:          z.string().min(1),
  description:    z.string().optional().nullable(),
  priority:       z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  assignedTo:     z.string().uuid().optional().nullable(),
  estimatedHours: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().positive().nullable().optional()),
  startDate:      z.string().optional().nullable(),
  dueDate:        z.string().optional().nullable(),
  labels:         z.array(z.string()).optional().default([]),
  storyPoints:    z.number().int().positive().optional().nullable(),
  position:       z.number().int().optional(),
});

const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED']).optional(),
});

export async function taskRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── List tasks ───────────────────────────────────────────────────────────────
  app.get('/projects/:id/tasks', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const q = request.query as any;
    const statusFilter    = (q.status ?? '').trim();
    const phaseFilter     = (q.phaseKey ?? '').trim();
    const milestoneFilter = (q.milestoneId ?? '').trim();
    const assigneeFilter  = (q.assignedTo ?? '').trim();
    const sprintFilter    = (q.sprintId ?? '').trim();

    const conditions: any[] = [eq(billetterieTasks.projectId, id)];
    if (statusFilter)    conditions.push(eq(billetterieTasks.status, statusFilter as any));
    if (phaseFilter)     conditions.push(eq(billetterieTasks.phaseKey, phaseFilter as any));
    if (milestoneFilter) conditions.push(eq(billetterieTasks.milestoneId, milestoneFilter));
    if (assigneeFilter)  conditions.push(eq(billetterieTasks.assignedTo, assigneeFilter));
    if (sprintFilter === 'none') conditions.push(isNull(billetterieTasks.sprintId));
    else if (sprintFilter)      conditions.push(eq(billetterieTasks.sprintId, sprintFilter));

    const tasks = await db
      .select({
        task:      billetterieTasks,
        assignee:  { id: staffMembers.id, name: staffMembers.name, role: staffMembers.role },
        milestone: { id: billetterieMilestones.id, title: billetterieMilestones.title },
      })
      .from(billetterieTasks)
      .leftJoin(staffMembers, eq(billetterieTasks.assignedTo, staffMembers.id))
      .leftJoin(billetterieMilestones, eq(billetterieTasks.milestoneId, billetterieMilestones.id))
      .where(and(...conditions))
      .orderBy(billetterieTasks.position, desc(billetterieTasks.createdAt));

    return {
      data: tasks.map((r) => ({
        ...r.task,
        assignee:  r.assignee?.id  ? r.assignee  : null,
        milestone: r.milestone?.id ? r.milestone : null,
      })),
    };
  });

  // ── Timeline (Gantt data) ────────────────────────────────────────────────────
  app.get('/projects/:id/tasks/timeline', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };

    const tasks = await db
      .select({
        task:      billetterieTasks,
        assignee:  { id: staffMembers.id, name: staffMembers.name },
        milestone: { id: billetterieMilestones.id, title: billetterieMilestones.title, dueDate: billetterieMilestones.dueDate },
      })
      .from(billetterieTasks)
      .leftJoin(staffMembers, eq(billetterieTasks.assignedTo, staffMembers.id))
      .leftJoin(billetterieMilestones, eq(billetterieTasks.milestoneId, billetterieMilestones.id))
      .where(and(
        eq(billetterieTasks.projectId, id),
        isNotNull(billetterieTasks.startDate),
        isNotNull(billetterieTasks.dueDate),
      ))
      .orderBy(billetterieTasks.startDate);

    const milestones = await db
      .select()
      .from(billetterieMilestones)
      .where(and(eq(billetterieMilestones.projectId, id), isNotNull(billetterieMilestones.dueDate)));

    return {
      data: {
        tasks: tasks.map((r) => ({
          ...r.task,
          assignee:  r.assignee?.id  ? r.assignee  : null,
          milestone: r.milestone?.id ? r.milestone : null,
        })),
        milestones,
      },
    };
  });

  // ── Create task — PM or BA ───────────────────────────────────────────────────
  app.post('/projects/:id/tasks', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user   = request.session!.user as any;
    const userId = user.id;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = createTaskSchema.parse(request.body);
    const [task] = await db.insert(billetterieTasks).values({
      projectId:      id,
      phaseKey:       body.phaseKey as any,
      milestoneId:    body.milestoneId ?? null,
      sprintId:       body.sprintId ?? null,
      parentTaskId:   body.parentTaskId ?? null,
      title:          body.title,
      description:    body.description ?? null,
      priority:       body.priority as any,
      assignedTo:     body.assignedTo ?? null,
      estimatedHours: body.estimatedHours ? String(body.estimatedHours) : null,
      startDate:      body.startDate ?? null,
      dueDate:        body.dueDate ?? null,
      labels:         body.labels ?? [],
      storyPoints:    body.storyPoints ?? null,
      position:       body.position ?? 0,
      createdBy:      userId,
    }).returning();

    return reply.status(201).send({ data: task });
  });

  // ── Update task — PM or BA ───────────────────────────────────────────────────
  app.put('/projects/:id/tasks/:taskId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, taskId } = request.params as { id: string; taskId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = updateTaskSchema.parse(request.body);
    const updateData: any = { updatedAt: new Date() };
    if (body.title          !== undefined) updateData.title          = body.title;
    if (body.description    !== undefined) updateData.description    = body.description;
    if (body.phaseKey       !== undefined) updateData.phaseKey       = body.phaseKey;
    if (body.milestoneId    !== undefined) updateData.milestoneId    = body.milestoneId;
    if (body.parentTaskId   !== undefined) updateData.parentTaskId   = body.parentTaskId;
    if (body.priority       !== undefined) updateData.priority       = body.priority;
    if (body.assignedTo     !== undefined) updateData.assignedTo     = body.assignedTo;
    if (body.estimatedHours !== undefined) updateData.estimatedHours = body.estimatedHours ? String(body.estimatedHours) : null;
    if (body.startDate      !== undefined) updateData.startDate      = body.startDate;
    if (body.dueDate        !== undefined) updateData.dueDate        = body.dueDate;
    if (body.labels         !== undefined) updateData.labels         = body.labels;
    if (body.storyPoints    !== undefined) updateData.storyPoints    = body.storyPoints;
    if (body.sprintId       !== undefined) updateData.sprintId       = body.sprintId;
    if (body.position       !== undefined) updateData.position       = body.position;
    if (body.status         !== undefined) {
      updateData.status = body.status;
      if (body.status === 'DONE') updateData.completedAt = new Date();
    }

    const [updated] = await db.update(billetterieTasks).set(updateData).where(eq(billetterieTasks.id, taskId)).returning();
    if (!updated) return reply.notFound('Task not found');
    return { data: updated };
  });

  // ── Delete task — PM only ────────────────────────────────────────────────────
  app.delete('/projects/:id/tasks/:taskId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, taskId } = request.params as { id: string; taskId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });
    await db.delete(billetterieTasks).where(eq(billetterieTasks.id, taskId));
    return { success: true };
  });

  // ── Bulk reorder (Kanban drag-drop) — PM or BA ──────────────────────────────
  app.put('/projects/:id/tasks/reorder', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      updates: z.array(z.object({
        taskId:   z.string().uuid(),
        position: z.number().int(),
        status:   z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED']).optional(),
      })),
    }).parse(request.body);

    // Validate all taskIds belong to project
    const taskIds = body.updates.map((u) => u.taskId);
    const existing = await db.select({ id: billetterieTasks.id }).from(billetterieTasks)
      .where(eq(billetterieTasks.projectId, id));
    const validIds = new Set(existing.map((t: any) => t.id));
    for (const u of body.updates) {
      if (!validIds.has(u.taskId)) return reply.badRequest(`Task ${u.taskId} does not belong to this project`);
    }

    for (const u of body.updates) {
      const set: any = { position: u.position, updatedAt: new Date() };
      if (u.status) {
        set.status = u.status;
        if (u.status === 'DONE') set.completedAt = new Date();
      }
      await db.update(billetterieTasks).set(set).where(eq(billetterieTasks.id, u.taskId));
    }

    return { updated: body.updates.length };
  });

  // ── Log time against a task — any team member ────────────────────────────────
  app.post('/projects/:id/tasks/:taskId/log-time', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, taskId } = request.params as { id: string; taskId: string };
    const user   = request.session!.user as any;
    const userId = user.id;

    const deny = await assertBilTeamMember(db, id, user);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = z.object({
      workDate:    z.string().min(1),
      hours:       z.number().positive().max(24),
      description: z.string().optional().nullable(),
    }).parse(request.body);

    // Verify task belongs to project
    const task = await db.select({ id: billetterieTasks.id })
      .from(billetterieTasks).where(and(eq(billetterieTasks.id, taskId), eq(billetterieTasks.projectId, id))).limit(1).then((r: any[]) => r[0]);
    if (!task) return reply.notFound('Task not found');

    const staffMemberId = await getStaffMemberId(db, userId);
    if (!staffMemberId) return reply.badRequest('No staff member record found for your account');

    const [log] = await db.insert(billetterieTimeLogs).values({
      taskId,
      staffMemberId,
      workDate:    body.workDate,
      hours:       String(body.hours),
      description: body.description ?? null,
      status:      'DRAFT',
    }).returning();

    // Re-sum logged_hours on task
    await db.execute(sql`
      UPDATE billetterie_tasks
      SET logged_hours = (
        SELECT COALESCE(SUM(hours), 0) FROM billetterie_time_logs WHERE task_id = ${taskId}
      ), updated_at = NOW()
      WHERE id = ${taskId}
    `);

    return reply.status(201).send({ data: log });
  });

  // ── Delete a time log — own log only (BIL_ADMIN can delete any DRAFT) ────────
  app.delete('/projects/:id/tasks/:taskId/time-logs/:logId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, taskId, logId } = request.params as { id: string; taskId: string; logId: string };
    const user   = request.session!.user as any;
    const userId = user.id;

    const log = await db.select().from(billetterieTimeLogs).where(eq(billetterieTimeLogs.id, logId)).limit(1).then((r: any[]) => r[0]);
    if (!log) return reply.notFound('Time log not found');
    if (log.status !== 'DRAFT') return reply.badRequest('Only DRAFT time logs can be deleted');

    const staffMemberId = await getStaffMemberId(db, userId);
    const isOwn = staffMemberId === log.staffMemberId;
    if (!isBilSysAdmin(user) && !isOwn) {
      return reply.status(403).send({ error: 'Forbidden', message: 'You can only delete your own time logs' });
    }

    await db.delete(billetterieTimeLogs).where(eq(billetterieTimeLogs.id, logId));

    // Re-sum
    await db.execute(sql`
      UPDATE billetterie_tasks
      SET logged_hours = (
        SELECT COALESCE(SUM(hours), 0) FROM billetterie_time_logs WHERE task_id = ${taskId}
      ), updated_at = NOW()
      WHERE id = ${taskId}
    `);

    return { success: true };
  });

  // ── My Work (cross-project personal view) ────────────────────────────────────
  app.get('/my-work', { preHandler: requireAuth }, async (request: any) => {
    const userId = request.session.user.id;
    const staffMemberId = await getStaffMemberId(db, userId);
    if (!staffMemberId) return { data: { tasks: [], issues: [], tickets: [], pendingTimeLogs: [], weekHours: 0 } };

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr   = weekEnd.toISOString().slice(0, 10);

    // Tasks assigned to me — use Drizzle ORM so response is camelCase
    const taskRows = await db
      .select({
        id:          billetterieTasks.id,
        projectId:   billetterieTasks.projectId,
        title:       billetterieTasks.title,
        status:      billetterieTasks.status,
        priority:    billetterieTasks.priority,
        dueDate:     billetterieTasks.dueDate,
        phaseKey:    billetterieTasks.phaseKey,
        storyPoints: billetterieTasks.storyPoints,
        projectName: billetterieProjects.name,
      })
      .from(billetterieTasks)
      .innerJoin(billetterieProjects, eq(billetterieTasks.projectId, billetterieProjects.id))
      .where(and(
        eq(billetterieTasks.assignedTo, staffMemberId),
        sql`${billetterieTasks.status} NOT IN ('DONE', 'CANCELLED')`,
      ))
      .orderBy(billetterieTasks.dueDate)
      .limit(30);

    // Issues where I am in the assignees JSONB array — raw SQL needed for @> operator
    // Aliased explicitly to camelCase
    const issueRaw = await db.execute(sql`
      SELECT
        bi.id, bi.project_id AS "projectId", bi.issue_number AS "issueNumber",
        bi.title, bi.type, bi.severity, bi.status, bi.created_at AS "createdAt",
        bp.name AS "projectName"
      FROM billetterie_issues bi
      JOIN billetterie_projects bp ON bp.id = bi.project_id
      WHERE bi.assignees::jsonb @> ${JSON.stringify([staffMemberId])}::jsonb
        AND bi.status NOT IN ('RESOLVED', 'CLOSED', 'WONT_FIX')
      ORDER BY bi.created_at DESC
      LIMIT 20
    `);
    const issueRows = Array.isArray(issueRaw) ? issueRaw : (issueRaw as any).rows ?? [];

    // Support tickets assigned to me — use Drizzle ORM
    const ticketRows = await db
      .select({
        id:              billetterieSupportTickets.id,
        projectId:       billetterieSupportTickets.projectId,
        ticketNumber:    billetterieSupportTickets.ticketNumber,
        title:           billetterieSupportTickets.title,
        priority:        billetterieSupportTickets.priority,
        status:          billetterieSupportTickets.status,
        slaResolutionDue: billetterieSupportTickets.slaResolutionDue,
        slaBreached:     billetterieSupportTickets.slaBreached,
        createdAt:       billetterieSupportTickets.createdAt,
        projectName:     billetterieProjects.name,
      })
      .from(billetterieSupportTickets)
      .innerJoin(billetterieProjects, eq(billetterieSupportTickets.projectId, billetterieProjects.id))
      .where(and(
        eq(billetterieSupportTickets.assignedToStaff, staffMemberId),
        sql`${billetterieSupportTickets.status} NOT IN ('RESOLVED', 'CLOSED')`,
      ))
      .orderBy(billetterieSupportTickets.slaResolutionDue)
      .limit(20);

    // Pending time logs this week
    const logRaw = await db.execute(sql`
      SELECT
        tl.id, tl.task_id AS "taskId", tl.work_date AS "workDate",
        tl.hours, tl.status, tl.description,
        bt.title AS "taskTitle"
      FROM billetterie_time_logs tl
      JOIN billetterie_tasks bt ON bt.id = tl.task_id
      WHERE tl.staff_member_id = ${staffMemberId}
        AND tl.work_date BETWEEN ${weekStartStr} AND ${weekEndStr}
        AND tl.status IN ('DRAFT', 'SUBMITTED')
      ORDER BY tl.work_date DESC
      LIMIT 30
    `);
    const pendingLogs = Array.isArray(logRaw) ? logRaw : (logRaw as any).rows ?? [];

    // Total hours this week
    const hrsRaw = await db.execute(sql`
      SELECT COALESCE(SUM(hours), 0) AS total
      FROM billetterie_time_logs
      WHERE staff_member_id = ${staffMemberId}
        AND work_date BETWEEN ${weekStartStr} AND ${weekEndStr}
    `);
    const hrsRows = Array.isArray(hrsRaw) ? hrsRaw : (hrsRaw as any).rows ?? [];

    return {
      data: {
        tasks:           taskRows,
        issues:          issueRows,
        tickets:         ticketRows,
        pendingTimeLogs: pendingLogs,
        weekHours:       Number(hrsRows[0]?.total ?? 0),
      },
    };
  });
}
