import type { FastifyInstance } from 'fastify';
import { eq, sql, and, isNull, gte, lte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  projects, projectMilestones, budgetLineItems, actualCostEntries,
  rateCards, timesheets, timesheetEntries, sowDocuments, sowDocumentVersions,
  costEstimationHistory, taskAssignments, taskTimeLogs, staffMembers, companySettings,
} from '@xarra/db';
import {
  createProjectSchema, updateProjectSchema,
  createMilestoneSchema, updateMilestoneSchema,
  createBudgetLineItemSchema, updateBudgetLineItemSchema,
  createActualCostSchema,
  createRateCardSchema, updateRateCardSchema,
  createTimesheetSchema, updateTimesheetSchema,
  createSowSchema, updateSowSchema,
  paginationSchema,
  costEstimateRequestSchema, applyEstimatesSchema,
  sendSowEmailSchema, sendDocumentEmailSchema,
  rejectTimesheetSchema, voidActualCostSchema,
  applyMilestoneTemplateSchema,
} from '@xarra/shared';
import { MILESTONE_TEMPLATES } from '@xarra/shared';
import { requirePermission, requireAuth } from '../../middleware/require-auth.js';
import { hasPermission } from '@xarra/shared';
import { requireIdempotencyKey, getIdempotencyKey } from '../../middleware/idempotency.js';
import {
  nextProjectNumber, nextTimesheetNumber, nextSowNumber,
} from '../finance/invoice-number.js';
import { generatePdf } from '../../services/pdf.js';
import { sendDocumentEmail } from '../../services/document-email.js';
import { config } from '../../config.js';
import { renderSowHtml as _renderSowHtml } from '../../services/templates/sow.js';
import { renderTimesheetHtml as _renderTimesheetHtml } from '../../services/templates/timesheet.js';
import { renderBudgetReportHtml as _renderBudgetReportHtml } from '../../services/templates/budget-report.js';

// Template functions accept loose types from DB (string decimals, etc.)
const renderSowHtml = _renderSowHtml as (data: any) => string;
const renderTimesheetHtml = _renderTimesheetHtml as (data: any) => string;
const renderBudgetReportHtml = _renderBudgetReportHtml as (data: any) => string;

export async function budgetingRoutes(app: FastifyInstance) {

  const deriveSowWorkflowStage = (sowStatus: string, taskStatuses: string[]) => {
    if (sowStatus === 'DRAFT') return 'DRAFT_SOW';
    if (sowStatus === 'SENT') return 'SOW_SENT';
    if (sowStatus === 'CANCELLED') return 'CANCELLED';
    if (sowStatus === 'EXPIRED') return 'EXPIRED';
    if (sowStatus !== 'ACCEPTED') return 'UNKNOWN';

    if (taskStatuses.length === 0) return 'SOW_ACCEPTED';

    const allFinal = taskStatuses.every((s) => s === 'COMPLETED' || s === 'CANCELLED');
    if (allFinal) return 'DELIVERY_COMPLETE';

    const hasExecution = taskStatuses.some((s) => s === 'IN_PROGRESS' || s === 'REVIEW');
    if (hasExecution) return 'IN_PROGRESS';

    const hasPlanningOnly = taskStatuses.every((s) => s === 'ASSIGNED' || s === 'DRAFT');
    if (hasPlanningOnly) return 'TASKS_PLANNED';

    return 'TASKS_PLANNED';
  };

  const deriveMilestonePipelineStatus = (
    milestone: { status: string; actualStartDate: Date | null; actualEndDate: Date | null },
    taskStatuses: string[],
  ) => {
    if (milestone.status === 'CANCELLED') return 'CANCELLED';
    if (milestone.actualEndDate) return 'COMPLETED';

    if (!taskStatuses.length) {
      if (milestone.actualStartDate) return 'IN_PROGRESS';
      return milestone.status || 'NOT_STARTED';
    }

    const allFinal = taskStatuses.every((s) => s === 'COMPLETED' || s === 'CANCELLED');
    const hasCompleted = taskStatuses.some((s) => s === 'COMPLETED');
    const hasStarted = taskStatuses.some((s) =>
      s === 'ASSIGNED' || s === 'IN_PROGRESS' || s === 'REVIEW' || s === 'COMPLETED',
    );

    if (allFinal && hasCompleted) return 'COMPLETED';
    if (allFinal && !hasCompleted) return 'CANCELLED';
    if (hasStarted || milestone.actualStartDate) return 'IN_PROGRESS';
    return 'NOT_STARTED';
  };

  // ==========================================
  // PROJECTS
  // ==========================================

  // List projects
  app.get('/projects', { preHandler: requirePermission('budgeting', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${projects.name} ILIKE ${'%' + search + '%'} OR ${projects.number} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.projects.findMany({
        where: where ? () => where : undefined,
        with: { title: true, author: true, manager: true },
        orderBy: (p, { desc }) => [desc(p.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(projects).where(where),
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

  // Get single project with all nested data
  app.get<{ Params: { id: string } }>('/projects/:id', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request, reply) => {
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.id),
      with: {
        title: true,
        author: true,
        manager: true,
        milestones: { orderBy: (m, { asc }) => [asc(m.sortOrder)] },
        budgetLineItems: {
          with: { milestone: true, rateCard: true, contractor: true },
        },
        actualCostEntries: {
          with: { milestone: true, budgetLineItem: true },
        },
      },
    });
    if (!project) return reply.notFound('Project not found');

    const milestoneTaskRows = await app.db.query.taskAssignments.findMany({
      where: and(
        eq(taskAssignments.projectId, request.params.id),
        sql`${taskAssignments.milestoneId} IS NOT NULL`,
      ),
      columns: {
        milestoneId: true,
        status: true,
      },
    });

    const taskStatusByMilestoneId = new Map<string, string[]>();
    for (const row of milestoneTaskRows) {
      if (!row.milestoneId) continue;
      const statuses = taskStatusByMilestoneId.get(row.milestoneId) || [];
      statuses.push(row.status);
      taskStatusByMilestoneId.set(row.milestoneId, statuses);
    }

    const milestones = project.milestones.map((m) => ({
      ...m,
      status: deriveMilestonePipelineStatus(m, taskStatusByMilestoneId.get(m.id) || []),
    }));

    // Compute xarraNetBudget
    const totalBudget = Number(project.totalBudget) || 0;
    const authorContribution = Number(project.authorContribution) || 0;

    return {
      data: {
        ...project,
        milestones,
        xarraNetBudget: String(totalBudget - authorContribution),
      },
    };
  });

  // Create project
  app.post('/projects', {
    preHandler: [requirePermission('budgeting', 'create'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createProjectSchema.parse(request.body);
    const idempotencyKey = getIdempotencyKey(request)!;
    const userId = request.session?.user?.id;

    const existing = await app.db.query.projects.findFirst({
      where: eq(projects.idempotencyKey, idempotencyKey),
    });
    if (existing) return { data: existing };

    const number = await nextProjectNumber(app.db as any);

    const [project] = await app.db.insert(projects).values({
      number,
      name: body.name,
      titleId: body.titleId || null,
      authorId: body.authorId || null,
      projectManager: body.projectManager || null,
      projectType: body.projectType,
      contractType: body.contractType,
      authorContribution: body.authorContribution ? String(body.authorContribution) : '0',
      description: body.description || null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      targetCompletionDate: body.targetCompletionDate ? new Date(body.targetCompletionDate) : null,
      currency: body.currency,
      notes: body.notes || null,
      createdBy: userId,
      idempotencyKey,
    }).returning();

    // Auto-apply milestone template based on project type
    const templateKey = body.projectType as keyof typeof MILESTONE_TEMPLATES;
    const template = MILESTONE_TEMPLATES[templateKey] || [];
    if (template.length > 0) {
      await app.db.insert(projectMilestones).values(
        template.map((m) => ({
          projectId: project.id,
          code: m.code,
          name: m.name,
          sortOrder: m.sortOrder,
          createdBy: userId,
        })),
      );
    }

    return reply.status(201).send({ data: project });
  });

  // Update project
  app.patch<{ Params: { id: string } }>('/projects/:id', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const body = updateProjectSchema.parse(request.body);
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (body.name !== undefined) updates.name = body.name;
    if (body.titleId !== undefined) updates.titleId = body.titleId || null;
    if (body.authorId !== undefined) updates.authorId = body.authorId || null;
    if (body.projectManager !== undefined) updates.projectManager = body.projectManager || null;
    if (body.projectType !== undefined) updates.projectType = body.projectType;
    if (body.contractType !== undefined) updates.contractType = body.contractType;
    if (body.authorContribution !== undefined) updates.authorContribution = String(body.authorContribution);
    // Status changes only through dedicated workflow endpoints (submit-budget, approve-budget, complete)
    if (body.description !== undefined) updates.description = body.description;
    if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.targetCompletionDate !== undefined) updates.targetCompletionDate = body.targetCompletionDate ? new Date(body.targetCompletionDate) : null;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await app.db.update(projects)
      .set(updates)
      .where(eq(projects.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Project not found');
    return { data: updated };
  });

  // Delete project (only PLANNING status)
  app.delete<{ Params: { id: string } }>('/projects/:id', {
    preHandler: requirePermission('budgeting', 'delete'),
  }, async (request, reply) => {
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.id),
    });
    if (!project) return reply.notFound('Project not found');
    if (project.status !== 'PLANNING') {
      return reply.badRequest('Only projects in PLANNING status can be deleted');
    }
    await app.db.delete(projects).where(eq(projects.id, request.params.id));
    return { success: true };
  });

  // ==========================================
  // MILESTONES
  // ==========================================

  // List milestones for a project
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/milestones', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request) => {
    const items = await app.db.query.projectMilestones.findMany({
      where: eq(projectMilestones.projectId, request.params.projectId),
      orderBy: (m, { asc }) => [asc(m.sortOrder)],
    });

    const taskRows = await app.db.query.taskAssignments.findMany({
      where: and(
        eq(taskAssignments.projectId, request.params.projectId),
        sql`${taskAssignments.milestoneId} IS NOT NULL`,
      ),
      columns: {
        milestoneId: true,
        status: true,
      },
    });

    const taskStatusByMilestoneId = new Map<string, string[]>();
    for (const row of taskRows) {
      if (!row.milestoneId) continue;
      const statuses = taskStatusByMilestoneId.get(row.milestoneId) || [];
      statuses.push(row.status);
      taskStatusByMilestoneId.set(row.milestoneId, statuses);
    }

    const derivedItems = items.map((m) => ({
      ...m,
      status: deriveMilestonePipelineStatus(m, taskStatusByMilestoneId.get(m.id) || []),
    }));

    return { data: derivedItems };
  });

  // Create milestone
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/milestones', {
    preHandler: requirePermission('budgeting', 'create'),
  }, async (request, reply) => {
    const body = createMilestoneSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const [milestone] = await app.db.insert(projectMilestones).values({
      projectId: request.params.projectId,
      code: body.code,
      name: body.name,
      sortOrder: body.sortOrder,
      plannedStartDate: body.plannedStartDate ? new Date(body.plannedStartDate) : null,
      plannedEndDate: body.plannedEndDate ? new Date(body.plannedEndDate) : null,
      notes: body.notes || null,
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: milestone });
  });

  // Update milestone
  app.patch<{ Params: { id: string } }>('/milestones/:id', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const body = updateMilestoneSchema.parse(request.body);
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.status !== undefined) updates.status = body.status;
    if (body.plannedStartDate !== undefined) updates.plannedStartDate = body.plannedStartDate ? new Date(body.plannedStartDate) : null;
    if (body.plannedEndDate !== undefined) updates.plannedEndDate = body.plannedEndDate ? new Date(body.plannedEndDate) : null;
    if (body.actualStartDate !== undefined) updates.actualStartDate = body.actualStartDate ? new Date(body.actualStartDate) : null;
    if (body.actualEndDate !== undefined) updates.actualEndDate = body.actualEndDate ? new Date(body.actualEndDate) : null;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await app.db.update(projectMilestones)
      .set(updates)
      .where(eq(projectMilestones.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Milestone not found');
    return { data: updated };
  });

  // Delete milestone
  app.delete<{ Params: { id: string } }>('/milestones/:id', {
    preHandler: requirePermission('budgeting', 'delete'),
  }, async (request, reply) => {
    // Check if milestone has budget lines or actuals
    const [lines, actuals] = await Promise.all([
      app.db.select({ count: sql<number>`count(*)` })
        .from(budgetLineItems)
        .where(eq(budgetLineItems.milestoneId, request.params.id)),
      app.db.select({ count: sql<number>`count(*)` })
        .from(actualCostEntries)
        .where(eq(actualCostEntries.milestoneId, request.params.id)),
    ]);

    if (Number(lines[0].count) > 0 || Number(actuals[0].count) > 0) {
      return reply.badRequest('Cannot delete milestone with existing budget lines or actual costs');
    }

    await app.db.delete(projectMilestones).where(eq(projectMilestones.id, request.params.id));
    return { success: true };
  });

  // Apply milestone template to project
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/milestones/template', {
    preHandler: requirePermission('budgeting', 'create'),
  }, async (request, reply) => {
    const { templateType } = applyMilestoneTemplateSchema.parse(request.body);
    const userId = request.session?.user?.id;

    // Check for existing milestones to prevent duplicates
    const existing = await app.db.query.projectMilestones.findMany({
      where: eq(projectMilestones.projectId, request.params.projectId),
    });
    if (existing.length > 0) {
      return reply.badRequest('Project already has milestones. Remove existing milestones before applying a template.');
    }

    const template = MILESTONE_TEMPLATES[templateType as keyof typeof MILESTONE_TEMPLATES];
    if (!template || template.length === 0) {
      return reply.badRequest('Invalid or empty template type');
    }

    const milestones = await app.db.insert(projectMilestones).values(
      template.map((m) => ({
        projectId: request.params.projectId,
        code: m.code,
        name: m.name,
        sortOrder: m.sortOrder,
        createdBy: userId,
      })),
    ).returning();

    return reply.status(201).send({ data: milestones });
  });

  // ==========================================
  // BUDGET LINE ITEMS
  // ==========================================

  // List budget lines for a project
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/budget-lines', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request) => {
    const items = await app.db.query.budgetLineItems.findMany({
      where: eq(budgetLineItems.projectId, request.params.projectId),
      with: { milestone: true, rateCard: true, contractor: true },
      orderBy: (b, { asc }) => [asc(b.createdAt)],
    });
    return { data: items };
  });

  // Create budget line item
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/budget-lines', {
    preHandler: [requirePermission('budgeting', 'create'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createBudgetLineItemSchema.parse(request.body);
    const idempotencyKey = getIdempotencyKey(request)!;
    const userId = request.session?.user?.id;

    const existing = await app.db.query.budgetLineItems.findFirst({
      where: eq(budgetLineItems.idempotencyKey, idempotencyKey),
    });
    if (existing) return { data: existing };

    const [item] = await app.db.insert(budgetLineItems).values({
      projectId: request.params.projectId,
      milestoneId: body.milestoneId || null,
      category: body.category,
      costClassification: body.costClassification,
      customCategory: body.customCategory || null,
      description: body.description,
      sourceType: body.sourceType,
      estimatedHours: body.estimatedHours != null ? String(body.estimatedHours) : null,
      hourlyRate: body.hourlyRate != null ? String(body.hourlyRate) : null,
      estimatedAmount: String(body.estimatedAmount),
      rateCardId: body.rateCardId || null,
      staffUserId: body.staffUserId || null,
      contractorId: body.contractorId || null,
      externalQuote: body.externalQuote != null ? String(body.externalQuote) : null,
      notes: body.notes || null,
      createdBy: userId,
      idempotencyKey,
    }).returning();

    // Recalculate project totalBudget
    await recalcProjectBudget(app, request.params.projectId);

    return reply.status(201).send({ data: item });
  });

  // Update budget line item
  app.patch<{ Params: { id: string } }>('/budget-lines/:id', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const body = updateBudgetLineItemSchema.parse(request.body);
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (body.milestoneId !== undefined) updates.milestoneId = body.milestoneId || null;
    if (body.category !== undefined) updates.category = body.category;
    if (body.costClassification !== undefined) updates.costClassification = body.costClassification;
    if (body.customCategory !== undefined) updates.customCategory = body.customCategory;
    if (body.description !== undefined) updates.description = body.description;
    if (body.sourceType !== undefined) updates.sourceType = body.sourceType;
    if (body.estimatedHours !== undefined) updates.estimatedHours = body.estimatedHours != null ? String(body.estimatedHours) : null;
    if (body.hourlyRate !== undefined) updates.hourlyRate = body.hourlyRate != null ? String(body.hourlyRate) : null;
    if (body.estimatedAmount !== undefined) updates.estimatedAmount = String(body.estimatedAmount);
    if (body.rateCardId !== undefined) updates.rateCardId = body.rateCardId || null;
    if (body.staffUserId !== undefined) updates.staffUserId = body.staffUserId || null;
    if (body.contractorId !== undefined) updates.contractorId = body.contractorId || null;
    if (body.externalQuote !== undefined) updates.externalQuote = body.externalQuote != null ? String(body.externalQuote) : null;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await app.db.update(budgetLineItems)
      .set(updates)
      .where(eq(budgetLineItems.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Budget line item not found');

    // Recalculate project totalBudget
    await recalcProjectBudget(app, updated.projectId);

    return { data: updated };
  });

  // Delete budget line item
  app.delete<{ Params: { id: string } }>('/budget-lines/:id', {
    preHandler: requirePermission('budgeting', 'delete'),
  }, async (request, reply) => {
    const item = await app.db.query.budgetLineItems.findFirst({
      where: eq(budgetLineItems.id, request.params.id),
    });
    if (!item) return reply.notFound('Budget line item not found');

    await app.db.delete(budgetLineItems).where(eq(budgetLineItems.id, request.params.id));
    await recalcProjectBudget(app, item.projectId);
    return { success: true };
  });

  // ==========================================
  // ACTUAL COST ENTRIES
  // ==========================================

  // List actuals for a project
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/actuals', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request) => {
    const items = await app.db.query.actualCostEntries.findMany({
      where: and(
        eq(actualCostEntries.projectId, request.params.projectId),
        isNull(actualCostEntries.voidedAt),
      ),
      with: { milestone: true, budgetLineItem: true },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });
    return { data: items };
  });

  // Record actual cost
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/actuals', {
    preHandler: [requirePermission('budgeting', 'create'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createActualCostSchema.parse(request.body);
    const idempotencyKey = getIdempotencyKey(request)!;
    const userId = request.session?.user?.id;

    const existing = await app.db.query.actualCostEntries.findFirst({
      where: eq(actualCostEntries.idempotencyKey, idempotencyKey),
    });
    if (existing) return { data: existing };

    const [entry] = await app.db.insert(actualCostEntries).values({
      projectId: request.params.projectId,
      milestoneId: body.milestoneId || null,
      budgetLineItemId: body.budgetLineItemId || null,
      category: body.category,
      costClassification: body.costClassification,
      customCategory: body.customCategory || null,
      description: body.description,
      sourceType: body.sourceType,
      amount: String(body.amount),
      vendor: body.vendor || null,
      invoiceRef: body.invoiceRef || null,
      paidDate: body.paidDate ? new Date(body.paidDate) : null,
      receiptUrl: body.receiptUrl || null,
      staffUserId: body.staffUserId || null,
      contractorId: body.contractorId || null,
      notes: body.notes || null,
      createdBy: userId,
      idempotencyKey,
    }).returning();

    // Recalculate project totalActual
    await recalcProjectActual(app, request.params.projectId);

    return reply.status(201).send({ data: entry });
  });

  // Void actual cost (immutable pattern)
  app.post<{ Params: { id: string } }>('/actuals/:id/void', {
    preHandler: requirePermission('budgeting', 'void'),
  }, async (request, reply) => {
    const { reason } = voidActualCostSchema.parse(request.body);

    const entry = await app.db.query.actualCostEntries.findFirst({
      where: eq(actualCostEntries.id, request.params.id),
    });
    if (!entry) return reply.notFound('Actual cost entry not found');
    if (entry.voidedAt) return reply.badRequest('Entry already voided');

    const [voided] = await app.db.update(actualCostEntries)
      .set({ voidedAt: new Date(), voidedReason: reason })
      .where(eq(actualCostEntries.id, request.params.id))
      .returning();

    await recalcProjectActual(app, entry.projectId);

    return { data: voided };
  });

  // ==========================================
  // VARIANCE REPORT
  // ==========================================

  app.get<{ Params: { projectId: string } }>('/projects/:projectId/variance', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request) => {
    const projectId = request.params.projectId;

    // Budget grouped by classification
    const budgetByClassification = await app.db.execute<{ classification: string; total: string }>(sql`
      SELECT cost_classification as classification, COALESCE(SUM(estimated_amount::numeric), 0) as total
      FROM budget_line_items WHERE project_id = ${projectId}
      GROUP BY cost_classification
    `);

    // Actuals grouped by classification (exclude voided)
    const actualByClassification = await app.db.execute<{ classification: string; total: string }>(sql`
      SELECT cost_classification as classification, COALESCE(SUM(amount::numeric), 0) as total
      FROM actual_cost_entries WHERE project_id = ${projectId} AND voided_at IS NULL
      GROUP BY cost_classification
    `);

    // Budget grouped by milestone
    const budgetByMilestone = await app.db.execute<{ milestone_id: string; milestone_name: string; total: string }>(sql`
      SELECT bli.milestone_id, COALESCE(pm.name, 'Unassigned') as milestone_name,
             COALESCE(SUM(bli.estimated_amount::numeric), 0) as total
      FROM budget_line_items bli
      LEFT JOIN project_milestones pm ON pm.id = bli.milestone_id
      WHERE bli.project_id = ${projectId}
      GROUP BY bli.milestone_id, pm.name
    `);

    // Actuals grouped by milestone
    const actualByMilestone = await app.db.execute<{ milestone_id: string; milestone_name: string; total: string }>(sql`
      SELECT ace.milestone_id, COALESCE(pm.name, 'Unassigned') as milestone_name,
             COALESCE(SUM(ace.amount::numeric), 0) as total
      FROM actual_cost_entries ace
      LEFT JOIN project_milestones pm ON pm.id = ace.milestone_id
      WHERE ace.project_id = ${projectId} AND ace.voided_at IS NULL
      GROUP BY ace.milestone_id, pm.name
    `);

    // Line-level variance (budget line vs linked actuals)
    const lineVariance = await app.db.execute<{
      id: string; description: string; category: string; classification: string;
      estimated: string; actual: string;
    }>(sql`
      SELECT bli.id, bli.description, bli.category, bli.cost_classification as classification,
             bli.estimated_amount as estimated,
             COALESCE((
               SELECT SUM(ace.amount::numeric) FROM actual_cost_entries ace
               WHERE ace.budget_line_item_id = bli.id AND ace.voided_at IS NULL
             ), 0) as actual
      FROM budget_line_items bli
      WHERE bli.project_id = ${projectId}
      ORDER BY bli.created_at
    `);

    return {
      data: {
        byClassification: {
          budget: budgetByClassification,
          actual: actualByClassification,
        },
        byMilestone: {
          budget: budgetByMilestone,
          actual: actualByMilestone,
        },
        lineVariance: lineVariance.map((l) => ({
          ...l,
          variance: String(Number(l.estimated) - Number(l.actual)),
          variancePercent: Number(l.estimated) > 0
            ? String(((Number(l.estimated) - Number(l.actual)) / Number(l.estimated) * 100).toFixed(1))
            : '0',
        })),
      },
    };
  });

  // ==========================================
  // BUDGET DASHBOARD (cross-project)
  // ==========================================

  app.get('/dashboard', { preHandler: requirePermission('budgeting', 'read') }, async () => {
    // Summary stats
    const stats = await app.db.execute<{
      total_projects: string; in_progress: string; total_budgeted: string; total_actual: string;
    }>(sql`
      SELECT
        COUNT(*) as total_projects,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress,
        COALESCE(SUM(total_budget::numeric), 0) as total_budgeted,
        COALESCE(SUM(total_actual::numeric), 0) as total_actual
      FROM projects WHERE status != 'CANCELLED'
    `);

    // Over-budget projects
    const overBudget = await app.db.execute<{
      id: string; number: string; name: string; total_budget: string; total_actual: string;
    }>(sql`
      SELECT id, number, name, total_budget, total_actual
      FROM projects
      WHERE total_actual::numeric > total_budget::numeric
        AND total_budget::numeric > 0
        AND status != 'CANCELLED'
      ORDER BY (total_actual::numeric - total_budget::numeric) DESC
      LIMIT 10
    `);

    // Recent projects
    const recent = await app.db.query.projects.findMany({
      with: { title: true, author: true },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
      limit: 10,
    });

    return {
      data: {
        stats: stats[0],
        overBudget,
        recentProjects: recent,
      },
    };
  });

  // ==========================================
  // COST COMPARISON (internal vs external)
  // ==========================================

  app.get<{ Params: { projectId: string } }>('/projects/:projectId/cost-comparison', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request) => {
    const items = await app.db.query.budgetLineItems.findMany({
      where: eq(budgetLineItems.projectId, request.params.projectId),
      with: { milestone: true, rateCard: true, contractor: true },
    });

    const comparison = items.map((item) => ({
      id: item.id,
      description: item.description,
      category: item.category,
      milestone: item.milestone?.name || 'Unassigned',
      sourceType: item.sourceType,
      internalCost: item.sourceType === 'INTERNAL' ? item.estimatedAmount : null,
      externalCost: item.sourceType === 'EXTERNAL' ? item.estimatedAmount : null,
      externalQuote: item.externalQuote,
      recommendation: item.externalQuote && item.estimatedAmount
        ? Number(item.externalQuote) < Number(item.estimatedAmount) ? 'EXTERNAL' : 'INTERNAL'
        : null,
    }));

    return { data: comparison };
  });

  // ==========================================
  // RATE CARDS
  // ==========================================

  app.get('/rate-cards', { preHandler: requirePermission('budgeting', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${rateCards.name} ILIKE ${'%' + search + '%'} OR ${rateCards.role} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.rateCards.findMany({
        where: where ? () => where : undefined,
        with: { staffUser: true, supplier: true },
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(rateCards).where(where),
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

  app.get<{ Params: { id: string } }>('/rate-cards/:id', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request, reply) => {
    const card = await app.db.query.rateCards.findFirst({
      where: eq(rateCards.id, request.params.id),
      with: { staffUser: true, supplier: true },
    });
    if (!card) return reply.notFound('Rate card not found');
    return { data: card };
  });

  app.post('/rate-cards', {
    preHandler: [requirePermission('budgeting', 'create'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createRateCardSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const [card] = await app.db.insert(rateCards).values({
      name: body.name,
      type: body.type,
      role: body.role,
      hourlyRateZar: String(body.hourlyRateZar),
      dailyRateZar: body.dailyRateZar ? String(body.dailyRateZar) : null,
      staffUserId: body.staffUserId || null,
      supplierId: body.supplierId || null,
      effectiveFrom: new Date(body.effectiveFrom),
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      currency: body.currency,
      notes: body.notes || null,
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: card });
  });

  app.patch<{ Params: { id: string } }>('/rate-cards/:id', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const body = updateRateCardSchema.parse(request.body);
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (body.name !== undefined) updates.name = body.name;
    if (body.type !== undefined) updates.type = body.type;
    if (body.role !== undefined) updates.role = body.role;
    if (body.hourlyRateZar !== undefined) updates.hourlyRateZar = String(body.hourlyRateZar);
    if (body.dailyRateZar !== undefined) updates.dailyRateZar = body.dailyRateZar ? String(body.dailyRateZar) : null;
    if (body.staffUserId !== undefined) updates.staffUserId = body.staffUserId || null;
    if (body.supplierId !== undefined) updates.supplierId = body.supplierId || null;
    if (body.effectiveFrom !== undefined) updates.effectiveFrom = new Date(body.effectiveFrom);
    if (body.effectiveTo !== undefined) updates.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await app.db.update(rateCards)
      .set(updates)
      .where(eq(rateCards.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Rate card not found');
    return { data: updated };
  });

  app.delete<{ Params: { id: string } }>('/rate-cards/:id', {
    preHandler: requirePermission('budgeting', 'delete'),
  }, async (request, reply) => {
    const [updated] = await app.db.update(rateCards)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(rateCards.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Rate card not found');
    return { data: updated };
  });

  // ==========================================
  // TIMESHEETS
  // ==========================================

  app.get('/timesheets', { preHandler: requirePermission('budgeting', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${timesheets.number} ILIKE ${'%' + search + '%'}`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.timesheets.findMany({
        where: where ? () => where : undefined,
        with: { project: true, worker: true },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(timesheets).where(where),
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

  app.get<{ Params: { id: string } }>('/timesheets/:id', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request, reply) => {
    const ts = await app.db.query.timesheets.findFirst({
      where: eq(timesheets.id, request.params.id),
      with: {
        project: true,
        worker: true,
        approvedByUser: true,
        entries: { with: { milestone: true } },
      },
    });
    if (!ts) return reply.notFound('Timesheet not found');
    return { data: ts };
  });

  app.post('/timesheets', {
    preHandler: [requirePermission('budgeting', 'create'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createTimesheetSchema.parse(request.body);
    const number = await nextTimesheetNumber(app.db as any);

    const [ts] = await app.db.insert(timesheets).values({
      number,
      projectId: body.projectId,
      userId: body.userId,
      periodFrom: new Date(body.periodFrom),
      periodTo: new Date(body.periodTo),
      notes: body.notes || null,
    }).returning();

    // Insert entries if provided
    if (body.entries && body.entries.length > 0) {
      await app.db.insert(timesheetEntries).values(
        body.entries.map((e) => ({
          timesheetId: ts.id,
          milestoneId: e.milestoneId,
          budgetLineItemId: e.budgetLineItemId || null,
          taskCodeId: e.taskCodeId || null,
          taskAssignmentId: e.taskAssignmentId || null,
          taskTimeLogId: e.taskTimeLogId || null,
          workDate: new Date(e.workDate),
          hours: String(e.hours),
          description: e.description,
        })),
      );
      // Update total hours
      const totalHours = body.entries.reduce((sum, e) => sum + e.hours, 0);
      await app.db.update(timesheets).set({ totalHours: String(totalHours) }).where(eq(timesheets.id, ts.id));
    }

    return reply.status(201).send({ data: ts });
  });

  // Generate a timesheet from APPROVED task time logs for a user/project/period.
  // This is the proper "tasks → timesheet" pipeline: source of truth is task time logs.
  app.post('/timesheets/generate', {
    preHandler: [requirePermission('budgeting', 'create'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = z.object({
      projectId: z.string().uuid(),
      userId: z.string(),
      periodFrom: z.string(),
      periodTo: z.string(),
      notes: z.string().nullable().optional(),
    }).parse(request.body);

    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);
    if (Number.isNaN(periodFrom.getTime()) || Number.isNaN(periodTo.getTime())) {
      return reply.badRequest('Invalid periodFrom/periodTo');
    }

    // Find the staff member record for this user
    const staff = await app.db.query.staffMembers.findFirst({
      where: eq(staffMembers.userId, body.userId),
    });
    if (!staff) {
      return reply.badRequest('No staff member profile found for this user.');
    }

    // Pull APPROVED task time logs in window for this staff member, restricted to tasks on this project.
    const projectTasks = await app.db.query.taskAssignments.findMany({
      where: and(
        eq(taskAssignments.projectId, body.projectId),
        eq(taskAssignments.staffMemberId, staff.id),
      ),
      columns: { id: true, milestoneId: true, taskCodeId: true, title: true },
    });
    if (projectTasks.length === 0) {
      return reply.badRequest('This staff member has no tasks on this project.');
    }
    const taskIds = projectTasks.map((t) => t.id);
    const taskById = new Map(projectTasks.map((t) => [t.id, t]));

    const logs = await app.db.query.taskTimeLogs.findMany({
      where: and(
        inArray(taskTimeLogs.taskAssignmentId, taskIds),
        eq(taskTimeLogs.status, 'APPROVED'),
        gte(taskTimeLogs.workDate, periodFrom),
        lte(taskTimeLogs.workDate, periodTo),
      ),
      orderBy: (l, { asc }) => [asc(l.workDate)],
    });

    if (logs.length === 0) {
      return reply.badRequest('No APPROVED task time logs found in this period for this staff member on this project.');
    }

    // Skip logs already pulled into another timesheet to prevent double-counting.
    const existing = await app.db.query.timesheetEntries.findMany({
      where: inArray(
        timesheetEntries.taskTimeLogId,
        logs.map((l) => l.id),
      ),
      columns: { taskTimeLogId: true },
    });
    const usedLogIds = new Set(existing.map((e) => e.taskTimeLogId).filter(Boolean));
    const freshLogs = logs.filter((l) => !usedLogIds.has(l.id));
    if (freshLogs.length === 0) {
      return reply.badRequest('All approved time logs in this period are already on existing timesheets.');
    }

    // Tasks must have a milestone (timesheet_entries.milestoneId is NOT NULL).
    const orphanLogs = freshLogs.filter((l) => !taskById.get(l.taskAssignmentId)?.milestoneId);
    if (orphanLogs.length > 0) {
      return reply.badRequest(
        `${orphanLogs.length} time log(s) belong to tasks without a milestone. Assign milestones to those tasks before generating a timesheet.`,
      );
    }

    const number = await nextTimesheetNumber(app.db as any);
    const totalHours = freshLogs.reduce((sum, l) => sum + Number(l.hours || 0), 0);

    const [ts] = await app.db.insert(timesheets).values({
      number,
      projectId: body.projectId,
      userId: body.userId,
      periodFrom,
      periodTo,
      totalHours: String(totalHours),
      notes: body.notes || `Generated from ${freshLogs.length} approved task time log(s).`,
    }).returning();

    await app.db.insert(timesheetEntries).values(
      freshLogs.map((l) => {
        const task = taskById.get(l.taskAssignmentId)!;
        return {
          timesheetId: ts.id,
          milestoneId: task.milestoneId!,
          budgetLineItemId: null,
          taskCodeId: task.taskCodeId || null,
          taskAssignmentId: l.taskAssignmentId,
          taskTimeLogId: l.id,
          workDate: l.workDate,
          hours: String(l.hours),
          description: `[${task.title}] ${l.description}`.slice(0, 500),
        };
      }),
    );

    return reply.status(201).send({
      data: ts,
      meta: {
        entriesCreated: freshLogs.length,
        totalHours,
        skippedAlreadyUsed: logs.length - freshLogs.length,
      },
    });
  });

  // Update timesheet entries
  app.patch<{ Params: { id: string } }>('/timesheets/:id', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const ts = await app.db.query.timesheets.findFirst({
      where: eq(timesheets.id, request.params.id),
    });
    if (!ts) return reply.notFound('Timesheet not found');
    if (ts.status !== 'DRAFT') return reply.badRequest('Only DRAFT timesheets can be edited');

    const body = updateTimesheetSchema.parse(request.body);

    // Delete existing entries and re-insert
    await app.db.delete(timesheetEntries).where(eq(timesheetEntries.timesheetId, request.params.id));

    if (body.entries.length > 0) {
      await app.db.insert(timesheetEntries).values(
        body.entries.map((e) => ({
          timesheetId: request.params.id,
          milestoneId: e.milestoneId,
          budgetLineItemId: e.budgetLineItemId || null,
          taskCodeId: e.taskCodeId || null,
          taskAssignmentId: e.taskAssignmentId || null,
          taskTimeLogId: e.taskTimeLogId || null,
          workDate: new Date(e.workDate),
          hours: String(e.hours),
          description: e.description,
        })),
      );
    }

    const totalHours = body.entries.reduce((sum, e) => sum + e.hours, 0);
    const [updated] = await app.db.update(timesheets)
      .set({
        totalHours: String(totalHours),
        notes: body.notes !== undefined ? body.notes : ts.notes,
        updatedAt: new Date(),
      })
      .where(eq(timesheets.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // Submit timesheet
  app.post<{ Params: { id: string } }>('/timesheets/:id/submit', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const ts = await app.db.query.timesheets.findFirst({
      where: eq(timesheets.id, request.params.id),
    });
    if (!ts) return reply.notFound('Timesheet not found');
    if (ts.status !== 'DRAFT') return reply.badRequest('Only DRAFT timesheets can be submitted');

    const [updated] = await app.db.update(timesheets)
      .set({ status: 'SUBMITTED', updatedAt: new Date() })
      .where(eq(timesheets.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // Approve timesheet
  app.post<{ Params: { id: string } }>('/timesheets/:id/approve', {
    preHandler: requirePermission('budgeting', 'approve'),
  }, async (request, reply) => {
    const ts = await app.db.query.timesheets.findFirst({
      where: eq(timesheets.id, request.params.id),
    });
    if (!ts) return reply.notFound('Timesheet not found');
    if (ts.status !== 'SUBMITTED') return reply.badRequest('Only SUBMITTED timesheets can be approved');

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(timesheets)
      .set({
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(timesheets.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // Reject timesheet
  app.post<{ Params: { id: string } }>('/timesheets/:id/reject', {
    preHandler: requirePermission('budgeting', 'approve'),
  }, async (request, reply) => {
    const { reason } = rejectTimesheetSchema.parse(request.body);
    const ts = await app.db.query.timesheets.findFirst({
      where: eq(timesheets.id, request.params.id),
    });
    if (!ts) return reply.notFound('Timesheet not found');
    if (ts.status !== 'SUBMITTED') return reply.badRequest('Only SUBMITTED timesheets can be rejected');

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(timesheets)
      .set({
        status: 'REJECTED',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(timesheets.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // ==========================================
  // SOW DOCUMENTS
  // ==========================================

  app.get('/sow', { preHandler: requirePermission('budgeting', 'read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${sowDocuments.number} ILIKE ${'%' + search + '%'} OR ${sowDocuments.scope} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.sowDocuments.findMany({
        where: where ? () => where : undefined,
        with: { project: true, contractor: true, staffUser: true },
        orderBy: (s, { desc }) => [desc(s.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(sowDocuments).where(where),
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

  app.get<{ Params: { id: string } }>('/sow/:id', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const user = request.session!.user;
    const sow = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
      with: { project: { with: { title: true, author: true } }, contractor: true, staffUser: true, versions: true },
    });
    if (!sow) return reply.notFound('SOW not found');

    // Allow access if: user has budgeting.read permission (admin/finance)
    // OR the SOW is assigned to this user (they are the staff member)
    const canRead = hasPermission(user.role ?? '', 'budgeting', 'read') || sow.staffUserId === user.id;
    if (!canRead) return reply.forbidden('You do not have access to this SOW');

    const tasks = await app.db.query.taskAssignments.findMany({
      where: eq(taskAssignments.projectId, sow.projectId),
      columns: { id: true, status: true },
    });

    const taskStatuses = tasks.map((t) => t.status);
    const workflowStage = deriveSowWorkflowStage(sow.status, taskStatuses);

    return {
      data: {
        ...sow,
        workflow: {
          stage: workflowStage,
          taskCount: tasks.length,
          statusBreakdown: {
            draftOrAssigned: taskStatuses.filter((s) => s === 'DRAFT' || s === 'ASSIGNED').length,
            inProgressOrReview: taskStatuses.filter((s) => s === 'IN_PROGRESS' || s === 'REVIEW').length,
            completed: taskStatuses.filter((s) => s === 'COMPLETED').length,
            cancelled: taskStatuses.filter((s) => s === 'CANCELLED').length,
          },
        },
      },
    };
  });

  // Look up an existing SOW for a project + assignee (contractor or staff user).
  // Returns null if none — used by frontend to decide between "Create SOW" / "View SOW" buttons.
  app.get('/sow/lookup', { preHandler: requirePermission('budgeting', 'read') }, async (request) => {
    const q = z.object({
      projectId: z.string().uuid(),
      contractorId: z.string().uuid().optional(),
      staffUserId: z.string().optional(),
    }).parse(request.query);

    const where = and(
      eq(sowDocuments.projectId, q.projectId),
      q.contractorId ? eq(sowDocuments.contractorId, q.contractorId) : undefined,
      q.staffUserId ? eq(sowDocuments.staffUserId, q.staffUserId) : undefined,
    );

    const sow = await app.db.query.sowDocuments.findFirst({
      where: where as any,
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });
    return { data: sow || null };
  });

  app.post('/sow', {
    preHandler: [requirePermission('budgeting', 'create'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = createSowSchema.parse(request.body);
    const userId = request.session?.user?.id;

    // Enforce one SOW per (project, assignee). New tasks update the existing SOW instead of creating a new one.
    if (body.contractorId || body.staffUserId) {
      const existingSow = await app.db.query.sowDocuments.findFirst({
        where: and(
          eq(sowDocuments.projectId, body.projectId),
          body.contractorId ? eq(sowDocuments.contractorId, body.contractorId) : undefined,
          body.staffUserId ? eq(sowDocuments.staffUserId, body.staffUserId) : undefined,
        ) as any,
      });
      if (existingSow) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'A SOW already exists for this person on this project. Update the existing SOW instead.',
          data: existingSow,
        });
      }
    }

    const number = await nextSowNumber(app.db as any);

    const sowValues = {
      number,
      projectId: body.projectId,
      contractorId: body.contractorId || null,
      staffUserId: body.staffUserId || null,
      scope: body.scope,
      deliverables: body.deliverables as any,
      timeline: body.timeline as any,
      costBreakdown: body.costBreakdown as any,
      totalAmount: String(body.totalAmount),
      terms: body.terms || null,
      validUntil: body.validUntil ? new Date(body.validUntil as string) : null,
      notes: body.notes || null,
      createdBy: userId,
    };
    const [sow] = await app.db.insert(sowDocuments).values(sowValues).returning();

    // Save initial version
    await app.db.insert(sowDocumentVersions).values({
      sowDocumentId: sow.id,
      version: 1,
      snapshotJson: { ...sow },
      changedBy: userId,
      changeNotes: 'Initial version',
    });

    return reply.status(201).send({ data: sow });
  });

  app.patch<{ Params: { id: string } }>('/sow/:id', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const existing = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
    });
    if (!existing) return reply.notFound('SOW not found');
    if (existing.status !== 'DRAFT') return reply.badRequest('Only DRAFT SOWs can be edited');

    const body = updateSowSchema.parse(request.body);
    const userId = request.session?.user?.id;
    const newVersion = existing.version + 1;
    const updates: Record<string, any> = { version: newVersion, updatedAt: new Date() };

    if (body.scope !== undefined) updates.scope = body.scope;
    if (body.deliverables !== undefined) updates.deliverables = body.deliverables;
    if (body.timeline !== undefined) updates.timeline = body.timeline;
    if (body.costBreakdown !== undefined) updates.costBreakdown = body.costBreakdown;
    if (body.totalAmount !== undefined) updates.totalAmount = String(body.totalAmount);
    if (body.terms !== undefined) updates.terms = body.terms;
    if (body.validUntil !== undefined) updates.validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (body.contractorId !== undefined) updates.contractorId = body.contractorId || null;
    if (body.staffUserId !== undefined) updates.staffUserId = body.staffUserId || null;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await app.db.update(sowDocuments)
      .set(updates)
      .where(eq(sowDocuments.id, request.params.id))
      .returning();

    // Save version snapshot
    await app.db.insert(sowDocumentVersions).values({
      sowDocumentId: updated.id,
      version: newVersion,
      snapshotJson: { ...updated },
      changedBy: userId,
      changeNotes: `Version ${newVersion}`,
    });

    return { data: updated };
  });

  // Mark SOW as sent
  app.post<{ Params: { id: string } }>('/sow/:id/send', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const { sentTo } = sendSowEmailSchema.parse(request.body);
    const sow = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
    });
    if (!sow) return reply.notFound('SOW not found');
    if (sow.status !== 'DRAFT' && sow.status !== 'SENT') {
      return reply.badRequest('Only DRAFT or SENT SOWs can be sent');
    }
    const [updated] = await app.db.update(sowDocuments)
      .set({ status: 'SENT', sentAt: new Date(), sentTo, updatedAt: new Date() })
      .where(eq(sowDocuments.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // Mark SOW as accepted — accessible by admin/finance (budgeting.approve) OR the assigned staff member
  app.post<{ Params: { id: string } }>('/sow/:id/accept', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const user = request.session!.user;
    const sow = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
    });
    if (!sow) return reply.notFound('SOW not found');

    const canAccept = hasPermission(user.role ?? '', 'budgeting', 'approve') || sow.staffUserId === user.id;
    if (!canAccept) return reply.forbidden('You do not have permission to accept this SOW');

    if (sow.status !== 'SENT') {
      return reply.badRequest('Only SENT SOWs can be accepted');
    }
    const [updated] = await app.db.update(sowDocuments)
      .set({ status: 'ACCEPTED', acceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(sowDocuments.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // SOW version history
  app.get<{ Params: { id: string } }>('/sow/:id/versions', {
    preHandler: requirePermission('budgeting', 'read'),
  }, async (request) => {
    const versions = await app.db.query.sowDocumentVersions.findMany({
      where: eq(sowDocumentVersions.sowDocumentId, request.params.id),
      orderBy: (v, { desc }) => [desc(v.version)],
    });
    return { data: versions };
  });

  // Reopen accepted SOW for revision (change request flow)
  app.post<{ Params: { id: string } }>('/sow/:id/reopen', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const body = z.object({ reason: z.string().min(1).optional() }).parse(request.body ?? {});
    const userId = request.session?.user?.id;

    const existing = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
    });
    if (!existing) return reply.notFound('SOW not found');
    if (existing.status !== 'ACCEPTED') {
      return reply.badRequest('Only ACCEPTED SOWs can be reopened for revision');
    }

    const newVersion = existing.version + 1;
    const [updated] = await app.db.update(sowDocuments)
      .set({
        status: 'DRAFT',
        version: newVersion,
        acceptedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(sowDocuments.id, request.params.id))
      .returning();

    await app.db.insert(sowDocumentVersions).values({
      sowDocumentId: updated.id,
      version: newVersion,
      snapshotJson: { ...updated },
      changedBy: userId,
      changeNotes: body.reason || `Reopened for revision (v${newVersion})`,
    });

    return { data: updated };
  });
  // ==========================================
  // BUDGET APPROVAL WORKFLOW
  // ==========================================

  // Submit budget for approval (PLANNING -> BUDGETED)
  app.post<{ Params: { id: string } }>('/projects/:id/submit-budget', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.id),
    });
    if (!project) return reply.notFound('Project not found');
    if (project.status !== 'PLANNING') {
      return reply.badRequest('Only PLANNING projects can be submitted for budget approval');
    }
    // Ensure at least one budget line exists
    const lineCount = await app.db.select({ count: sql<number>`count(*)` })
      .from(budgetLineItems).where(eq(budgetLineItems.projectId, request.params.id));
    if (Number(lineCount[0].count) === 0) {
      return reply.badRequest('Cannot submit budget: no budget line items');
    }
    const [updated] = await app.db.update(projects)
      .set({ status: 'BUDGETED', updatedAt: new Date() })
      .where(eq(projects.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // Approve budget and start project (BUDGETED -> IN_PROGRESS)
  app.post<{ Params: { id: string } }>('/projects/:id/approve-budget', {
    preHandler: requirePermission('budgeting', 'approve'),
  }, async (request, reply) => {
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.id),
    });
    if (!project) return reply.notFound('Project not found');
    if (project.status !== 'BUDGETED') {
      return reply.badRequest('Only BUDGETED projects can be approved');
    }
    const [updated] = await app.db.update(projects)
      .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
      .where(eq(projects.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // Complete project (IN_PROGRESS -> COMPLETED)
  app.post<{ Params: { id: string } }>('/projects/:id/complete', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.id),
    });
    if (!project) return reply.notFound('Project not found');
    if (project.status !== 'IN_PROGRESS') {
      return reply.badRequest('Only IN_PROGRESS projects can be completed');
    }
    const [updated] = await app.db.update(projects)
      .set({ status: 'COMPLETED', actualCompletionDate: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // ==========================================
  // PDF GENERATION
  // ==========================================

  // Budget report PDF
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/pdf', {
    preHandler: requirePermission('budgeting', 'export'),
  }, async (request, reply) => {
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.projectId),
      with: { title: true, author: true, manager: true },
    });
    if (!project) return reply.notFound('Project not found');

    const lines = await app.db.query.budgetLineItems.findMany({
      where: eq(budgetLineItems.projectId, request.params.projectId),
      with: { milestone: true },
    });
    const actuals = await app.db.query.actualCostEntries.findMany({
      where: and(
        eq(actualCostEntries.projectId, request.params.projectId),
        isNull(actualCostEntries.voidedAt),
      ),
    });

    // Build grouped data
    const actualsByLine = new Map<string, number>();
    for (const a of actuals) {
      if (a.budgetLineItemId) {
        actualsByLine.set(a.budgetLineItemId, (actualsByLine.get(a.budgetLineItemId) || 0) + Number(a.amount));
      }
    }

    const lineItems = lines.map((l) => {
      const est = Number(l.estimatedAmount);
      const act = actualsByLine.get(l.id) || 0;
      return {
        milestone: l.milestone?.name || 'Unassigned',
        description: l.description,
        category: l.category,
        classification: l.costClassification,
        source: l.sourceType,
        estimatedHours: l.estimatedHours || '',
        hourlyRate: l.hourlyRate || '',
        estimated: String(est),
        actual: String(act),
        variance: String(est - act),
        variancePercent: est > 0 ? String(((est - act) / est * 100).toFixed(1)) : '0',
      };
    });

    const totalBudget = Number(project.totalBudget);
    const totalActual = Number(project.totalActual);

    // Group by classification
    const classMap = new Map<string, { budgeted: number; actual: number }>();
    for (const l of lineItems) {
      const cls = l.classification;
      const entry = classMap.get(cls) || { budgeted: 0, actual: 0 };
      entry.budgeted += Number(l.estimated);
      entry.actual += Number(l.actual);
      classMap.set(cls, entry);
    }

    const settings = await app.db.query.companySettings.findFirst();
    const companyInfo = settings ? {
      name: settings.companyName ?? 'Xarra Books',
      tradingAs: settings.tradingAs,
      logoUrl: settings.logoUrl,
      city: settings.city,
      province: settings.province,
      vatNumber: settings.vatNumber,
      phone: settings.phone,
      email: settings.email,
    } : undefined;

    const html = renderBudgetReportHtml({
      company: companyInfo,

      project: {
        name: project.name,
        number: project.number,
        type: project.projectType.replace(/_/g, ' '),
        contractType: project.contractType,
        authorName: project.author?.legalName || '',
        titleName: project.title?.title || '',
        startDate: project.startDate ? new Date(project.startDate).toISOString() : '',
        targetDate: project.targetCompletionDate ? new Date(project.targetCompletionDate).toISOString() : '',
      },
      summary: {
        totalBudget: String(totalBudget),
        totalActual: String(totalActual),
        variance: String(totalBudget - totalActual),
        authorContribution: project.authorContribution || '0',
        xarraNet: String(totalBudget - Number(project.authorContribution || 0)),
      },
      byClassification: Array.from(classMap.entries()).map(([cls, d]) => ({
        classification: cls,
        budgeted: String(d.budgeted),
        actual: String(d.actual),
        variance: String(d.budgeted - d.actual),
      })),
      byMilestone: [],
      lineItems,
    });

    const pdf = await generatePdf(html);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${project.number}-budget-report.pdf"`)
      .send(pdf);
  });

  // SOW PDF
  app.get<{ Params: { id: string } }>('/sow/:id/pdf', {
    preHandler: requirePermission('budgeting', 'export'),
  }, async (request, reply) => {
    const sow = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
      with: { project: { with: { title: true, author: true } }, contractor: true },
    });
    if (!sow) return reply.notFound('SOW not found');

    // For internal staff SOWs, extract staff name from scope
    let pdfStaffName: string | undefined;
    if (!sow.contractor) {
      const scopeMatch = sow.scope?.match(/Statement of Work for (.+?) on project/);
      pdfStaffName = scopeMatch?.[1] || 'Staff Member';
    }

    const sowSettings1 = await app.db.query.companySettings.findFirst();

    const html = renderSowHtml({
      number: sow.number,
      version: sow.version,
      date: new Date(sow.createdAt).toISOString(),
      validUntil: sow.validUntil ? new Date(sow.validUntil).toISOString() : undefined,
      company: sowSettings1 ? { name: sowSettings1.companyName ?? 'Xarra Books', tradingAs: sowSettings1.tradingAs, logoUrl: sowSettings1.logoUrl, city: sowSettings1.city, province: sowSettings1.province, vatNumber: sowSettings1.vatNumber, phone: sowSettings1.phone, email: sowSettings1.email } : undefined,
      contractor: sow.contractor ? {
        name: sow.contractor.name,
        contactName: sow.contractor.contactName,
        contactEmail: sow.contractor.contactEmail,
        address: [sow.contractor.addressLine1, sow.contractor.city, sow.contractor.province, sow.contractor.postalCode].filter(Boolean).join(', ') || undefined,
      } : undefined,
      staffName: pdfStaffName,
      project: {
        name: sow.project.name,
        number: sow.project.number,
        titleName: sow.project.title?.title || '',
        authorName: sow.project.author?.legalName || '',
      },
      scope: sow.scope,
      deliverables: sow.deliverables as any[],
      timeline: sow.timeline as any,
      costBreakdown: sow.costBreakdown as any[],
      totalAmount: sow.totalAmount,
      terms: sow.terms || undefined,
    });

    const pdf = await generatePdf(html);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${sow.number}.pdf"`)
      .send(pdf);
  });

  // Public SOW view — no auth required; uses UUID as access token for external contractors
  app.get<{ Params: { id: string } }>('/sow/:id/public-view', async (request, reply) => {
    const sow = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
      with: { project: { with: { title: true, author: true } }, contractor: true },
    });
    if (!sow) return reply.notFound('SOW not found');

    // Only expose contractor SOWs publicly (staff SOWs require login)
    if (!sow.contractorId) return reply.forbidden('This SOW requires login to view');

    return {
      data: {
        id: sow.id,
        number: sow.number,
        status: sow.status,
        version: sow.version,
        totalAmount: sow.totalAmount,
        scope: sow.scope,
        terms: sow.terms,
        validUntil: sow.validUntil,
        startDate: sow.startDate,
        endDate: sow.endDate,
        acceptedAt: sow.acceptedAt,
        createdAt: sow.createdAt,
        project: { name: sow.project.name, number: sow.project.number },
        contractor: sow.contractor ? {
          name: sow.contractor.name,
          contactName: sow.contractor.contactName,
          contactEmail: sow.contractor.contactEmail,
        } : null,
        deliverables: sow.deliverables,
        timeline: sow.timeline,
        costBreakdown: sow.costBreakdown,
      },
    };
  });

  // Public SOW accept — no auth required; only for contractor SOWs
  app.post<{ Params: { id: string } }>('/sow/:id/accept-public', async (request, reply) => {
    const sow = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
    });
    if (!sow) return reply.notFound('SOW not found');
    if (!sow.contractorId) return reply.forbidden('This SOW requires login to accept');
    if (sow.status !== 'SENT') return reply.badRequest('Only SENT SOWs can be accepted');

    const [updated] = await app.db.update(sowDocuments)
      .set({ status: 'ACCEPTED', acceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(sowDocuments.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // Timesheet PDF
  app.get<{ Params: { id: string } }>('/timesheets/:id/pdf', {
    preHandler: requirePermission('budgeting', 'export'),
  }, async (request, reply) => {
    const ts = await app.db.query.timesheets.findFirst({
      where: eq(timesheets.id, request.params.id),
      with: { project: true, worker: true, approvedByUser: true, entries: { with: { milestone: true } } },
    });
    if (!ts) return reply.notFound('Timesheet not found');

    const tsSettings = await app.db.query.companySettings.findFirst();

    const html = renderTimesheetHtml({
      number: ts.number,
      company: tsSettings ? { name: tsSettings.companyName ?? 'Xarra Books', tradingAs: tsSettings.tradingAs, logoUrl: tsSettings.logoUrl, city: tsSettings.city, province: tsSettings.province, vatNumber: tsSettings.vatNumber, phone: tsSettings.phone, email: tsSettings.email } : undefined,
      periodFrom: new Date(ts.periodFrom).toISOString(),
      periodTo: new Date(ts.periodTo).toISOString(),
      worker: { name: ts.worker?.name || 'Unknown', role: '' },
      project: { name: ts.project.name, number: ts.project.number },
      entries: (ts.entries || []).map((e) => ({
        milestoneName: e.milestone?.name || 'N/A',
        workDate: new Date(e.workDate).toISOString(),
        hours: String(e.hours),
        description: e.description,
      })),
      totalHours: String(ts.totalHours),
      status: ts.status,
      approvedBy: ts.approvedByUser?.name || undefined,
      approvedAt: ts.approvedAt ? new Date(ts.approvedAt).toISOString() : undefined,
    });

    const pdf = await generatePdf(html);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${ts.number}.pdf"`)
      .send(pdf);
  });

  // ==========================================
  // EMAIL SENDING
  // ==========================================

  // Send SOW via email
  app.post<{ Params: { id: string } }>('/sow/:id/email', {
    preHandler: requirePermission('budgeting', 'update'),
  }, async (request, reply) => {
    const { recipientEmail, message } = sendDocumentEmailSchema.parse(request.body);
    const sow = await app.db.query.sowDocuments.findFirst({
      where: eq(sowDocuments.id, request.params.id),
      with: { project: { with: { title: true, author: true } }, contractor: true },
    });
    if (!sow) return reply.notFound('SOW not found');

    // For internal staff SOWs, extract staff name from scope
    let staffName: string | undefined;
    let staffEmail: string | undefined;
    if (!sow.contractor) {
      const scopeMatch = sow.scope?.match(/Statement of Work for (.+?) on project/);
      staffName = scopeMatch?.[1] || 'Staff Member';
    }

    const sowSettings2 = await app.db.query.companySettings.findFirst();

    const html = renderSowHtml({
      number: sow.number,
      version: sow.version,
      date: new Date(sow.createdAt).toISOString(),
      validUntil: sow.validUntil ? new Date(sow.validUntil).toISOString() : undefined,
      company: sowSettings2 ? { name: sowSettings2.companyName ?? 'Xarra Books', tradingAs: sowSettings2.tradingAs, logoUrl: sowSettings2.logoUrl, city: sowSettings2.city, province: sowSettings2.province, vatNumber: sowSettings2.vatNumber, phone: sowSettings2.phone, email: sowSettings2.email } : undefined,
      contractor: sow.contractor ? {
        name: sow.contractor.name,
        contactName: sow.contractor.contactName,
        contactEmail: sow.contractor.contactEmail,
      } : undefined,
      staffName,
      staffEmail,
      project: {
        name: sow.project.name,
        number: sow.project.number,
        titleName: sow.project.title?.title || '',
        authorName: sow.project.author?.legalName || '',
      },
      scope: sow.scope,
      deliverables: sow.deliverables as any[],
      timeline: sow.timeline as any,
      costBreakdown: sow.costBreakdown as any[],
      totalAmount: sow.totalAmount,
      terms: sow.terms || undefined,
    });

    // Build the portal link from the canonical frontend URL config.
    const appUrl = config.web.url;
    // External contractors (no system account) use the public review page.
    // Internal staff users (staffUserId is set) can log in and view the admin SOW page.
    const sowLink = sow.contractorId
      ? `${appUrl}/sow-review/${sow.id}`
      : `${appUrl}/budgeting/sow/${sow.id}`;

    const recipientName = sow.contractor?.contactName || sow.contractor?.name || staffName || 'Team Member';
    const projectTitle = sow.project.title?.title ? ` — ${sow.project.title.title}` : '';
    const totalFormatted = sow.totalAmount
      ? `R ${Number(sow.totalAmount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <div style="background: #166534; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 20px;">Statement of Work</h1>
          <p style="color: #bbf7d0; margin: 4px 0 0; font-size: 14px;">${sow.number} · ${sow.project.number}${projectTitle}</p>
        </div>

        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Dear ${recipientName},</p>

          <p style="margin: 0 0 16px;">
            ${message || `Please find attached your Statement of Work for <strong>${sow.project.name}</strong>. Kindly review the scope, deliverables, and terms, then confirm your acceptance.`}
          </p>

          <!-- Summary card -->
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="color: #6b7280; padding: 4px 0; width: 140px;">SOW Reference</td>
                <td style="font-weight: 600; color: #111827;">${sow.number}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; padding: 4px 0;">Project</td>
                <td style="font-weight: 600; color: #111827;">${sow.project.number} — ${sow.project.name}</td>
              </tr>
              ${totalFormatted ? `
              <tr>
                <td style="color: #6b7280; padding: 4px 0;">Contract Value</td>
                <td style="font-weight: 600; color: #166534;">${totalFormatted}</td>
              </tr>` : ''}
              ${sow.validUntil ? `
              <tr>
                <td style="color: #6b7280; padding: 4px 0;">Valid Until</td>
                <td style="font-weight: 600; color: #111827;">${new Date(sow.validUntil).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
              </tr>` : ''}
            </table>
          </div>

          <p style="margin: 0 0 8px; font-size: 14px; color: #374151;">
            The full SOW document is attached to this email as a PDF. You can also view and accept it online using the button below:
          </p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${sowLink}"
               style="background: #166534; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600; display: inline-block;">
              Review &amp; Accept SOW →
            </a>
          </div>

          <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
            After you accept, your tasks will become visible and you can begin logging your work through the same portal.
          </p>

          <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280;">
            If you have any questions, please reply to this email or contact your project manager directly.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="margin: 0; font-size: 12px; color: #9ca3af;">
            Xarra Books Management System · This email was sent on behalf of the Xarra Books project team.
          </p>
        </div>
      </div>
    `;

    const result = await sendDocumentEmail({
      app,
      documentType: 'SOW',
      documentId: sow.id,
      recipientEmail,
      subject: `Statement of Work ${sow.number} — ${sow.project.name}`,
      emailHtml,
      html,
      documentNumber: sow.number,
      attachmentName: `SOW-${sow.number}`,
      sentBy: request.session?.user?.id,
    });

    // Mark SOW as sent
    if (result.success) {
      await app.db.update(sowDocuments)
        .set({ status: 'SENT', sentAt: new Date(), sentTo: recipientEmail, updatedAt: new Date() })
        .where(eq(sowDocuments.id, request.params.id));
    }

    return result;
  });

  // Send budget report via email
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/email', {
    preHandler: requirePermission('budgeting', 'export'),
  }, async (request, reply) => {
    const { recipientEmail, message } = sendDocumentEmailSchema.parse(request.body);
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.projectId),
      with: { title: true, author: true },
    });
    if (!project) return reply.notFound('Project not found');

    const brSettings = await app.db.query.companySettings.findFirst();

    const html = renderBudgetReportHtml({
      company: brSettings ? { name: brSettings.companyName ?? 'Xarra Books', tradingAs: brSettings.tradingAs, logoUrl: brSettings.logoUrl, city: brSettings.city, province: brSettings.province, vatNumber: brSettings.vatNumber, phone: brSettings.phone, email: brSettings.email } : undefined,
      project: {
        name: project.name,
        number: project.number,
        type: project.projectType.replace(/_/g, ' '),
        contractType: project.contractType,
        authorName: project.author?.legalName || '',
        titleName: project.title?.title || '',
        startDate: project.startDate ? new Date(project.startDate).toISOString() : '',
        targetDate: project.targetCompletionDate ? new Date(project.targetCompletionDate).toISOString() : '',
      },
      summary: {
        totalBudget: project.totalBudget || '0',
        totalActual: project.totalActual || '0',
        variance: String(Number(project.totalBudget) - Number(project.totalActual)),
        authorContribution: project.authorContribution || '0',
        xarraNet: String(Number(project.totalBudget) - Number(project.authorContribution || 0)),
      },
      byClassification: [],
      byMilestone: [],
      lineItems: [],
    });

    const result = await sendDocumentEmail({
      app,
      documentType: 'BUDGET_REPORT',
      documentId: project.id,
      recipientEmail,
      subject: `Budget Report — ${project.name} (${project.number})`,
      html,
      documentNumber: project.number,
      sentBy: request.session?.user?.id,
    });

    return result;
  });

  // ==========================================
  // AI COST ESTIMATION
  // ==========================================

  app.post<{ Params: { projectId: string } }>('/projects/:projectId/estimate', {
    preHandler: requirePermission('budgeting', 'create'),
  }, async (request, reply) => {
    const project = await app.db.query.projects.findFirst({
      where: eq(projects.id, request.params.projectId),
      with: { title: true, milestones: true },
    });
    if (!project) return reply.notFound('Project not found');

    const body = costEstimateRequestSchema.parse(request.body);
    const pageCount = body.pageCount || project.title?.pageCount || 200;
    const complexity = body.complexityScore || 3; // default medium

    // Get active rate cards
    const internalRates = await app.db.query.rateCards.findMany({
      where: and(eq(rateCards.type, 'INTERNAL'), eq(rateCards.isActive, true)),
    });
    const externalRates = await app.db.query.rateCards.findMany({
      where: and(eq(rateCards.type, 'EXTERNAL'), eq(rateCards.isActive, true)),
    });

    // Check historical data for regression
    const historyCount = await app.db.select({ count: sql<number>`count(*)` })
      .from(costEstimationHistory);
    const hasHistory = Number(historyCount[0].count) >= 5;

    // Baseline estimation tables (pages/hour by task and complexity)
    const baselines: Record<string, { pagesPerHour?: number; flatHours?: number }> = {
      EDITING: { pagesPerHour: complexity <= 2 ? 5 : complexity <= 3 ? 4 : 3 },
      TYPESETTING: { pagesPerHour: complexity <= 2 ? 12 : complexity <= 3 ? 10 : 8 },
      COVER_DESIGN: { flatHours: complexity <= 2 ? 15 : complexity <= 3 ? 20 : 30 },
      PROOFREADING: { pagesPerHour: complexity <= 2 ? 12 : complexity <= 3 ? 10 : 8 },
      ISBN_REGISTRATION: { flatHours: 2 },
      PRINTING: { flatHours: 0 }, // printing is per-unit cost, not hours
      LAUNCH: { flatHours: 40 },
      MARKETING: { flatHours: complexity <= 2 ? 20 : complexity <= 3 ? 30 : 40 },
      TRANSLATION: { pagesPerHour: complexity <= 2 ? 3 : complexity <= 3 ? 2.5 : 2 },
      RIGHTS_CLEARANCE: { flatHours: complexity <= 2 ? 10 : complexity <= 3 ? 20 : 30 },
      DISTRIBUTION: { flatHours: 8 },
    };

    // If we have historical data, try simple regression per task
    let historicalModels: Record<string, { slope: number; intercept: number; dataPoints: number }> = {};
    if (hasHistory) {
      const history = await app.db.execute<{
        milestone_code: string;
        avg_hours_per_page: string;
        data_points: string;
      }>(sql`
        SELECT milestone_code,
               AVG(actual_hours::numeric / NULLIF(page_count, 0)) as avg_hours_per_page,
               COUNT(*) as data_points
        FROM cost_estimation_history
        WHERE actual_hours IS NOT NULL AND page_count > 0
        GROUP BY milestone_code
        HAVING COUNT(*) >= 3
      `);

      for (const row of history) {
        historicalModels[row.milestone_code] = {
          slope: Number(row.avg_hours_per_page), // hours per page
          intercept: 0,
          dataPoints: Number(row.data_points),
        };
      }
    }

    // Generate estimates for each milestone
    const estimates = project.milestones.map((m) => {
      const baseline = baselines[m.code] || { flatHours: 10 };
      let estimatedHours: number;
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW';

      // Use historical model if available
      const model = historicalModels[m.code];
      if (model && model.dataPoints >= 10) {
        estimatedHours = model.slope * pageCount + model.intercept;
        confidence = 'HIGH';
      } else if (model && model.dataPoints >= 5) {
        estimatedHours = model.slope * pageCount + model.intercept;
        confidence = 'MEDIUM';
      } else {
        // Use baseline
        estimatedHours = baseline.flatHours ?? (pageCount / (baseline.pagesPerHour || 5));
        confidence = 'LOW';
      }

      estimatedHours = Math.round(estimatedHours * 10) / 10;

      // Find matching rate cards by role mapping
      const roleMap: Record<string, string> = {
        EDITING: 'Editor', TYPESETTING: 'Typesetter', COVER_DESIGN: 'Cover Designer',
        PROOFREADING: 'Proofreader', TRANSLATION: 'Translator', MARKETING: 'Marketing',
        LAUNCH: 'Events', ISBN_REGISTRATION: 'Admin', RIGHTS_CLEARANCE: 'Legal',
      };
      const role = roleMap[m.code] || m.code;

      const internalRate = internalRates.find((r) => r.role.toLowerCase().includes(role.toLowerCase()));
      const externalRate = externalRates.find((r) => r.role.toLowerCase().includes(role.toLowerCase()));

      const internalHourly = internalRate ? Number(internalRate.hourlyRateZar) : 0;
      const externalHourly = externalRate ? Number(externalRate.hourlyRateZar) : 0;

      return {
        milestoneId: m.id,
        milestoneCode: m.code,
        milestoneName: m.name,
        estimatedHours,
        confidence,
        dataPoints: model?.dataPoints || 0,
        internal: internalHourly > 0 ? {
          hourlyRate: internalHourly,
          totalCost: Math.round(estimatedHours * internalHourly * 100) / 100,
          rateCardId: internalRate!.id,
          rateCardName: internalRate!.name,
        } : null,
        external: externalHourly > 0 ? {
          hourlyRate: externalHourly,
          totalCost: Math.round(estimatedHours * externalHourly * 100) / 100,
          rateCardId: externalRate!.id,
          rateCardName: externalRate!.name,
        } : null,
        recommendation: internalHourly > 0 && externalHourly > 0
          ? (externalHourly < internalHourly ? 'EXTERNAL' : 'INTERNAL')
          : (internalHourly > 0 ? 'INTERNAL' : 'EXTERNAL'),
      };
    });

    const totalInternal = estimates.reduce((s, e) => s + (e.internal?.totalCost || 0), 0);
    const totalExternal = estimates.reduce((s, e) => s + (e.external?.totalCost || 0), 0);

    return {
      data: {
        projectId: project.id,
        pageCount,
        complexityScore: complexity,
        estimates,
        summary: {
          totalInternalCost: Math.round(totalInternal * 100) / 100,
          totalExternalCost: Math.round(totalExternal * 100) / 100,
          totalEstimatedHours: estimates.reduce((s, e) => s + e.estimatedHours, 0),
          hasHistoricalData: hasHistory,
        },
      },
    };
  });

  // Apply AI estimates as budget lines
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/apply-estimates', {
    preHandler: [requirePermission('budgeting', 'create'), requireIdempotencyKey],
  }, async (request, reply) => {
    const body = applyEstimatesSchema.parse(request.body);
    const idempotencyKey = getIdempotencyKey(request)!;
    const userId = request.session?.user?.id;

    const items = await app.db.insert(budgetLineItems).values(
      body.estimates.map((e, i) => ({
        projectId: request.params.projectId,
        milestoneId: e.milestoneId,
        category: e.category || 'LABOR',
        costClassification: 'PUBLISHING' as const,
        description: e.description,
        sourceType: e.sourceType as 'INTERNAL' | 'EXTERNAL',
        estimatedHours: String(e.estimatedHours),
        hourlyRate: String(e.hourlyRate),
        estimatedAmount: String(e.estimatedAmount),
        rateCardId: e.rateCardId || null,
        createdBy: userId,
        idempotencyKey: `${idempotencyKey}-${i}`,
      })),
    ).returning();

    await recalcProjectBudget(app, request.params.projectId);

    return reply.status(201).send({ data: items });
  });
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function recalcProjectBudget(app: FastifyInstance, projectId: string) {
  const result = await app.db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(estimated_amount::numeric), 0) as total
    FROM budget_line_items WHERE project_id = ${projectId}
  `);
  await app.db.update(projects)
    .set({ totalBudget: result[0]?.total || '0', updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

async function recalcProjectActual(app: FastifyInstance, projectId: string) {
  const result = await app.db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(amount::numeric), 0) as total
    FROM actual_cost_entries WHERE project_id = ${projectId} AND voided_at IS NULL
  `);
  await app.db.update(projects)
    .set({ totalActual: result[0]?.total || '0', updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
