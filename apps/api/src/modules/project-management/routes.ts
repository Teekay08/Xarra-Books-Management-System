import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, sql, and, desc, asc, ilike, or } from 'drizzle-orm';
import {
  staffMembers, staffProjectAssignments, taskAssignments, taskTimeLogs,
  timeExtensionRequests, staffPayments, projects, projectMilestones,
  contractorAccessTokens,
} from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { createNotification, createBroadcastNotification } from '../../services/notifications.js';

// ==========================================
// ZOD SCHEMAS
// ==========================================

const createStaffMemberSchema = z.object({
  userId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.string().min(1),
  skills: z.array(z.string()).default([]),
  availabilityType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).default('FULL_TIME'),
  maxHoursPerWeek: z.coerce.number().int().positive().default(40),
  hourlyRate: z.preprocess((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)), z.number().min(0)),
  currency: z.string().length(3).default('ZAR'),
  isInternal: z.boolean().default(true),
  notes: z.string().nullable().optional(),
});

const updateStaffMemberSchema = createStaffMemberSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const assignStaffToProjectSchema = z.object({
  staffMemberId: z.string().uuid(),
  role: z.string().min(1),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  totalAllocatedHours: z.coerce.number().min(0).default(0),
  notes: z.string().nullable().optional(),
});

const updateAssignmentSchema = z.object({
  role: z.string().min(1).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  totalAllocatedHours: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const createTaskAssignmentSchema = z.object({
  staffMemberId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  allocatedHours: z.coerce.number().positive(),
  hourlyRate: z.coerce.number().positive(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  deliverables: z.array(z.object({ description: z.string(), completed: z.boolean() })).nullable().optional(),
});

const updateTaskAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  deliverables: z.array(z.object({ description: z.string(), completed: z.boolean() })).optional(),
  notes: z.string().nullable().optional(),
});

const logTimeSchema = z.object({
  workDate: z.string(),
  hours: z.coerce.number().positive(),
  description: z.string().min(1),
});

const requestExtensionSchema = z.object({
  requestedHours: z.coerce.number().positive(),
  reason: z.string().min(1),
});

const createPaymentSchema = z.object({
  staffMemberId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  periodFrom: z.string(),
  periodTo: z.string(),
  totalHours: z.coerce.number().positive(),
  hourlyRate: z.coerce.number().positive(),
  notes: z.string().nullable().optional(),
});

const markPaidSchema = z.object({
  paymentReference: z.string().min(1),
});

const staffListQuerySchema = paginationSchema.extend({
  role: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  availabilityType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).optional(),
});

// ==========================================
// HELPERS
// ==========================================

async function nextTaskAssignmentNumber(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `TA-${year}-%`;

  const result = await db.execute(sql`
    SELECT MAX(SUBSTRING(number FROM '-([0-9]+)$')::int) AS "maxNum"
    FROM task_assignments
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `TA-${year}-${String(nextNum).padStart(4, '0')}`;
}

async function getStaffMemberByUserId(db: any, userId: string) {
  return db.query.staffMembers.findFirst({
    where: eq(staffMembers.userId, userId),
  });
}

// ==========================================
// ROUTES
// ==========================================

export async function projectManagementRoutes(app: FastifyInstance) {

  // ==========================================
  // STAFF MEMBERS CRUD
  // ==========================================

  // List staff members (paginated, searchable, filterable)
  app.get('/staff', { preHandler: requireAuth }, async (request) => {
    const query = staffListQuerySchema.parse(request.query);
    const { page, limit, search, role, isActive, availabilityType } = query;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(staffMembers.name, `%${search}%`),
          ilike(staffMembers.email, `%${search}%`),
          ilike(staffMembers.role, `%${search}%`),
        ),
      );
    }
    if (role) {
      conditions.push(eq(staffMembers.role, role));
    }
    if (isActive !== undefined) {
      conditions.push(eq(staffMembers.isActive, isActive === 'true'));
    }
    if (availabilityType) {
      conditions.push(eq(staffMembers.availabilityType, availabilityType));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.staffMembers.findMany({
        where: where ? () => where : undefined,
        orderBy: (s, { asc }) => [asc(s.name)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(staffMembers).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get single staff member with project assignments
  app.get<{ Params: { id: string } }>('/staff/:id', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const staff = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.id, request.params.id),
      with: {
        projectAssignments: {
          with: { project: true },
        },
        taskAssignments: {
          orderBy: (t, { desc }) => [desc(t.createdAt)],
          limit: 20,
        },
      },
    });
    if (!staff) return reply.notFound('Staff member not found');
    return { data: staff };
  });

  // Create staff member (PM/admin only)
  app.post('/staff', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = createStaffMemberSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const [staff] = await app.db.insert(staffMembers).values({
      userId: body.userId || null,
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      role: body.role,
      skills: body.skills,
      availabilityType: body.availabilityType,
      maxHoursPerWeek: body.maxHoursPerWeek,
      hourlyRate: String(body.hourlyRate),
      currency: body.currency,
      isInternal: body.isInternal,
      notes: body.notes || null,
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: staff });
  });

  // Update staff member
  app.patch<{ Params: { id: string } }>('/staff/:id', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = updateStaffMemberSchema.parse(request.body);
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone || null;
    if (body.role !== undefined) updates.role = body.role;
    if (body.skills !== undefined) updates.skills = body.skills;
    if (body.availabilityType !== undefined) updates.availabilityType = body.availabilityType;
    if (body.maxHoursPerWeek !== undefined) updates.maxHoursPerWeek = body.maxHoursPerWeek;
    if (body.hourlyRate !== undefined) updates.hourlyRate = String(body.hourlyRate);
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.isInternal !== undefined) updates.isInternal = body.isInternal;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.userId !== undefined) updates.userId = body.userId || null;
    if (body.notes !== undefined) updates.notes = body.notes || null;

    const [updated] = await app.db.update(staffMembers)
      .set(updates)
      .where(eq(staffMembers.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Staff member not found');
    return { data: updated };
  });

  // ==========================================
  // STAFF PROJECT ASSIGNMENTS
  // ==========================================

  // List staff assigned to a project
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/team', {
    preHandler: requireAuth,
  }, async (request) => {
    const items = await app.db.query.staffProjectAssignments.findMany({
      where: eq(staffProjectAssignments.projectId, request.params.projectId),
      with: { staffMember: true, project: true },
      orderBy: (a, { asc }) => [asc(a.createdAt)],
    });
    return { data: items };
  });

  // Assign staff to project
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/team', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = assignStaffToProjectSchema.parse(request.body);
    const userId = request.session?.user?.id;

    // Verify project exists
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.projectId),
    });
    if (!project) return reply.notFound('Project not found');

    // Verify staff member exists
    const staff = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.id, body.staffMemberId),
    });
    if (!staff) return reply.notFound('Staff member not found');

    const [assignment] = await app.db.insert(staffProjectAssignments).values({
      staffMemberId: body.staffMemberId,
      projectId: request.params.projectId,
      role: body.role,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      totalAllocatedHours: String(body.totalAllocatedHours),
      notes: body.notes || null,
      assignedBy: userId,
    }).returning();

    return reply.status(201).send({ data: assignment });
  });

  // Update assignment
  app.patch<{ Params: { id: string } }>('/assignments/:id', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = updateAssignmentSchema.parse(request.body);
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (body.role !== undefined) updates.role = body.role;
    if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) updates.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.totalAllocatedHours !== undefined) updates.totalAllocatedHours = String(body.totalAllocatedHours);
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await app.db.update(staffProjectAssignments)
      .set(updates)
      .where(eq(staffProjectAssignments.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Assignment not found');
    return { data: updated };
  });

  // Remove from project
  app.delete<{ Params: { id: string } }>('/assignments/:id', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const [deleted] = await app.db.delete(staffProjectAssignments)
      .where(eq(staffProjectAssignments.id, request.params.id))
      .returning();
    if (!deleted) return reply.notFound('Assignment not found');
    return { data: deleted };
  });

  // ==========================================
  // TASK ASSIGNMENTS
  // ==========================================

  // List tasks for a project
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/tasks', {
    preHandler: requireAuth,
  }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const conditions: any[] = [eq(taskAssignments.projectId, request.params.projectId)];
    if (search) {
      conditions.push(
        or(
          ilike(taskAssignments.title, `%${search}%`),
          ilike(taskAssignments.number, `%${search}%`),
        ),
      );
    }
    const where = and(...conditions);

    const [items, countResult] = await Promise.all([
      app.db.query.taskAssignments.findMany({
        where: () => where,
        with: { staffMember: true, milestone: true },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(taskAssignments).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // List tasks for a staff member (across projects)
  app.get<{ Params: { staffId: string } }>('/staff/:staffId/tasks', {
    preHandler: requireAuth,
  }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const where = eq(taskAssignments.staffMemberId, request.params.staffId);

    const [items, countResult] = await Promise.all([
      app.db.query.taskAssignments.findMany({
        where: () => where,
        with: { project: true, milestone: true },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(taskAssignments).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get single task with time logs
  app.get<{ Params: { id: string } }>('/tasks/:id', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
      with: {
        staffMember: true,
        project: true,
        milestone: true,
        timeLogs: {
          orderBy: (l, { desc }) => [desc(l.workDate)],
        },
        extensionRequests: {
          orderBy: (e, { desc }) => [desc(e.createdAt)],
        },
      },
    });
    if (!task) return reply.notFound('Task assignment not found');
    return { data: task };
  });

  // Create task assignment
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/tasks', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = createTaskAssignmentSchema.parse(request.body);
    const userId = request.session?.user?.id;

    // Verify project exists
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.projectId),
    });
    if (!project) return reply.notFound('Project not found');

    // Verify staff member exists
    const staff = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.id, body.staffMemberId),
    });
    if (!staff) return reply.notFound('Staff member not found');

    // Verify milestone belongs to project (if provided)
    if (body.milestoneId) {
      const milestone = await app.db.query.projectMilestones.findFirst({
        where: and(
          eq(projectMilestones.id, body.milestoneId),
          eq(projectMilestones.projectId, request.params.projectId),
        ),
      });
      if (!milestone) return reply.badRequest('Milestone does not belong to this project');
    }

    const number = await nextTaskAssignmentNumber(app.db);
    const totalCost = body.allocatedHours * body.hourlyRate;

    const [task] = await app.db.insert(taskAssignments).values({
      number,
      projectId: request.params.projectId,
      milestoneId: body.milestoneId || null,
      staffMemberId: body.staffMemberId,
      title: body.title,
      description: body.description || null,
      priority: body.priority,
      allocatedHours: String(body.allocatedHours),
      loggedHours: '0',
      remainingHours: String(body.allocatedHours),
      hourlyRate: String(body.hourlyRate),
      totalCost: String(totalCost),
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      deliverables: body.deliverables || [],
      assignedBy: userId,
      status: 'ASSIGNED',
    }).returning();

    return reply.status(201).send({ data: task });
  });

  // Update task (PM only)
  app.patch<{ Params: { id: string } }>('/tasks/:id', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = updateTaskAssignmentSchema.parse(request.body);
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.milestoneId !== undefined) updates.milestoneId = body.milestoneId;
    if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.deliverables !== undefined) updates.deliverables = body.deliverables;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await app.db.update(taskAssignments)
      .set(updates)
      .where(eq(taskAssignments.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Task assignment not found');
    return { data: updated };
  });

  // Start task (mark as IN_PROGRESS)
  app.post<{ Params: { id: string } }>('/tasks/:id/start', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
    });
    if (!task) return reply.notFound('Task assignment not found');
    if (task.status !== 'ASSIGNED' && task.status !== 'DRAFT') {
      return reply.badRequest('Task can only be started from DRAFT or ASSIGNED status');
    }

    const [updated] = await app.db.update(taskAssignments)
      .set({ status: 'IN_PROGRESS', startDate: task.startDate || new Date(), updatedAt: new Date() })
      .where(eq(taskAssignments.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // Submit for review
  app.post<{ Params: { id: string } }>('/tasks/:id/submit-review', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
    });
    if (!task) return reply.notFound('Task assignment not found');
    if (task.status !== 'IN_PROGRESS') {
      return reply.badRequest('Task can only be submitted for review from IN_PROGRESS status');
    }

    const [updated] = await app.db.update(taskAssignments)
      .set({ status: 'REVIEW', updatedAt: new Date() })
      .where(eq(taskAssignments.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // Complete task (PM approves)
  app.post<{ Params: { id: string } }>('/tasks/:id/complete', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
    });
    if (!task) return reply.notFound('Task assignment not found');
    if (task.status !== 'REVIEW') {
      return reply.badRequest('Task can only be completed from REVIEW status');
    }

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(taskAssignments)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        approvedAt: new Date(),
        approvedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(taskAssignments.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // ==========================================
  // TIME LOGGING
  // ==========================================

  // List time logs for a task
  app.get<{ Params: { taskId: string } }>('/tasks/:taskId/time-logs', {
    preHandler: requireAuth,
  }, async (request) => {
    const items = await app.db.query.taskTimeLogs.findMany({
      where: eq(taskTimeLogs.taskAssignmentId, request.params.taskId),
      with: { staffMember: true },
      orderBy: (l, { desc }) => [desc(l.workDate)],
    });
    return { data: items };
  });

  // Log time on a task
  app.post<{ Params: { taskId: string } }>('/tasks/:taskId/log-time', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const body = logTimeSchema.parse(request.body);
    const userId = request.session?.user?.id;

    // Find the task
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.taskId),
    });
    if (!task) return reply.notFound('Task assignment not found');

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      return reply.badRequest('Cannot log time on a completed or cancelled task');
    }

    // Find the staff member for the current user
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const currentLogged = Number(task.loggedHours) || 0;
    const allocated = Number(task.allocatedHours) || 0;

    // Validate: hours + loggedHours <= allocatedHours (unless already exhausted)
    if (!task.timeExhausted && (currentLogged + body.hours) > allocated) {
      return reply.badRequest(
        `Cannot log ${body.hours}h — only ${(allocated - currentLogged).toFixed(2)}h remaining. Request a time extension if needed.`,
      );
    }

    const newLogged = currentLogged + body.hours;
    const newRemaining = Math.max(0, allocated - newLogged);
    const isExhausted = newLogged >= allocated;

    // Create time log
    const [timeLog] = await app.db.insert(taskTimeLogs).values({
      taskAssignmentId: request.params.taskId,
      staffMemberId: staff.id,
      workDate: new Date(body.workDate),
      hours: String(body.hours),
      description: body.description,
    }).returning();

    // Update task assignment totals
    await app.db.update(taskAssignments)
      .set({
        loggedHours: String(newLogged),
        remainingHours: String(newRemaining),
        timeExhausted: isExhausted,
        updatedAt: new Date(),
      })
      .where(eq(taskAssignments.id, request.params.taskId));

    // Also update the project assignment's logged hours
    const projectAssignment = await app.db.query.staffProjectAssignments.findFirst({
      where: and(
        eq(staffProjectAssignments.staffMemberId, staff.id),
        eq(staffProjectAssignments.projectId, task.projectId),
      ),
    });
    if (projectAssignment) {
      const newProjectLogged = (Number(projectAssignment.totalLoggedHours) || 0) + body.hours;
      await app.db.update(staffProjectAssignments)
        .set({ totalLoggedHours: String(newProjectLogged), updatedAt: new Date() })
        .where(eq(staffProjectAssignments.id, projectAssignment.id));
    }

    return reply.status(201).send({ data: timeLog });
  });

  // Approve time log
  app.post<{ Params: { id: string } }>('/time-logs/:id/approve', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const userId = request.session?.user?.id;

    const [updated] = await app.db.update(taskTimeLogs)
      .set({
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .where(and(
        eq(taskTimeLogs.id, request.params.id),
        eq(taskTimeLogs.status, 'LOGGED'),
      ))
      .returning();
    if (!updated) return reply.notFound('Time log not found or already processed');
    return { data: updated };
  });

  // Reject time log
  app.post<{ Params: { id: string } }>('/time-logs/:id/reject', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({ reason: z.string().min(1) }).parse(request.body);
    const userId = request.session?.user?.id;

    const [updated] = await app.db.update(taskTimeLogs)
      .set({
        status: 'REJECTED',
        approvedBy: userId,
        approvedAt: new Date(),
        rejectionReason: body.reason,
      })
      .where(and(
        eq(taskTimeLogs.id, request.params.id),
        eq(taskTimeLogs.status, 'LOGGED'),
      ))
      .returning();
    if (!updated) return reply.notFound('Time log not found or already processed');
    return { data: updated };
  });

  // ==========================================
  // TIME EXTENSION REQUESTS
  // ==========================================

  // List extension requests for a task
  app.get<{ Params: { taskId: string } }>('/tasks/:taskId/extensions', {
    preHandler: requireAuth,
  }, async (request) => {
    const items = await app.db.query.timeExtensionRequests.findMany({
      where: eq(timeExtensionRequests.taskAssignmentId, request.params.taskId),
      with: { staffMember: true },
      orderBy: (e, { desc }) => [desc(e.createdAt)],
    });
    return { data: items };
  });

  // Request time extension
  app.post<{ Params: { taskId: string } }>('/tasks/:taskId/request-extension', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const body = requestExtensionSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.taskId),
    });
    if (!task) return reply.notFound('Task assignment not found');
    if (!task.timeExhausted) {
      return reply.badRequest('Time extension can only be requested when allocated hours are exhausted');
    }

    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const [extension] = await app.db.insert(timeExtensionRequests).values({
      taskAssignmentId: request.params.taskId,
      staffMemberId: staff.id,
      requestedHours: String(body.requestedHours),
      reason: body.reason,
    }).returning();

    // Notify PM about extension request
    createBroadcastNotification(app, {
      type: 'TIMESHEET_SUBMITTED',
      priority: 'HIGH',
      title: 'Time Extension Requested',
      message: `${staff.name} has requested ${body.requestedHours} additional hours on task "${task.title}". Reason: ${body.reason}`,
      actionUrl: `/pm/tasks/${task.id}`,
      referenceType: 'TASK_ASSIGNMENT',
      referenceId: task.id,
    }).catch(() => {});

    return reply.status(201).send({ data: extension });
  });

  // Approve extension (PM can grant custom hours — more or less than requested)
  app.post<{ Params: { id: string } }>('/extensions/:id/approve', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({
      grantedHours: z.coerce.number().positive().optional(), // if not provided, uses requested amount
      notes: z.string().nullable().optional(),
    }).parse(request.body || {});

    const userId = request.session?.user?.id;

    const extension = await app.db.query.timeExtensionRequests.findFirst({
      where: eq(timeExtensionRequests.id, request.params.id),
    });
    if (!extension) return reply.notFound('Extension request not found');
    if (extension.status !== 'PENDING') {
      return reply.badRequest('Extension request has already been processed');
    }

    // Use custom hours if provided, otherwise use requested amount
    const hoursToGrant = body.grantedHours || Number(extension.requestedHours);

    // Update extension status
    const [updated] = await app.db.update(timeExtensionRequests)
      .set({
        status: 'APPROVED',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: body.notes || (hoursToGrant !== Number(extension.requestedHours)
          ? `Requested ${Number(extension.requestedHours)}h, granted ${hoursToGrant}h`
          : null),
      })
      .where(eq(timeExtensionRequests.id, request.params.id))
      .returning();

    // Increase task allocated hours and remaining hours, reset timeExhausted
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, extension.taskAssignmentId),
    });
    if (task) {
      const newAllocated = (Number(task.allocatedHours) || 0) + hoursToGrant;
      const newRemaining = (Number(task.remainingHours) || 0) + hoursToGrant;
      const newTotalCost = newAllocated * (Number(task.hourlyRate) || 0);

      await app.db.update(taskAssignments)
        .set({
          allocatedHours: String(newAllocated),
          remainingHours: String(newRemaining),
          totalCost: String(newTotalCost),
          timeExhausted: false,
          updatedAt: new Date(),
        })
        .where(eq(taskAssignments.id, extension.taskAssignmentId));
    }

    // Notify the specific staff member that extension was approved
    const staffMember = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.id, extension.staffMemberId),
    });
    if (staffMember?.userId) {
      createNotification(app, {
        type: 'TIMESHEET_APPROVED',
        title: 'Extension Approved',
        message: `Your request for additional hours on "${task?.title}" has been approved. Granted: ${hoursToGrant}h${hoursToGrant !== Number(extension.requestedHours) ? ` (requested ${Number(extension.requestedHours)}h)` : ''}.`,
        userId: staffMember.userId, // targeted to the specific staff member
        actionUrl: `/pm/tasks/${extension.taskAssignmentId}`,
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: extension.taskAssignmentId,
      }).catch(() => {});
    }

    return { data: updated };
  });

  // Decline extension
  app.post<{ Params: { id: string } }>('/extensions/:id/decline', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({ notes: z.string().optional() }).parse(request.body);
    const userId = request.session?.user?.id;

    const [updated] = await app.db.update(timeExtensionRequests)
      .set({
        status: 'DECLINED',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: body.notes || null,
      })
      .where(and(
        eq(timeExtensionRequests.id, request.params.id),
        eq(timeExtensionRequests.status, 'PENDING'),
      ))
      .returning();
    if (!updated) return reply.notFound('Extension request not found or already processed');

    // Notify staff that extension was declined
    const declinedExt = await app.db.query.timeExtensionRequests.findFirst({
      where: eq(timeExtensionRequests.id, request.params.id),
    });
    if (declinedExt) {
      const declinedStaff = await app.db.query.staffMembers.findFirst({
        where: eq(staffMembers.id, declinedExt.staffMemberId),
      });
      const declinedTask = await app.db.query.taskAssignments.findFirst({
        where: eq(taskAssignments.id, declinedExt.taskAssignmentId),
      });
      if (declinedStaff?.userId) {
        createNotification(app, {
          type: 'TIMESHEET_REJECTED',
          title: 'Extension Declined',
          message: `Your request for ${Number(declinedExt.requestedHours)} additional hours on "${declinedTask?.title}" was declined.${body.notes ? ` Reason: ${body.notes}` : ''}`,
          userId: declinedStaff.userId,
          actionUrl: `/pm/tasks/${declinedExt.taskAssignmentId}`,
          referenceType: 'TASK_ASSIGNMENT',
          referenceId: declinedExt.taskAssignmentId,
        }).catch(() => {});
      }
    }

    return { data: updated };
  });

  // ==========================================
  // EMPLOYEE DASHBOARD (my/* routes)
  // ==========================================

  // My tasks
  app.get('/my/tasks', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const where = eq(taskAssignments.staffMemberId, staff.id);

    const [items, countResult] = await Promise.all([
      app.db.query.taskAssignments.findMany({
        where: () => where,
        with: { project: true, milestone: true },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(taskAssignments).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // My time logs
  app.get('/my/time-logs', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const where = eq(taskTimeLogs.staffMemberId, staff.id);

    const [items, countResult] = await Promise.all([
      app.db.query.taskTimeLogs.findMany({
        where: () => where,
        with: { taskAssignment: { with: { project: true } } },
        orderBy: (l, { desc }) => [desc(l.workDate)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(taskTimeLogs).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // My extension requests
  app.get('/my/extensions', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const items = await app.db.query.timeExtensionRequests.findMany({
      where: eq(timeExtensionRequests.staffMemberId, staff.id),
      with: { taskAssignment: { with: { project: true } } },
      orderBy: (e, { desc }) => [desc(e.createdAt)],
    });
    return { data: items };
  });

  // ==========================================
  // RESOURCE PLANNING
  // ==========================================

  // Capacity overview — all staff with allocation summary
  app.get('/capacity', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async () => {
    const allStaff = await app.db.query.staffMembers.findMany({
      where: eq(staffMembers.isActive, true),
      with: {
        taskAssignments: {
          where: () => and(
            sql`${taskAssignments.status} NOT IN ('COMPLETED', 'CANCELLED')`,
          ),
        },
      },
      orderBy: (s, { asc }) => [asc(s.name)],
    });

    const data = allStaff.map((staff) => {
      const allocatedHours = staff.taskAssignments.reduce(
        (sum, t) => sum + (Number(t.allocatedHours) || 0), 0,
      );
      const loggedHours = staff.taskAssignments.reduce(
        (sum, t) => sum + (Number(t.loggedHours) || 0), 0,
      );
      const maxWeekly = staff.maxHoursPerWeek;
      const maxMonthly = maxWeekly * 4;

      return {
        id: staff.id,
        name: staff.name,
        role: staff.role,
        availabilityType: staff.availabilityType,
        maxHoursPerWeek: maxWeekly,
        maxHoursPerMonth: maxMonthly,
        allocatedHours,
        loggedHours,
        availableHoursWeekly: Math.max(0, maxWeekly - (allocatedHours / 4)),
        availableHoursMonthly: Math.max(0, maxMonthly - allocatedHours),
        activeTaskCount: staff.taskAssignments.length,
      };
    });

    return { data };
  });

  // Single staff utilization
  app.get<{ Params: { id: string } }>('/staff/:id/utilization', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const staff = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.id, request.params.id),
    });
    if (!staff) return reply.notFound('Staff member not found');

    // Get all task assignments (including completed)
    const tasks = await app.db.query.taskAssignments.findMany({
      where: eq(taskAssignments.staffMemberId, request.params.id),
      with: { project: true },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    // Get recent time logs
    const timeLogs = await app.db.query.taskTimeLogs.findMany({
      where: eq(taskTimeLogs.staffMemberId, request.params.id),
      orderBy: (l, { desc }) => [desc(l.workDate)],
      limit: 100,
    });

    const totalAllocated = tasks.reduce((sum, t) => sum + (Number(t.allocatedHours) || 0), 0);
    const totalLogged = tasks.reduce((sum, t) => sum + (Number(t.loggedHours) || 0), 0);
    const activeTasks = tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status));
    const activeAllocated = activeTasks.reduce((sum, t) => sum + (Number(t.allocatedHours) || 0), 0);
    const activeLogged = activeTasks.reduce((sum, t) => sum + (Number(t.loggedHours) || 0), 0);

    return {
      data: {
        staff: {
          id: staff.id,
          name: staff.name,
          role: staff.role,
          maxHoursPerWeek: staff.maxHoursPerWeek,
          hourlyRate: staff.hourlyRate,
        },
        summary: {
          totalTaskCount: tasks.length,
          activeTaskCount: activeTasks.length,
          totalAllocatedHours: totalAllocated,
          totalLoggedHours: totalLogged,
          activeAllocatedHours: activeAllocated,
          activeLoggedHours: activeLogged,
          utilizationPercentage: totalAllocated > 0
            ? Math.round((totalLogged / totalAllocated) * 100)
            : 0,
        },
        tasks,
        recentTimeLogs: timeLogs,
      },
    };
  });

  // ==========================================
  // STAFF PAYMENTS
  // ==========================================

  // List all payments
  app.get('/payments', {
    preHandler: requireRole('admin', 'project_manager', 'finance'),
  }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (search) {
      // Search by staff name via subquery
      conditions.push(
        sql`${staffPayments.staffMemberId} IN (
          SELECT id FROM staff_members WHERE name ILIKE ${'%' + search + '%'}
        )`,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.staffPayments.findMany({
        where: where ? () => where : undefined,
        with: { staffMember: true, project: true },
        orderBy: (p, { desc }) => [desc(p.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(staffPayments).where(where),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Create payment
  app.post('/payments', {
    preHandler: requireRole('admin', 'project_manager', 'finance'),
  }, async (request, reply) => {
    const body = createPaymentSchema.parse(request.body);
    const userId = request.session?.user?.id;

    // Verify staff member exists
    const staff = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.id, body.staffMemberId),
    });
    if (!staff) return reply.notFound('Staff member not found');

    const grossAmount = body.totalHours * body.hourlyRate;

    const [payment] = await app.db.insert(staffPayments).values({
      staffMemberId: body.staffMemberId,
      projectId: body.projectId || null,
      periodFrom: new Date(body.periodFrom),
      periodTo: new Date(body.periodTo),
      totalHours: String(body.totalHours),
      hourlyRate: String(body.hourlyRate),
      grossAmount: String(grossAmount),
      notes: body.notes || null,
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: payment });
  });

  // Approve payment
  app.post<{ Params: { id: string } }>('/payments/:id/approve', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const userId = request.session?.user?.id;

    const [updated] = await app.db.update(staffPayments)
      .set({
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(staffPayments.id, request.params.id),
        eq(staffPayments.status, 'PENDING'),
      ))
      .returning();
    if (!updated) return reply.notFound('Payment not found or not in PENDING status');
    return { data: updated };
  });

  // Mark payment as paid
  app.post<{ Params: { id: string } }>('/payments/:id/mark-paid', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = markPaidSchema.parse(request.body);

    const [updated] = await app.db.update(staffPayments)
      .set({
        status: 'PAID',
        paidAt: new Date(),
        paymentReference: body.paymentReference,
        updatedAt: new Date(),
      })
      .where(and(
        eq(staffPayments.id, request.params.id),
        eq(staffPayments.status, 'APPROVED'),
      ))
      .returning();
    if (!updated) return reply.notFound('Payment not found or not in APPROVED status');
    return { data: updated };
  });

  // ==========================================
  // SOW GENERATION FROM TASK ASSIGNMENTS
  // ==========================================

  // Generate SOW data pre-filled from a staff member's task assignments on a project
  app.get<{ Params: { projectId: string; staffMemberId: string } }>('/projects/:projectId/staff/:staffMemberId/sow-data', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const { projectId, staffMemberId } = request.params;

    // Get staff member
    const staff = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.id, staffMemberId),
    });
    if (!staff) return reply.notFound('Staff member not found');

    // Get project
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      with: { title: true, author: true },
    });
    if (!project) return reply.notFound('Project not found');

    // Get assignment
    const assignment = await app.db.query.staffProjectAssignments.findFirst({
      where: and(
        eq(staffProjectAssignments.projectId, projectId),
        eq(staffProjectAssignments.staffMemberId, staffMemberId),
      ),
    });

    // Get tasks for this staff on this project
    const tasks = await app.db.query.taskAssignments.findMany({
      where: and(
        eq(taskAssignments.projectId, projectId),
        eq(taskAssignments.staffMemberId, staffMemberId),
      ),
      with: { milestone: true },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    // Build scope from tasks
    const scope = [
      `Statement of Work for ${staff.name} on project ${project.name} (${project.number}).`,
      '',
      `Role: ${assignment?.role || staff.role}`,
      '',
      'Tasks:',
      ...tasks.map((t, i) => `${i + 1}. ${t.title}${t.description ? ` — ${t.description}` : ''}`),
    ].join('\n');

    // Build deliverables from tasks
    const deliverables = tasks.map((t) => ({
      description: t.title + (t.milestone ? ` (${t.milestone.name})` : ''),
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : new Date().toISOString(),
      acceptanceCriteria: (t.deliverables as any[])?.map((d: any) => d.description).join('; ') || 'Completed to satisfaction',
    }));

    // Build cost breakdown from tasks
    const costBreakdown = tasks.map((t) => ({
      description: t.title,
      hours: Number(t.allocatedHours),
      rate: Number(t.hourlyRate),
      total: Number(t.totalCost),
    }));

    const totalAmount = costBreakdown.reduce((s, c) => s + c.total, 0);
    const totalHours = costBreakdown.reduce((s, c) => s + c.hours, 0);

    // Build timeline
    const taskDates = tasks.filter((t) => t.startDate || t.dueDate);
    const startDate = taskDates.length > 0
      ? new Date(Math.min(...taskDates.map((t) => new Date(t.startDate || t.dueDate!).getTime()))).toISOString()
      : new Date().toISOString();
    const endDate = taskDates.length > 0
      ? new Date(Math.max(...taskDates.map((t) => new Date(t.dueDate || t.startDate!).getTime()))).toISOString()
      : new Date(Date.now() + 30 * 86400000).toISOString();

    return {
      data: {
        projectId,
        staffMemberId,
        staffName: staff.name,
        staffEmail: staff.email,
        isInternal: staff.isInternal,
        supplierId: null, // will be set if external
        projectName: project.name,
        projectNumber: project.number,
        scope,
        deliverables,
        timeline: {
          startDate,
          endDate,
          milestones: tasks.filter((t) => t.dueDate).map((t) => ({
            name: t.title,
            date: new Date(t.dueDate!).toISOString(),
          })),
        },
        costBreakdown,
        totalAmount,
        totalHours,
        terms: `Payment terms: ${staff.isInternal ? 'Monthly payroll' : 'Net 30 days from invoice date'}.\nRate: R${Number(staff.hourlyRate).toFixed(2)}/hour.\nTotal estimated hours: ${totalHours}.`,
      },
    };
  });

  // ==========================================
  // CONTRACTOR MAGIC LINK PORTAL
  // ==========================================

  // Generate contractor access link for a staff member's tasks on a project
  app.post<{ Params: { projectId: string; staffMemberId: string } }>('/projects/:projectId/staff/:staffMemberId/send-access-link', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const { projectId, staffMemberId } = request.params;
    const staff = await app.db.query.staffMembers.findFirst({ where: eq(staffMembers.id, staffMemberId) });
    if (!staff) return reply.notFound('Staff member not found');
    if (!staff.email) return reply.badRequest('Staff member has no email address');

    const project = await app.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!project) return reply.notFound('Project not found');

    // Generate magic link token
    const crypto = await import('node:crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await app.db.insert(contractorAccessTokens).values({
      token,
      staffMemberId,
      projectId,
      expiresAt,
      createdBy: request.session?.user?.id,
    });

    // Send email with link
    const { sendEmail, isEmailConfigured } = await import('../../services/email.js');
    if (isEmailConfigured()) {
      const link = `${(request.headers.origin || request.headers.referer || 'https://app.xarrabooks.com').replace(/\/$/, '')}/contractor/${token}`;
      await sendEmail({
        to: staff.email,
        subject: `Xarra Books — Your Tasks on ${project.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="border-bottom:3px solid #166534;padding-bottom:15px;margin-bottom:20px">
              <h1 style="color:#166534;font-size:20px;margin:0">Xarra Books</h1>
            </div>
            <p>Hi ${staff.name},</p>
            <p>You have been assigned tasks on the project <strong>${project.name}</strong> (${project.number}).</p>
            <p>Use the link below to view your Statement of Work, tasks, and log your working hours:</p>
            <div style="margin:25px 0">
              <a href="${link}" style="background:#166534;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
                View My Tasks & Log Hours
              </a>
            </div>
            <p style="color:#666;font-size:13px">This link expires on ${expiresAt.toLocaleDateString('en-ZA')}.</p>
            <p style="color:#999;font-size:12px;margin-top:30px">Xarra Books Management System</p>
          </div>
        `,
      });
    }

    return { data: { token, email: staff.email, expiresAt } };
  });

  // Contractor portal: get tasks and SOW via magic link (NO AUTH REQUIRED)
  app.get<{ Params: { token: string } }>('/contractor-portal/:token', async (request, reply) => {
    const tokenRecord = await app.db.query.contractorAccessTokens.findFirst({
      where: eq(contractorAccessTokens.token, request.params.token),
    });
    if (!tokenRecord) return reply.notFound('Invalid access link');
    if (new Date() > new Date(tokenRecord.expiresAt)) return reply.badRequest('This link has expired. Please contact your project manager for a new one.');

    const staff = await app.db.query.staffMembers.findFirst({ where: eq(staffMembers.id, tokenRecord.staffMemberId) });
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, tokenRecord.projectId),
      with: { title: true, author: true },
    });

    // Get tasks
    const tasks = await app.db.query.taskAssignments.findMany({
      where: and(
        eq(taskAssignments.projectId, tokenRecord.projectId),
        eq(taskAssignments.staffMemberId, tokenRecord.staffMemberId),
      ),
      with: { milestone: true, timeLogs: true },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    return {
      data: {
        staff: { name: staff?.name, email: staff?.email, role: staff?.role },
        project: { name: project?.name, number: project?.number, titleName: project?.title?.title },
        tasks: tasks.map((t) => ({
          id: t.id,
          number: t.number,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          allocatedHours: t.allocatedHours,
          loggedHours: t.loggedHours,
          remainingHours: t.remainingHours,
          timeExhausted: t.timeExhausted,
          hourlyRate: t.hourlyRate,
          startDate: t.startDate,
          dueDate: t.dueDate,
          deliverables: t.deliverables,
          milestone: t.milestone?.name || null,
          timeLogs: (t.timeLogs || []).map((l) => ({
            id: l.id,
            workDate: l.workDate,
            hours: l.hours,
            description: l.description,
            status: l.status,
          })),
        })),
      },
    };
  });

  // Contractor portal: log time via magic link (NO AUTH REQUIRED)
  app.post<{ Params: { token: string; taskId: string } }>('/contractor-portal/:token/tasks/:taskId/log-time', async (request, reply) => {
    const tokenRecord = await app.db.query.contractorAccessTokens.findFirst({
      where: eq(contractorAccessTokens.token, request.params.token),
    });
    if (!tokenRecord) return reply.notFound('Invalid access link');
    if (new Date() > new Date(tokenRecord.expiresAt)) return reply.badRequest('Link expired');

    const body = logTimeSchema.parse(request.body);

    const task = await app.db.query.taskAssignments.findFirst({
      where: and(
        eq(taskAssignments.id, request.params.taskId),
        eq(taskAssignments.staffMemberId, tokenRecord.staffMemberId),
      ),
    });
    if (!task) return reply.notFound('Task not found');

    const newLogged = Number(task.loggedHours) + body.hours;
    const newRemaining = Math.max(0, Number(task.allocatedHours) - newLogged);
    const timeExhausted = newLogged >= Number(task.allocatedHours);

    // Create time log
    const [log] = await app.db.insert(taskTimeLogs).values({
      taskAssignmentId: task.id,
      staffMemberId: tokenRecord.staffMemberId,
      workDate: new Date(body.workDate),
      hours: String(body.hours),
      description: body.description,
    }).returning();

    // Update task hours
    await app.db.update(taskAssignments).set({
      loggedHours: String(newLogged),
      remainingHours: String(newRemaining),
      timeExhausted,
      updatedAt: new Date(),
    }).where(eq(taskAssignments.id, task.id));

    return reply.status(201).send({ data: log });
  });

  // Contractor portal: request extension via magic link (NO AUTH REQUIRED)
  app.post<{ Params: { token: string; taskId: string } }>('/contractor-portal/:token/tasks/:taskId/request-extension', async (request, reply) => {
    const tokenRecord = await app.db.query.contractorAccessTokens.findFirst({
      where: eq(contractorAccessTokens.token, request.params.token),
    });
    if (!tokenRecord) return reply.notFound('Invalid access link');
    if (new Date() > new Date(tokenRecord.expiresAt)) return reply.badRequest('Link expired');

    const body = z.object({
      requestedHours: z.coerce.number().positive(),
      reason: z.string().min(1),
    }).parse(request.body);

    const task = await app.db.query.taskAssignments.findFirst({
      where: and(
        eq(taskAssignments.id, request.params.taskId),
        eq(taskAssignments.staffMemberId, tokenRecord.staffMemberId),
      ),
    });
    if (!task) return reply.notFound('Task not found');
    if (!task.timeExhausted) return reply.badRequest('Time is not exhausted for this task');

    const [ext] = await app.db.insert(timeExtensionRequests).values({
      taskAssignmentId: task.id,
      staffMemberId: tokenRecord.staffMemberId,
      requestedHours: String(body.requestedHours),
      reason: body.reason,
    }).returning();

    // Notify PM
    const reqStaff = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.id, tokenRecord.staffMemberId),
    });
    createBroadcastNotification(app, {
      type: 'TIMESHEET_SUBMITTED',
      priority: 'HIGH',
      title: 'Time Extension Requested',
      message: `${reqStaff?.name || 'A staff member'} has requested ${body.requestedHours} additional hours on task "${task.title}". Reason: ${body.reason}`,
      actionUrl: `/pm/tasks/${task.id}`,
      referenceType: 'TASK_ASSIGNMENT',
      referenceId: task.id,
    }).catch(() => {});

    return reply.status(201).send({ data: ext });
  });

  // PM logs time ON BEHALF of a staff member
  app.post<{ Params: { taskId: string } }>('/tasks/:taskId/log-time-on-behalf', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({
      staffMemberId: z.string().uuid(),
      workDate: z.string(),
      hours: z.coerce.number().positive(),
      description: z.string().min(1),
    }).parse(request.body);

    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.taskId),
    });
    if (!task) return reply.notFound('Task not found');

    const newLogged = Number(task.loggedHours) + body.hours;
    const newRemaining = Math.max(0, Number(task.allocatedHours) - newLogged);
    const timeExhausted = newLogged >= Number(task.allocatedHours);

    const [log] = await app.db.insert(taskTimeLogs).values({
      taskAssignmentId: task.id,
      staffMemberId: body.staffMemberId,
      workDate: new Date(body.workDate),
      hours: String(body.hours),
      description: body.description,
      status: 'APPROVED', // PM-entered time is auto-approved
      approvedBy: request.session?.user?.id,
      approvedAt: new Date(),
    }).returning();

    await app.db.update(taskAssignments).set({
      loggedHours: String(newLogged),
      remainingHours: String(newRemaining),
      timeExhausted,
      updatedAt: new Date(),
    }).where(eq(taskAssignments.id, task.id));

    return reply.status(201).send({ data: log });
  });
}
