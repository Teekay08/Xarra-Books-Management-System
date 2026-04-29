import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasPermission, type Module, type Permission } from '@xarra/shared';
import { hasEffectivePermission } from '../services/permissions.js';

/**
 * Map any role string (old or new, any case) to the canonical 5-role name.
 * This ensures backward compatibility when old role names appear in either:
 * - The user's DB role (e.g., 'OPERATIONS' stored from before restructuring)
 * - The requireRole() argument (e.g., legacy code calling requireRole('operations'))
 */
const ROLE_CANONICAL: Record<string, string> = {
  admin: 'admin',
  finance: 'finance',
  projectmanager: 'projectmanager',
  project_manager: 'projectmanager',
  author: 'author',
  staff: 'staff',
  // Legacy mappings
  operations: 'projectmanager',
  editorial: 'staff',
  reportsonly: 'staff',
  reports_only: 'staff',
  employee: 'staff',
};

function canonicalRole(role: string): string {
  const key = role.toLowerCase().replace(/_/g, '');
  return ROLE_CANONICAL[key] ?? ROLE_CANONICAL[role.toLowerCase()] ?? role.toLowerCase();
}

/**
 * Middleware that requires an authenticated session.
 * Use as a preHandler on routes that need authentication.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session?.user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
}

/**
 * Factory that creates a middleware requiring specific roles.
 * Usage: { preHandler: requireRole('admin', 'finance') }
 *
 * Supports both old and new role names via canonical mapping:
 * - requireRole('admin', 'operations') → matches users with PROJECT_MANAGER role
 * - requireRole('admin', 'editorial') → matches users with STAFF role
 */
export function requireRole(...roles: string[]) {
  // Pre-compute canonical versions of required roles
  const canonicalRequired = roles.map(canonicalRole);

  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.session?.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const userRole = request.session.user.role;
    if (!userRole) {
      return reply.status(403).send({ error: 'No role assigned', current: userRole });
    }

    const userCanonical = canonicalRole(userRole);

    if (!canonicalRequired.includes(userCanonical)) {
      return reply.status(403).send({
        error: 'Insufficient permissions',
        required: roles,
        current: userRole,
      });
    }
  };
}

/**
 * Middleware that requires the user to have access to a specific product.
 * Products: 'xarra' | 'billetterie'
 *
 * Usage: { preHandler: requireProduct('billetterie') }
 *
 * IMPORTANT: No automatic bypasses — even system admins must be explicitly
 * granted product access. This enforces separation of concerns between
 * Xarra Books and Billetterie Software.
 *
 * Additionally: author role is permanently blocked from Billetterie.
 */
export function requireProduct(product: 'xarra' | 'billetterie') {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.session?.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const user = request.session.user as any;

    // Authors are external creatives — they have no business in a PM tool
    if (product === 'billetterie' && canonicalRole(user.role ?? '') === 'author') {
      return reply.status(403).send({
        error: 'Access denied',
        message: 'Author accounts do not have access to Billetterie Software.',
      });
    }

    const hasAccess = product === 'billetterie'
      ? user.billetterieAccess === true          // must be explicitly granted
      : user.xarraAccess !== false;              // xarra defaults to true (existing behaviour)

    if (!hasAccess) {
      return reply.status(403).send({
        error: 'Product access denied',
        product,
        message: `You do not have access to ${product === 'billetterie' ? 'Billetterie Software' : 'Xarra Books'}. Contact your administrator.`,
      });
    }
  };
}

/**
 * Blocks roles that have no business-data access (staff, author) from modules
 * where they should never appear. Apply as a module-level hook via
 * `app.addHook('preHandler', requireXarraBusinessUser)`.
 */
export async function requireXarraBusinessUser(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session?.user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
  const canon = canonicalRole(request.session.user.role ?? '');
  if (canon === 'staff' || canon === 'author') {
    return reply.status(403).send({
      error: 'Access denied',
      message: 'This area requires a business user role (Admin, Finance, or Operations).',
    });
  }
}

/**
 * Factory that creates a middleware requiring specific permission on a module.
 * Usage: { preHandler: requirePermission('invoices', 'create') }
 *
 * Checks effective permissions = role defaults + per-user overrides.
 * An admin-granted GRANT can add permissions beyond role; a DENY removes them.
 */
export function requirePermission(module: Module, permission: Permission) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.session?.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const user = request.session.user as any;
    const userRole = user.role ?? '';
    const db = (request.server as any).db;

    const allowed = db
      ? await hasEffectivePermission(db, user.id, userRole, module, permission)
      : hasPermission(userRole, module, permission); // fallback if db not available

    if (!allowed) {
      return reply.status(403).send({
        error: 'Insufficient permissions',
        required: `${module}:${permission}`,
        current: userRole,
      });
    }
  };
}
