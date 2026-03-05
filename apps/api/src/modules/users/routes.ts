import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { users } from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireRole } from '../../middleware/require-auth.js';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'FINANCE', 'OPERATIONS', 'EDITORIAL', 'AUTHOR', 'REPORTS_ONLY']),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'FINANCE', 'OPERATIONS', 'EDITORIAL', 'AUTHOR', 'REPORTS_ONLY']).optional(),
  isActive: z.boolean().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  // List users (admin only)
  app.get('/', { preHandler: requireRole('admin') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${users.name} ILIKE ${'%' + search + '%'} OR ${users.email} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.users.findMany({
        where: where ? () => where : undefined,
        orderBy: (u, { asc }) => [asc(u.name)],
        limit,
        offset,
        columns: { passwordHash: false },
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(users).where(where),
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

  // Create user via Better Auth sign-up (admin only)
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);

    // Create user via Better Auth sign-up
    const response = await fetch(`${process.env.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body.email, name: body.name, password: body.password }),
    });

    if (!response.ok) {
      const err = await response.text();
      return reply.badRequest(`Failed to create user: ${err}`);
    }

    const { user: newUser } = await response.json() as { user: { id: string } };

    // Set role
    await app.db.update(users).set({ role: body.role }).where(eq(users.id, newUser.id));

    const user = await app.db.query.users.findFirst({
      where: eq(users.id, newUser.id),
      columns: { passwordHash: false },
    });

    return reply.status(201).send({ data: user });
  });

  // Update user (admin only)
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = updateUserSchema.parse(request.body);

    const [updated] = await app.db
      .update(users)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(users.id, request.params.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        updatedAt: users.updatedAt,
      });

    if (!updated) return reply.notFound('User not found');
    return { data: updated };
  });

  // Resend verification email (admin only)
  app.post<{ Params: { id: string } }>('/:id/send-verification', { preHandler: requireRole('admin') }, async (request, reply) => {
    const targetUser = await app.db.query.users.findFirst({
      where: eq(users.id, request.params.id),
      columns: { id: true, email: true },
    });
    if (!targetUser) return reply.notFound('User not found');

    // Trigger verification via Better Auth
    const response = await fetch(`${process.env.BETTER_AUTH_URL}/api/auth/send-verification-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetUser.email }),
    });

    if (!response.ok) {
      return reply.internalServerError('Failed to send verification email');
    }

    return { message: 'Verification email sent' };
  });
}
