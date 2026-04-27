import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, ilike } from 'drizzle-orm';
import { staffMembers, billetterieProjectTeam } from '@xarra/db';
import { requireAuth, requireRole } from '../../../middleware/require-auth.js';
import { getProjectRole } from '../helpers.js';

const addMemberSchema = z.object({
  staffMemberId: z.string().uuid(),
  role:          z.enum(['SPONSOR', 'PM', 'BA', 'ADMIN']),
});

const updateMemberSchema = z.object({
  role: z.enum(['SPONSOR', 'PM', 'BA', 'ADMIN']),
});

export async function teamRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── GET /billetterie/team — all active staff (for assignment pickers) ────────
  app.get('/team', { preHandler: requireAuth }, async (request: any) => {
    const search = ((request.query as any).search ?? '').trim();

    const members = await db
      .select({
        id:               staffMembers.id,
        name:             staffMembers.name,
        role:             staffMembers.role,
        email:            staffMembers.email,
        availabilityType: staffMembers.availabilityType,
        isActive:         staffMembers.isActive,
      })
      .from(staffMembers)
      .where(
        search
          ? and(eq(staffMembers.isActive, true), ilike(staffMembers.name, `%${search}%`))
          : eq(staffMembers.isActive, true),
      )
      .orderBy(staffMembers.name);

    return { data: members };
  });

  // ── GET /billetterie/projects/:id/team — project team members with roles ─────
  app.get('/projects/:id/team', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };

    const members = await db
      .select({
        id:            billetterieProjectTeam.id,
        role:          billetterieProjectTeam.role,
        addedAt:       billetterieProjectTeam.addedAt,
        staffMemberId: billetterieProjectTeam.staffMemberId,
        name:          staffMembers.name,
        email:         staffMembers.email,
        memberRole:    staffMembers.role,
        isActive:      staffMembers.isActive,
      })
      .from(billetterieProjectTeam)
      .leftJoin(staffMembers, eq(billetterieProjectTeam.staffMemberId, staffMembers.id))
      .where(eq(billetterieProjectTeam.projectId, id))
      .orderBy(billetterieProjectTeam.role);

    return { data: members };
  });

  // ── POST /billetterie/projects/:id/team — add team member ───────────────────
  app.post('/projects/:id/team', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.session.user.id;

    const projectRole = await getProjectRole(db, id, userId);
    const sysRole: string = (request.session as any).user?.role ?? '';
    const isSys = ['admin', 'projectmanager'].includes(sysRole.toLowerCase());
    if (!isSys && projectRole !== 'PM') return reply.forbidden('Only the project PM or system admin can manage team');

    const body = addMemberSchema.parse(request.body);

    // Check staff member exists
    const staff = await db.select({ id: staffMembers.id }).from(staffMembers).where(eq(staffMembers.id, body.staffMemberId)).limit(1).then((r: any[]) => r[0]);
    if (!staff) return reply.notFound('Staff member not found');

    const [member] = await db.insert(billetterieProjectTeam).values({
      projectId:     id,
      staffMemberId: body.staffMemberId,
      role:          body.role as any,
      addedBy:       userId,
    }).onConflictDoUpdate({
      target: [billetterieProjectTeam.projectId, billetterieProjectTeam.staffMemberId],
      set: { role: body.role as any },
    }).returning();

    return reply.status(201).send({ data: member });
  });

  // ── PUT /billetterie/projects/:id/team/:memberId — change role ───────────────
  app.put('/projects/:id/team/:memberId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, memberId } = request.params as { id: string; memberId: string };
    const userId = request.session.user.id;

    const projectRole = await getProjectRole(db, id, userId);
    const sysRole: string = (request.session as any).user?.role ?? '';
    const isSys = ['admin', 'projectmanager'].includes(sysRole.toLowerCase());
    if (!isSys && projectRole !== 'PM') return reply.forbidden('Only the project PM or system admin can manage team');

    const body = updateMemberSchema.parse(request.body);

    const [updated] = await db
      .update(billetterieProjectTeam)
      .set({ role: body.role as any })
      .where(and(eq(billetterieProjectTeam.id, memberId), eq(billetterieProjectTeam.projectId, id)))
      .returning();

    if (!updated) return reply.notFound('Team member not found');
    return { data: updated };
  });

  // ── DELETE /billetterie/projects/:id/team/:memberId — remove member ──────────
  app.delete('/projects/:id/team/:memberId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, memberId } = request.params as { id: string; memberId: string };
    const userId = request.session.user.id;

    const projectRole = await getProjectRole(db, id, userId);
    const sysRole: string = (request.session as any).user?.role ?? '';
    const isSys = ['admin', 'projectmanager'].includes(sysRole.toLowerCase());
    if (!isSys && projectRole !== 'PM') return reply.forbidden('Only the project PM or system admin can manage team');

    await db.delete(billetterieProjectTeam)
      .where(and(eq(billetterieProjectTeam.id, memberId), eq(billetterieProjectTeam.projectId, id)));

    return { success: true };
  });
}
