import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import databasePlugin from './plugins/database.js';
import authPlugin from './plugins/auth.js';
import { authorRoutes } from './modules/authors/routes.js';
import { titleRoutes } from './modules/titles/routes.js';
import { partnerRoutes } from './modules/partners/routes.js';
import { inventoryRoutes } from './modules/inventory/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { financeRoutes } from './modules/finance/routes.js';
import { royaltyRoutes } from './modules/royalties/routes.js';
import { consignmentRoutes } from './modules/consignments/routes.js';
import { config } from './config.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      transport: config.nodeEnv !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // Core plugins
  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });
  await app.register(helmet);
  await app.register(sensible);

  // Database
  await app.register(databasePlugin);

  // Authentication (Better Auth)
  await app.register(authPlugin);

  // Health check (no auth required)
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  }));

  // API version prefix
  app.register(async (api) => {
    api.get('/ping', async () => ({ message: 'Xarra Books API v1' }));

    // Session info endpoint
    api.get('/me', async (request, reply) => {
      if (!request.session?.user) {
        return reply.status(401).send({ error: 'Not authenticated' });
      }
      return {
        user: request.session.user,
        session: {
          id: request.session.session.id,
          expiresAt: request.session.session.expiresAt,
        },
      };
    });

    // Module routes
    api.register(authorRoutes, { prefix: '/authors' });
    api.register(titleRoutes, { prefix: '/titles' });
    api.register(partnerRoutes, { prefix: '/partners' });
    api.register(inventoryRoutes, { prefix: '/inventory' });
    api.register(dashboardRoutes, { prefix: '/dashboard' });
    api.register(financeRoutes, { prefix: '/finance' });
    api.register(royaltyRoutes, { prefix: '/royalties' });
    api.register(consignmentRoutes, { prefix: '/consignments' });
  }, { prefix: '/api/v1' });

  return app;
}
