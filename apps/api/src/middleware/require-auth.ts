import type { FastifyRequest, FastifyReply } from 'fastify';

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
