import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, sql, and, desc, asc, ilike, or, gte, lte, notInArray, inArray } from 'drizzle-orm';
import {
  staffMembers, staffProjectAssignments, taskAssignments, taskTimeLogs,
  timeExtensionRequests, staffPayments, projects, projectMilestones, budgetLineItems,
  contractorAccessTokens, taskCodes, sowDocuments, staffTaskPlannerEntries, taskRequests,
  taskDeliverables, deliverableLogs,
  user as authUsers,
} from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { createNotification, createBroadcastNotification } from '../../services/notifications.js';
import { regenerateSowFromTasks } from '../../services/sow-regen.js';
import { sendEmail, isEmailConfigured } from '../../services/email.js';
import { config } from '../../config.js';
import crypto from 'node:crypto';

// ==========================================
// ZOD SCHEMAS
// ==========================================

const createStaffMemberSchema = z.object({
  userId: z.string().nullable().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.string().optional().nullable().transform((v) => (v && v.trim()) || 'Staff Member'),
  skills: z.array(z.string()).default([]),
  availabilityType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).default('FULL_TIME'),
  maxHoursPerMonth: z.coerce.number().int().positive().default(160),
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
  // Role on the project — falls back to the staff member's default role if omitted.
  role: z.string().optional().nullable(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  totalAllocatedHours: z.coerce.number().min(0).default(0),
  notes: z.string().nullable().optional(),
});

const updateAssignmentSchema = z.object({
  role: z.string().optional().nullable(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  totalAllocatedHours: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const createTaskAssignmentSchema = z.object({
  staffMemberId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable().optional(),
  taskCodeId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  estimatedHours: z.coerce.number().positive().nullable().optional(), // PM's original estimate
  allocatedHours: z.coerce.number().positive(),
  hourlyRate: z.coerce.number().positive(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  // deliverables are managed separately via /tasks/:id/deliverables endpoints
  deliverables: z.array(z.object({ title: z.string(), description: z.string().optional(), estimatedHours: z.number().optional() })).nullable().optional(),
});

const updateTaskAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
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

const plannerWeekQuerySchema = z.object({
  start: z.string().optional(), // YYYY-MM-DD
});

const plannerMonthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const workflowGuideQuerySchema = z.object({
  projectIds: z.string().min(1), // comma-separated UUIDs
});

// plannedHours is now the TOTAL hours across the span (start..end inclusive),
// not per-day. UI shows the implied per-day rate.
const upsertPlannerEntrySchema = z.object({
  taskAssignmentId: z.string().uuid(),
  plannedDate: z.string(), // YYYY-MM-DD — span start
  endDate: z.string().nullable().optional(), // YYYY-MM-DD — span end (omit/null = single day)
  plannedHours: z.coerce.number().min(0).max(2000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  slotStart: z.string().nullable().optional(),
  slotEnd: z.string().nullable().optional(),
});

const updatePlannerEntrySchema = z.object({
  plannedDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  plannedHours: z.coerce.number().min(0).max(2000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  slotStart: z.string().nullable().optional(),
  slotEnd: z.string().nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, {
  message: 'At least one field is required to update planner entry',
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

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(d: Date) {
  const base = startOfDay(d);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(base, diff);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function formatYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function safeDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

async function triggerPasswordSetupEmail(app: FastifyInstance, email: string, frontendUrl: string) {
  try {
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      payload: { email, redirectTo: `${frontendUrl.replace(/\/$/, '')}/reset-password` },
      headers: {
        'content-type': 'application/json',
        origin: frontendUrl,
      },
    });

    if (resetRes.statusCode < 200 || resetRes.statusCode >= 300) {
      app.log.warn(`Password setup trigger returned ${resetRes.statusCode} for ${email}`);
      return false;
    }

    return true;
  } catch (e) {
    app.log.warn(`Password setup trigger failed for ${email}: ${e}`);
    return false;
  }
}

// ==========================================
// ROUTES
// ==========================================

export async function projectManagementRoutes(app: FastifyInstance) {

  // ==========================================
  // TASK CODES CRUD
  // ==========================================

  app.get('/task-codes', { preHandler: requireAuth }, async () => {
    const codes = await app.db.query.taskCodes.findMany({
      where: eq(taskCodes.isActive, true),
      orderBy: (c, { asc }) => [asc(c.code)],
    });
    return { data: codes };
  });

  app.post('/task-codes', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({
      code: z.string().min(1).max(20).transform(v => v.toUpperCase().replace(/\s+/g, '-')),
      name: z.string().min(1),
      category: z.string().min(1),
      description: z.string().nullable().optional(),
    }).parse(request.body);

    // Check uniqueness
    const existing = await app.db.query.taskCodes.findFirst({
      where: eq(taskCodes.code, body.code),
    });
    if (existing) return reply.badRequest(`Task code "${body.code}" already exists`);

    const [code] = await app.db.insert(taskCodes).values({
      code: body.code,
      name: body.name,
      category: body.category,
      description: body.description || null,
      createdBy: request.session?.user?.id,
    }).returning();

    return reply.status(201).send({ data: code });
  });

  app.patch<{ Params: { id: string } }>('/task-codes/:id', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    const [updated] = await app.db.update(taskCodes).set(body)
      .where(eq(taskCodes.id, request.params.id)).returning();
    if (!updated) return reply.notFound('Task code not found');
    return { data: updated };
  });

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
  // For internal staff without an existing user account, auto-creates a system login
  app.post('/staff', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = createStaffMemberSchema.parse(request.body);
    const currentUserId = request.session?.user?.id;

    let linkedUserId = body.userId || null;

    // Auto-create system account for internal staff who don't have one
    if (body.isInternal && !linkedUserId) {
      // Check if a user with this email already exists
      const existingUser = await app.db.query.user.findFirst({
        where: eq(authUsers.email, body.email),
        columns: { id: true },
      });

      if (existingUser) {
        // Link to existing account
        linkedUserId = existingUser.id;
      } else {
        // Create new user via Better Auth sign-up endpoint
        const tempPassword = crypto.randomBytes(16).toString('hex'); // random, user will reset
        const origin = process.env.BETTER_AUTH_URL || `http://localhost:${config.port}`;

        const signUpResponse = await fetch(`${origin}/api/auth/sign-up/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({
            email: body.email,
            name: body.name,
            password: tempPassword,
          }),
        });

        if (!signUpResponse.ok) {
          const errText = await signUpResponse.text();
          app.log.error(`Failed to create user account for staff: ${errText}`);
          return reply.badRequest(`Failed to create system account: ${errText}`);
        }

        const { user: newUser } = await signUpResponse.json() as { user: { id: string } };
        linkedUserId = newUser.id;

        // Set role to STAFF
        await app.db
          .update(authUsers)
          .set({ role: 'STAFF', updatedAt: new Date() })
          .where(eq(authUsers.id, newUser.id));

        const frontendUrl = config.web.url;

        // In development, log the temporary password so the PM can share it for testing
        if (config.nodeEnv === 'development') {
          app.log.info(`========================================`);
          app.log.info(`NEW STAFF ACCOUNT CREATED`);
          app.log.info(`Name: ${body.name}`);
          app.log.info(`Email: ${body.email}`);
          app.log.info(`Temporary password: ${tempPassword}`);
          app.log.info(`Login: ${frontendUrl}/login`);
          app.log.info(`========================================`);
        }

        // Trigger password setup so the new staff member can set their own password
        await triggerPasswordSetupEmail(app, body.email, frontendUrl);

        // Send welcome email
        if (isEmailConfigured()) {
          try {
            await sendEmail({
              to: body.email,
              subject: 'Welcome to Xarra Books — Your Account Has Been Created',
              html: `
                <div style="font-family: 'Inter', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
                  <h2 style="color: #1f2937; margin-bottom: 16px;">Welcome to Xarra Books</h2>
                  <p style="color: #4b5563; line-height: 1.6;">Hi ${body.name},</p>
                  <p style="color: #4b5563; line-height: 1.6;">
                    A staff account has been created for you on the Xarra Books Management System.
                    You'll receive a separate email to set your password.
                  </p>
                  <p style="color: #4b5563; line-height: 1.6;"><strong>Your role:</strong> ${body.role}</p>
                  <p style="color: #4b5563; line-height: 1.6;"><strong>Email:</strong> ${body.email}</p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${frontendUrl}/login"
                       style="background-color: #8B1A1A; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
                      Go to Xarra Books
                    </a>
                  </div>
                  <p style="color: #9ca3af; font-size: 13px;">
                    If you have questions, please contact your project manager.
                  </p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                  <p style="color: #d1d5db; font-size: 11px; text-align: center;">Xarra Books &mdash; We mainstream the African book</p>
                </div>
              `,
            });
            app.log.info(`Welcome email sent to ${body.email}`);
          } catch (emailErr) {
            app.log.warn(`Welcome email failed for ${body.email}: ${emailErr}`);
          }
        }
      }
    }

    const [staff] = await app.db.insert(staffMembers).values({
      userId: linkedUserId,
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      role: body.role,
      skills: body.skills,
      availabilityType: body.availabilityType,
      maxHoursPerMonth: body.maxHoursPerMonth,
      hourlyRate: String(body.hourlyRate),
      currency: body.currency,
      isInternal: body.isInternal,
      notes: body.notes || null,
      createdBy: currentUserId,
    }).returning();

    return reply.status(201).send({
      data: staff,
      accountCreated: body.isInternal && !body.userId && !!linkedUserId,
    });
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
    if (body.maxHoursPerMonth !== undefined) updates.maxHoursPerMonth = body.maxHoursPerMonth;
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

  // List staff assigned to a project — totals derived live from task assignments
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/team', {
    preHandler: requireAuth,
  }, async (request) => {
    const items = await app.db.query.staffProjectAssignments.findMany({
      where: eq(staffProjectAssignments.projectId, request.params.projectId),
      with: { staffMember: true, project: true },
      orderBy: (a, { asc }) => [asc(a.createdAt)],
    });

    // Live totals from task assignments (excludes CANCELLED tasks)
    const projectTasks = await app.db.query.taskAssignments.findMany({
      where: and(
        eq(taskAssignments.projectId, request.params.projectId),
        notInArray(taskAssignments.status, ['CANCELLED']),
      ),
      columns: { staffMemberId: true, allocatedHours: true, loggedHours: true },
    });
    const totalsByStaff = new Map<string, { allocated: number; logged: number }>();
    for (const t of projectTasks) {
      const cur = totalsByStaff.get(t.staffMemberId) || { allocated: 0, logged: 0 };
      cur.allocated += Number(t.allocatedHours || 0);
      cur.logged += Number(t.loggedHours || 0);
      totalsByStaff.set(t.staffMemberId, cur);
    }

    // Fetch all SOWs for this project so we can show per-member SOW status
    const projectSows = await app.db.query.sowDocuments.findMany({
      where: eq(sowDocuments.projectId, request.params.projectId),
      columns: { id: true, number: true, status: true, staffUserId: true, contractorId: true },
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });
    // Index by staffUserId (most recent wins — already desc ordered)
    const sowByUserId = new Map<string, typeof projectSows[number]>();
    for (const sow of projectSows) {
      if (sow.staffUserId && !sowByUserId.has(sow.staffUserId)) {
        sowByUserId.set(sow.staffUserId, sow);
      }
    }

    const enriched = items.map((a) => {
      const live = totalsByStaff.get(a.staffMemberId);
      const allocatedFromTasks = live?.allocated ?? 0;
      const loggedFromTasks = live?.logged ?? 0;
      // Match SOW via the staff member's Better Auth userId
      const sow = a.staffMember?.userId ? sowByUserId.get(a.staffMember.userId) : undefined;
      return {
        ...a,
        totalAllocatedHours: String(
          Math.max(Number(a.totalAllocatedHours || 0), allocatedFromTasks),
        ),
        totalLoggedHours: String(
          Math.max(Number(a.totalLoggedHours || 0), loggedFromTasks),
        ),
        sow: sow ? { id: sow.id, number: sow.number, status: sow.status } : null,
      };
    });

    return { data: enriched };
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

    // Contractor SOW requirement is enforced at task creation time, not at team assignment.
    // This lets a PM add a contractor to a project before issuing the SOW.

    const [assignment] = await app.db.insert(staffProjectAssignments).values({
      staffMemberId: body.staffMemberId,
      projectId: request.params.projectId,
      role: body.role || staff.role,
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

  // Workflow guide for multiple projects.
  // Returns checklist completion, blockers, and the next recommended action per project.
  app.get('/projects/workflow-guide', {
    preHandler: requireAuth,
  }, async (request) => {
    const query = workflowGuideQuerySchema.parse(request.query);

    const projectIds = Array.from(new Set(
      query.projectIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ));

    const validProjectIds = z.array(z.string().uuid()).max(100).parse(projectIds);
    if (validProjectIds.length === 0) return { data: [] };

    const [projectRows, milestoneRows, budgetLineRows, teamRows, acceptedSowRows, taskRows] = await Promise.all([
      app.db.query.projects.findMany({
        where: inArray(projects.id, validProjectIds),
        columns: { id: true, number: true, name: true, status: true },
      }),
      app.db
        .select({ projectId: projectMilestones.projectId, count: sql<number>`count(*)` })
        .from(projectMilestones)
        .where(inArray(projectMilestones.projectId, validProjectIds))
        .groupBy(projectMilestones.projectId),
      app.db
        .select({ projectId: budgetLineItems.projectId, count: sql<number>`count(*)` })
        .from(budgetLineItems)
        .where(inArray(budgetLineItems.projectId, validProjectIds))
        .groupBy(budgetLineItems.projectId),
      app.db
        .select({ projectId: staffProjectAssignments.projectId, count: sql<number>`count(*)` })
        .from(staffProjectAssignments)
        .where(and(
          inArray(staffProjectAssignments.projectId, validProjectIds),
          eq(staffProjectAssignments.isActive, true),
        ))
        .groupBy(staffProjectAssignments.projectId),
      app.db
        .select({ projectId: sowDocuments.projectId, count: sql<number>`count(*)` })
        .from(sowDocuments)
        .where(and(
          inArray(sowDocuments.projectId, validProjectIds),
          eq(sowDocuments.status, 'ACCEPTED'),
        ))
        .groupBy(sowDocuments.projectId),
      app.db
        .select({
          projectId: taskAssignments.projectId,
          taskCount: sql<number>`count(*)`,
          startedCount: sql<number>`count(*) filter (where ${taskAssignments.status} in ('ASSIGNED','IN_PROGRESS','REVIEW','COMPLETED'))`,
          reviewCount: sql<number>`count(*) filter (where ${taskAssignments.status} = 'REVIEW')`,
          completedCount: sql<number>`count(*) filter (where ${taskAssignments.status} = 'COMPLETED')`,
        })
        .from(taskAssignments)
        .where(inArray(taskAssignments.projectId, validProjectIds))
        .groupBy(taskAssignments.projectId),
    ]);

    const milestoneCountByProject = new Map(milestoneRows.map((r) => [r.projectId, Number(r.count)]));
    const budgetLineCountByProject = new Map(budgetLineRows.map((r) => [r.projectId, Number(r.count)]));
    const teamCountByProject = new Map(teamRows.map((r) => [r.projectId, Number(r.count)]));
    const acceptedSowCountByProject = new Map(acceptedSowRows.map((r) => [r.projectId, Number(r.count)]));
    const taskStatsByProject = new Map(taskRows.map((r) => [r.projectId, {
      taskCount: Number(r.taskCount),
      startedCount: Number(r.startedCount),
      reviewCount: Number(r.reviewCount),
      completedCount: Number(r.completedCount),
    }]));

    const projectById = new Map(projectRows.map((p) => [p.id, p]));

    const data = validProjectIds
      .map((projectId) => {
        const project = projectById.get(projectId);
        if (!project) return null;

        const milestoneCount = milestoneCountByProject.get(projectId) || 0;
        const budgetLineCount = budgetLineCountByProject.get(projectId) || 0;
        const teamCount = teamCountByProject.get(projectId) || 0;
        const acceptedSowCount = acceptedSowCountByProject.get(projectId) || 0;
        const taskStats = taskStatsByProject.get(projectId) || {
          taskCount: 0,
          startedCount: 0,
          reviewCount: 0,
          completedCount: 0,
        };

        // ── Build full 8-stage breakdown ──────────────────────────────────────
        type StageStatus = 'COMPLETED' | 'CURRENT' | 'BLOCKED' | 'UPCOMING';
        type StageAction = { label: string; href: string };
        type StageEntry = { key: string; name: string; status: StageStatus; blockers: string[]; action?: StageAction };

        const budgetApproved = project.status === 'IN_PROGRESS' || project.status === 'COMPLETED';
        const allTasksDone = taskStats.taskCount > 0 && taskStats.completedCount === taskStats.taskCount;
        const projectComplete = project.status === 'COMPLETED';

        // Determine highest completed stage index (0-based) to assign UPCOMING to later ones
        let currentStageIndex = 0;
        if (projectComplete) {
          currentStageIndex = 7;
        } else if (allTasksDone) {
          currentStageIndex = 7;
        } else if (taskStats.taskCount > 0) {
          currentStageIndex = 6;
        } else if (taskStats.taskCount === 0 && budgetApproved && acceptedSowCount > 0) {
          currentStageIndex = 5;
        } else if (budgetApproved && teamCount > 0 && acceptedSowCount === 0) {
          currentStageIndex = 4;
        } else if (budgetApproved && teamCount === 0) {
          currentStageIndex = 3;
        } else if (project.status === 'BUDGETED') {
          currentStageIndex = 2;
        } else if (milestoneCount > 0) {
          currentStageIndex = 1;
        } else {
          currentStageIndex = 0;
        }

        const stage1Blockers: string[] = [];
        const stage2Blockers: string[] = [];
        const stage3Blockers: string[] = [];
        const stage4Blockers: string[] = [];
        const stage5Blockers: string[] = [];
        const stage6Blockers: string[] = [];
        const stage7Blockers: string[] = [];
        const stage8Blockers: string[] = [];

        if (currentStageIndex === 1 && milestoneCount === 0) stage2Blockers.push('No milestones defined yet');
        if (currentStageIndex === 1 && budgetLineCount === 0) stage2Blockers.push('No budget lines added yet');
        if (currentStageIndex === 3 && teamCount === 0) stage4Blockers.push('No team members assigned yet');
        if (currentStageIndex === 4 && acceptedSowCount === 0) stage5Blockers.push('No accepted SOW yet');
        if (currentStageIndex === 5 && taskStats.taskCount === 0) stage6Blockers.push('No tasks created from SOW');
        if (currentStageIndex === 6 && taskStats.reviewCount > 0) stage7Blockers.push(`${taskStats.reviewCount} task(s) awaiting your review`);

        const stageCompleted = (i: number) => i < currentStageIndex || (i === 7 && projectComplete);
        const stageCurrent = (i: number) => i === currentStageIndex && !(i === 7 && projectComplete);

        const stageBlockers = [stage1Blockers, stage2Blockers, stage3Blockers, stage4Blockers, stage5Blockers, stage6Blockers, stage7Blockers, stage8Blockers];
        const stageActions: (StageAction | undefined)[] = [
          { label: 'Open project', href: `/budgeting/projects/${projectId}` },
          { label: 'Add milestones & budget', href: `/budgeting/projects/${projectId}` },
          { label: 'Approve budget', href: `/budgeting/projects/${projectId}` },
          { label: 'Assign team members', href: `/pm/projects/${projectId}/team` },
          { label: 'Create & send SOW', href: `/pm/projects/${projectId}/team` },
          { label: 'Create first task', href: `/pm/projects/${projectId}/tasks/new` },
          { label: taskStats.reviewCount > 0 ? 'Review submitted tasks' : 'Track task progress', href: `/pm/projects/${projectId}/tasks` },
          { label: 'View completed project', href: `/budgeting/projects/${projectId}` },
        ];
        const stageNames = ['Create Project', 'Define Budget', 'Approve Budget', 'Assign Team', 'Create & Accept SOW', 'Create Tasks', 'Execute & Review', 'Close Project'];
        const stageKeys = ['PROJECT_SETUP', 'BUDGET_PLANNING', 'BUDGET_APPROVAL', 'TEAM_ASSEMBLY', 'SOW_CREATION', 'TASK_CREATION', 'EXECUTION', 'COMPLETION'];

        const stages: StageEntry[] = stageKeys.map((key, i) => {
          let status: StageStatus;
          if (stageCompleted(i)) {
            status = 'COMPLETED';
          } else if (stageCurrent(i)) {
            status = stageBlockers[i].length > 0 ? 'BLOCKED' : 'CURRENT';
          } else {
            status = 'UPCOMING';
          }
          return {
            key,
            name: stageNames[i],
            status,
            blockers: stageBlockers[i],
            action: stageActions[i],
          };
        });

        // ── Legacy fields (backwards-compatible) ─────────────────────────────
        const currentStage = stages[currentStageIndex];
        const legacyBlockers = currentStage.blockers;
        const legacyStage = currentStage.name;

        let nextAction = stageActions[currentStageIndex] ?? { label: 'Open project', href: `/budgeting/projects/${projectId}`, code: 'VIEW_PROJECT' };

        if (project.status === 'PLANNING') {
          if (milestoneCount === 0) {
            nextAction = { code: 'ADD_MILESTONES', label: 'Add milestones', href: `/budgeting/projects/${projectId}` } as typeof nextAction;
          } else if (budgetLineCount === 0) {
            nextAction = { code: 'BUILD_BUDGET', label: 'Add budget lines', href: `/budgeting/projects/${projectId}` } as typeof nextAction;
          } else {
            nextAction = { code: 'SUBMIT_BUDGET', label: 'Submit budget for approval', href: `/budgeting/projects/${projectId}` } as typeof nextAction;
          }
        } else if (project.status === 'BUDGETED') {
          nextAction = { code: 'APPROVE_BUDGET', label: 'Approve and start project', href: `/budgeting/projects/${projectId}` } as typeof nextAction;
        } else if (project.status === 'IN_PROGRESS') {
          if (teamCount === 0) {
            nextAction = { code: 'ASSIGN_TEAM', label: 'Assign project team', href: `/pm/projects/${projectId}/team` } as typeof nextAction;
          } else if (acceptedSowCount === 0) {
            nextAction = { code: 'CREATE_SOW', label: 'Create and accept SOW', href: `/pm/projects/${projectId}/team` } as typeof nextAction;
          } else if (taskStats.taskCount === 0) {
            nextAction = { code: 'CREATE_TASKS', label: 'Create first task', href: `/pm/projects/${projectId}/tasks/new` } as typeof nextAction;
          } else if (taskStats.reviewCount > 0) {
            nextAction = { code: 'REVIEW_TASKS', label: 'Review submitted tasks', href: `/pm/projects/${projectId}/tasks` } as typeof nextAction;
          } else if (allTasksDone) {
            nextAction = { code: 'COMPLETE_PROJECT', label: 'Mark project complete', href: `/budgeting/projects/${projectId}` } as typeof nextAction;
          } else {
            nextAction = { code: 'TRACK_PROGRESS', label: 'Track task progress', href: `/pm/projects/${projectId}/tasks` } as typeof nextAction;
          }
        } else if (project.status === 'COMPLETED') {
          nextAction = { code: 'VIEW_PROJECT', label: 'View final project record', href: `/budgeting/projects/${projectId}` } as typeof nextAction;
        } else if (project.status === 'CANCELLED') {
          nextAction = { code: 'VIEW_PROJECT', label: 'View project record', href: `/budgeting/projects/${projectId}` } as typeof nextAction;
        }

        const doneCount = stages.filter((s) => s.status === 'COMPLETED').length;
        const progressPercent = Math.round((doneCount / stages.length) * 100);

        return {
          projectId,
          projectNumber: project.number,
          projectName: project.name,
          projectStatus: project.status,
          stage: legacyStage,
          blockers: legacyBlockers,
          stages,
          progressPercent,
          nextAction,
        };
      })
      .filter(Boolean);

    return { data };
  });

  // Project overview summary — used by the PM project overview page
  app.get('/projects/:projectId/overview', {
    preHandler: requireAuth,
  }, async (request) => {
    const { projectId } = z.object({ projectId: z.string().uuid() }).parse(request.params);

    const [project, teamRows, taskRows, sowRows, milestoneRows, budgetRows] = await Promise.all([
      app.db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { id: true, number: true, name: true, status: true, projectType: true, startDate: true, targetCompletionDate: true, totalBudget: true, totalActual: true, currency: true, authorId: true },
      }),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(staffProjectAssignments)
        .where(and(eq(staffProjectAssignments.projectId, projectId), eq(staffProjectAssignments.isActive, true))),
      app.db
        .select({
          total: sql<number>`count(*)`,
          draft: sql<number>`count(*) filter (where ${taskAssignments.status} = 'DRAFT')`,
          assigned: sql<number>`count(*) filter (where ${taskAssignments.status} = 'ASSIGNED')`,
          inProgress: sql<number>`count(*) filter (where ${taskAssignments.status} = 'IN_PROGRESS')`,
          review: sql<number>`count(*) filter (where ${taskAssignments.status} = 'REVIEW')`,
          completed: sql<number>`count(*) filter (where ${taskAssignments.status} = 'COMPLETED')`,
          cancelled: sql<number>`count(*) filter (where ${taskAssignments.status} = 'CANCELLED')`,
        })
        .from(taskAssignments)
        .where(eq(taskAssignments.projectId, projectId)),
      app.db
        .select({
          total: sql<number>`count(*)`,
          accepted: sql<number>`count(*) filter (where ${sowDocuments.status} = 'ACCEPTED')`,
        })
        .from(sowDocuments)
        .where(eq(sowDocuments.projectId, projectId)),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, projectId)),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(budgetLineItems)
        .where(eq(budgetLineItems.projectId, projectId)),
    ]);

    if (!project) {
      throw app.httpErrors.notFound('Project not found');
    }

    const totalBudget = Number(project.totalBudget ?? 0);
    const totalActual = Number(project.totalActual ?? 0);

    return {
      project: {
        id: project.id,
        number: project.number,
        name: project.name,
        status: project.status,
        projectType: project.projectType,
        startDate: project.startDate,
        targetCompletionDate: project.targetCompletionDate,
        currency: project.currency,
        authorId: project.authorId,
      },
      counts: {
        teamMembers: Number(teamRows[0]?.count ?? 0),
        tasks: {
          total: Number(taskRows[0]?.total ?? 0),
          byStatus: {
            DRAFT: Number(taskRows[0]?.draft ?? 0),
            ASSIGNED: Number(taskRows[0]?.assigned ?? 0),
            IN_PROGRESS: Number(taskRows[0]?.inProgress ?? 0),
            REVIEW: Number(taskRows[0]?.review ?? 0),
            COMPLETED: Number(taskRows[0]?.completed ?? 0),
            CANCELLED: Number(taskRows[0]?.cancelled ?? 0),
          },
        },
        sows: {
          total: Number(sowRows[0]?.total ?? 0),
          accepted: Number(sowRows[0]?.accepted ?? 0),
        },
        milestones: Number(milestoneRows[0]?.count ?? 0),
        budgetLines: Number(budgetRows[0]?.count ?? 0),
      },
      budget: {
        totalBudget,
        totalActual,
        percentSpent: totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0,
      },
    };
  });

  // List tasks for a project
  // List all tasks (for reports — PM/admin only)
  app.get('/tasks', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? or(ilike(taskAssignments.title, `%${search}%`), ilike(taskAssignments.number, `%${search}%`))
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.taskAssignments.findMany({
        where: where ? () => where : undefined,
        with: { staffMember: true, project: true, taskCode: true },
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

  app.get<{ Params: { projectId: string } }>('/projects/:projectId/tasks', {
    preHandler: requireAuth,
  }, async (request) => {
    const query = paginationSchema.extend({
      status: z.string().optional(),
    }).parse(request.query);
    const { page, limit, search, status } = query;
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
    if (status) conditions.push(eq(taskAssignments.status, status as any));
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
        taskCode: true,
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

    // SOW-first workflow: every staff member (internal or contractor) requires an ACCEPTED
    // SOW for this project before tasks can be created. The SOW defines the scope of work
    // and tasks are derived from it.
    const acceptedSow = await app.db.query.sowDocuments.findFirst({
      where: and(
        eq(sowDocuments.projectId, request.params.projectId),
        eq(sowDocuments.status, 'ACCEPTED'),
      ),
    });
    if (!acceptedSow) {
      return reply.badRequest(
        'Cannot create task: an ACCEPTED SOW is required for this project before tasks can be created. The SOW defines the scope of work; tasks are derived from it.',
      );
    }

    // Capacity check — monthly model.
    // The new task is attributed to the calendar month containing its due date (or this month if no due date).
    // Sum of allocated hours for tasks in that month must stay within maxHoursPerMonth.
    const maxMonthly = staff.maxHoursPerMonth || 160;
    const targetMonthRef = body.dueDate ? new Date(body.dueDate) : new Date();
    const monthStart = new Date(targetMonthRef.getFullYear(), targetMonthRef.getMonth(), 1);
    const monthEnd = new Date(targetMonthRef.getFullYear(), targetMonthRef.getMonth() + 1, 0, 23, 59, 59);

    const monthTasks = await app.db.query.taskAssignments.findMany({
      where: and(
        eq(taskAssignments.staffMemberId, body.staffMemberId),
        notInArray(taskAssignments.status, ['CANCELLED']),
        gte(taskAssignments.dueDate, monthStart),
        lte(taskAssignments.dueDate, monthEnd),
      ),
      columns: { allocatedHours: true },
    });
    const monthAllocated = monthTasks.reduce((sum, t) => sum + Number(t.allocatedHours || 0), 0);
    if (monthAllocated + body.allocatedHours > maxMonthly) {
      const monthLabel = monthStart.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
      return reply.badRequest(
        `Cannot create task: ${staff.name} already has ${monthAllocated.toFixed(1)}h allocated in ${monthLabel}. Adding ${body.allocatedHours}h would exceed the monthly cap of ${maxMonthly}h. Push the due date to next month, reduce hours, or raise the staff member's monthly capacity.`,
      );
    }

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
      taskCodeId: body.taskCodeId || null,
      staffMemberId: body.staffMemberId,
      title: body.title,
      description: body.description || null,
      priority: body.priority,
      estimatedHours: body.estimatedHours ? String(body.estimatedHours) : null,
      allocatedHours: String(body.allocatedHours),
      loggedHours: '0',
      remainingHours: String(body.allocatedHours),
      hourlyRate: String(body.hourlyRate),
      totalCost: String(totalCost),
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      assignedBy: userId,
      status: 'ASSIGNED',
    }).returning();

    // Create initial deliverables if provided inline
    if (body.deliverables && body.deliverables.length > 0) {
      await app.db.insert(taskDeliverables).values(
        body.deliverables.map((d, i) => ({
          taskAssignmentId: task.id,
          title: d.title,
          description: d.description || null,
          estimatedHours: d.estimatedHours ? String(d.estimatedHours) : null,
          sortOrder: i,
          createdBy: userId,
        }))
      );
    }

    // Auto-regen the SOW so its cost breakdown reflects the new task.
    regenerateSowFromTasks(app, {
      projectId: request.params.projectId,
      staffMemberId: body.staffMemberId,
      reason: `Task added: ${task.title}`,
      userId,
    }).catch((e) => app.log.error({ err: e }, 'SOW regen failed after task create'));

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
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await app.db.update(taskAssignments)
      .set(updates)
      .where(eq(taskAssignments.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Task assignment not found');
    return { data: updated };
  });

  // ==========================================
  // TASK WORKFLOW — enforced status transitions
  //
  // DRAFT/ASSIGNED → IN_PROGRESS   (assigned staff only)
  // IN_PROGRESS    → REVIEW        (assigned staff only, requires ≥1 time log, all logs approved)
  // REVIEW         → COMPLETED     (PM/admin only, all logs approved, no pending extensions)
  // REVIEW         → IN_PROGRESS   (PM sends back for rework)
  // Any            → CANCELLED     (PM/admin only)
  // ==========================================

  // Start task → IN_PROGRESS (assigned staff or PM)
  app.post<{ Params: { id: string } }>('/tasks/:id/start', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
      with: { staffMember: true },
    });
    if (!task) return reply.notFound('Task assignment not found');
    if (task.status !== 'ASSIGNED' && task.status !== 'DRAFT') {
      return reply.badRequest('Task can only be started from DRAFT or ASSIGNED status');
    }

    // Verify caller is the assigned staff or a PM/admin
    const userId = request.session?.user?.id;
    const isAssignedStaff = task.staffMember?.userId === userId;
    const userRole = (request.session?.user as any)?.role?.toLowerCase() || '';
    const isPMOrAdmin = ['admin', 'project_manager', 'projectmanager'].includes(userRole.replace(/_/g, ''));
    if (!isAssignedStaff && !isPMOrAdmin) {
      return reply.forbidden('Only the assigned staff member or a PM can start this task');
    }

    const [updated] = await app.db.update(taskAssignments)
      .set({ status: 'IN_PROGRESS', startDate: task.startDate || new Date(), updatedAt: new Date() })
      .where(eq(taskAssignments.id, request.params.id))
      .returning();

    // Notify PM that staff started working
    if (isAssignedStaff && task.assignedBy) {
      createNotification(app, {
        userId: task.assignedBy,
        type: 'TASK_STARTED' as any,
        title: `Task started: ${task.title}`,
        message: `${task.staffMember?.name || 'Staff'} has started working on "${task.title}"`,
        actionUrl: `/pm/projects/${task.projectId}/tasks/${task.id}`,
      }).catch(() => {});
    }

    return { data: updated };
  });

  // Submit for review → REVIEW (assigned staff only)
  // Requires: at least 1 time log exists AND all logs are APPROVED (none pending)
  app.post<{ Params: { id: string } }>('/tasks/:id/submit-review', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
      with: { staffMember: true, timeLogs: true },
    });
    if (!task) return reply.notFound('Task assignment not found');
    if (task.status !== 'IN_PROGRESS') {
      return reply.badRequest('Task can only be submitted for review from IN_PROGRESS status');
    }

    // Verify caller is the assigned staff
    const userId = request.session?.user?.id;
    const isAssignedStaff = task.staffMember?.userId === userId;
    const userRole = (request.session?.user as any)?.role?.toLowerCase() || '';
    const isPMOrAdmin = ['admin', 'project_manager', 'projectmanager'].includes(userRole.replace(/_/g, ''));
    if (!isAssignedStaff && !isPMOrAdmin) {
      return reply.forbidden('Only the assigned staff member can submit a task for review');
    }

    // Enforce: must have at least one time log
    const logs = task.timeLogs || [];
    if (logs.length === 0) {
      return reply.badRequest('Cannot submit for review: no time has been logged on this task. Please log your hours first.');
    }

    // Enforce: no REJECTED logs (must re-submit or fix them first)
    const rejectedLogs = logs.filter((l) => l.status === 'REJECTED');
    if (rejectedLogs.length > 0) {
      return reply.badRequest(`Cannot submit for review: ${rejectedLogs.length} time log(s) have been rejected. Please dispute or re-submit them.`);
    }

    // Enforce: all logs must be APPROVED (none still in LOGGED status)
    const pendingLogs = logs.filter((l) => l.status === 'LOGGED');
    if (pendingLogs.length > 0) {
      return reply.badRequest(`Cannot submit for review: ${pendingLogs.length} time log(s) are still pending approval. Please wait for PM approval.`);
    }

    const [updated] = await app.db.update(taskAssignments)
      .set({ status: 'REVIEW', updatedAt: new Date() })
      .where(eq(taskAssignments.id, request.params.id))
      .returning();

    // Notify PM that task is ready for review
    if (task.assignedBy) {
      createNotification(app, {
        userId: task.assignedBy,
        type: 'TASK_REVIEW_REQUESTED' as any,
        title: `Task ready for review: ${task.title}`,
        message: `${task.staffMember?.name || 'Staff'} has submitted "${task.title}" for your review. ${logs.length} time log(s), ${Number(task.loggedHours)}h logged.`,
        actionUrl: `/pm/projects/${task.projectId}/tasks/${task.id}`,
      }).catch(() => {});
    }

    return { data: updated };
  });

  // Complete task → COMPLETED (PM/admin only)
  // Requires: all time logs APPROVED, no pending extensions
  app.post<{ Params: { id: string } }>('/tasks/:id/complete', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
      with: { staffMember: true, timeLogs: true, extensionRequests: true },
    });
    if (!task) return reply.notFound('Task assignment not found');
    if (task.status !== 'REVIEW') {
      return reply.badRequest('Task can only be completed from REVIEW status');
    }

    // Enforce: all time logs must be APPROVED
    const logs = task.timeLogs || [];
    const unapprovedLogs = logs.filter((l) => l.status === 'LOGGED');
    if (unapprovedLogs.length > 0) {
      return reply.badRequest(`Cannot complete: ${unapprovedLogs.length} time log(s) still pending approval. Please approve or reject all time logs first.`);
    }

    const rejectedLogs = logs.filter((l) => l.status === 'REJECTED');
    if (rejectedLogs.length > 0) {
      return reply.badRequest(`Cannot complete: ${rejectedLogs.length} rejected time log(s) need resolution. The staff member should dispute or the logs should be removed.`);
    }

    // Enforce: no pending extension requests
    const pendingExtensions = (task.extensionRequests || []).filter((e) => e.status === 'PENDING');
    if (pendingExtensions.length > 0) {
      return reply.badRequest(`Cannot complete: ${pendingExtensions.length} extension request(s) pending. Please approve or decline them first.`);
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

    // Notify staff that task is completed
    if (task.staffMember?.userId) {
      createNotification(app, {
        userId: task.staffMember.userId,
        type: 'TASK_COMPLETED' as any,
        title: `Task completed: ${task.title}`,
        message: `Your task "${task.title}" has been marked as completed and approved.`,
        actionUrl: `/employee`,
      }).catch(() => {});
    }

    return { data: updated };
  });

  // Send back for rework → IN_PROGRESS (PM/admin only, from REVIEW)
  app.post<{ Params: { id: string } }>('/tasks/:id/send-back', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({ reason: z.string().min(1) }).parse(request.body);
    const task = await app.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
      with: { staffMember: true },
    });
    if (!task) return reply.notFound('Task assignment not found');
    if (task.status !== 'REVIEW') {
      return reply.badRequest('Task can only be sent back from REVIEW status');
    }

    const [updated] = await app.db.update(taskAssignments)
      .set({ status: 'IN_PROGRESS', notes: `[Sent back] ${body.reason}${task.notes ? '\n\n' + task.notes : ''}`, updatedAt: new Date() })
      .where(eq(taskAssignments.id, request.params.id))
      .returning();

    // Notify staff
    if (task.staffMember?.userId) {
      createNotification(app, {
        userId: task.staffMember.userId,
        type: 'TASK_SENT_BACK' as any,
        title: `Task sent back: ${task.title}`,
        message: `Your task "${task.title}" has been sent back for rework. Reason: ${body.reason}`,
        actionUrl: `/employee`,
      }).catch(() => {});
    }

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

    // Per-day sanity ceiling
    const MAX_HOURS_PER_DAY = 12;
    if (body.hours > MAX_HOURS_PER_DAY) {
      return reply.badRequest(`Cannot log ${body.hours}h on a single day — above the ${MAX_HOURS_PER_DAY}h sanity limit.`);
    }

    // Validate: hours + loggedHours <= allocatedHours (unless already exhausted)
    if (!task.timeExhausted && (currentLogged + body.hours) > allocated) {
      return reply.badRequest(
        `Cannot log ${body.hours}h — only ${(allocated - currentLogged).toFixed(2)}h remaining. Request a time extension if needed.`,
      );
    }

    // Monthly cap: month-to-date approved+logged hours for this staff member must stay within maxHoursPerMonth.
    const workDate = new Date(body.workDate);
    const maxMonthly = staff.maxHoursPerMonth || 160;
    const monthStart = new Date(workDate.getFullYear(), workDate.getMonth(), 1);
    const monthEnd = new Date(workDate.getFullYear(), workDate.getMonth() + 1, 0, 23, 59, 59);
    const monthLogs = await app.db.query.taskTimeLogs.findMany({
      where: and(
        eq(taskTimeLogs.staffMemberId, staff.id),
        gte(taskTimeLogs.workDate, monthStart),
        lte(taskTimeLogs.workDate, monthEnd),
        sql`${taskTimeLogs.status} <> 'REJECTED'`,
      ),
      columns: { hours: true },
    });
    const monthHours = monthLogs.reduce((sum, l) => sum + Number(l.hours || 0), 0);
    if (monthHours + body.hours > maxMonthly) {
      const monthLabel = monthStart.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
      return reply.badRequest(
        `Cannot log ${body.hours}h — you already have ${monthHours.toFixed(1)}h logged in ${monthLabel} (cap ${maxMonthly}h). Request a time extension or push this work to next month.`,
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
    const body = z.object({ reason: z.string().nullable().optional() }).parse(request.body || {});
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
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      return reply.badRequest('Cannot request extension on a completed or cancelled task');
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
        userId: staffMember.userId,
        recipientEmail: staffMember.email, // send email to staff
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
          recipientEmail: declinedStaff.email, // send email to staff
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

  // My time logs — returns flat DTO matching EmployeeDashboard's TimeLogEntry interface
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
      data: items.map((l) => ({
        id: l.id,
        date: l.workDate,
        hours: Number(l.hours),
        description: l.description,
        status: l.status,
        taskTitle: (l.taskAssignment as any)?.title ?? '',
        projectName: (l.taskAssignment as any)?.project?.name ?? '',
      })),
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // My extension requests — returns flat DTO matching EmployeeDashboard's ExtensionEntry interface
  app.get('/my/extensions', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const items = await app.db.query.timeExtensionRequests.findMany({
      where: eq(timeExtensionRequests.staffMemberId, staff.id),
      with: { taskAssignment: { with: { project: true } } },
      orderBy: (e, { desc }) => [desc(e.createdAt)],
    });
    return {
      data: items.map((e) => ({
        id: e.id,
        requestedHours: Number(e.requestedHours),
        reason: e.reason,
        status: e.status,
        createdAt: e.createdAt,
        taskTitle: (e.taskAssignment as any)?.title ?? '',
        projectName: (e.taskAssignment as any)?.project?.name ?? '',
      })),
    };
  });

  const mapTaskToPlannerDto = (task: any, today: Date) => ({
    id: task.id,
    number: task.number,
    title: task.title,
    status: task.status,
    priority: task.priority,
    projectId: task.project?.id || task.projectId || null,
    projectName: task.project?.name || null,
    projectNumber: task.project?.number || null,
    milestoneName: task.milestone?.name || null,
    startDate: task.startDate,
    dueDate: task.dueDate,
    allocatedHours: Number(task.allocatedHours || 0),
    loggedHours: Number(task.loggedHours || 0),
    remainingHours: Number(task.remainingHours || 0),
    isOverdue: !!(task.dueDate && safeDate(task.dueDate)! < today && task.status !== 'COMPLETED'),
  });

  // Create or update planner entry (span). plannedHours = total across the span.
  app.put('/my/planner/entry', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const body = upsertPlannerEntrySchema.parse(request.body);
    const startDate = safeDate(body.plannedDate);
    if (!startDate) return reply.badRequest('Invalid plannedDate. Use YYYY-MM-DD.');
    const endDate = body.endDate ? safeDate(body.endDate) : null;
    if (body.endDate && !endDate) return reply.badRequest('Invalid endDate. Use YYYY-MM-DD.');
    if (endDate && endDate < startDate) {
      return reply.badRequest('End date must be on or after start date.');
    }

    const task = await app.db.query.taskAssignments.findFirst({
      where: and(
        eq(taskAssignments.id, body.taskAssignmentId),
        eq(taskAssignments.staffMemberId, staff.id),
      ),
    });
    if (!task) return reply.notFound('Task not found for your profile');

    // Per-day sanity ceiling: prevent typos like 80h on a single day.
    const MAX_HOURS_PER_DAY = 12;
    if (body.plannedHours != null) {
      const totalDays = endDate
        ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
        : 1;
      const perDay = body.plannedHours / totalDays;
      if (perDay > MAX_HOURS_PER_DAY) {
        return reply.badRequest(
          `Cannot plan ${body.plannedHours}h over ${totalDays} day${totalDays === 1 ? '' : 's'} — that's ${perDay.toFixed(1)}h/day, above the ${MAX_HOURS_PER_DAY}h/day sanity limit.`,
        );
      }
    }

    // Aggregate-hours block: sum across this task's other planner entries + this new entry ≤ task remaining.
    if (body.plannedHours != null) {
      const remaining = Number(task.remainingHours || 0);
      const otherEntries = await app.db.query.staffTaskPlannerEntries.findMany({
        where: and(
          eq(staffTaskPlannerEntries.staffMemberId, staff.id),
          eq(staffTaskPlannerEntries.taskAssignmentId, body.taskAssignmentId),
        ),
        columns: { plannedHours: true, plannedDate: true },
      });
      const otherSum = otherEntries
        .filter((e) => e.plannedDate.toISOString().slice(0, 10) !== startDate.toISOString().slice(0, 10))
        .reduce((sum, e) => sum + Number(e.plannedHours || 0), 0);
      if (otherSum + body.plannedHours > remaining) {
        return reply.badRequest(
          `Cannot plan ${body.plannedHours}h — task has ${remaining.toFixed(1)}h remaining and ${otherSum.toFixed(1)}h is already planned across other entries. Request a time extension if you need more.`,
        );
      }
    }

    // Monthly cap: sum of plannedHours across ALL of this staff member's entries in the same calendar month.
    // The span is attributed to the calendar month containing its start date.
    if (body.plannedHours != null) {
      const maxMonthly = staff.maxHoursPerMonth || 160;
      const spanMonthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const spanMonthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
      const monthEntries = await app.db.query.staffTaskPlannerEntries.findMany({
        where: and(
          eq(staffTaskPlannerEntries.staffMemberId, staff.id),
          gte(staffTaskPlannerEntries.plannedDate, spanMonthStart),
          lte(staffTaskPlannerEntries.plannedDate, spanMonthEnd),
        ),
        columns: { id: true, plannedHours: true, plannedDate: true, taskAssignmentId: true },
      });
      const monthSumOthers = monthEntries
        .filter((e) =>
          !(e.taskAssignmentId === body.taskAssignmentId &&
            e.plannedDate.toISOString().slice(0, 10) === startDate.toISOString().slice(0, 10)),
        )
        .reduce((sum, e) => sum + Number(e.plannedHours || 0), 0);
      if (monthSumOthers + body.plannedHours > maxMonthly) {
        const monthLabel = spanMonthStart.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
        return reply.badRequest(
          `Cannot plan ${body.plannedHours}h — you already have ${monthSumOthers.toFixed(1)}h planned in ${monthLabel} (cap ${maxMonthly}h). Request a time extension if needed.`,
        );
      }
    }

    const [entry] = await app.db.insert(staffTaskPlannerEntries)
      .values({
        staffMemberId: staff.id,
        taskAssignmentId: body.taskAssignmentId,
        plannedDate: startDate,
        endDate: endDate || null,
        plannedHours: body.plannedHours == null ? null : String(body.plannedHours),
        note: body.note ?? null,
        slotStart: body.slotStart ? new Date(body.slotStart) : null,
        slotEnd: body.slotEnd ? new Date(body.slotEnd) : null,
      })
      .onConflictDoUpdate({
        target: [
          staffTaskPlannerEntries.staffMemberId,
          staffTaskPlannerEntries.taskAssignmentId,
          staffTaskPlannerEntries.plannedDate,
        ],
        set: {
          endDate: endDate || null,
          plannedHours: body.plannedHours == null ? null : String(body.plannedHours),
          note: body.note ?? null,
          slotStart: body.slotStart ? new Date(body.slotStart) : null,
          slotEnd: body.slotEnd ? new Date(body.slotEnd) : null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return { data: entry };
  });

  // Update planner entry details (including shifting date)
  app.patch<{ Params: { id: string } }>('/my/planner/entry/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const body = updatePlannerEntrySchema.parse(request.body);
    const existing = await app.db.query.staffTaskPlannerEntries.findFirst({
      where: and(
        eq(staffTaskPlannerEntries.id, request.params.id),
        eq(staffTaskPlannerEntries.staffMemberId, staff.id),
      ),
    });
    if (!existing) return reply.notFound('Planner entry not found');

    const newStart = body.plannedDate ? (safeDate(body.plannedDate) || existing.plannedDate) : existing.plannedDate;
    const newEnd =
      body.endDate === undefined
        ? existing.endDate
        : (body.endDate == null ? null : safeDate(body.endDate));
    if (newEnd && newEnd < newStart) {
      return reply.badRequest('End date must be on or after start date.');
    }

    // Per-day sanity ceiling on update.
    if (body.plannedHours !== undefined && body.plannedHours != null) {
      const MAX_HOURS_PER_DAY = 12;
      const totalDays = newEnd
        ? Math.max(1, Math.round((newEnd.getTime() - newStart.getTime()) / 86400000) + 1)
        : 1;
      const perDay = body.plannedHours / totalDays;
      if (perDay > MAX_HOURS_PER_DAY) {
        return reply.badRequest(
          `Cannot plan ${body.plannedHours}h over ${totalDays} day${totalDays === 1 ? '' : 's'} — that's ${perDay.toFixed(1)}h/day, above the ${MAX_HOURS_PER_DAY}h/day sanity limit.`,
        );
      }
    }

    // Per-task aggregate block + monthly cap on update.
    if (body.plannedHours !== undefined && body.plannedHours != null) {
      const linkedTask = await app.db.query.taskAssignments.findFirst({
        where: eq(taskAssignments.id, existing.taskAssignmentId),
      });
      if (linkedTask) {
        const remaining = Number(linkedTask.remainingHours || 0);
        const otherEntries = await app.db.query.staffTaskPlannerEntries.findMany({
          where: and(
            eq(staffTaskPlannerEntries.staffMemberId, staff.id),
            eq(staffTaskPlannerEntries.taskAssignmentId, existing.taskAssignmentId),
          ),
          columns: { id: true, plannedHours: true },
        });
        const otherSum = otherEntries
          .filter((e) => e.id !== existing.id)
          .reduce((sum, e) => sum + Number(e.plannedHours || 0), 0);
        if (otherSum + body.plannedHours > remaining) {
          return reply.badRequest(
            `Cannot plan ${body.plannedHours}h — task has ${remaining.toFixed(1)}h remaining and ${otherSum.toFixed(1)}h is already planned across other entries.`,
          );
        }
      }

      // Monthly cap (excluding this entry).
      const maxMonthly = staff.maxHoursPerMonth || 160;
      const spanMonthStart = new Date(newStart.getFullYear(), newStart.getMonth(), 1);
      const spanMonthEnd = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0, 23, 59, 59);
      const monthEntries = await app.db.query.staffTaskPlannerEntries.findMany({
        where: and(
          eq(staffTaskPlannerEntries.staffMemberId, staff.id),
          gte(staffTaskPlannerEntries.plannedDate, spanMonthStart),
          lte(staffTaskPlannerEntries.plannedDate, spanMonthEnd),
        ),
        columns: { id: true, plannedHours: true },
      });
      const monthSumOthers = monthEntries
        .filter((e) => e.id !== existing.id)
        .reduce((sum, e) => sum + Number(e.plannedHours || 0), 0);
      if (monthSumOthers + body.plannedHours > maxMonthly) {
        const monthLabel = spanMonthStart.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
        return reply.badRequest(
          `Cannot plan ${body.plannedHours}h — you already have ${monthSumOthers.toFixed(1)}h planned in ${monthLabel} (cap ${maxMonthly}h).`,
        );
      }
    }

    const [updated] = await app.db.update(staffTaskPlannerEntries)
      .set({
        plannedDate: newStart,
        endDate: newEnd,
        plannedHours: body.plannedHours === undefined
          ? existing.plannedHours
          : (body.plannedHours == null ? null : String(body.plannedHours)),
        note: body.note === undefined ? existing.note : body.note,
        slotStart: body.slotStart === undefined ? existing.slotStart : (body.slotStart ? new Date(body.slotStart) : null),
        slotEnd: body.slotEnd === undefined ? existing.slotEnd : (body.slotEnd ? new Date(body.slotEnd) : null),
        updatedAt: new Date(),
      })
      .where(and(
        eq(staffTaskPlannerEntries.id, request.params.id),
        eq(staffTaskPlannerEntries.staffMemberId, staff.id),
      ))
      .returning();

    return { data: updated };
  });

  // Delete planner entry
  app.delete<{ Params: { id: string } }>('/my/planner/entry/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const [deleted] = await app.db.delete(staffTaskPlannerEntries)
      .where(and(
        eq(staffTaskPlannerEntries.id, request.params.id),
        eq(staffTaskPlannerEntries.staffMemberId, staff.id),
      ))
      .returning();
    if (!deleted) return reply.notFound('Planner entry not found');

    return { data: deleted };
  });

  // Planner analytics: Planned vs Actual (PM/admin)
  app.get('/planner/analytics', { preHandler: requireRole('admin', 'project_manager') }, async (request, reply) => {
    const q = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(request.query);

    const today = new Date();
    const from = safeDate(q.from || null) || addDays(today, -28);
    const to = safeDate(q.to || null) || today;

    // All planner entries in window, joined to task + staff
    const entries = await app.db.query.staffTaskPlannerEntries.findMany({
      where: and(
        gte(staffTaskPlannerEntries.plannedDate, from),
        lte(staffTaskPlannerEntries.plannedDate, to),
      ),
      with: {
        staffMember: true,
        taskAssignment: { with: { project: true, timeLogs: true } },
      },
    });

    // Aggregate per staff member
    const byStaff = new Map<string, {
      staffId: string;
      staffName: string;
      role: string;
      plannedHours: number;
      loggedHours: number;
      plannedEntries: number;
      tasks: Set<string>;
    }>();

    for (const entry of entries) {
      const staff = entry.staffMember;
      if (!staff) continue;
      const key = staff.id;
      if (!byStaff.has(key)) {
        byStaff.set(key, {
          staffId: staff.id,
          staffName: staff.name,
          role: staff.role,
          plannedHours: 0,
          loggedHours: 0,
          plannedEntries: 0,
          tasks: new Set(),
        });
      }
      const row = byStaff.get(key)!;
      row.plannedHours += Number(entry.plannedHours || 0);
      row.plannedEntries += 1;
      row.tasks.add(entry.taskAssignmentId);

      // Sum APPROVED time logs in window for this task by this staff member
      const task = entry.taskAssignment;
      if (task) {
        const entryDateStr = entry.plannedDate.toISOString().slice(0, 10);
        for (const log of task.timeLogs || []) {
          if (log.status !== 'APPROVED') continue;
          const logDateStr = new Date(log.workDate).toISOString().slice(0, 10);
          if (logDateStr === entryDateStr) {
            row.loggedHours += Number(log.hours || 0);
          }
        }
      }
    }

    const rows = Array.from(byStaff.values()).map((r) => {
      const variance = r.loggedHours - r.plannedHours;
      const accuracy = r.plannedHours > 0 ? Math.max(0, 100 - Math.abs(variance / r.plannedHours) * 100) : null;
      return {
        staffId: r.staffId,
        staffName: r.staffName,
        role: r.role,
        plannedHours: Number(r.plannedHours.toFixed(2)),
        loggedHours: Number(r.loggedHours.toFixed(2)),
        variance: Number(variance.toFixed(2)),
        accuracyPercent: accuracy == null ? null : Number(accuracy.toFixed(1)),
        uniqueTasks: r.tasks.size,
        plannedEntries: r.plannedEntries,
      };
    }).sort((a, b) => b.plannedHours - a.plannedHours);

    const totals = rows.reduce(
      (acc, r) => {
        acc.plannedHours += r.plannedHours;
        acc.loggedHours += r.loggedHours;
        return acc;
      },
      { plannedHours: 0, loggedHours: 0 },
    );

    return {
      data: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        totals: {
          plannedHours: Number(totals.plannedHours.toFixed(2)),
          loggedHours: Number(totals.loggedHours.toFixed(2)),
          variance: Number((totals.loggedHours - totals.plannedHours).toFixed(2)),
          accuracyPercent:
            totals.plannedHours > 0
              ? Number(Math.max(0, 100 - Math.abs((totals.loggedHours - totals.plannedHours) / totals.plannedHours) * 100).toFixed(1))
              : null,
        },
        rows,
      },
    };
  });

  // My planner (weekly)
  app.get('/my/planner/week', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const { start } = plannerWeekQuerySchema.parse(request.query);
    const baseDate = safeDate(start || null) || startOfDay(new Date());
    const weekStart = startOfWeekMonday(baseDate);
    const weekEnd = addDays(weekStart, 6);
    const today = startOfDay(new Date());

    const [tasks, plannerEntries] = await Promise.all([
      app.db.query.taskAssignments.findMany({
        where: and(
          eq(taskAssignments.staffMemberId, staff.id),
          sql`${taskAssignments.status} NOT IN ('CANCELLED', 'COMPLETED')`,
        ),
        with: {
          project: true,
          milestone: true,
        },
        orderBy: (t, { asc }) => [asc(t.dueDate), asc(t.createdAt)],
      }),
      app.db.query.staffTaskPlannerEntries.findMany({
        where: and(
          eq(staffTaskPlannerEntries.staffMemberId, staff.id),
          // Overlap check: span (planned_date .. coalesce(end_date, planned_date)) intersects [weekStart, weekEnd]
          lte(staffTaskPlannerEntries.plannedDate, weekEnd),
          sql`COALESCE(${staffTaskPlannerEntries.endDate}, ${staffTaskPlannerEntries.plannedDate}) >= ${weekStart.toISOString()}::timestamptz`,
        ),
        with: {
          taskAssignment: {
            with: {
              project: true,
              milestone: true,
            },
          },
        },
        orderBy: (p, { asc }) => [asc(p.plannedDate), asc(p.createdAt)],
      }),
    ]);

    const days = Array.from({ length: 7 }, (_, idx) => {
      const date = addDays(weekStart, idx);
      return {
        date: formatYmd(date),
        dayName: date.toLocaleDateString('en-ZA', { weekday: 'short' }),
        dayOfMonth: date.getDate(),
        tasks: [] as any[],
      };
    });

    for (const entry of plannerEntries) {
      const task = entry.taskAssignment;
      if (!task) continue;
      const spanStart = safeDate(entry.plannedDate);
      const spanEnd = safeDate(entry.endDate || entry.plannedDate);
      if (!spanStart || !spanEnd) continue;

      const totalDays = Math.max(1, Math.round((spanEnd.getTime() - spanStart.getTime()) / 86400000) + 1);
      const totalHours = entry.plannedHours == null ? null : Number(entry.plannedHours);
      const hoursPerDay = totalHours == null ? null : Number((totalHours / totalDays).toFixed(2));

      // Render this entry on every day in the visible week that falls inside the span.
      for (let i = 0; i < 7; i++) {
        const dayDate = addDays(weekStart, i);
        if (dayDate < spanStart || dayDate > spanEnd) continue;
        const dayIndex = i;
        const dayOfSpan = Math.round((dayDate.getTime() - spanStart.getTime()) / 86400000) + 1;
        days[dayIndex].tasks.push({
          ...mapTaskToPlannerDto(task, today),
          plannerEntryId: entry.id,
          plannedDate: formatYmd(spanStart),
          spanStart: formatYmd(spanStart),
          spanEnd: formatYmd(spanEnd),
          spanTotalDays: totalDays,
          spanDayIndex: dayOfSpan,
          plannedHours: totalHours,
          plannedHoursPerDay: hoursPerDay,
          note: entry.note,
          slotStart: entry.slotStart,
          slotEnd: entry.slotEnd,
        });
      }
    }

    const plannedTaskIds = new Set(plannerEntries.map((e) => e.taskAssignmentId));
    const unscheduled = tasks
      .filter((task) => !plannedTaskIds.has(task.id))
      .map((task) => mapTaskToPlannerDto(task, today));

    const overdueCount = tasks.filter((task) => {
      const due = safeDate(task.dueDate);
      return !!(due && due < today);
    }).length;

    return {
      data: {
        weekStart: formatYmd(weekStart),
        weekEnd: formatYmd(weekEnd),
        days,
        unscheduled,
        totals: {
          scheduledTasks: days.reduce((acc, d) => acc + d.tasks.length, 0),
          uniqueTasks: tasks.length,
          unscheduledTasks: unscheduled.length,
          overdueTasks: overdueCount,
        },
      },
    };
  });

  // My planner (monthly)
  app.get('/my/planner/month', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const { year, month } = plannerMonthQuerySchema.parse(request.query);
    const today = startOfDay(new Date());
    const baseYear = year || today.getFullYear();
    const baseMonth = month || (today.getMonth() + 1);
    const monthStart = new Date(baseYear, baseMonth - 1, 1);
    const monthEnd = endOfMonth(monthStart);

    const [tasks, plannerEntries] = await Promise.all([
      app.db.query.taskAssignments.findMany({
        where: and(
          eq(taskAssignments.staffMemberId, staff.id),
          sql`${taskAssignments.status} NOT IN ('CANCELLED', 'COMPLETED')`,
        ),
        with: {
          project: true,
          milestone: true,
        },
        orderBy: (t, { asc }) => [asc(t.dueDate), asc(t.createdAt)],
      }),
      app.db.query.staffTaskPlannerEntries.findMany({
        where: and(
          eq(staffTaskPlannerEntries.staffMemberId, staff.id),
          lte(staffTaskPlannerEntries.plannedDate, monthEnd),
          sql`COALESCE(${staffTaskPlannerEntries.endDate}, ${staffTaskPlannerEntries.plannedDate}) >= ${monthStart.toISOString()}::timestamptz`,
        ),
        with: {
          taskAssignment: {
            with: {
              project: true,
              milestone: true,
            },
          },
        },
        orderBy: (p, { asc }) => [asc(p.plannedDate), asc(p.createdAt)],
      }),
    ]);

    const dayMap = new Map<string, any>();
    const daysInMonth = monthEnd.getDate();
    for (let i = 0; i < daysInMonth; i++) {
      const d = addDays(monthStart, i);
      dayMap.set(formatYmd(d), {
        date: formatYmd(d),
        dayOfMonth: d.getDate(),
        dayName: d.toLocaleDateString('en-ZA', { weekday: 'short' }),
        tasks: [] as any[],
      });
    }

    for (const entry of plannerEntries) {
      const task = entry.taskAssignment;
      const spanStart = safeDate(entry.plannedDate);
      const spanEnd = safeDate(entry.endDate || entry.plannedDate);
      if (!task || !spanStart || !spanEnd) continue;

      const totalDays = Math.max(1, Math.round((spanEnd.getTime() - spanStart.getTime()) / 86400000) + 1);
      const totalHours = entry.plannedHours == null ? null : Number(entry.plannedHours);
      const hoursPerDay = totalHours == null ? null : Number((totalHours / totalDays).toFixed(2));

      for (let i = 0; i < daysInMonth; i++) {
        const d = addDays(monthStart, i);
        if (d < spanStart || d > spanEnd) continue;
        const key = formatYmd(d);
        const dayOfSpan = Math.round((d.getTime() - spanStart.getTime()) / 86400000) + 1;
        dayMap.get(key)?.tasks.push({
          ...mapTaskToPlannerDto(task, today),
          plannerEntryId: entry.id,
          plannedDate: formatYmd(spanStart),
          spanStart: formatYmd(spanStart),
          spanEnd: formatYmd(spanEnd),
          spanTotalDays: totalDays,
          spanDayIndex: dayOfSpan,
          plannedHours: totalHours,
          plannedHoursPerDay: hoursPerDay,
          note: entry.note,
        });
      }
    }

    const plannedTaskIds = new Set(plannerEntries.map((e) => e.taskAssignmentId));
    const unscheduled = tasks
      .filter((task) => !plannedTaskIds.has(task.id))
      .map((task) => mapTaskToPlannerDto(task, today));

    const overdueCount = tasks.filter((task) => {
      const due = safeDate(task.dueDate);
      return !!(due && due < today);
    }).length;

    const days = Array.from(dayMap.values());
    return {
      data: {
        year: baseYear,
        month: baseMonth,
        monthStart: formatYmd(monthStart),
        monthEnd: formatYmd(monthEnd),
        days,
        unscheduled,
        totals: {
          scheduledTasks: days.reduce((acc, d) => acc + d.tasks.length, 0),
          uniqueTasks: tasks.length,
          unscheduledTasks: unscheduled.length,
          overdueTasks: overdueCount,
        },
      },
    };
  });

  // ==========================================
  // RESOURCE PLANNING
  // ==========================================

  // Capacity overview — all staff with allocation summary
  app.get('/capacity', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async () => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const addDays = (d: Date, days: number) => {
      const next = new Date(d);
      next.setDate(next.getDate() + days);
      return next;
    };
    const startOfWeekMonday = (d: Date) => {
      const base = startOfDay(d);
      const day = base.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      return addDays(base, diff);
    };
    const isWeekday = (d: Date) => {
      const day = d.getDay();
      return day >= 1 && day <= 5;
    };
    const workingDaysBetweenInclusive = (start: Date, end: Date) => {
      if (end < start) return 0;
      let count = 0;
      const cur = new Date(start);
      while (cur <= end) {
        if (isWeekday(cur)) count += 1;
        cur.setDate(cur.getDate() + 1);
      }
      return count;
    };

    const today = startOfDay(new Date());
    const weekStart = startOfWeekMonday(today);
    const weekEnd = addDays(weekStart, 6);
    const forecastMonths = [0, 1, 2].map((offset) => {
      const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0, 23, 59, 59);
      return {
        offset,
        start,
        end,
        label: start.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' }),
      };
    });

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

    const getTaskRemainingHours = (t: any) => {
      const remaining = Number(t.remainingHours);
      if (Number.isFinite(remaining)) return Math.max(0, remaining);
      return Math.max(0, (Number(t.allocatedHours) || 0) - (Number(t.loggedHours) || 0));
    };

    const getTaskAllocationForWindow = (t: any, windowStart: Date, windowEnd: Date) => {
      const remaining = getTaskRemainingHours(t);
      if (remaining <= 0) return 0;

      const taskStart = t.startDate ? startOfDay(new Date(t.startDate)) : today;
      const fallbackEnd = addDays(taskStart, 20);
      const rawEnd = t.dueDate ? startOfDay(new Date(t.dueDate)) : fallbackEnd;
      const taskEnd = rawEnd < today ? today : rawEnd;

      const effectiveStart = taskStart < today ? today : taskStart;
      const totalWorkDays = workingDaysBetweenInclusive(effectiveStart, taskEnd);
      if (totalWorkDays <= 0) return 0;

      const overlapStart = effectiveStart > windowStart ? effectiveStart : windowStart;
      const overlapEnd = taskEnd < windowEnd ? taskEnd : windowEnd;
      const overlapDays = workingDaysBetweenInclusive(overlapStart, overlapEnd);
      if (overlapDays <= 0) return 0;

      return (remaining * overlapDays) / totalWorkDays;
    };

    const data = allStaff.map((staff) => {
      const allocatedHours = staff.taskAssignments.reduce(
        (sum, t) => sum + (Number(t.allocatedHours) || 0), 0,
      );
      const loggedHours = staff.taskAssignments.reduce(
        (sum, t) => sum + (Number(t.loggedHours) || 0), 0,
      );
      const remainingHours = staff.taskAssignments.reduce((sum, t) => {
        return sum + getTaskRemainingHours(t);
      }, 0);

      const maxMonthly = staff.maxHoursPerMonth;

      // Allocated this calendar month = sum of task allocatedHours for tasks whose due date falls in current month
      const thisMonthStart = forecastMonths[0].start;
      const thisMonthEnd = forecastMonths[0].end;
      const allocatedThisMonth = staff.taskAssignments.reduce((sum, t) => {
        if (!t.dueDate) return sum;
        const due = new Date(t.dueDate);
        if (due >= thisMonthStart && due <= thisMonthEnd) {
          return sum + (Number(t.allocatedHours) || 0);
        }
        return sum;
      }, 0);

      const monthlyForecast = forecastMonths.map((m) => {
        const allocated = staff.taskAssignments.reduce((sum, t) => {
          if (!t.dueDate) return sum;
          const due = new Date(t.dueDate);
          if (due >= m.start && due <= m.end) return sum + (Number(t.allocatedHours) || 0);
          return sum;
        }, 0);
        const available = Math.max(0, maxMonthly - allocated);
        const utilizationPct = maxMonthly > 0 ? (allocated / maxMonthly) * 100 : 0;
        return {
          offset: m.offset,
          label: m.label,
          monthStart: m.start.toISOString(),
          monthEnd: m.end.toISOString(),
          allocated,
          available,
          utilizationPct,
        };
      });

      return {
        id: staff.id,
        name: staff.name,
        role: staff.role,
        availabilityType: staff.availabilityType,
        maxHoursPerMonth: maxMonthly,
        allocatedHours,
        loggedHours,
        remainingHours,
        allocatedThisMonth,
        availableHoursMonthly: Math.max(0, maxMonthly - allocatedThisMonth),
        utilizationMonthlyPct: maxMonthly > 0 ? (allocatedThisMonth / maxMonthly) * 100 : 0,
        activeTaskCount: staff.taskAssignments.length,
        monthlyForecast,
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
          maxHoursPerMonth: staff.maxHoursPerMonth,
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

    // Build deliverables from tasks (titles only — detailed deliverables are tracked in task_deliverables table)
    const deliverables = tasks.map((t) => ({
      description: t.title + (t.milestone ? ` (${t.milestone.name})` : ''),
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : new Date().toISOString(),
      acceptanceCriteria: 'Completed to satisfaction',
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
        staffUserId: staff.userId || null,
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

  // Send access link for a staff member's tasks on a project.
  // Internal staff get an internal login email; external staff get a contractor magic link.
  app.post<{ Params: { projectId: string; staffMemberId: string } }>('/projects/:projectId/staff/:staffMemberId/send-access-link', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const { projectId, staffMemberId } = request.params;
    const staff = await app.db.query.staffMembers.findFirst({ where: eq(staffMembers.id, staffMemberId) });
    if (!staff) return reply.notFound('Staff member not found');
    if (!staff.email) return reply.badRequest('Staff member has no email address');

    const project = await app.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!project) return reply.notFound('Project not found');

    const frontendUrl = config.web.url;

    // Internal staff should use normal app login, not contractor portal.
    if (staff.isInternal) {
      const passwordSetupTriggered = await triggerPasswordSetupEmail(app, staff.email, frontendUrl);

      if (isEmailConfigured()) {
        await sendEmail({
          to: staff.email,
          subject: `Xarra Books — Access your tasks for ${project.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
              <div style="border-bottom:3px solid #166534;padding-bottom:15px;margin-bottom:20px">
                <h1 style="color:#166534;font-size:20px;margin:0">Xarra Books</h1>
              </div>
              <p>Hi ${staff.name},</p>
              <p>You have been assigned work on <strong>${project.name}</strong> (${project.number}).</p>
              <p>Please sign in to your internal staff account to view your SOW, tasks, and submit time logs.</p>
              <div style="margin:25px 0">
                <a href="${frontendUrl}/login" style="background:#166534;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
                  Sign In to Xarra Books
                </a>
              </div>
              <p style="color:#666;font-size:13px">If this is your first login, use "Forgot password" on the login page to set your password.</p>
              <p style="color:#999;font-size:12px;margin-top:30px">Xarra Books Management System</p>
            </div>
          `,
        });
      }

      return {
        data: {
          type: 'internal',
          email: staff.email,
          loginUrl: `${frontendUrl}/login`,
          passwordSetupTriggered,
        },
      };
    }

    // External staff use contractor magic links.
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await app.db.insert(contractorAccessTokens).values({
      token,
      staffMemberId,
      projectId,
      expiresAt,
      createdBy: request.session?.user?.id,
    });

    if (isEmailConfigured()) {
      const link = `${frontendUrl}/contractor/${token}`;
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

    return { data: { type: 'contractor', token, email: staff.email, expiresAt } };
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
      with: { milestone: true, timeLogs: true, deliverables: true },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    // Get the contractor's active SOW for this project (most recent ACCEPTED or SENT).
    const activeSow = await app.db.query.sowDocuments.findFirst({
      where: and(
        eq(sowDocuments.projectId, tokenRecord.projectId),
        or(eq(sowDocuments.status, 'ACCEPTED'), eq(sowDocuments.status, 'SENT')),
      ),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    return {
      data: {
        staff: { name: staff?.name, email: staff?.email, role: staff?.role },
        project: { name: project?.name, number: project?.number, titleName: project?.title?.title },
        sow: activeSow
          ? {
              id: activeSow.id,
              number: activeSow.number,
              status: activeSow.status,
              scope: activeSow.scope,
              deliverables: activeSow.deliverables,
              timeline: activeSow.timeline,
              totalAmount: activeSow.totalAmount,
              terms: activeSow.terms,
              validUntil: activeSow.validUntil,
              acceptedAt: activeSow.acceptedAt,
              pdfUrl: activeSow.pdfUrl,
            }
          : null,
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
          deliverables: (t.deliverables || []).map((d) => ({
            id: d.id,
            title: d.title,
            description: d.description,
            estimatedHours: d.estimatedHours,
            status: d.status,
            sortOrder: d.sortOrder,
          })),
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

  // ==========================================
  // EXCEL TIMESHEET DOWNLOAD
  // ==========================================

  // Download monthly timesheet as Excel for a staff member (all projects)
  app.get<{ Params: { projectId: string; staffMemberId: string } }>('/projects/:projectId/staff/:staffMemberId/timesheet-excel', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { projectId, staffMemberId } = request.params;

    const staff = await app.db.query.staffMembers.findFirst({ where: eq(staffMembers.id, staffMemberId) });
    const project = await app.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!staff || !project) return reply.notFound('Staff or project not found');

    const tasks = await app.db.query.taskAssignments.findMany({
      where: and(eq(taskAssignments.projectId, projectId), eq(taskAssignments.staffMemberId, staffMemberId)),
      with: { timeLogs: { orderBy: (l, { asc }) => [asc(l.workDate)] }, milestone: true, taskCode: true, project: true },
    });

    // Get current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthName = now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Xarra Books';
    workbook.created = new Date();

    // Sheet 1: Monthly Summary
    const summarySheet = workbook.addWorksheet('Monthly Summary');

    const greenFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF166534' } };
    const whiteFont = { bold: true, color: { argb: 'FFFFFFFF' } };
    const boldFont = { bold: true };

    // === SHEET 1: MONTHLY SUMMARY ===
    summarySheet.mergeCells('A1:H1');
    summarySheet.getCell('A1').value = 'XARRA BOOKS — MONTHLY TIMESHEET';
    summarySheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF166534' } };

    summarySheet.getCell('A3').value = 'Period:';
    summarySheet.getCell('B3').value = monthName;
    summarySheet.getCell('B3').font = boldFont;
    summarySheet.getCell('A4').value = 'Staff Member:';
    summarySheet.getCell('B4').value = staff.name;
    summarySheet.getCell('B4').font = boldFont;
    summarySheet.getCell('A5').value = 'Role:';
    summarySheet.getCell('B5').value = staff.role;
    summarySheet.getCell('A6').value = 'Project:';
    summarySheet.getCell('B6').value = `${project.name} (${project.number})`;
    summarySheet.getCell('B6').font = boldFont;
    summarySheet.getCell('A7').value = 'Hourly Rate:';
    summarySheet.getCell('B7').value = `R ${Number(staff.hourlyRate).toFixed(2)}`;
    summarySheet.getCell('A8').value = 'Generated:';
    summarySheet.getCell('B8').value = new Date().toLocaleDateString('en-ZA');
    summarySheet.getCell('D3').value = 'Status:';
    summarySheet.getCell('E3').value = 'Draft';

    // Task summary table with codes + est vs actual
    const headers = ['Code', 'Task', 'Project', 'Milestone', 'Est. Hours', 'Allocated', 'Actual', 'Variance', 'Status'];
    const hr = 10;
    headers.forEach((h, i) => {
      const cell = summarySheet.getCell(hr, i + 1);
      cell.value = h;
      cell.font = whiteFont;
      cell.fill = greenFill;
    });

    let row = hr + 1;
    let totalEst = 0, totalAlloc = 0, totalActual = 0;
    for (const t of tasks) {
      const est = Number(t.estimatedHours || 0);
      const alloc = Number(t.allocatedHours);
      const actual = Number(t.loggedHours);
      const variance = est > 0 ? actual - est : 0;
      summarySheet.getCell(`A${row}`).value = (t.taskCode as any)?.code || '—';
      summarySheet.getCell(`B${row}`).value = `${t.number} — ${t.title}`;
      summarySheet.getCell(`C${row}`).value = (t.project as any)?.number || project.number;
      summarySheet.getCell(`D${row}`).value = t.milestone?.name || '—';
      summarySheet.getCell(`E${row}`).value = est || '—';
      summarySheet.getCell(`F${row}`).value = alloc;
      summarySheet.getCell(`G${row}`).value = actual;
      summarySheet.getCell(`H${row}`).value = est > 0 ? variance : '—';
      if (variance > 0) summarySheet.getCell(`H${row}`).font = { color: { argb: 'FFCC0000' } };
      if (variance < 0) summarySheet.getCell(`H${row}`).font = { color: { argb: 'FF006600' } };
      summarySheet.getCell(`I${row}`).value = t.status;
      totalEst += est; totalAlloc += alloc; totalActual += actual;
      row++;
    }
    // Totals
    summarySheet.getCell(`A${row}`).value = 'TOTAL';
    summarySheet.getCell(`A${row}`).font = boldFont;
    summarySheet.getCell(`E${row}`).value = totalEst || '—';
    summarySheet.getCell(`E${row}`).font = boldFont;
    summarySheet.getCell(`F${row}`).value = totalAlloc;
    summarySheet.getCell(`F${row}`).font = boldFont;
    summarySheet.getCell(`G${row}`).value = totalActual;
    summarySheet.getCell(`G${row}`).font = boldFont;
    summarySheet.getCell(`H${row}`).value = totalEst > 0 ? totalActual - totalEst : '—';
    summarySheet.getCell(`H${row}`).font = boldFont;

    // Cost summary
    row += 2;
    summarySheet.getCell(`A${row}`).value = 'COST SUMMARY';
    summarySheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row++;
    summarySheet.getCell(`A${row}`).value = 'Total Hours:';
    summarySheet.getCell(`B${row}`).value = totalActual;
    summarySheet.getCell(`B${row}`).font = boldFont;
    row++;
    summarySheet.getCell(`A${row}`).value = 'Hourly Rate:';
    summarySheet.getCell(`B${row}`).value = `R ${Number(staff.hourlyRate).toFixed(2)}`;
    row++;
    summarySheet.getCell(`A${row}`).value = 'Gross Amount:';
    summarySheet.getCell(`B${row}`).value = `R ${(totalActual * Number(staff.hourlyRate)).toFixed(2)}`;
    summarySheet.getCell(`B${row}`).font = { bold: true, size: 13 };

    // Signatures
    row += 3;
    summarySheet.getCell(`A${row}`).value = 'Staff Signature: ____________________';
    summarySheet.getCell(`D${row}`).value = 'Date: ____________________';
    row += 2;
    summarySheet.getCell(`A${row}`).value = 'PM Approval: ____________________';
    summarySheet.getCell(`D${row}`).value = 'Date: ____________________';
    row += 2;
    summarySheet.getCell(`A${row}`).value = 'Finance Approval: ____________________';
    summarySheet.getCell(`D${row}`).value = 'Date: ____________________';

    summarySheet.columns = [
      { width: 14 }, { width: 35 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    ];

    // === SHEET 2: DAILY LOG ===
    const logsSheet = workbook.addWorksheet('Daily Log');
    logsSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Task', key: 'task', width: 35 },
      { header: 'Project', key: 'project', width: 14 },
      { header: 'Hours', key: 'hours', width: 10 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    logsSheet.getRow(1).font = whiteFont;
    logsSheet.getRow(1).fill = greenFill;

    // Group logs by week
    for (const t of tasks) {
      for (const l of t.timeLogs || []) {
        logsSheet.addRow({
          date: new Date(l.workDate).toLocaleDateString('en-ZA'),
          code: (t.taskCode as any)?.code || '—',
          task: `${t.number} — ${t.title}`,
          project: (t.project as any)?.number || project.number,
          hours: Number(l.hours),
          description: l.description,
          status: l.status,
        });
      }
    }

    // === SHEET 3: COST BREAKDOWN ===
    const costSheet = workbook.addWorksheet('Cost Summary');
    costSheet.mergeCells('A1:F1');
    costSheet.getCell('A1').value = `COST SUMMARY — ${monthName}`;
    costSheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF166534' } };

    const costHeaders = ['Code', 'Task', 'Hours', 'Rate (R)', 'Amount (R)', 'Status'];
    costHeaders.forEach((h, i) => {
      const cell = costSheet.getCell(3, i + 1);
      cell.value = h;
      cell.font = whiteFont;
      cell.fill = greenFill;
    });

    let costRow = 4;
    let grandTotal = 0;
    for (const t of tasks) {
      const hrs = Number(t.loggedHours);
      const rate = Number(t.hourlyRate);
      const amt = hrs * rate;
      costSheet.getCell(`A${costRow}`).value = (t.taskCode as any)?.code || '—';
      costSheet.getCell(`B${costRow}`).value = `${t.number} — ${t.title}`;
      costSheet.getCell(`C${costRow}`).value = hrs;
      costSheet.getCell(`D${costRow}`).value = rate;
      costSheet.getCell(`E${costRow}`).value = amt;
      costSheet.getCell(`E${costRow}`).numFmt = '#,##0.00';
      costSheet.getCell(`F${costRow}`).value = t.status;
      grandTotal += amt;
      costRow++;
    }
    costSheet.getCell(`A${costRow}`).value = 'TOTAL';
    costSheet.getCell(`A${costRow}`).font = boldFont;
    costSheet.getCell(`C${costRow}`).value = totalActual;
    costSheet.getCell(`C${costRow}`).font = boldFont;
    costSheet.getCell(`E${costRow}`).value = grandTotal;
    costSheet.getCell(`E${costRow}`).font = { bold: true, size: 13 };
    costSheet.getCell(`E${costRow}`).numFmt = '#,##0.00';
    costSheet.columns = [{ width: 14 }, { width: 35 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 12 }];

    // === SHEET 4: BLANK ENTRY (for offline manual logging) ===
    const entrySheet = workbook.addWorksheet('Log Hours (Fill In)');
    entrySheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Task Code', key: 'code', width: 12 },
      { header: 'Task Number', key: 'taskNumber', width: 16 },
      { header: 'Task Title', key: 'taskTitle', width: 30 },
      { header: 'Hours Worked', key: 'hours', width: 14 },
      { header: 'Description of Work Done', key: 'description', width: 50 },
    ];
    entrySheet.getRow(1).font = whiteFont;
    entrySheet.getRow(1).fill = greenFill;

    for (const t of tasks) {
      if (t.status !== 'COMPLETED' && t.status !== 'CANCELLED') {
        for (let i = 0; i < 5; i++) {
          entrySheet.addRow({ date: '', code: (t.taskCode as any)?.code || '', taskNumber: t.number, taskTitle: t.title, hours: '', description: '' });
        }
      }
    }
    const sigR = entrySheet.rowCount + 3;
    entrySheet.getCell(`A${sigR}`).value = 'Staff Signature: ____________________';
    entrySheet.getCell(`D${sigR}`).value = 'Date: ____________________';
    entrySheet.getCell(`A${sigR + 2}`).value = 'PM Approval: ____________________';
    entrySheet.getCell(`D${sigR + 2}`).value = 'Date: ____________________';
    entrySheet.getCell(`A${sigR + 4}`).value = 'Finance Approval: ____________________';
    entrySheet.getCell(`D${sigR + 4}`).value = 'Date: ____________________';

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Timesheet-${staff.name.replace(/\s+/g, '-')}-${monthName.replace(/\s+/g, '-')}.xlsx`;

    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(Buffer.from(buffer as ArrayBuffer));
  });

  // Contractor portal: download timesheet Excel via magic link (NO AUTH)
  // Contractor portal: download timesheet Excel via magic link (NO AUTH)
  app.get<{ Params: { token: string } }>('/contractor-portal/:token/timesheet-excel', async (request, reply) => {
    const tokenRecord = await app.db.query.contractorAccessTokens.findFirst({
      where: eq(contractorAccessTokens.token, request.params.token),
    });
    if (!tokenRecord) return reply.notFound('Invalid access link');
    if (new Date() > new Date(tokenRecord.expiresAt)) return reply.badRequest('Link expired');

    // Generate Excel directly (same logic as authenticated endpoint)
    const { projectId, staffMemberId } = tokenRecord;

    const staff = await app.db.query.staffMembers.findFirst({ where: eq(staffMembers.id, staffMemberId) });
    const project = await app.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!staff || !project) return reply.notFound('Staff or project not found');

    const tasks = await app.db.query.taskAssignments.findMany({
      where: and(eq(taskAssignments.projectId, projectId), eq(taskAssignments.staffMemberId, staffMemberId)),
      with: { timeLogs: { orderBy: (l, { asc }) => [asc(l.workDate)] }, milestone: true },
    });

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Xarra Books';

    const summarySheet = workbook.addWorksheet('Timesheet');
    summarySheet.mergeCells('A1:F1');
    summarySheet.getCell('A1').value = 'XARRA BOOKS — TIMESHEET';
    summarySheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF166534' } };
    summarySheet.getCell('A3').value = 'Staff Member:';
    summarySheet.getCell('B3').value = staff.name;
    summarySheet.getCell('B3').font = { bold: true };
    summarySheet.getCell('A4').value = 'Role:';
    summarySheet.getCell('B4').value = staff.role;
    summarySheet.getCell('A5').value = 'Project:';
    summarySheet.getCell('B5').value = `${project.name} (${project.number})`;
    summarySheet.getCell('A6').value = 'Rate:';
    summarySheet.getCell('B6').value = `R ${Number(staff.hourlyRate).toFixed(2)}/hr`;
    summarySheet.getCell('A7').value = 'Generated:';
    summarySheet.getCell('B7').value = new Date().toLocaleDateString('en-ZA');

    const hr = 9;
    ['Task', 'Milestone', 'Allocated Hours', 'Logged Hours', 'Remaining', 'Status'].forEach((h, i) => {
      const cell = summarySheet.getCell(hr, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    });

    let row = hr + 1;
    let tAlloc = 0, tLog = 0;
    for (const t of tasks) {
      summarySheet.getCell(`A${row}`).value = `${t.number} — ${t.title}`;
      summarySheet.getCell(`B${row}`).value = t.milestone?.name || '—';
      summarySheet.getCell(`C${row}`).value = Number(t.allocatedHours);
      summarySheet.getCell(`D${row}`).value = Number(t.loggedHours);
      summarySheet.getCell(`E${row}`).value = Number(t.remainingHours);
      summarySheet.getCell(`F${row}`).value = t.status;
      tAlloc += Number(t.allocatedHours); tLog += Number(t.loggedHours);
      row++;
    }
    summarySheet.getCell(`A${row}`).value = 'TOTAL';
    summarySheet.getCell(`A${row}`).font = { bold: true };
    summarySheet.getCell(`C${row}`).value = tAlloc;
    summarySheet.getCell(`C${row}`).font = { bold: true };
    summarySheet.getCell(`D${row}`).value = tLog;
    summarySheet.getCell(`D${row}`).font = { bold: true };
    summarySheet.columns = [{ width: 40 }, { width: 20 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }];

    const logsSheet = workbook.addWorksheet('Time Logs');
    logsSheet.columns = [
      { header: 'Date', key: 'date', width: 15 }, { header: 'Task', key: 'task', width: 35 },
      { header: 'Hours', key: 'hours', width: 10 }, { header: 'Description', key: 'description', width: 50 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    logsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    logsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    for (const t of tasks) {
      for (const l of t.timeLogs || []) {
        logsSheet.addRow({ date: new Date(l.workDate).toLocaleDateString('en-ZA'), task: `${t.number} — ${t.title}`, hours: Number(l.hours), description: l.description, status: l.status });
      }
    }

    const entrySheet = workbook.addWorksheet('Log Hours (Fill In)');
    entrySheet.columns = [
      { header: 'Date', key: 'date', width: 15 }, { header: 'Task Number', key: 'taskNumber', width: 18 },
      { header: 'Task Title', key: 'taskTitle', width: 35 }, { header: 'Hours Worked', key: 'hours', width: 14 },
      { header: 'Description of Work Done', key: 'description', width: 50 },
    ];
    entrySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    entrySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    for (const t of tasks) {
      if (t.status !== 'COMPLETED' && t.status !== 'CANCELLED') {
        for (let i = 0; i < 5; i++) entrySheet.addRow({ date: '', taskNumber: t.number, taskTitle: t.title, hours: '', description: '' });
      }
    }
    const sr = entrySheet.rowCount + 3;
    entrySheet.getCell(`A${sr}`).value = 'Staff Signature: ____________________';
    entrySheet.getCell(`D${sr}`).value = 'Date: ____________________';
    entrySheet.getCell(`A${sr + 2}`).value = 'PM Approval: ____________________';
    entrySheet.getCell(`D${sr + 2}`).value = 'Date: ____________________';

    const buffer = await workbook.xlsx.writeBuffer();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="Timesheet-${staff.name.replace(/\s+/g, '-')}-${project.number}.xlsx"`)
      .send(Buffer.from(buffer as ArrayBuffer));
  });

  // ==========================================
  // TASK REQUESTS — staff/contractor asks PM to add a task
  // ==========================================

  // Staff submits a task request
  app.post('/task-requests', { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({
      projectId: z.string().uuid(),
      title: z.string().min(1).max(255),
      description: z.string().min(1),
      justification: z.string().min(1),
      estimatedHours: z.coerce.number().positive(),
      linkedTaskId: z.string().uuid().nullable().optional(),
    }).parse(request.body);

    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const project = await app.db.query.projects.findFirst({ where: eq(projects.id, body.projectId) });
    if (!project) return reply.notFound('Project not found');

    const [created] = await app.db.insert(taskRequests).values({
      projectId: body.projectId,
      requestedByStaffId: staff.id,
      linkedTaskId: body.linkedTaskId || null,
      title: body.title,
      description: body.description,
      justification: body.justification,
      estimatedHours: String(body.estimatedHours),
    }).returning();

    // Notify PMs/admins
    createBroadcastNotification(app, {
      type: 'TASK_REQUEST_SUBMITTED' as any,
      priority: 'NORMAL',
      title: 'New task request',
      message: `${staff.name} requested a new task on project ${project.number}: "${body.title}" (${body.estimatedHours}h)`,
      actionUrl: `/pm/task-requests/${created.id}`,
      referenceType: 'TASK_REQUEST',
      referenceId: created.id,
    }).catch(() => {});

    return reply.status(201).send({ data: created });
  });

  // Staff: list my task requests
  app.get('/my/task-requests', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const items = await app.db.query.taskRequests.findMany({
      where: eq(taskRequests.requestedByStaffId, staff.id),
      with: { project: true, createdTask: true },
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
    return { data: items };
  });

  // PM: list all task requests, optional ?status=PENDING
  app.get('/task-requests', { preHandler: requireRole('admin', 'project_manager') }, async (request) => {
    const q = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO']).optional() }).parse(request.query);
    const where = q.status ? eq(taskRequests.status, q.status) : undefined;
    const items = await app.db.query.taskRequests.findMany({
      where: where ? () => where : undefined,
      with: { project: true, requestedBy: true, linkedTask: true, createdTask: true },
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
    return { data: items };
  });

  // PM: get one
  app.get<{ Params: { id: string } }>('/task-requests/:id', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const item = await app.db.query.taskRequests.findFirst({
      where: eq(taskRequests.id, request.params.id),
      with: { project: true, requestedBy: true, linkedTask: true, createdTask: true },
    });
    if (!item) return reply.notFound('Task request not found');
    return { data: item };
  });

  // PM approves: creates a real task assignment, links it back, notifies staff
  app.post<{ Params: { id: string } }>('/task-requests/:id/approve', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({
      milestoneId: z.string().uuid().nullable().optional(),
      taskCodeId: z.string().uuid().nullable().optional(),
      allocatedHours: z.coerce.number().positive(),
      hourlyRate: z.coerce.number().positive(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
      dueDate: z.string().nullable().optional(),
      reviewNotes: z.string().nullable().optional(),
    }).parse(request.body);

    const userId = request.session?.user?.id;
    const tr = await app.db.query.taskRequests.findFirst({
      where: eq(taskRequests.id, request.params.id),
      with: { requestedBy: true, project: true },
    });
    if (!tr) return reply.notFound('Task request not found');
    if (tr.status !== 'PENDING' && tr.status !== 'NEEDS_INFO') {
      return reply.badRequest(`Cannot approve a request in ${tr.status} status`);
    }

    if (body.milestoneId) {
      const milestone = await app.db.query.projectMilestones.findFirst({
        where: and(eq(projectMilestones.id, body.milestoneId), eq(projectMilestones.projectId, tr.projectId)),
      });
      if (!milestone) return reply.badRequest('Milestone does not belong to this project');
    }

    const number = await nextTaskAssignmentNumber(app.db);
    const totalCost = body.allocatedHours * body.hourlyRate;
    const [task] = await app.db.insert(taskAssignments).values({
      number,
      projectId: tr.projectId,
      milestoneId: body.milestoneId || null,
      taskCodeId: body.taskCodeId || null,
      staffMemberId: tr.requestedByStaffId,
      title: tr.title,
      description: tr.description,
      priority: body.priority,
      estimatedHours: tr.estimatedHours,
      allocatedHours: String(body.allocatedHours),
      loggedHours: '0',
      remainingHours: String(body.allocatedHours),
      hourlyRate: String(body.hourlyRate),
      totalCost: String(totalCost),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      assignedBy: userId,
      status: 'ASSIGNED',
    }).returning();

    const [updated] = await app.db.update(taskRequests)
      .set({
        status: 'APPROVED',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: body.reviewNotes || null,
        createdTaskId: task.id,
        updatedAt: new Date(),
      })
      .where(eq(taskRequests.id, request.params.id))
      .returning();

    // Auto-regen the SOW so the new task is reflected in cost/deliverables/timeline.
    regenerateSowFromTasks(app, {
      projectId: tr.projectId,
      staffMemberId: tr.requestedByStaffId,
      reason: `Task request approved: ${tr.title}`,
      userId,
    }).catch((e) => app.log.error({ err: e }, 'SOW regen failed after task-request approve'));

    if (tr.requestedBy?.userId) {
      createNotification(app, {
        userId: tr.requestedBy.userId,
        type: 'TASK_STARTED' as any,
        title: 'Task request approved',
        message: `Your request "${tr.title}" was approved and is now task ${task.number}.`,
        actionUrl: `/pm/tasks/${task.id}`,
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: task.id,
      }).catch(() => {});
    }

    return { data: { request: updated, task } };
  });

  // PM rejects
  app.post<{ Params: { id: string } }>('/task-requests/:id/reject', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({ reviewNotes: z.string().min(1) }).parse(request.body);
    const userId = request.session?.user?.id;

    const tr = await app.db.query.taskRequests.findFirst({
      where: eq(taskRequests.id, request.params.id),
      with: { requestedBy: true },
    });
    if (!tr) return reply.notFound('Task request not found');
    if (tr.status !== 'PENDING' && tr.status !== 'NEEDS_INFO') {
      return reply.badRequest(`Cannot reject a request in ${tr.status} status`);
    }

    const [updated] = await app.db.update(taskRequests)
      .set({
        status: 'REJECTED',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: body.reviewNotes,
        updatedAt: new Date(),
      })
      .where(eq(taskRequests.id, request.params.id))
      .returning();

    if (tr.requestedBy?.userId) {
      createNotification(app, {
        userId: tr.requestedBy.userId,
        type: 'TASK_SENT_BACK' as any,
        title: 'Task request rejected',
        message: `Your request "${tr.title}" was rejected. Reason: ${body.reviewNotes}`,
        referenceType: 'TASK_REQUEST',
        referenceId: tr.id,
      }).catch(() => {});
    }

    return { data: updated };
  });

  // PM asks for more info
  app.post<{ Params: { id: string } }>('/task-requests/:id/needs-info', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({ reviewNotes: z.string().min(1) }).parse(request.body);
    const userId = request.session?.user?.id;

    const tr = await app.db.query.taskRequests.findFirst({
      where: eq(taskRequests.id, request.params.id),
      with: { requestedBy: true },
    });
    if (!tr) return reply.notFound('Task request not found');
    if (tr.status !== 'PENDING') {
      return reply.badRequest(`Can only ask for info on PENDING requests`);
    }

    const [updated] = await app.db.update(taskRequests)
      .set({
        status: 'NEEDS_INFO',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: body.reviewNotes,
        updatedAt: new Date(),
      })
      .where(eq(taskRequests.id, request.params.id))
      .returning();

    if (tr.requestedBy?.userId) {
      createNotification(app, {
        userId: tr.requestedBy.userId,
        type: 'TASK_SENT_BACK' as any,
        title: 'More info needed on task request',
        message: `Your request "${tr.title}" needs more info: ${body.reviewNotes}`,
        actionUrl: `/employee/task-requests`,
        referenceType: 'TASK_REQUEST',
        referenceId: tr.id,
      }).catch(() => {});
    }

    return { data: updated };
  });

  // ==========================================
  // DELIVERABLES — per task_assignment
  // ==========================================

  // Helper: check all deliverables approved → complete task → check if project is fully done → notify
  async function maybeAutoCompleteTask(taskAssignmentId: string) {
    try {
      const delivs = await app.db.query.taskDeliverables.findMany({
        where: eq(taskDeliverables.taskAssignmentId, taskAssignmentId),
      });
      if (delivs.length === 0) return;
      const allApproved = delivs.every((d: any) => d.status === 'APPROVED');
      if (!allApproved) return;

      const task = await app.db.query.taskAssignments.findFirst({
        where: eq(taskAssignments.id, taskAssignmentId),
      });
      if (!task || task.status === 'COMPLETED') return;

      await app.db.update(taskAssignments)
        .set({ status: 'COMPLETED', updatedAt: new Date() })
        .where(eq(taskAssignments.id, taskAssignmentId));

      // Notify project ready to close if all tasks completed
      const allTasks = await app.db.query.taskAssignments.findMany({
        where: and(
          eq(taskAssignments.projectId, task.projectId),
          notInArray(taskAssignments.status, ['CANCELLED']),
        ),
      });
      const allDone = allTasks.every((t: any) => t.status === 'COMPLETED' || t.id === taskAssignmentId);
      if (allDone) {
        const project = await app.db.query.projects.findFirst({ where: eq(projects.id, task.projectId) });
        if (project) {
          await createBroadcastNotification(app, {
            type: 'PROJECT_READY_TO_CLOSE',
            priority: 'HIGH',
            title: 'Project Ready to Close',
            message: `All tasks and deliverables for project ${project.number} "${project.name}" have been approved.`,
            actionUrl: `/pm/projects/${project.id}`,
            referenceType: 'PROJECT',
            referenceId: project.id,
          });
        }
      }
    } catch (_e) {
      // Non-blocking
    }
  }

  // GET /tasks/:id/deliverables — list deliverables for a task
  app.get<{ Params: { id: string } }>('/tasks/:id/deliverables', { preHandler: requireAuth }, async (request, reply) => {
    const delivs = await request.server.db.query.taskDeliverables.findMany({
      where: eq(taskDeliverables.taskAssignmentId, request.params.id),
      orderBy: (d, { asc }) => [asc(d.sortOrder), asc(d.createdAt)],
    });
    return { data: delivs };
  });

  // POST /tasks/:id/deliverables — PM creates a deliverable
  app.post<{ Params: { id: string } }>('/tasks/:id/deliverables', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({
      title: z.string().min(1).max(255),
      description: z.string().nullable().optional(),
      estimatedHours: z.coerce.number().positive().nullable().optional(),
      sortOrder: z.coerce.number().int().min(0).optional(),
    }).parse(request.body);

    const task = await request.server.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.id),
    });
    if (!task) return reply.notFound('Task not found');

    const userId = request.session?.user?.id;
    const [created] = await request.server.db.insert(taskDeliverables).values({
      taskAssignmentId: request.params.id,
      title: body.title,
      description: body.description || null,
      estimatedHours: body.estimatedHours ? String(body.estimatedHours) : null,
      sortOrder: body.sortOrder ?? 0,
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: created });
  });

  // PATCH /tasks/:taskId/deliverables/:deliverableId — PM updates a deliverable
  app.patch<{ Params: { taskId: string; deliverableId: string } }>('/tasks/:taskId/deliverables/:deliverableId', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().nullable().optional(),
      estimatedHours: z.coerce.number().positive().nullable().optional(),
      sortOrder: z.coerce.number().int().min(0).optional(),
    }).parse(request.body);

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.estimatedHours !== undefined) updates.estimatedHours = body.estimatedHours ? String(body.estimatedHours) : null;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    const [updated] = await request.server.db.update(taskDeliverables)
      .set(updates)
      .where(and(
        eq(taskDeliverables.id, request.params.deliverableId),
        eq(taskDeliverables.taskAssignmentId, request.params.taskId),
      ))
      .returning();
    if (!updated) return reply.notFound('Deliverable not found');
    return { data: updated };
  });

  // DELETE /tasks/:taskId/deliverables/:deliverableId — PM removes a deliverable
  app.delete<{ Params: { taskId: string; deliverableId: string } }>('/tasks/:taskId/deliverables/:deliverableId', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const deliv = await request.server.db.query.taskDeliverables.findFirst({
      where: and(
        eq(taskDeliverables.id, request.params.deliverableId),
        eq(taskDeliverables.taskAssignmentId, request.params.taskId),
      ),
    });
    if (!deliv) return reply.notFound('Deliverable not found');
    if (deliv.status === 'APPROVED') return reply.badRequest('Cannot delete an approved deliverable');

    await request.server.db.delete(taskDeliverables)
      .where(eq(taskDeliverables.id, request.params.deliverableId));
    return reply.status(204).send();
  });

  // POST /tasks/:taskId/deliverables/:deliverableId/log — staff logs work on a deliverable
  app.post<{ Params: { taskId: string; deliverableId: string } }>('/tasks/:taskId/deliverables/:deliverableId/log', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const body = z.object({
      workDate: z.string(),
      hours: z.coerce.number().positive().max(24),
      description: z.string().min(1),
    }).parse(request.body);

    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(request.server.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found');

    const task = await request.server.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.taskId),
    });
    if (!task) return reply.notFound('Task not found');
    if (task.staffMemberId !== staff.id) return reply.forbidden('You are not assigned to this task');
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      return reply.badRequest('Cannot log work on a completed or cancelled task');
    }

    const deliv = await request.server.db.query.taskDeliverables.findFirst({
      where: and(
        eq(taskDeliverables.id, request.params.deliverableId),
        eq(taskDeliverables.taskAssignmentId, request.params.taskId),
      ),
    });
    if (!deliv) return reply.notFound('Deliverable not found');
    if (deliv.status === 'APPROVED') return reply.badRequest('This deliverable is already approved');

    // Create the log entry
    const [log] = await request.server.db.insert(deliverableLogs).values({
      deliverableId: request.params.deliverableId,
      taskAssignmentId: request.params.taskId,
      staffMemberId: staff.id,
      workDate: body.workDate,
      hours: String(body.hours),
      description: body.description,
    }).returning();

    // Move deliverable to IN_PROGRESS if it was NOT_STARTED
    if (deliv.status === 'NOT_STARTED') {
      await request.server.db.update(taskDeliverables)
        .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
        .where(eq(taskDeliverables.id, request.params.deliverableId));
    }

    // Also update task loggedHours + remainingHours
    const newLogged = Number(task.loggedHours) + body.hours;
    const newRemaining = Math.max(0, Number(task.allocatedHours) - newLogged);
    await request.server.db.update(taskAssignments)
      .set({
        loggedHours: String(newLogged),
        remainingHours: String(newRemaining),
        timeExhausted: newLogged >= Number(task.allocatedHours),
        updatedAt: new Date(),
      })
      .where(eq(taskAssignments.id, request.params.taskId));

    return reply.status(201).send({ data: log });
  });

  // POST /tasks/:taskId/deliverables/:deliverableId/submit — staff submits for review
  app.post<{ Params: { taskId: string; deliverableId: string } }>('/tasks/:taskId/deliverables/:deliverableId/submit', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(request.server.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found');

    const task = await request.server.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.taskId),
      with: { staffMember: true },
    });
    if (!task) return reply.notFound('Task not found');
    if (task.staffMemberId !== staff.id) return reply.forbidden('You are not assigned to this task');

    const deliv = await request.server.db.query.taskDeliverables.findFirst({
      where: and(
        eq(taskDeliverables.id, request.params.deliverableId),
        eq(taskDeliverables.taskAssignmentId, request.params.taskId),
      ),
    });
    if (!deliv) return reply.notFound('Deliverable not found');
    if (deliv.status === 'APPROVED') return reply.badRequest('Already approved');
    if (deliv.status === 'SUBMITTED') return reply.badRequest('Already submitted for review');

    const [updated] = await request.server.db.update(taskDeliverables)
      .set({ status: 'SUBMITTED', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(taskDeliverables.id, request.params.deliverableId))
      .returning();

    // Notify PMs
    await createBroadcastNotification(request.server, {
      type: 'DELIVERABLE_SUBMITTED',
      priority: 'NORMAL',
      title: 'Deliverable Submitted for Review',
      message: `${staff.name} submitted "${deliv.title}" on task ${task.number} for review.`,
      actionUrl: `/pm/tasks/${request.params.taskId}`,
      referenceType: 'TASK_ASSIGNMENT',
      referenceId: request.params.taskId,
    });

    return { data: updated };
  });

  // POST /tasks/:taskId/deliverables/:deliverableId/approve — PM approves
  app.post<{ Params: { taskId: string; deliverableId: string } }>('/tasks/:taskId/deliverables/:deliverableId/approve', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const userId = request.session?.user?.id;

    const deliv = await request.server.db.query.taskDeliverables.findFirst({
      where: and(
        eq(taskDeliverables.id, request.params.deliverableId),
        eq(taskDeliverables.taskAssignmentId, request.params.taskId),
      ),
    });
    if (!deliv) return reply.notFound('Deliverable not found');
    if (deliv.status === 'APPROVED') return reply.badRequest('Already approved');

    const [updated] = await request.server.db.update(taskDeliverables)
      .set({ status: 'APPROVED', reviewedBy: userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(taskDeliverables.id, request.params.deliverableId))
      .returning();

    // Notify assigned staff
    const task = await request.server.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.taskId),
      with: { staffMember: true },
    });
    if (task?.staffMember?.userId) {
      await createNotification(request.server, {
        type: 'DELIVERABLE_APPROVED',
        priority: 'NORMAL',
        title: 'Deliverable Approved',
        message: `Your deliverable "${deliv.title}" on task ${task.number} has been approved.`,
        userId: task.staffMember.userId,
        actionUrl: `/employee/tasks/${request.params.taskId}`,
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: request.params.taskId,
      });
    }

    // Check if all deliverables are now approved → auto-complete task
    await maybeAutoCompleteTask(request.params.taskId);

    return { data: updated };
  });

  // POST /tasks/:taskId/deliverables/:deliverableId/reject — PM rejects with reason
  app.post<{ Params: { taskId: string; deliverableId: string } }>('/tasks/:taskId/deliverables/:deliverableId/reject', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request, reply) => {
    const body = z.object({
      rejectionReason: z.string().min(1),
    }).parse(request.body);

    const userId = request.session?.user?.id;

    const deliv = await request.server.db.query.taskDeliverables.findFirst({
      where: and(
        eq(taskDeliverables.id, request.params.deliverableId),
        eq(taskDeliverables.taskAssignmentId, request.params.taskId),
      ),
    });
    if (!deliv) return reply.notFound('Deliverable not found');

    const [updated] = await request.server.db.update(taskDeliverables)
      .set({
        status: 'IN_PROGRESS',
        rejectionReason: body.rejectionReason,
        reviewedBy: userId,
        reviewedAt: new Date(),
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(taskDeliverables.id, request.params.deliverableId))
      .returning();

    // Notify staff
    const task = await request.server.db.query.taskAssignments.findFirst({
      where: eq(taskAssignments.id, request.params.taskId),
      with: { staffMember: true },
    });
    if (task?.staffMember?.userId) {
      await createNotification(request.server, {
        type: 'DELIVERABLE_REJECTED',
        priority: 'HIGH',
        title: 'Deliverable Returned for Rework',
        message: `Your deliverable "${deliv.title}" on task ${task.number} was returned: ${body.rejectionReason}`,
        userId: task.staffMember.userId,
        actionUrl: `/employee/tasks/${request.params.taskId}`,
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: request.params.taskId,
      });
    }

    return { data: updated };
  });

  // GET /deliverables/review-queue — PM review queue (all SUBMITTED deliverables)
  app.get('/deliverables/review-queue', {
    preHandler: requireRole('admin', 'project_manager'),
  }, async (request) => {
    const pending = await request.server.db.query.taskDeliverables.findMany({
      where: eq(taskDeliverables.status, 'SUBMITTED'),
      with: {
        taskAssignment: {
          with: { staffMember: true, project: true },
        },
      },
      orderBy: (d, { asc }) => [asc(d.submittedAt)],
    });
    return { data: pending };
  });

  // GET /tasks/:id/deliverables/:deliverableId/logs — history of work logs for a deliverable
  app.get<{ Params: { id: string; deliverableId: string } }>('/tasks/:id/deliverables/:deliverableId/logs', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const logs = await request.server.db.query.deliverableLogs.findMany({
      where: and(
        eq(deliverableLogs.deliverableId, request.params.deliverableId),
        eq(deliverableLogs.taskAssignmentId, request.params.id),
      ),
      with: { staffMember: true },
      orderBy: (l, { desc }) => [desc(l.workDate)],
    });
    return { data: logs };
  });

  // Staff: update a request when PM asks for more info
  app.patch<{ Params: { id: string } }>('/my/task-requests/:id', { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().min(1).optional(),
      justification: z.string().min(1).optional(),
      estimatedHours: z.coerce.number().positive().optional(),
    }).parse(request.body);

    const userId = request.session?.user?.id;
    const staff = await getStaffMemberByUserId(app.db, userId!);
    if (!staff) return reply.badRequest('No staff member profile found for your user account');

    const existing = await app.db.query.taskRequests.findFirst({
      where: and(eq(taskRequests.id, request.params.id), eq(taskRequests.requestedByStaffId, staff.id)),
    });
    if (!existing) return reply.notFound('Task request not found');
    if (existing.status !== 'NEEDS_INFO' && existing.status !== 'PENDING') {
      return reply.badRequest('Cannot edit a request that has been approved or rejected');
    }

    const updates: Record<string, any> = { updatedAt: new Date(), status: 'PENDING' };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.justification !== undefined) updates.justification = body.justification;
    if (body.estimatedHours !== undefined) updates.estimatedHours = String(body.estimatedHours);

    const [updated] = await app.db.update(taskRequests).set(updates).where(eq(taskRequests.id, request.params.id)).returning();
    return { data: updated };
  });
}
