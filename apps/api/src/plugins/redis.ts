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
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });

  fastify.log.info('Redis connected');
});
