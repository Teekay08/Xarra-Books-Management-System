import { Queue, Worker, type Job } from 'bullmq';
import { createDb } from '@xarra/db';
import { sql } from 'drizzle-orm';
import { sendEmail, isEmailConfigured } from '../services/email.js';
import { renderInvoiceReminderHtml } from '../services/templates/invoice-reminder.js';
import { config } from '../config.js';

const QUEUE_NAME = 'invoice-reminders';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

export function createInvoiceReminderQueue(redisUrl: string) {
  return new Queue(QUEUE_NAME, { connection: parseRedisUrl(redisUrl) });
}

export async function scheduleInvoiceReminderJob(queue: Queue) {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Run daily at 06:00 UTC (08:00 SAST)
  await queue.add(
    'send-invoice-reminders',
    {},
    {
      repeat: { pattern: '0 6 * * *' },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

interface ReminderCandidate {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  partnerId: string;
  partnerName: string;
  contactEmail: string | null;
  remittanceEmail: string | null;
  daysUntilDue: number;
}

// Map reminder type to days-until-due value
const REMINDER_TYPES = [
  { type: 'WEEK_BEFORE', days: 7, settingKey: 'weekBefore' as const },
  { type: 'DAY_BEFORE', days: 1, settingKey: 'dayBefore' as const },
  { type: 'ON_DUE_DATE', days: 0, settingKey: 'onDueDate' as const },
  { type: 'THREE_DAYS_AFTER', days: -3, settingKey: 'threeDaysAfter' as const },
  { type: 'SEVEN_DAYS_AFTER', days: -7, settingKey: 'sevenDaysAfter' as const },
];

export function createInvoiceReminderWorker(redisUrl: string) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const db = createDb(config.database.url);

      // Check reminder settings
      const settings = await db.execute(sql`
        SELECT invoice_reminders FROM company_settings LIMIT 1
      `) as unknown as { invoice_reminders: {
        enabled: boolean;
        weekBefore: boolean;
        dayBefore: boolean;
        onDueDate: boolean;
        threeDaysAfter: boolean;
        sevenDaysAfter: boolean;
      } | null }[];

      const reminderSettings = settings[0]?.invoice_reminders;
      if (!reminderSettings?.enabled) {
        return { message: 'Invoice reminders disabled' };
      }

      if (!isEmailConfigured()) {
        return { message: 'Email not configured' };
      }

      // Get company info for email template
      const companyRows = await db.execute(sql`
        SELECT company_name, email, phone FROM company_settings LIMIT 1
      `) as unknown as { company_name: string; email: string | null; phone: string | null }[];
      const company = companyRows[0] || { company_name: 'Xarra Books', email: null, phone: null };

      // Determine which reminder types are active
      const activeTypes = REMINDER_TYPES.filter(rt => reminderSettings[rt.settingKey]);
      if (!activeTypes.length) {
        return { message: 'No reminder intervals enabled' };
      }

      // Find invoices that match any active reminder interval
      // daysUntilDue = due_date - today (positive = upcoming, negative = overdue)
      const candidates = await db.execute(sql`
        SELECT
          i.id AS "invoiceId",
          i.number AS "invoiceNumber",
          i.invoice_date AS "invoiceDate",
          i.due_date AS "dueDate",
          i.total,
          cp.id AS "partnerId",
          cp.name AS "partnerName",
          cp.contact_email AS "contactEmail",
          cp.remittance_email AS "remittanceEmail",
          (i.due_date::date - CURRENT_DATE)::int AS "daysUntilDue"
        FROM invoices i
        JOIN channel_partners cp ON cp.id = i.partner_id
        WHERE i.status IN ('ISSUED', 'PARTIAL')
          AND i.due_date IS NOT NULL
          AND (i.due_date::date - CURRENT_DATE)::int IN (${sql.join(activeTypes.map(t => sql`${t.days}`), sql`, `)})
      `) as unknown as ReminderCandidate[];

      if (!candidates.length) {
        return { message: 'No invoices match reminder intervals today' };
      }

      let sent = 0;
      let skipped = 0;

      for (const candidate of candidates) {
        const email = candidate.remittanceEmail || candidate.contactEmail;
        if (!email) {
          skipped++;
          continue;
        }

        // Determine reminder type
        const reminderType = REMINDER_TYPES.find(rt => rt.days === candidate.daysUntilDue)?.type;
        if (!reminderType) continue;

        // Check if already sent
        const alreadySent = await db.execute(sql`
          SELECT 1 FROM invoice_reminders
          WHERE invoice_id = ${candidate.invoiceId}
            AND reminder_type = ${reminderType}
          LIMIT 1
        `) as unknown as any[];

        if (alreadySent.length > 0) {
          skipped++;
          continue;
        }

        // Send reminder email
        const html = renderInvoiceReminderHtml({
          partnerName: candidate.partnerName,
          invoiceNumber: candidate.invoiceNumber,
          invoiceDate: candidate.invoiceDate,
          dueDate: candidate.dueDate,
          total: candidate.total,
          daysUntilDue: candidate.daysUntilDue,
          companyName: company.company_name,
          companyEmail: company.email,
          companyPhone: company.phone,
        });

        const isOverdue = candidate.daysUntilDue < 0;
        const subject = isOverdue
          ? `Overdue Invoice Reminder: ${candidate.invoiceNumber}`
          : `Invoice Payment Reminder: ${candidate.invoiceNumber}`;

        await sendEmail({ to: email, subject, html });

        // Record sent reminder
        await db.execute(sql`
          INSERT INTO invoice_reminders (invoice_id, partner_id, reminder_type, sent_to)
          VALUES (${candidate.invoiceId}, ${candidate.partnerId}, ${reminderType}, ${email})
        `);

        sent++;
      }

      return { message: `Sent ${sent} reminders, skipped ${skipped}` };
    },
    { connection: parseRedisUrl(redisUrl) }
  );

  worker.on('completed', (job, result) => {
    console.log(`Invoice reminder job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`Invoice reminder job ${job?.id} failed:`, err.message);
  });

  return worker;
}
