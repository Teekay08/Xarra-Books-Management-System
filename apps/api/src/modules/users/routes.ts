import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { user as authUsers } from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireRole } from '../../middleware/require-auth.js';
import { z } from 'zod';

const uiToAuthRole: Record<string, string> = {
  ADMIN: 'admin',
  FINANCE: 'finance',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  AUTHOR: 'author',
  STAFF: 'STAFF',
  // Legacy
  OPERATIONS: 'PROJECT_MANAGER',
  EDITORIAL: 'STAFF',
  REPORTS_ONLY: 'STAFF',
};

const authToUiRole: Record<string, string> = {
  admin: 'ADMIN',
  ADMIN: 'ADMIN',
  finance: 'FINANCE',
  FINANCE: 'FINANCE',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  project_manager: 'PROJECT_MANAGER',
  AUTHOR: 'AUTHOR',
  author: 'AUTHOR',
  STAFF: 'STAFF',
  staff: 'STAFF',
  // Legacy
  operations: 'PROJECT_MANAGER',
  OPERATIONS: 'PROJECT_MANAGER',
  editorial: 'STAFF',
  EDITORIAL: 'STAFF',
  reportsOnly: 'STAFF',
  REPORTS_ONLY: 'STAFF',
  employee: 'STAFF',
  EMPLOYEE: 'STAFF',
};

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'FINANCE', 'PROJECT_MANAGER', 'AUTHOR', 'STAFF']),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'FINANCE', 'PROJECT_MANAGER', 'AUTHOR', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  // List users (admin only)
  app.get('/', { preHandler: requireRole('admin') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${authUsers.name} ILIKE ${'%' + search + '%'} OR ${authUsers.email} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.user.findMany({
        where: where ? () => where : undefined,
        orderBy: (u, { asc }) => [asc(u.name)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(authUsers).where(where),
    ]);

    return {
      data: items.map((item) => ({
        ...item,
        role: authToUiRole[item.role ?? 'staff'] ?? 'STAFF',
        isActive: item.isActive ?? true,
      })),
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
    const origin = process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3002}`;
    const response = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ email: body.email, name: body.name, password: body.password }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsed: any;
      try { parsed = JSON.parse(errText); } catch { parsed = null; }
      if (parsed?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
        return reply.badRequest('A user with this email already exists. Use a different email address.');
      }
      return reply.badRequest(`Failed to create user: ${errText}`);
    }

    const { user: newUser } = await response.json() as { user: { id: string } };

    // Set role
    await app.db
      .update(authUsers)
      .set({ role: uiToAuthRole[body.role], updatedAt: new Date() })
      .where(eq(authUsers.id, newUser.id));

    const createdUser = await app.db.query.user.findFirst({
      where: eq(authUsers.id, newUser.id),
    });

    return reply.status(201).send({
      data: createdUser
        ? {
          ...createdUser,
          role: authToUiRole[createdUser.role ?? 'staff'] ?? 'STAFF',
          isActive: createdUser.isActive ?? true,
        }
        : null,
    });
  });

  // Update user (admin only)
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = updateUserSchema.parse(request.body);

    const [updated] = await app.db
      .update(authUsers)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.role !== undefined ? { role: uiToAuthRole[body.role] } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, request.params.id))
      .returning({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        isActive: authUsers.isActive,
        updatedAt: authUsers.updatedAt,
      });

    if (!updated) return reply.notFound('User not found');
    return {
      data: {
        ...updated,
        role: authToUiRole[updated.role ?? 'staff'] ?? 'STAFF',
        isActive: updated.isActive ?? true,
      },
    };
  });

  // Resend verification email (admin only)
  app.post<{ Params: { id: string } }>('/:id/send-verification', { preHandler: requireRole('admin') }, async (request, reply) => {
    const targetUser = await app.db.query.user.findFirst({
      where: eq(authUsers.id, request.params.id),
      columns: { id: true, email: true },
    });
    if (!targetUser) return reply.notFound('User not found');

    // Trigger verification via Better Auth
    const origin = process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3002}`;
    const response = await fetch(`${origin}/api/auth/send-verification-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ email: targetUser.email }),
    });

    if (!response.ok) {
      return reply.internalServerError('Failed to send verification email');
    }

    return { message: 'Verification email sent' };
  });
}
