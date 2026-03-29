import fp from 'fastify-plugin';
import IORedis from 'ioredis';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: IORedis;
  }
}

export default fp(async (fastify) => {
  const redis = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null, // required by BullMQ
    retryStrategy(times) {
      if (times > 3) return null; // stop retrying after 3 attempts
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  // Suppress unhandled error events (Redis is optional for dev)
  redis.on('error', (err) => {
    fastify.log.warn({ err: err.message }, 'Redis connection error (non-fatal)');
  });

  try {
    await redis.connect();
    fastify.log.info('Redis connected');
  } catch {
    fastify.log.warn('Redis unavailable — background jobs will not run');
  }

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit().catch(() => {});
  });
});
