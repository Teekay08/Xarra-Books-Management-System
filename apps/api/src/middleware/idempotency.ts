import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Extracts idempotency key from X-Idempotency-Key header.
 * Returns undefined if not provided (optional for non-financial endpoints).
 */
export function getIdempotencyKey(request: FastifyRequest): string | undefined {
  return request.headers['x-idempotency-key'] as string | undefined;
}

/**
 * Requires X-Idempotency-Key header on financial write endpoints.
 */
export async function requireIdempotencyKey(request: FastifyRequest, reply: FastifyReply) {
  const key = getIdempotencyKey(request);
  if (!key) {
    return reply.badRequest('X-Idempotency-Key header is required for financial operations');
  }
  if (key.length > 64) {
    return reply.badRequest('X-Idempotency-Key must be 64 characters or fewer');
  }
}
