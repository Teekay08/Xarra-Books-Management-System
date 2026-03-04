import fp from 'fastify-plugin';
import { createDb, type Database } from '@xarra/db';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export default fp(async (fastify) => {
  const db = createDb(config.database.url);
  fastify.decorate('db', db);
  fastify.log.info('Database connected');
});
