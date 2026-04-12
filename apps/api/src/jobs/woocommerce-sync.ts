import { Queue, Worker, type Job } from 'bullmq';
import { createDb } from '@xarra/db';
import { sql } from 'drizzle-orm';
import { WooCommerceAdapter } from '../integrations/woocommerce.js';
import { SyncEngine } from '../integrations/sync-engine.js';
import { config } from '../config.js';

const QUEUE_NAME = 'woocommerce-sync';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

export function createWoocommerceSyncQueue(redisUrl: string) {
  return new Queue(QUEUE_NAME, { connection: parseRedisUrl(redisUrl) });
}

export async function scheduleWoocommerceSyncJob(queue: Queue) {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Run every 15 minutes
  await queue.add(
    'poll-woocommerce-sales',
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

export function createWoocommerceSyncWorker(redisUrl: string) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const { url, consumerKey, consumerSecret } = config.woocommerce;
      if (!url || !consumerKey || !consumerSecret) {
        return { message: 'WooCommerce credentials not configured, skipping sync' };
      }

      const db = createDb(config.database.url);

      // Determine the last successful sync date
      const lastSync = await db.execute(sql`
        SELECT completed_at FROM sync_operations
        WHERE platform = 'WOOCOMMERCE' AND status IN ('COMPLETED', 'PARTIAL')
        ORDER BY completed_at DESC LIMIT 1
      `);

      const since = (lastSync as any[])[0]?.completed_at
        ? new Date((lastSync as any[])[0].completed_at)
        : new Date(Date.now() - 24 * 60 * 60 * 1000); // default: last 24 hours

      const adapter = new WooCommerceAdapter({ baseUrl: url, consumerKey, consumerSecret });
      const engine = new SyncEngine(db);
      const result = await engine.importSales(adapter, since);

      return {
        message: 'WooCommerce sync completed',
        recordsProcessed: result.recordsProcessed,
        recordsCreated: result.recordsCreated,
        recordsSkipped: result.recordsSkipped,
        errors: result.errors.length,
      };
    },
    { connection: parseRedisUrl(redisUrl) }
  );

  worker.on('completed', (job, result) => {
    console.log(`WooCommerce sync job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`WooCommerce sync job ${job?.id} failed:`, err.message);
  });

  return worker;
}
