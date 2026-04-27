import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { billetterieTimeLogs, billetterieTasks, staffMembers } from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { getStaffMemberId, getProjectRole, assertBilProjectRole, isBilSysManager } from '../helpers.js';

export async function timesheetRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── GET /projects/:id/timesheets — weekly grid ───────────────────────────────
  app.get('/projects/:id/timesheets', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };
    const q = request.query as any;

    // Default to current week Monday
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStartStr: string = q.weekStart ?? monday.toISOString().slice(0, 10);

    const weekStart = new Date(weekStartStr);
    const weekEnd   = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const conditions: any[] = [
      gte(billetterieTimeLogs.workDate, weekStartStr),
      lte(billetterieTimeLogs.workDate, weekEnd.toISOString().slice(0, 10)),
    ];

    // Join tasks to filter by project
    const logs = await db
      .select({
        log:         billetterieTimeLogs,
        taskTitle:   billetterieTasks.title,
        taskPhase:   billetterieTasks.phaseKey,
        staffName:   staffMembers.name,
        staffRole:   staffMembers.role,
        staffEmail:  staffMembers.email,
      })
      .from(billetterieTimeLogs)
      .innerJoin(billetterieTasks, eq(billetterieTimeLogs.taskId, billetterieTasks.id))
      .leftJoin(staffMembers, eq(billetterieTimeLogs.staffMemberId, staffMembers.id))
      .where(and(eq(billetterieTasks.projectId, id), ...conditions))
      .orderBy(billetterieTimeLogs.workDate);

    // Group by staff member
    const byMember = new Map<string, any>();
    for (const r of logs) {
      const mid = r.log.staffMemberId;
      if (!byMember.has(mid)) {
        byMember.set(mid, {
          staffMember: { id: mid, name: r.staffName, role: r.staffRole, email: r.staffEmail },
          entries: [],
          totalHours: 0,
        });
      }
      const m = byMember.get(mid)!;
      m.entries.push({ ...r.log, taskTitle: r.taskTitle, taskPhase: r.taskPhase });
      m.totalHours += Number(r.log.hours);
    }

    return {
      data: {
        weekStart: weekStartStr,
        weekEnd:   weekEnd.toISOString().slice(0, 10),
        members:   Array.from(byMember.values()),
      },
    };
  });

  // ── GET /my-timesheets ───────────────────────────────────────────────────────
  app.get('/my-timesheets', { preHandler: requireAuth }, async (request: any) => {
    const userId = request.session.user.id;
    const staffMemberId = await getStaffMemberId(db, userId);
    if (!staffMemberId) return { data: [] };

    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const twoWeeksAgo = new Date(monday);
    twoWeeksAgo.setDate(monday.getDate() - 7);

    const logs = await db
      .select({
        log:       billetterieTimeLogs,
        taskTitle: billetterieTasks.title,
        taskId:    billetterieTasks.id,
        projectId: billetterieTasks.projectId,
      })
      .from(billetterieTimeLogs)
      .innerJoin(billetterieTasks, eq(billetterieTimeLogs.taskId, billetterieTasks.id))
      .where(and(
        eq(billetterieTimeLogs.staffMemberId, staffMemberId),
        gte(billetterieTimeLogs.workDate, twoWeeksAgo.toISOString().slice(0, 10)),
      ))
      .orderBy(billetterieTimeLogs.workDate);

    return { data: logs.map((r) => ({ ...r.log, taskTitle: r.taskTitle, taskId: r.taskId, projectId: r.projectId })) };
  });

  // ── POST /projects/:id/timesheets/submit-week ────────────────────────────────
  app.post('/projects/:id/timesheets/submit-week', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.session.user.id;

    const body = z.object({
      weekStart:     z.string().min(1),
      staffMemberId: z.string().uuid(),
    }).parse(request.body);

    const weekEnd = new Date(body.weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const staffMemberId = await getStaffMemberId(db, userId);
    const projectRole   = await getProjectRole(db, id, userId);
    const isOwn = staffMemberId === body.staffMemberId;
    const isMgr = isBilSysManager(request.session!.user as any) || projectRole === 'PM' || projectRole === 'ADMIN';
    if (!isOwn && !isMgr) return reply.forbidden('You can only submit your own timesheets');

    // Update DRAFT → SUBMITTED for this member's logs in this project+week
    await db.execute(sql`
      UPDATE billetterie_time_logs tl
      SET status = 'SUBMITTED', updated_at = NOW()
      FROM billetterie_tasks t
      WHERE tl.task_id = t.id
        AND t.project_id = ${id}
        AND tl.staff_member_id = ${body.staffMemberId}
        AND tl.work_date BETWEEN ${body.weekStart} AND ${weekEnd.toISOString().slice(0, 10)}
        AND tl.status = 'DRAFT'
    `);

    return { success: true };
  });

  // ── PUT /time-logs/:logId/approve — PM or BIL_ADMIN ─────────────────────────
  app.put('/time-logs/:logId/approve', { preHandler: requireAuth }, async (request: any, reply) => {
    const { logId } = request.params as { logId: string };
    const user   = request.session!.user as any;
    const userId = user.id;

    const log = await db.select({ log: billetterieTimeLogs, projectId: billetterieTasks.projectId })
      .from(billetterieTimeLogs)
      .innerJoin(billetterieTasks, eq(billetterieTimeLogs.taskId, billetterieTasks.id))
      .where(eq(billetterieTimeLogs.id, logId))
      .limit(1).then((r: any[]) => r[0]);

    if (!log) return reply.notFound('Time log not found');

    const deny = await assertBilProjectRole(db, log.projectId, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const [updated] = await db.update(billetterieTimeLogs)
      .set({ status: 'APPROVED', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(billetterieTimeLogs.id, logId))
      .returning();

    return { data: updated };
  });

  // ── PUT /time-logs/:logId/reject — PM or BIL_ADMIN ──────────────────────────
  app.put('/time-logs/:logId/reject', { preHandler: requireAuth }, async (request: any, reply) => {
    const { logId } = request.params as { logId: string };
    const user = request.session!.user as any;

    const log = await db.select({ log: billetterieTimeLogs, projectId: billetterieTasks.projectId })
      .from(billetterieTimeLogs)
      .innerJoin(billetterieTasks, eq(billetterieTimeLogs.taskId, billetterieTasks.id))
      .where(eq(billetterieTimeLogs.id, logId))
      .limit(1).then((r: any[]) => r[0]);

    if (!log) return reply.notFound('Time log not found');

    const deny = await assertBilProjectRole(db, log.projectId, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const [updated] = await db.update(billetterieTimeLogs)
      .set({ status: 'REJECTED', updatedAt: new Date() })
      .where(eq(billetterieTimeLogs.id, logId))
      .returning();

    return { data: updated };
  });
}
