import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, type Auth } from '../auth/index.js';

type Session = Awaited<ReturnType<Auth['api']['getSession']>>;

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null;
  }
}

export default fp(async (fastify) => {
  // Mount Better Auth handler for /api/auth/* routes
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
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
        response.headers.forEach((value, key) => reply.header(key, value));

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
