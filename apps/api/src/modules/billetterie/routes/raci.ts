import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { billetterieProjectRaci, staffMembers } from '@xarra/db';
import { requireAuth } from '../../../middleware/require-auth.js';
import { assertBilProjectRole } from '../helpers.js';
import { PHASE_ORDER } from './projects.js';

const raciBodySchema = z.object({
  area:          z.string().min(1).max(255),
  responsibleId: z.string().uuid().optional().nullable(),
  accountableId: z.string().uuid().optional().nullable(),
  consulted:     z.array(z.string().uuid()).optional(),
  informed:      z.array(z.string().uuid()).optional(),
  phaseKey:      z.enum(PHASE_ORDER).optional().nullable(),
  notes:         z.string().optional().nullable(),
});

export async function raciRoutes(app: FastifyInstance) {
  const db = app.db;

  // List all RACI rows for a project, enriched with staff member names
  app.get('/projects/:id/raci', { preHandler: requireAuth }, async (request: any) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(billetterieProjectRaci)
      .where(eq(billetterieProjectRaci.projectId, id))
      .orderBy(billetterieProjectRaci.createdAt);

    // Collect all unique staff IDs referenced
    const staffIds = [...new Set([
      ...rows.map(r => r.responsibleId),
      ...rows.map(r => r.accountableId),
      ...rows.flatMap(r => (r.consulted as string[]) ?? []),
      ...rows.flatMap(r => (r.informed as string[]) ?? []),
    ].filter(Boolean))] as string[];

    let staffMap: Record<string, { id: string; name: string; role: string }> = {};
    if (staffIds.length) {
      const members = await db
        .select({ id: staffMembers.id, name: staffMembers.name, role: staffMembers.role })
        .from(staffMembers)
        .where(inArray(staffMembers.id, staffIds));
      for (const m of members) staffMap[m.id] = m;
    }

    const data = rows.map(r => ({
      ...r,
      responsible: r.responsibleId ? (staffMap[r.responsibleId] ?? null) : null,
      accountable: r.accountableId ? (staffMap[r.accountableId] ?? null) : null,
      consultedMembers: ((r.consulted as string[]) ?? []).map(sid => staffMap[sid] ?? { id: sid }),
      informedMembers:  ((r.informed as string[])  ?? []).map(sid => staffMap[sid] ?? { id: sid }),
    }));

    return { data };
  });

  // Create a RACI row (PM or BA)
  app.post('/projects/:id/raci', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = raciBodySchema.parse(request.body);
    const [row] = await db.insert(billetterieProjectRaci).values({
      projectId:     id,
      area:          body.area,
      responsibleId: body.responsibleId ?? null,
      accountableId: body.accountableId ?? null,
      consulted:     body.consulted ?? [],
      informed:      body.informed ?? [],
      phaseKey:      (body.phaseKey ?? null) as any,
      notes:         body.notes ?? null,
      createdBy:     user.id,
    }).returning();

    return reply.status(201).send({ data: row });
  });

  // Update a RACI row (PM or BA)
  app.put('/projects/:id/raci/:raciId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, raciId } = request.params as { id: string; raciId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM', 'BA']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    const body = raciBodySchema.partial().parse(request.body);
    const updateData: any = { updatedAt: new Date() };
    if (body.area          !== undefined) updateData.area          = body.area;
    if (body.responsibleId !== undefined) updateData.responsibleId = body.responsibleId;
    if (body.accountableId !== undefined) updateData.accountableId = body.accountableId;
    if (body.consulted     !== undefined) updateData.consulted     = body.consulted;
    if (body.informed      !== undefined) updateData.informed      = body.informed;
    if (body.phaseKey      !== undefined) updateData.phaseKey      = body.phaseKey;
    if (body.notes         !== undefined) updateData.notes         = body.notes;

    const [updated] = await db.update(billetterieProjectRaci)
      .set(updateData)
      .where(and(eq(billetterieProjectRaci.id, raciId), eq(billetterieProjectRaci.projectId, id)))
      .returning();

    if (!updated) return reply.notFound('RACI entry not found');
    return { data: updated };
  });

  // Delete a RACI row (PM only)
  app.delete('/projects/:id/raci/:raciId', { preHandler: requireAuth }, async (request: any, reply) => {
    const { id, raciId } = request.params as { id: string; raciId: string };
    const user = request.session!.user as any;
    const deny = await assertBilProjectRole(db, id, user, ['PM']);
    if (deny) return reply.status(403).send({ error: 'Forbidden', message: deny });

    await db.delete(billetterieProjectRaci)
      .where(and(eq(billetterieProjectRaci.id, raciId), eq(billetterieProjectRaci.projectId, id)));

    return { success: true };
  });
}
