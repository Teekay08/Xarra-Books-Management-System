import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasPermission, type Module, type Permission } from '@xarra/shared';

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
 */
export function requireRole(...roles: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.session?.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const userRole = request.session.user.role;
    if (!userRole || !roles.includes(userRole)) {
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
