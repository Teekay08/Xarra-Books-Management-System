import { Queue, Worker, type Job } from 'bullmq';
import { createDb } from '@xarra/db';
import { sql } from 'drizzle-orm';
import { sendEmail, isEmailConfigured } from '../services/email.js';
import { renderSorExpiryAlert } from '../services/templates/sor-expiry.js';
import { config } from '../config.js';

const QUEUE_NAME = 'sor-expiry-alerts';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

export function createSorExpiryQueue(redisUrl: string) {
  const queue = new Queue(QUEUE_NAME, {
    connection: parseRedisUrl(redisUrl),
  });
  return queue;
}

export async function scheduleSorExpiryJob(queue: Queue) {
  // Remove existing repeatable jobs to avoid duplicates
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Run daily at 7:00 AM SAST (05:00 UTC)
  await queue.add(
    'check-sor-expiry',
    {},
    {
      repeat: { pattern: '0 5 * * *' }, // 7 AM SAST
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

interface SorExpiryRow {
  consignmentId: string;
  partnerName: string;
  contactEmail: string | null;
  sorExpiryDate: string;
  daysRemaining: number;
  totalDispatched: number;
  totalSold: number;
  totalOutstanding: number;
}

export function createSorExpiryWorker(redisUrl: string) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const db = createDb(config.database.url);
      const now = new Date();

      // Find consignments expiring within 30 days that are still active
      const results = (await db.execute(sql`
        SELECT
          c.id AS "consignmentId",
          cp.name AS "partnerName",
          cp.contact_email AS "contactEmail",
          c.sor_expiry_date AS "sorExpiryDate",
          EXTRACT(DAY FROM c.sor_expiry_date - ${now.toISOString()}::timestamptz)::int AS "daysRemaining",
          COALESCE(SUM(cl.qty_dispatched), 0)::int AS "totalDispatched",
          COALESCE(SUM(cl.qty_sold), 0)::int AS "totalSold",
          COALESCE(SUM(cl.qty_dispatched - cl.qty_sold - cl.qty_returned - cl.qty_damaged), 0)::int AS "totalOutstanding"
        FROM consignments c
        JOIN channel_partners cp ON cp.id = c.partner_id
        LEFT JOIN consignment_lines cl ON cl.consignment_id = c.id
        WHERE c.status IN ('DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED')
          AND c.sor_expiry_date IS NOT NULL
          AND c.sor_expiry_date <= (${now.toISOString()}::timestamptz + INTERVAL '30 days')
        GROUP BY c.id, cp.name, cp.contact_email, c.sor_expiry_date
        ORDER BY c.sor_expiry_date ASC
      `)) as unknown as SorExpiryRow[];

      if (!results.length) {
        return { message: 'No expiring consignments found' };
      }

      if (!isEmailConfigured()) {
        return { message: `Found ${results.length} expiring consignments but email not configured` };
      }

      // Group by urgency: overdue, expiring this week, expiring within 30 days
      const overdue = results.filter((r) => r.daysRemaining <= 0);
      const thisWeek = results.filter((r) => r.daysRemaining > 0 && r.daysRemaining <= 7);
      const upcoming = results.filter((r) => r.daysRemaining > 7);

      // Send alert to Xarra admin
      const html = renderSorExpiryAlert(results);
      const urgentCount = overdue.length + thisWeek.length;
      const subject = urgentCount > 0
        ? `[URGENT] ${urgentCount} SOR consignment(s) expiring soon`
        : `SOR Expiry Report: ${upcoming.length} consignment(s) within 30 days`;

      await sendEmail({
        to: config.resend.fromEmail, // sends to configured admin email
        subject,
        html,
      });

      return {
        message: 'SOR expiry alerts sent',
        overdue: overdue.length,
        thisWeek: thisWeek.length,
        upcoming: upcoming.length,
      };
    },
    { connection: parseRedisUrl(redisUrl) }
  );

  worker.on('completed', (job, result) => {
    console.log(`SOR expiry job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`SOR expiry job ${job?.id} failed:`, err.message);
  });

  return worker;
}
