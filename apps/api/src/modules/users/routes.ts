import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { user as authUsers, userPermissionOverrides } from '@xarra/db';
import { paginationSchema, type Module, type Permission } from '@xarra/shared';
import { requireRole } from '../../middleware/require-auth.js';
import { logAudit, requestContext } from '../../services/audit.js';
import { getEffectivePermissions } from '../../services/permissions.js';
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

const updateProductAccessSchema = z.object({
  xarraAccess:           z.boolean().optional(),
  billetterieAccess:     z.boolean().optional(),
  billetterieSystemRole: z.enum(['MANAGER', 'ADMIN']).nullable().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  // List users with PM/admin role — used by Project form's "Project Manager" picker.
  // Accessible to admin + project_manager so PMs can create projects too.
  app.get('/managers', { preHandler: requireRole('admin', 'project_manager') }, async () => {
    const items = await app.db.query.user.findMany({
      where: (u, { inArray }) => inArray(u.role, ['admin', 'project_manager']),
      orderBy: (u, { asc }) => [asc(u.name)],
    });
    return {
      data: items.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: authToUiRole[u.role ?? 'staff'] ?? 'STAFF',
      })),
    };
  });

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

  // Update product access (admin only)
  app.patch<{ Params: { id: string } }>('/:id/product-access', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = updateProductAccessSchema.parse(request.body);

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (body.xarraAccess       !== undefined) updateData.xarraAccess           = body.xarraAccess;
    if (body.billetterieAccess !== undefined) updateData.billetterieAccess     = body.billetterieAccess;
    if ('billetterieSystemRole' in body)      updateData.billetterieSystemRole = body.billetterieSystemRole ?? null;

    const [updated] = await app.db
      .update(authUsers)
      .set(updateData)
      .where(eq(authUsers.id, request.params.id))
      .returning({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        xarraAccess: authUsers.xarraAccess,
        billetterieAccess: authUsers.billetterieAccess,
        billetterieSystemRole: authUsers.billetterieSystemRole,
      });

    if (!updated) return reply.notFound('User not found');
    return { data: updated };
  });

  // ── Permission overrides — GET /users/:id/permissions ────────────────────────
  app.get<{ Params: { id: string } }>('/:id/permissions', { preHandler: requireRole('admin') }, async (request, reply) => {
    const targetUser = await app.db.query.user.findFirst({
      where: eq(authUsers.id, request.params.id),
      columns: { id: true, name: true, email: true, role: true },
    });
    if (!targetUser) return reply.notFound('User not found');

    const [overrides, effective] = await Promise.all([
      app.db.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.userId, request.params.id)),
      getEffectivePermissions(app.db, request.params.id, targetUser.role ?? 'staff'),
    ]);

    return { data: { user: targetUser, overrides, effectivePermissions: effective } };
  });

  // ── Permission overrides — PUT /users/:id/permissions ────────────────────────
  // Replaces the full override set for a user. Body = array of { module, permission, type, reason }.
  // Admin only. Each change is written to audit_logs.
  app.put<{ Params: { id: string } }>('/:id/permissions', { preHandler: requireRole('admin') }, async (request: any, reply) => {
    const adminId = request.session!.user.id;
    const targetId = request.params.id;

    const bodySchema = z.object({
      overrides: z.array(z.object({
        module:     z.string().min(1).max(50),
        permission: z.string().min(1).max(20),
        type:       z.enum(['GRANT', 'DENY']),
        reason:     z.string().optional().nullable(),
      })),
    });
    const { overrides } = bodySchema.parse(request.body);

    const targetUser = await app.db.query.user.findFirst({
      where: eq(authUsers.id, targetId),
      columns: { id: true, name: true, role: true },
    });
    if (!targetUser) return reply.notFound('User not found');

    // Fetch existing overrides for audit diff
    const existing = await app.db.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.userId, targetId));

    // Replace all overrides: delete then insert
    await app.db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, targetId));

    if (overrides.length > 0) {
      await app.db.insert(userPermissionOverrides).values(
        overrides.map(o => ({
          userId:    targetId,
          module:    o.module,
          permission: o.permission,
          type:      o.type,
          grantedBy: adminId,
          reason:    o.reason ?? null,
        })),
      );
    }

    await logAudit(app.db, {
      userId:     adminId,
      action:     'PERMISSION_GRANT',
      entityType: 'user',
      entityId:   targetId,
      before:     { overrides: existing.map(e => ({ module: e.module, permission: e.permission, type: e.type })) },
      after:      { overrides: overrides.map(o => ({ module: o.module, permission: o.permission, type: o.type })) },
      metadata:   { targetUser: targetUser.name },
      ...requestContext(request),
    });

    const newOverrides = await app.db.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.userId, targetId));
    return { data: newOverrides };
  });

  // ── Product access update: audit the change ────────────────────────────────
  // Override the existing product-access route to add audit logging
  // (wrapped inside the same export function so we have app.db access)

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
