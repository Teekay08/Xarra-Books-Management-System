import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import databasePlugin from './plugins/database.js';
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
  await app.register(cors, { origin: config.cors.origin, credentials: true });
  await app.register(helmet);
  await app.register(sensible);

  // Database
  await app.register(databasePlugin);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  }));

  // API version prefix
  app.register(async (api) => {
    // Module routes will be registered here
    api.get('/ping', async () => ({ message: 'Xarra Books API v1' }));
  }, { prefix: '/api/v1' });

  return app;
}
