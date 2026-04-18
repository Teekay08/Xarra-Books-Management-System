import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import {
  sowDocuments, sowDocumentVersions, taskAssignments, projectMilestones, staffMembers,
} from '@xarra/db';

/**
 * Regenerate a SOW's cost breakdown, deliverables, timeline and total
 * from the current set of task assignments for that staff member on the project.
 *
 * - Snapshots the previous version into sow_document_versions
 * - Bumps version
 * - If status was ACCEPTED, demotes back to DRAFT and clears acceptedAt so the
 *   staff member must re-acknowledge the new scope.
 *
 * Call this whenever tasks for a staff member on a project are added/updated/removed.
 */
export async function regenerateSowFromTasks(
  app: FastifyInstance,
  opts: { projectId: string; staffMemberId: string; reason: string; userId?: string | null },
) {
  // Find the staff member to resolve contractorId vs staffUserId
  const staff = await app.db.query.staffMembers.findFirst({
    where: eq(staffMembers.id, opts.staffMemberId),
  });
  if (!staff) return null;

  // Look up the SOW for this person on this project.
  // Internal staff link via staffUserId; external contractors would link via contractorId,
  // but we don't have a clean contractor->staffMember mapping, so we match on staffUserId
  // (internal staff) only. External contractors created from the suppliers table can be
  // wired up later if needed.
  if (!staff.userId) return null;

  const sow = await app.db.query.sowDocuments.findFirst({
    where: and(
      eq(sowDocuments.projectId, opts.projectId),
      eq(sowDocuments.staffUserId, staff.userId),
    ),
  });
  if (!sow) return null;

  // Pull all active (non-cancelled) tasks for this staff member on this project
  const tasks = await app.db.query.taskAssignments.findMany({
    where: and(
      eq(taskAssignments.projectId, opts.projectId),
      eq(taskAssignments.staffMemberId, opts.staffMemberId),
    ),
    with: { milestone: true },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  const activeTasks = tasks.filter((t) => t.status !== 'CANCELLED');

  // Build cost breakdown from tasks
  const costBreakdown = activeTasks.map((t) => ({
    description: t.title,
    hours: Number(t.allocatedHours || 0),
    rate: Number(t.hourlyRate || 0),
    total: Number(t.totalCost || 0),
  }));
  const totalAmount = costBreakdown.reduce((sum, l) => sum + l.total, 0);

  // Build deliverables from task titles (detailed deliverables now tracked in task_deliverables table)
  const deliverables: Array<{ description: string; dueDate: string; acceptanceCriteria: string }> = activeTasks.map((t) => ({
    description: t.title,
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
    acceptanceCriteria: t.description || 'Completed to satisfaction',
  }));

  // Build timeline from earliest start to latest due
  const startDates = activeTasks.map((t) => t.startDate).filter(Boolean) as Date[];
  const dueDates = activeTasks.map((t) => t.dueDate).filter(Boolean) as Date[];
  const earliestStart = startDates.length ? new Date(Math.min(...startDates.map((d) => new Date(d).getTime()))) : null;
  const latestDue = dueDates.length ? new Date(Math.max(...dueDates.map((d) => new Date(d).getTime()))) : null;

  // Pull project milestones used by these tasks for the timeline list
  const milestoneIds = Array.from(new Set(activeTasks.map((t) => t.milestoneId).filter(Boolean) as string[]));
  const milestones = milestoneIds.length
    ? await app.db.query.projectMilestones.findMany({
        where: (m, { inArray }) => inArray(m.id, milestoneIds),
      })
    : [];
  const timeline = {
    startDate: earliestStart ? earliestStart.toISOString().slice(0, 10) : '',
    endDate: latestDue ? latestDue.toISOString().slice(0, 10) : '',
    milestones: milestones.map((m) => ({
      name: m.name,
      date: m.plannedEndDate ? new Date(m.plannedEndDate).toISOString().slice(0, 10) : '',
    })),
  };

  const newVersion = sow.version + 1;
  const wasAccepted = sow.status === 'ACCEPTED';
  const newStatus = wasAccepted ? 'DRAFT' : sow.status;

  // Snapshot the previous state before updating
  await app.db.insert(sowDocumentVersions).values({
    sowDocumentId: sow.id,
    version: sow.version,
    snapshotJson: { ...sow },
    changedBy: opts.userId || null,
    changeNotes: `Pre-regen snapshot: ${opts.reason}`,
  });

  const [updated] = await app.db.update(sowDocuments)
    .set({
      version: newVersion,
      status: newStatus,
      acceptedAt: wasAccepted ? null : sow.acceptedAt,
      costBreakdown: costBreakdown as any,
      deliverables: deliverables as any,
      timeline: timeline as any,
      totalAmount: String(totalAmount),
      updatedAt: new Date(),
    })
    .where(eq(sowDocuments.id, sow.id))
    .returning();

  // Save the new version snapshot
  await app.db.insert(sowDocumentVersions).values({
    sowDocumentId: sow.id,
    version: newVersion,
    snapshotJson: { ...updated },
    changedBy: opts.userId || null,
    changeNotes: `Auto-regen from tasks: ${opts.reason}${wasAccepted ? ' (status reverted to DRAFT — re-send for acceptance)' : ''}`,
  });

  return { sow: updated, wasAccepted, newVersion };
}
