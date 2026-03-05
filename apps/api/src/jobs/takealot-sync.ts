import { Queue, Worker, type Job } from 'bullmq';
import { createDb } from '@xarra/db';
import { sql } from 'drizzle-orm';
import { TakealotAdapter } from '../integrations/takealot.js';
import { SyncEngine } from '../integrations/sync-engine.js';
import { config } from '../config.js';

const QUEUE_NAME = 'takealot-sync';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

export function createTakealotSyncQueue(redisUrl: string) {
  return new Queue(QUEUE_NAME, { connection: parseRedisUrl(redisUrl) });
}

export async function scheduleTakealotSyncJob(queue: Queue) {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Run daily at 6:00 AM SAST (04:00 UTC)
  await queue.add(
    'poll-takealot-sales',
    {},
    {
      repeat: { pattern: '0 4 * * *' },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

export function createTakealotSyncWorker(redisUrl: string) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const apiKey = config.takealot.apiKey;
      if (!apiKey) {
        return { message: 'TAKEALOT_API_KEY not configured, skipping sync' };
      }

      const db = createDb(config.database.url);

      // Determine the last successful sync date
      const lastSync = await db.execute(sql`
        SELECT completed_at FROM sync_operations
        WHERE platform = 'TAKEALOT' AND status IN ('COMPLETED', 'PARTIAL')
        ORDER BY completed_at DESC LIMIT 1
      `);

      const since = (lastSync as any[])[0]?.completed_at
        ? new Date((lastSync as any[])[0].completed_at)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default: last 7 days

      const adapter = new TakealotAdapter({ apiKey });
      const engine = new SyncEngine(db);
      const result = await engine.importSales(adapter, since);

      return {
        message: 'Takealot sync completed',
        recordsProcessed: result.recordsProcessed,
        recordsCreated: result.recordsCreated,
        recordsSkipped: result.recordsSkipped,
        errors: result.errors.length,
      };
    },
    { connection: parseRedisUrl(redisUrl) }
  );

  worker.on('completed', (job, result) => {
    console.log(`Takealot sync job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`Takealot sync job ${job?.id} failed:`, err.message);
  });

  return worker;
}
