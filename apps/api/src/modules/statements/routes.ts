import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../../middleware/require-auth.js';
import { generatePdf } from '../../services/pdf.js';
import { renderStatementHtml } from '../../services/templates/statement.js';
import { sendEmailWithAttachment, isEmailConfigured } from '../../services/email.js';

// ─── Shared: compute statement data for a partner/branch/period ───────────────

async function computeStatementData(
  db: FastifyInstance['db'],
  partnerId: string,
  branchId: string | null,
  periodFrom: string,
  periodTo: string,
  consolidated: boolean,
) {
  // Factory functions — each call returns a fresh sql object to avoid
  // Drizzle parameter-numbering issues when the same condition appears
  // in multiple queries or multiple UNION branches.
  const ibc = () => consolidated ? sql`TRUE` : branchId ? sql`i.branch_id = ${branchId}` : sql`i.branch_id IS NULL`;
  const pbc = () => consolidated ? sql`TRUE` : branchId ? sql`p.branch_id = ${branchId}` : sql`p.branch_id IS NULL`;

  const [preInv, prePay, preCN, preDN, txRows] = await Promise.all([
    // Opening: invoices issued before period
    db.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(i.total::numeric), 0) AS total
      FROM invoices i
      WHERE i.partner_id = ${partnerId}
        AND ${ibc()}
        AND i.status NOT IN ('VOIDED', 'DRAFT')
        AND i.invoice_date < ${periodFrom}
    `),
    // Opening: payments received before period
    db.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(p.amount::numeric), 0) AS total
      FROM payments p
      WHERE p.partner_id = ${partnerId}
        AND ${pbc()}
        AND p.payment_date < ${periodFrom}
    `),
    // Opening: credit notes applied before period
    db.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(cn.total::numeric), 0) AS total
      FROM credit_notes cn
      JOIN invoices i ON i.id = cn.invoice_id
      WHERE cn.partner_id = ${partnerId}
        AND ${ibc()}
        AND cn.status NOT IN ('VOIDED', 'DRAFT')
        AND cn.created_at < ${periodFrom}
    `),
    // Opening: debit notes before period
    db.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(dn.total::numeric), 0) AS total
      FROM debit_notes dn
      WHERE dn.partner_id = ${partnerId}
        AND dn.voided_at IS NULL
        AND dn.created_at < ${periodFrom}
    `),
    // Transactions within period — alias 'tx_date' avoids PostgreSQL reserved word 'date'
    db.execute(sql`
      SELECT 'INVOICE' AS type, i.id, i.number AS reference,
             'Invoice' AS description,
             i.invoice_date::text AS tx_date,
             i.total::numeric AS debit, 0::numeric AS credit
      FROM invoices i
      WHERE i.partner_id = ${partnerId}
        AND ${ibc()}
        AND i.status NOT IN ('VOIDED', 'DRAFT')
        AND i.invoice_date >= ${periodFrom}
        AND i.invoice_date <= ${periodTo}
      UNION ALL
      SELECT 'PAYMENT', p.id, p.bank_reference,
             'Payment received',
             p.payment_date::text,
             0, SUM(pa.amount::numeric)
      FROM payments p
      JOIN payment_allocations pa ON pa.payment_id = p.id
      JOIN invoices inv ON inv.id = pa.invoice_id AND inv.partner_id = ${partnerId}
      WHERE p.partner_id = ${partnerId}
        AND ${pbc()}
        AND p.payment_date >= ${periodFrom}
        AND p.payment_date <= ${periodTo}
      GROUP BY p.id, p.bank_reference, p.payment_date
      UNION ALL
      SELECT 'CREDIT_NOTE', cn.id, cn.number,
             COALESCE(cn.reason, 'Credit note'),
             cn.created_at::text,
             0, cn.total::numeric
      FROM credit_notes cn
      JOIN invoices i ON i.id = cn.invoice_id
      WHERE cn.partner_id = ${partnerId}
        AND ${ibc()}
        AND cn.status NOT IN ('VOIDED', 'DRAFT')
        AND cn.created_at >= ${periodFrom}
        AND cn.created_at <= ${periodTo}
      UNION ALL
      SELECT 'DEBIT_NOTE', dn.id, dn.number,
             COALESCE(dn.reason, 'Debit note'),
             dn.created_at::text,
             dn.total::numeric, 0
      FROM debit_notes dn
      WHERE dn.partner_id = ${partnerId}
        AND dn.voided_at IS NULL
        AND dn.created_at >= ${periodFrom}
        AND dn.created_at <= ${periodTo}
      ORDER BY tx_date ASC
    `),
  ]);

  const preInvoiced = Number(preInv[0]?.total ?? 0);
  const prePaid = Number(prePay[0]?.total ?? 0);
  const preCredited = Number(preCN[0]?.total ?? 0);
  const preDebited = Number(preDN[0]?.total ?? 0);
  const openingBalance = preInvoiced - prePaid - preCredited + preDebited;

  // Build running balance
  let runningBalance = openingBalance;
  let totalInvoiced = 0;
  let totalReceived = 0;
  let totalCredits = 0;
  let totalDebits = 0;

  const transactions = (txRows as any[]).map((r) => {
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    runningBalance = runningBalance + debit - credit;
    if (r.type === 'INVOICE') totalInvoiced += debit;
    if (r.type === 'PAYMENT') totalReceived += credit;
    if (r.type === 'CREDIT_NOTE') totalCredits += credit;
    if (r.type === 'DEBIT_NOTE') totalDebits += debit;
    return {
      date: r.tx_date,
      type: r.type as 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'DEBIT_NOTE',
      reference: r.reference,
      description: r.description,
      debit,
      credit,
      balance: runningBalance,
    };
  });

  return {
    openingBalance,
    transactions,
    closingBalance: runningBalance,
    totalInvoiced,
    totalReceived,
    totalCredits,
    totalDebits,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function statementRoutes(app: FastifyInstance) {

  // ── Batch list — supports ?status=X or ?status=X,Y ─────────────────────────
  app.get('/batches', { preHandler: requireAuth }, async (request) => {
    const { status } = request.query as { status?: string };

    // Build optional WHERE clause from comma-separated status values
    let statusWhere = '';
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        const escaped = statuses.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        statusWhere = `WHERE sb.status IN (${escaped})`;
      }
    }

    const rows = await app.db.execute(sql`
      SELECT
        sb.id, sb.period_from, sb.period_to, sb.period_label, sb.status,
        sb.reviewed_at, sb.approved_at, sb.sent_at, sb.notes, sb.created_at,
        COUNT(sbi.id)::int AS total_items,
        COUNT(sbi.id) FILTER (WHERE sbi.status = 'SENT')::int AS total_sent,
        COUNT(sbi.id) FILTER (WHERE sbi.status = 'FAILED')::int AS total_failed
      FROM statement_batches sb
      LEFT JOIN statement_batch_items sbi ON sbi.batch_id = sb.id
      ${sql.raw(statusWhere)}
      GROUP BY sb.id, sb.period_from, sb.period_to, sb.period_label, sb.status,
               sb.reviewed_at, sb.approved_at, sb.sent_at, sb.notes, sb.created_at
      ORDER BY sb.created_at DESC
    `);

    return {
      data: (rows as any[]).map((r) => ({
        id: r.id,
        periodFrom: r.period_from,
        periodTo: r.period_to,
        periodLabel: r.period_label,
        status: r.status,
        reviewedAt: r.reviewed_at,
        approvedAt: r.approved_at,
        sentAt: r.sent_at,
        notes: r.notes,
        createdAt: r.created_at,
        totalItems: r.total_items,
        totalSent: r.total_sent,
        totalFailed: r.total_failed,
      })),
    };
  });

  // ── Compile a new batch ────────────────────────────────────────────────────
  app.post<{ Body: { month: number; year: number } }>(
    '/batches/compile',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { month, year } = request.body;

      if (!month || !year || month < 1 || month > 12 || year < 2020 || year > 2100) {
        return reply.status(400).send({ error: 'Invalid month or year' });
      }

      const periodFromDate = new Date(year, month - 1, 1);
      const periodToDate = new Date(year, month, 0, 23, 59, 59, 999);
      const periodFrom = periodFromDate.toISOString();
      const periodTo = periodToDate.toISOString();
      const periodLabel = periodFromDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

      // Prevent duplicate batches for same period
      const existing = await app.db.execute(sql`
        SELECT id FROM statement_batches
        WHERE period_from = ${periodFrom} AND period_to = ${periodTo}
        LIMIT 1
      `);
      if ((existing as any[]).length > 0) {
        return reply.status(409).send({
          error: `A statement batch for ${periodLabel} already exists`,
          batchId: (existing as any[])[0].id,
        });
      }

      // Find partners with activity in or before the period
      type PartnerRow = { id: string; name: string; contactEmail: string | null; remittanceEmail: string | null; branchCount: number };
      const partners = (await app.db.execute(sql`
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
              WHERE p.partner_id = cp.id
                AND p.payment_date >= ${periodFrom} AND p.payment_date <= ${periodTo}
            )
          )
        ORDER BY cp.name ASC
      `)) as unknown as PartnerRow[];

      if (!partners.length) {
        return reply.status(422).send({ error: `No partners with activity for ${periodLabel}` });
      }

      const [batchRow] = await app.db.execute<{ id: string }>(sql`
        INSERT INTO statement_batches (period_from, period_to, period_label, status)
        VALUES (${periodFrom}, ${periodTo}, ${periodLabel}, 'DRAFT')
        RETURNING id
      `);
      const batchId = batchRow.id;
      let itemsCreated = 0;

      type BranchRow = { id: string; name: string; contactEmail: string | null };
      for (const partner of partners) {
        if (partner.branchCount > 0) {
          const branches = (await app.db.execute(sql`
            SELECT id, name, contact_email AS "contactEmail"
            FROM partner_branches
            WHERE partner_id = ${partner.id} AND is_active = true
            ORDER BY name ASC
          `)) as unknown as BranchRow[];

          for (const branch of branches) {
            const recipientEmail = branch.contactEmail || partner.contactEmail || partner.remittanceEmail;
            await app.db.execute(sql`
              INSERT INTO statement_batch_items (batch_id, partner_id, branch_id, recipient_email, send_to_type, status)
              VALUES (${batchId}, ${partner.id}, ${branch.id}, ${recipientEmail}, 'BRANCH', 'PENDING')
            `);
            itemsCreated++;
          }

          const hqEmail = partner.contactEmail || partner.remittanceEmail;
          await app.db.execute(sql`
            INSERT INTO statement_batch_items (batch_id, partner_id, branch_id, recipient_email, send_to_type, status)
            VALUES (${batchId}, ${partner.id}, ${null}, ${hqEmail}, 'HQ_CONSOLIDATED', 'PENDING')
          `);
          itemsCreated++;
        } else {
          const recipientEmail = partner.contactEmail || partner.remittanceEmail;
          await app.db.execute(sql`
            INSERT INTO statement_batch_items (batch_id, partner_id, branch_id, recipient_email, send_to_type, status)
            VALUES (${batchId}, ${partner.id}, ${null}, ${recipientEmail}, 'DIRECT', 'PENDING')
          `);
          itemsCreated++;
        }
      }

      return { data: { id: batchId, periodLabel, itemsCreated, partnersCount: partners.length } };
    },
  );

  // ── Batch detail ───────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/batches/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params;

    const batchRows = await app.db.execute(sql`
      SELECT sb.*, COUNT(sbi.id)::int AS total_items,
        COUNT(sbi.id) FILTER (WHERE sbi.status = 'SENT')::int AS total_sent,
        COUNT(sbi.id) FILTER (WHERE sbi.status = 'FAILED')::int AS total_failed
      FROM statement_batches sb
      LEFT JOIN statement_batch_items sbi ON sbi.batch_id = sb.id
      WHERE sb.id = ${id}
      GROUP BY sb.id
    `);

    if (!(batchRows as any[]).length) return reply.status(404).send({ error: 'Batch not found' });
    const b = (batchRows as any[])[0];

    const items = await app.db.execute(sql`
      SELECT sbi.*,
        cp.name AS partner_name,
        pb.name AS branch_name
      FROM statement_batch_items sbi
      JOIN channel_partners cp ON cp.id = sbi.partner_id
      LEFT JOIN partner_branches pb ON pb.id = sbi.branch_id
      WHERE sbi.batch_id = ${id}
      ORDER BY cp.name ASC, sbi.send_to_type ASC
    `);

    return {
      data: {
        id: b.id, periodFrom: b.period_from, periodTo: b.period_to,
        periodLabel: b.period_label, status: b.status,
        reviewedAt: b.reviewed_at, approvedAt: b.approved_at, sentAt: b.sent_at,
        notes: b.notes, createdAt: b.created_at,
        totalItems: b.total_items, totalSent: b.total_sent, totalFailed: b.total_failed,
        items: (items as any[]).map((i) => ({
          id: i.id, partnerId: i.partner_id, branchId: i.branch_id,
          recipientEmail: i.recipient_email, sendToType: i.send_to_type,
          status: i.status, closingBalance: i.closing_balance,
          sentAt: i.sent_at, errorMessage: i.error_message,
          partner: { id: i.partner_id, name: i.partner_name },
          branch: i.branch_id ? { id: i.branch_id, name: i.branch_name } : null,
        })),
      },
    };
  });

  // ── Review ─────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/batches/:id/review', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params;
    const result = await app.db.execute(sql`
      UPDATE statement_batches
      SET status = 'REVIEWED', reviewed_at = NOW()
      WHERE id = ${id} AND status = 'DRAFT'
      RETURNING id
    `);
    if (!(result as any[]).length) return reply.status(400).send({ error: 'Batch not found or not in DRAFT status' });
    return { data: { id } };
  });

  // ── Approve ────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/batches/:id/approve', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params;
    const result = await app.db.execute(sql`
      UPDATE statement_batches
      SET status = 'APPROVED', approved_at = NOW()
      WHERE id = ${id} AND status = 'REVIEWED'
      RETURNING id
    `);
    if (!(result as any[]).length) return reply.status(400).send({ error: 'Batch not found or not in REVIEWED status' });
    return { data: { id } };
  });

  // ── Send all pending items ─────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/batches/:id/send', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params;

    const batchRows = await app.db.execute(sql`
      SELECT * FROM statement_batches WHERE id = ${id} AND status = 'APPROVED' LIMIT 1
    `);
    if (!(batchRows as any[]).length) {
      return reply.status(400).send({ error: 'Batch not found or not in APPROVED status' });
    }
    const batch = (batchRows as any[])[0];

    await app.db.execute(sql`
      UPDATE statement_batches SET status = 'SENDING' WHERE id = ${id}
    `);

    const items = await app.db.execute(sql`
      SELECT sbi.*, cp.name AS partner_name
      FROM statement_batch_items sbi
      JOIN channel_partners cp ON cp.id = sbi.partner_id
      WHERE sbi.batch_id = ${id} AND sbi.status = 'PENDING'
    `);

    const settings = await app.db.query.companySettings?.findFirst?.() as any;
    const emailReady = isEmailConfigured();
    let sent = 0;
    let failed = 0;

    // Normalise to ISO string regardless of what postgres.js returns for the TIMESTAMPTZ column
    // (Date object, string, or postgres.js internal type)
    const periodFrom = new Date(batch.period_from as any).toISOString();
    const periodTo   = new Date(batch.period_to   as any).toISOString();

    for (const item of items as any[]) {
      try {
        const consolidated = item.send_to_type === 'HQ_CONSOLIDATED';
        const stmtData = await computeStatementData(
          app.db,
          item.partner_id,
          item.branch_id,
          periodFrom,
          periodTo,
          consolidated,
        );

        // Update closing balance
        await app.db.execute(sql`
          UPDATE statement_batch_items
          SET closing_balance = ${stmtData.closingBalance}
          WHERE id = ${item.id}
        `);

        if (emailReady && item.recipient_email) {
          const html = renderStatementHtml({
            statementDate: new Date().toISOString().split('T')[0],
            periodFrom: periodFrom.split('T')[0],
            periodTo: periodTo.split('T')[0],
            company: settings ? {
              name: settings.companyName,
              tradingAs: settings.tradingAs,
              vatNumber: settings.vatNumber,
              registrationNumber: settings.registrationNumber,
              addressLine1: settings.addressLine1,
              city: settings.city,
              province: settings.province,
              postalCode: settings.postalCode,
              phone: settings.phone,
              email: settings.email,
              logoUrl: settings.logoUrl,
            } : undefined,
            recipient: {
              name: item.partner_name,
              branchName: consolidated ? 'Consolidated — All Branches' : undefined,
            },
            ...stmtData,
          });

          const pdfBuffer = await generatePdf(html);
          await sendEmailWithAttachment({
            to: item.recipient_email,
            subject: `Statement of Account — ${batch.period_label} — ${item.partner_name}`,
            html: `<p>Dear ${item.partner_name},</p><p>Please find your statement of account for ${batch.period_label} attached.</p>`,
            attachments: [{
              filename: `Statement_${item.partner_name.replace(/\s+/g, '_')}_${batch.period_label.replace(/\s+/g, '_')}.pdf`,
              content: pdfBuffer,
            }],
          });
        }

        await app.db.execute(sql`
          UPDATE statement_batch_items
          SET status = 'SENT', sent_at = NOW()
          WHERE id = ${item.id}
        `);
        sent++;
      } catch (err: any) {
        await app.db.execute(sql`
          UPDATE statement_batch_items
          SET status = 'FAILED', error_message = ${err.message ?? 'Unknown error'}
          WHERE id = ${item.id}
        `);
        failed++;
      }
    }

    // Finalise batch status
    const finalStatus = failed === 0 ? 'SENT' : sent === 0 ? 'APPROVED' : 'SENT';
    await app.db.execute(sql`
      UPDATE statement_batches
      SET status = ${finalStatus}, sent_at = ${finalStatus === 'SENT' ? new Date() : null}
      WHERE id = ${id}
    `);

    return { data: { sent, failed, emailSent: emailReady } };
  });

  // ── Exclude item ───────────────────────────────────────────────────────────
  app.post<{ Params: { id: string; itemId: string } }>(
    '/batches/:id/items/:itemId/exclude',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id, itemId } = request.params;
      const result = await app.db.execute(sql`
        UPDATE statement_batch_items SET status = 'EXCLUDED'
        WHERE id = ${itemId} AND batch_id = ${id} AND status = 'PENDING'
        RETURNING id
      `);
      if (!(result as any[]).length) return reply.status(400).send({ error: 'Item not found or already processed' });
      return { data: { id: itemId } };
    },
  );

  // ── Include item (undo exclude) ────────────────────────────────────────────
  app.post<{ Params: { id: string; itemId: string } }>(
    '/batches/:id/items/:itemId/include',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id, itemId } = request.params;
      const result = await app.db.execute(sql`
        UPDATE statement_batch_items SET status = 'PENDING'
        WHERE id = ${itemId} AND batch_id = ${id} AND status = 'EXCLUDED'
        RETURNING id
      `);
      if (!(result as any[]).length) return reply.status(400).send({ error: 'Item not found or not excluded' });
      return { data: { id: itemId } };
    },
  );

  // ── Update item email ──────────────────────────────────────────────────────
  app.patch<{ Params: { id: string; itemId: string }; Body: { recipientEmail: string } }>(
    '/batches/:id/items/:itemId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id, itemId } = request.params;
      const { recipientEmail } = request.body;
      const result = await app.db.execute(sql`
        UPDATE statement_batch_items SET recipient_email = ${recipientEmail}
        WHERE id = ${itemId} AND batch_id = ${id}
        RETURNING id
      `);
      if (!(result as any[]).length) return reply.status(404).send({ error: 'Item not found' });
      return { data: { id: itemId } };
    },
  );

  // ── Preview statement data (individual tab) ────────────────────────────────
  app.post<{
    Body: {
      partnerId: string;
      branchId?: string;
      branchIds?: string[];
      periodFrom: string;
      periodTo: string;
      consolidated?: boolean;
    };
  }>('/preview', { preHandler: requireAuth }, async (request, reply) => {
    const { partnerId, branchId, periodFrom, periodTo, consolidated } = request.body;
    if (!partnerId || !periodFrom || !periodTo) {
      return reply.status(400).send({ error: 'partnerId, periodFrom, and periodTo are required' });
    }

    const data = await computeStatementData(
      app.db,
      partnerId,
      branchId ?? null,
      periodFrom,
      periodTo,
      consolidated ?? false,
    );
    return { data };
  });

  // ── Generate PDF (individual tab) ──────────────────────────────────────────
  app.post<{
    Body: {
      partnerId: string;
      branchId?: string;
      periodFrom: string;
      periodTo: string;
      consolidated?: boolean;
    };
  }>('/generate', { preHandler: requireAuth }, async (request, reply) => {
    const { partnerId, branchId, periodFrom, periodTo, consolidated } = request.body;

    const [partnerRow, settings] = await Promise.all([
      app.db.execute(sql`SELECT name FROM channel_partners WHERE id = ${partnerId} LIMIT 1`),
      (app.db.query as any).companySettings?.findFirst?.() as Promise<any>,
    ]);

    const partner = (partnerRow as any[])[0];
    if (!partner) return reply.status(404).send({ error: 'Partner not found' });

    let branchName: string | undefined;
    if (branchId) {
      const br = await app.db.execute(sql`SELECT name FROM partner_branches WHERE id = ${branchId} LIMIT 1`);
      branchName = (br as any[])[0]?.name;
    }

    const stmtData = await computeStatementData(
      app.db,
      partnerId,
      branchId ?? null,
      periodFrom,
      periodTo,
      consolidated ?? false,
    );

    const html = renderStatementHtml({
      statementDate: new Date().toISOString().split('T')[0],
      periodFrom,
      periodTo,
      company: settings ? {
        name: settings.companyName,
        tradingAs: settings.tradingAs,
        vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
        addressLine1: settings.addressLine1,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      recipient: {
        name: partner.name,
        branchName: consolidated ? 'Consolidated — All Branches' : branchName,
      },
      ...stmtData,
    });

    const pdfBuffer = await generatePdf(html);
    const filename = `Statement_${partner.name.replace(/\s+/g, '_')}_${periodFrom}_to_${periodTo}.pdf`;

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(pdfBuffer);
  });

  // ── Generate consolidated PDF ──────────────────────────────────────────────
  app.post<{
    Body: { partnerId: string; periodFrom: string; periodTo: string };
  }>('/generate-consolidated', { preHandler: requireAuth }, async (request, reply) => {
    const { partnerId, periodFrom, periodTo } = request.body;

    const [partnerRow, settings] = await Promise.all([
      app.db.execute(sql`SELECT name FROM channel_partners WHERE id = ${partnerId} LIMIT 1`),
      (app.db.query as any).companySettings?.findFirst?.() as Promise<any>,
    ]);

    const partner = (partnerRow as any[])[0];
    if (!partner) return reply.status(404).send({ error: 'Partner not found' });

    const stmtData = await computeStatementData(app.db, partnerId, null, periodFrom, periodTo, true);

    const html = renderStatementHtml({
      statementDate: new Date().toISOString().split('T')[0],
      periodFrom,
      periodTo,
      company: settings ? {
        name: settings.companyName,
        tradingAs: settings.tradingAs,
        vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
      } : undefined,
      recipient: { name: partner.name, branchName: 'Consolidated — All Branches' },
      ...stmtData,
    });

    const pdfBuffer = await generatePdf(html);
    const filename = `Statement_${partner.name.replace(/\s+/g, '_')}_Consolidated_${periodFrom}_to_${periodTo}.pdf`;

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(pdfBuffer);
  });

  // ── Send single statement via email ───────────────────────────────────────
  app.post<{
    Body: {
      partnerId: string;
      branchId?: string;
      periodFrom: string;
      periodTo: string;
      consolidated?: boolean;
      recipientEmail?: string;
      message?: string;
    };
  }>('/send', { preHandler: requireAuth }, async (request, reply) => {
    const { partnerId, branchId, periodFrom, periodTo, consolidated, recipientEmail, message } = request.body;

    if (!isEmailConfigured()) {
      return reply.status(503).send({ error: 'Email is not configured. Set RESEND_API_KEY to enable email sending.' });
    }

    const [partnerRow, settings] = await Promise.all([
      app.db.execute(sql`
        SELECT cp.name, cp.contact_email, cp.remittance_email
        FROM channel_partners cp WHERE cp.id = ${partnerId} LIMIT 1
      `),
      (app.db.query as any).companySettings?.findFirst?.() as Promise<any>,
    ]);

    const partner = (partnerRow as any[])[0];
    if (!partner) return reply.status(404).send({ error: 'Partner not found' });

    const toEmail = recipientEmail || partner.contact_email || partner.remittance_email;
    if (!toEmail) return reply.status(400).send({ error: 'No recipient email available for this partner' });

    const stmtData = await computeStatementData(
      app.db, partnerId, branchId ?? null, periodFrom, periodTo, consolidated ?? false,
    );

    const html = renderStatementHtml({
      statementDate: new Date().toISOString().split('T')[0],
      periodFrom,
      periodTo,
      company: settings ? { name: settings.companyName, vatNumber: settings.vatNumber } : undefined,
      recipient: { name: partner.name },
      ...stmtData,
    });

    const pdfBuffer = await generatePdf(html);
    const periodRange = `${periodFrom} to ${periodTo}`;

    await sendEmailWithAttachment({
      to: toEmail,
      subject: `Statement of Account — ${periodRange} — ${partner.name}`,
      html: `<p>Dear ${partner.name},</p>${message ? `<p>${message}</p>` : ''}<p>Please find your statement of account attached.</p>`,
      attachments: [{
        filename: `Statement_${partner.name.replace(/\s+/g, '_')}_${periodFrom}_to_${periodTo}.pdf`,
        content: pdfBuffer,
      }],
    });

    return { data: { message: `Statement sent to ${toEmail}` } };
  });

  // ── Send to all branches ────────────────────────────────────────────────────
  app.post<{
    Body: { partnerId: string; periodFrom: string; periodTo: string; recipientEmail?: string; message?: string };
  }>('/send-all-branches', { preHandler: requireAuth }, async (request, reply) => {
    const { partnerId, periodFrom, periodTo, recipientEmail, message } = request.body;

    if (!isEmailConfigured()) {
      return reply.status(503).send({ error: 'Email is not configured.' });
    }

    const [partnerRow, branches, settings] = await Promise.all([
      app.db.execute(sql`SELECT name, contact_email, remittance_email FROM channel_partners WHERE id = ${partnerId} LIMIT 1`),
      app.db.execute(sql`SELECT id, name, contact_email FROM partner_branches WHERE partner_id = ${partnerId} AND is_active = true ORDER BY name ASC`),
      (app.db.query as any).companySettings?.findFirst?.() as Promise<any>,
    ]);

    const partner = (partnerRow as any[])[0];
    if (!partner) return reply.status(404).send({ error: 'Partner not found' });

    const toEmail = recipientEmail || partner.contact_email || partner.remittance_email;
    if (!toEmail) return reply.status(400).send({ error: 'No recipient email available' });

    // Generate one PDF per branch and consolidate into a single email
    const attachments: { filename: string; content: Buffer }[] = [];
    for (const branch of branches as any[]) {
      const stmtData = await computeStatementData(app.db, partnerId, branch.id, periodFrom, periodTo, false);
      const html = renderStatementHtml({
        statementDate: new Date().toISOString().split('T')[0],
        periodFrom, periodTo,
        company: settings ? { name: settings.companyName } : undefined,
        recipient: { name: partner.name, branchName: branch.name },
        ...stmtData,
      });
      const pdfBuffer = await generatePdf(html);
      attachments.push({
        filename: `Statement_${branch.name.replace(/\s+/g, '_')}_${periodFrom}_to_${periodTo}.pdf`,
        content: pdfBuffer,
      });
    }

    await sendEmailWithAttachment({
      to: toEmail,
      subject: `Branch Statements — ${periodFrom} to ${periodTo} — ${partner.name}`,
      html: `<p>Dear ${partner.name},</p>${message ? `<p>${message}</p>` : ''}<p>Please find ${attachments.length} branch statement(s) attached.</p>`,
      attachments,
    });

    return { data: { message: `${attachments.length} branch statement(s) sent to ${toEmail}` } };
  });
}
