import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasPermission, type Module, type Permission } from '@xarra/shared';

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
 * Factory that creates a middleware requiring specific permission on a module.
 * Usage: { preHandler: requirePermission('invoices', 'create') }
 */
export function requirePermission(module: Module, permission: Permission) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.session?.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const userRole = request.session.user.role;
    if (!userRole || !hasPermission(userRole, module, permission)) {
      return reply.status(403).send({
        error: 'Insufficient permissions',
        required: `${module}:${permission}`,
        current: userRole,
      });
    }
  };
}
