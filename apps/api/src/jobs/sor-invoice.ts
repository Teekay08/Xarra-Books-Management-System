import { Queue, Worker, type Job } from 'bullmq';
import { createDb } from '@xarra/db';
import { sql, eq } from 'drizzle-orm';
import { invoices, invoiceLines, consignments } from '@xarra/db';
import { config } from '../config.js';
import { VAT_RATE, roundAmount } from '@xarra/shared';

const QUEUE_NAME = 'sor-auto-invoice';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

export function createSorInvoiceQueue(redisUrl: string) {
  return new Queue(QUEUE_NAME, { connection: parseRedisUrl(redisUrl) });
}

export async function scheduleSorInvoiceJob(queue: Queue) {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Run daily at 8:00 AM SAST (06:00 UTC), after the SOR expiry alert job
  await queue.add(
    'generate-sor-invoices',
    {},
    {
      repeat: { pattern: '0 6 * * *' },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

interface ExpiredSorRow {
  consignmentId: string;
  partnerId: string;
  branchId: string | null;
  partnerName: string;
  paymentTermsDays: number | null;
  sorExpiryDate: string;
}

interface ConsignmentLineRow {
  id: string;
  titleId: string;
  titleName: string;
  isbn: string | null;
  qtySold: number;
  unitRrp: string;
  discountPct: string;
}

export function createSorInvoiceWorker(redisUrl: string) {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const db = createDb(config.database.url);
      const now = new Date();

      // Check scheduling settings
      const settingsRow = await db.execute(sql`
        SELECT scheduling_settings AS "schedulingSettings" FROM company_settings LIMIT 1
      `);
      const scheduling = (settingsRow[0] as any)?.schedulingSettings;
      const sorConfig = scheduling?.sorAutoInvoice ?? { enabled: true, graceDays: 0, timeHour: 8 };

      if (!sorConfig.enabled) {
        return { message: 'SOR auto-invoicing is disabled', invoicesCreated: 0 };
      }

      // Apply grace days: only invoice consignments expired more than N days ago
      const cutoffDate = new Date(now);
      cutoffDate.setDate(cutoffDate.getDate() - (sorConfig.graceDays || 0));

      // Find expired SOR consignments that have unreported sold items and haven't been invoiced yet
      const expired = (await db.execute(sql`
        SELECT
          c.id AS "consignmentId",
          c.partner_id AS "partnerId",
          c.branch_id AS "branchId",
          cp.name AS "partnerName",
          cp.payment_terms_days AS "paymentTermsDays",
          c.sor_expiry_date AS "sorExpiryDate"
        FROM consignments c
        JOIN channel_partners cp ON cp.id = c.partner_id
        WHERE c.status IN ('DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN')
          AND c.sor_expiry_date IS NOT NULL
          AND c.sor_expiry_date <= ${cutoffDate.toISOString()}::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.consignment_id = c.id AND i.status != 'VOIDED'
          )
        ORDER BY c.sor_expiry_date ASC
      `)) as unknown as ExpiredSorRow[];

      if (!expired.length) {
        return { message: 'No expired SOR consignments needing invoicing', invoicesCreated: 0 };
      }

      let invoicesCreated = 0;

      for (const sor of expired) {
        // Get consignment lines with sold quantities
        const lines = (await db.execute(sql`
          SELECT
            cl.id,
            cl.title_id AS "titleId",
            t.title AS "titleName",
            t.isbn_13 AS isbn,
            cl.qty_sold AS "qtySold",
            cl.unit_rrp AS "unitRrp",
            cl.discount_pct AS "discountPct"
          FROM consignment_lines cl
          JOIN titles t ON t.id = cl.title_id
          WHERE cl.consignment_id = ${sor.consignmentId}
            AND cl.qty_sold > 0
        `)) as unknown as ConsignmentLineRow[];

        if (!lines.length) continue;

        // Calculate invoice totals from SOR pricing (tax-inclusive — RRP is always inclusive in SA)
        const isTaxInclusive = true;
        let subtotal = 0;
        let totalVat = 0;
        const lineData = lines.map((line, i) => {
          const unitPrice = roundAmount(Number(line.unitRrp) * (1 - Number(line.discountPct) / 100));
          const lineTotal = roundAmount(line.qtySold * unitPrice);
          const lineTax = roundAmount(isTaxInclusive
            ? lineTotal - (lineTotal / (1 + VAT_RATE))
            : lineTotal * VAT_RATE);
          const lineExVat = roundAmount(isTaxInclusive ? lineTotal - lineTax : lineTotal);
          subtotal += lineExVat;
          totalVat += lineTax;
          return {
            lineNumber: i + 1,
            titleId: line.titleId,
            consignmentLineId: line.id,
            description: `${line.titleName}${line.isbn ? ` (ISBN: ${line.isbn})` : ''}`,
            quantity: String(line.qtySold),
            unitPrice: String(unitPrice),
            discountPct: '0', // discount already baked into unitPrice
            lineTotal: String(lineTotal),
            lineTax: String(lineTax),
          };
        });

        subtotal = roundAmount(subtotal);
        totalVat = roundAmount(totalVat);
        const total = roundAmount(subtotal + totalVat);

        if (total <= 0) continue;

        // Generate invoice number
        const yearStr = String(now.getFullYear());
        const countResult = await db.execute<{ count: string }>(sql`
          SELECT COUNT(*) AS count FROM invoices
          WHERE number LIKE ${'INV-' + yearStr + '-%'}
        `);
        const nextNum = Number(countResult[0]?.count ?? 0) + 1;
        const invoiceNumber = `INV-${yearStr}-${String(nextNum).padStart(4, '0')}`;

        // Calculate due date
        const invoiceDate = now;
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + (sor.paymentTermsDays ?? 30));

        // Create the invoice and lines in a transaction
        await db.transaction(async (tx) => {
          const [inv] = await tx.insert(invoices).values({
            number: invoiceNumber,
            partnerId: sor.partnerId,
            branchId: sor.branchId,
            consignmentId: sor.consignmentId,
            invoiceDate,
            dueDate,
            subtotal: String(subtotal),
            vatAmount: String(totalVat),
            total: String(total),
            taxInclusive: isTaxInclusive,
            status: 'ISSUED',
            issuedAt: now,
            notes: `Auto-generated invoice for expired SOR consignment. SOR expired ${new Date(sor.sorExpiryDate).toLocaleDateString('en-ZA')}.`,
          }).returning();

          await tx.insert(invoiceLines).values(
            lineData.map((l) => ({ ...l, invoiceId: inv.id }))
          );

          // Move consignment to RECONCILED status since it's been invoiced
          await tx.update(consignments).set({
            status: 'RECONCILED',
            reconciledAt: now,
            updatedAt: now,
          }).where(eq(consignments.id, sor.consignmentId));
        });

        invoicesCreated++;
      }

      // Create notifications for the created invoices
      if (invoicesCreated > 0) {
        try {
          await db.execute(sql`
            INSERT INTO notifications (type, priority, title, message, action_url)
            VALUES (
              'INVOICE_ISSUED',
              'HIGH',
              ${`${invoicesCreated} SOR invoice(s) auto-generated`},
              ${`${invoicesCreated} invoice(s) created for expired SOR consignments. Please review and send to partners.`},
              '/invoices'
            )
          `);
        } catch (err) {
          console.error('Failed to create SOR invoice notification:', err);
        }
      }

      return {
        message: `Generated ${invoicesCreated} invoice(s) for expired SOR consignments`,
        invoicesCreated,
        totalExpired: expired.length,
      };
    },
    { connection: parseRedisUrl(redisUrl) }
  );

  worker.on('completed', (job, result) => {
    console.log(`SOR auto-invoice job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`SOR auto-invoice job ${job?.id} failed:`, err.message);
  });

  return worker;
}
