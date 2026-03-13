import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, type Auth } from '../auth/index.js';
import { config } from '../config.js';

type Session = Awaited<ReturnType<Auth['api']['getSession']>>;

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null;
  }
}

export default fp(async (fastify) => {
  // Mount Better Auth handler for /api/auth/* routes
  // Note: Auth endpoints have stricter rate limiting applied at app level
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: {
      // Stricter rate limiting for auth endpoints — production only
      rateLimit: config.nodeEnv === 'production'
        ? { max: 5, timeWindow: '15 minutes' }
        : false,
    },
    async handler(request, reply) {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const headers = new Headers();
        Object.entries(request.headers).forEach(([key, value]) => {
          if (value) headers.append(key, Array.isArray(value) ? value.join(', ') : value);
        });

        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        });

        const response = await auth.handler(req);
        reply.status(response.status);

        // Forward headers, handling Set-Cookie specially to avoid
        // comma-joining multiple cookies (which corrupts them)
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() === 'set-cookie') return; // handled below
          reply.header(key, value);
        });
        const cookies = response.headers.getSetCookie?.() ?? [];
        for (const cookie of cookies) {
          reply.header('set-cookie', cookie);
        }

        const text = await response.text();
        reply.send(text || null);
      } catch (error) {
        fastify.log.error(error, 'Authentication error');
        reply.status(500).send({ error: 'Internal authentication error' });
      }
    },
  });

  // Decorate request with session resolver
  fastify.decorateRequest('session', null);

  // Pre-handler hook to resolve session on protected routes
  fastify.addHook('preHandler', async (request) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      request.session = session;
    } catch {
      request.session = null;
    }
  });

  fastify.log.info('Auth plugin registered');
});
