import { Queue, Worker, type Job } from 'bullmq';
import { createDb } from '@xarra/db';
import { sql } from 'drizzle-orm';
import { config } from '../config.js';

const QUEUE_NAME = 'monthly-statements';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

export function createMonthlyStatementQueue(redisUrl: string) {
  return new Queue(QUEUE_NAME, { connection: parseRedisUrl(redisUrl) });
}

export async function scheduleMonthlyStatementJob(queue: Queue) {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Run daily at 04:00 UTC (6:00 AM SAST) — the worker checks the configured day of month
  await queue.add(
    'compile-monthly-statements',
    {},
    {
      repeat: { pattern: '0 4 * * *' },
      removeOnComplete: 50,
      removeOnFail: 20,
    }
  );
}

interface PartnerRow {
  id: string;
  name: string;
  contactEmail: string | null;
  remittanceEmail: string | null;
  branchCount: number;
}

interface BranchRow {
  id: string;
  partnerId: string;
  name: string;
  contactEmail: string | null;
}

export function createMonthlyStatementWorker(redisUrl: string) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const db = createDb(config.database.url);

      // Check scheduling settings
      const settingsRow = await db.execute(sql`
        SELECT scheduling_settings AS "schedulingSettings" FROM company_settings LIMIT 1
      `);
      const scheduling = (settingsRow[0] as any)?.schedulingSettings;
      const stmtConfig = scheduling?.statementGeneration ?? { enabled: true, dayOfMonth: 1, timeHour: 6 };

      if (!stmtConfig.enabled) {
        return { message: 'Monthly statement auto-compilation is disabled', itemsCreated: 0 };
      }

      // Only run on the configured day of month
      const now = new Date();
      const currentDay = now.getDate();
      if (currentDay !== stmtConfig.dayOfMonth) {
        return { message: `Skipped — configured to run on day ${stmtConfig.dayOfMonth}, today is day ${currentDay}`, itemsCreated: 0 };
      }

      // Previous month period
      const periodFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const periodTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const periodLabel = periodFrom.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

      // Check if batch already exists for this period
      const existingBatch = await db.execute(sql`
        SELECT id FROM statement_batches
        WHERE period_from = ${periodFrom} AND period_to = ${periodTo}
      `);
      if (existingBatch.length > 0) {
        return { message: `Batch already exists for ${periodLabel}`, batchId: existingBatch[0].id };
      }

      // Find all active partners with outstanding invoices or activity in the period
      const partners = (await db.execute(sql`
        SELECT DISTINCT
          cp.id, cp.name,
          cp.contact_email AS "contactEmail",
          cp.remittance_email AS "remittanceEmail",
          (SELECT COUNT(*) FROM partner_branches pb WHERE pb.partner_id = cp.id AND pb.is_active = true)::int AS "branchCount"
        FROM channel_partners cp
        WHERE cp.is_active = true
          AND (
            EXISTS (
              SELECT 1 FROM invoices i
              WHERE i.partner_id = cp.id AND i.status NOT IN ('VOIDED', 'DRAFT')
              AND i.invoice_date <= ${periodTo}
            )
            OR EXISTS (
              SELECT 1 FROM payments p
              JOIN payment_allocations pa ON pa.payment_id = p.id
              JOIN invoices i ON i.id = pa.invoice_id
              WHERE i.partner_id = cp.id
              AND p.payment_date >= ${periodFrom} AND p.payment_date <= ${periodTo}
            )
          )
        ORDER BY cp.name ASC
      `)) as unknown as PartnerRow[];

      if (!partners.length) {
        return { message: `No partners with activity for ${periodLabel}`, itemsCreated: 0 };
      }

      // Create the statement batch
      const [batch] = await db.execute<{ id: string }>(sql`
        INSERT INTO statement_batches (period_from, period_to, period_label, status)
        VALUES (${periodFrom}, ${periodTo}, ${periodLabel}, 'DRAFT')
        RETURNING id
      `);
      const batchId = batch.id;

      let itemsCreated = 0;

      for (const partner of partners) {
        if (partner.branchCount > 0) {
          // Multi-branch partner: create one item per active branch + consolidated for HQ
          const branches = (await db.execute(sql`
            SELECT id, partner_id AS "partnerId", name, contact_email AS "contactEmail"
            FROM partner_branches
            WHERE partner_id = ${partner.id} AND is_active = true
            ORDER BY name ASC
          `)) as unknown as BranchRow[];

          for (const branch of branches) {
            // Determine recipient: branch email or fall back to partner HQ
            const recipientEmail = branch.contactEmail || partner.contactEmail || partner.remittanceEmail;
            await db.execute(sql`
              INSERT INTO statement_batch_items (
                batch_id, partner_id, branch_id, recipient_email,
                send_to_type, status
              ) VALUES (
                ${batchId}, ${partner.id}, ${branch.id},
                ${recipientEmail},
                'BRANCH', 'PENDING'
              )
            `);
            itemsCreated++;
          }

          // Consolidated statement for HQ
          const hqEmail = partner.contactEmail || partner.remittanceEmail;
          await db.execute(sql`
            INSERT INTO statement_batch_items (
              batch_id, partner_id, branch_id, recipient_email,
              send_to_type, status
            ) VALUES (
              ${batchId}, ${partner.id}, ${null},
              ${hqEmail},
              'HQ_CONSOLIDATED', 'PENDING'
            )
          `);
          itemsCreated++;
        } else {
          // Single-store partner (no branches): send directly to partner email
          const recipientEmail = partner.contactEmail || partner.remittanceEmail;
          await db.execute(sql`
            INSERT INTO statement_batch_items (
              batch_id, partner_id, branch_id, recipient_email,
              send_to_type, status
            ) VALUES (
              ${batchId}, ${partner.id}, ${null},
              ${recipientEmail},
              'DIRECT', 'PENDING'
            )
          `);
          itemsCreated++;
        }
      }

      // Create notification for admin review
      try {
        await db.execute(sql`
          INSERT INTO notifications (type, priority, title, message, action_url)
          VALUES (
            'SYSTEM',
            'HIGH',
            ${`Monthly statements ready for review — ${periodLabel}`},
            ${`${itemsCreated} statement(s) compiled for ${partners.length} partner(s). Review and approve before sending.`},
            ${`/statements/batches/${batchId}`}
          )
        `);
      } catch (err) {
        console.error('Failed to create statement batch notification:', err);
      }

      return {
        message: `Compiled ${itemsCreated} statements for ${partners.length} partners (${periodLabel})`,
        batchId,
        partnersCount: partners.length,
        itemsCreated,
      };
    },
    { connection: parseRedisUrl(redisUrl) }
  );

  worker.on('completed', (job, result) => {
    console.log(`Monthly statement job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`Monthly statement job ${job?.id} failed:`, err.message);
  });

  return worker;
}
