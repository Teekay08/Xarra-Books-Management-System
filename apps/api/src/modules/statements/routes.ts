import type { FastifyInstance } from 'fastify';
import { eq, sql, and, gte, lte, desc } from 'drizzle-orm';
import {
  invoices, payments, paymentAllocations, creditNotes, debitNotes,
  channelPartners, partnerBranches, companySettings,
  statementBatches, statementBatchItems,
} from '@xarra/db';
import { generateStatementSchema } from '@xarra/shared';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { generatePdf } from '../../services/pdf.js';
import { renderStatementHtml } from '../../services/templates/statement.js';
import { sendEmailWithAttachment, isEmailConfigured } from '../../services/email.js';
import { createBroadcastNotification } from '../../services/notifications.js';

interface InvoiceLineDetail {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Transaction {
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  lines?: InvoiceLineDetail[];
}

/** Build a SQL branch filter fragment for one or many branchIds. */
function branchSql(branchId?: string, branchIds?: string[]) {
  if (branchIds && branchIds.length > 0) {
    // sql`ANY(...)` for multi-branch
    return sql`AND branch_id = ANY(${branchIds})`;
  }
  if (branchId) {
    return sql`AND branch_id = ${branchId}`;
  }
  return sql``;
}

async function computeStatement(
  db: any,
  partnerId: string,
  branchId: string | undefined,
  periodFrom: Date,
  periodTo: Date,
  branchIds?: string[],
) {
  const bf = branchSql(branchId, branchIds);

  // Opening balance: sum of all invoices before period minus payments before period
  const priorInvoices = await db.execute(sql`
    SELECT COALESCE(SUM(total::numeric), 0) AS total
    FROM invoices
    WHERE partner_id = ${partnerId}
    ${bf}
    AND invoice_date < ${periodFrom}
    AND status != 'VOIDED'
  `);

  const priorPayments = await db.execute(sql`
    SELECT COALESCE(SUM(pa.amount::numeric), 0) AS total
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    JOIN invoices i ON i.id = pa.invoice_id
    WHERE i.partner_id = ${partnerId}
    ${bf}
    AND p.payment_date < ${periodFrom}
  `);

  const priorCredits = await db.execute(sql`
    SELECT COALESCE(SUM(total::numeric), 0) AS total
    FROM credit_notes
    WHERE partner_id = ${partnerId}
    AND created_at < ${periodFrom}
    AND voided_at IS NULL
  `);

  const priorDebits = await db.execute(sql`
    SELECT COALESCE(SUM(total::numeric), 0) AS total
    FROM debit_notes
    WHERE partner_id = ${partnerId}
    AND created_at < ${periodFrom}
    AND voided_at IS NULL
  `);

  const openingBalance = Number(priorInvoices[0]?.total ?? 0)
    + Number(priorDebits[0]?.total ?? 0)
    - Number(priorPayments[0]?.total ?? 0)
    - Number(priorCredits[0]?.total ?? 0);

  // Period invoices with line items for book-level detail
  const periodInvoices = await db.execute(sql`
    SELECT i.id, i.number, i.invoice_date, i.total, i.notes
    FROM invoices i
    WHERE i.partner_id = ${partnerId}
    ${bf}
    AND i.invoice_date >= ${periodFrom}
    AND i.invoice_date <= ${periodTo}
    AND i.status != 'VOIDED'
    ORDER BY i.invoice_date ASC
  `);

  // Fetch line items for all period invoices
  const invoiceIds = periodInvoices.map((inv: any) => inv.id);
  let invoiceLineMap: Record<string, InvoiceLineDetail[]> = {};
  if (invoiceIds.length > 0) {
    const lineRows = await db.execute(sql`
      SELECT invoice_id, description, quantity::int AS quantity,
             unit_price::numeric AS unit_price, line_total::numeric AS line_total
      FROM invoice_lines
      WHERE invoice_id = ANY(${invoiceIds})
      ORDER BY line_number ASC
    `);
    for (const row of lineRows) {
      const id = row.invoice_id;
      if (!invoiceLineMap[id]) invoiceLineMap[id] = [];
      invoiceLineMap[id].push({
        description: row.description,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        lineTotal: Number(row.line_total),
      });
    }
  }

  // Period payments (via allocations to partner invoices)
  const periodPayments = await db.execute(sql`
    SELECT p.bank_reference, p.payment_date, pa.amount, p.payment_method
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    JOIN invoices i ON i.id = pa.invoice_id
    WHERE i.partner_id = ${partnerId}
    ${bf}
    AND p.payment_date >= ${periodFrom}
    AND p.payment_date <= ${periodTo}
    ORDER BY p.payment_date ASC
  `);

  // Period credit notes
  const periodCredits = await db.execute(sql`
    SELECT number, created_at, total, reason
    FROM credit_notes
    WHERE partner_id = ${partnerId}
    AND created_at >= ${periodFrom}
    AND created_at <= ${periodTo}
    AND voided_at IS NULL
    ORDER BY created_at ASC
  `);

  // Period debit notes
  const periodDebits = await db.execute(sql`
    SELECT number, created_at, total, reason
    FROM debit_notes
    WHERE partner_id = ${partnerId}
    AND created_at >= ${periodFrom}
    AND created_at <= ${periodTo}
    AND voided_at IS NULL
    ORDER BY created_at ASC
  `);

  // Build transaction list
  const transactions: Transaction[] = [];
  let runningBalance = openingBalance;

  const allItems: { date: Date; item: any; type: Transaction['type'] }[] = [];

  for (const inv of periodInvoices) {
    allItems.push({ date: new Date(inv.invoice_date), item: inv, type: 'INVOICE' });
  }
  for (const pmt of periodPayments) {
    allItems.push({ date: new Date(pmt.payment_date), item: pmt, type: 'PAYMENT' });
  }
  for (const cn of periodCredits) {
    allItems.push({ date: new Date(cn.created_at), item: cn, type: 'CREDIT_NOTE' });
  }
  for (const dn of periodDebits) {
    allItems.push({ date: new Date(dn.created_at), item: dn, type: 'DEBIT_NOTE' });
  }

  allItems.sort((a, b) => a.date.getTime() - b.date.getTime());

  let totalInvoiced = 0;
  let totalReceived = 0;
  let totalCredits = 0;
  let totalDebits = 0;

  for (const entry of allItems) {
    const amount = Number(entry.item.total ?? entry.item.amount ?? 0);

    if (entry.type === 'INVOICE') {
      runningBalance += amount;
      totalInvoiced += amount;
      transactions.push({
        date: entry.date.toISOString(),
        type: 'INVOICE',
        reference: entry.item.number,
        description: entry.item.notes ?? 'Invoice',
        debit: amount,
        credit: 0,
        balance: runningBalance,
        lines: invoiceLineMap[entry.item.id],
      });
    } else if (entry.type === 'PAYMENT') {
      runningBalance -= amount;
      totalReceived += amount;
      transactions.push({
        date: entry.date.toISOString(),
        type: 'PAYMENT',
        reference: entry.item.bank_reference,
        description: `Payment received (${entry.item.payment_method ?? 'EFT'})`,
        debit: 0,
        credit: amount,
        balance: runningBalance,
      });
    } else if (entry.type === 'CREDIT_NOTE') {
      runningBalance -= amount;
      totalCredits += amount;
      transactions.push({
        date: entry.date.toISOString(),
        type: 'CREDIT_NOTE',
        reference: entry.item.number,
        description: entry.item.reason ?? 'Credit note',
        debit: 0,
        credit: amount,
        balance: runningBalance,
      });
    } else if (entry.type === 'DEBIT_NOTE') {
      runningBalance += amount;
      totalDebits += amount;
      transactions.push({
        date: entry.date.toISOString(),
        type: 'DEBIT_NOTE',
        reference: entry.item.number,
        description: entry.item.reason ?? 'Debit note',
        debit: amount,
        credit: 0,
        balance: runningBalance,
      });
    }
  }

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

export async function statementRoutes(app: FastifyInstance) {
  // Preview statement data (JSON)
  app.post('/preview', { preHandler: requireAuth }, async (request, reply) => {
    const body = generateStatementSchema.parse(request.body);
    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);

    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
    });
    if (!partner) return reply.notFound('Partner not found');

    const result = await computeStatement(
      app.db, body.partnerId, body.branchId, periodFrom, periodTo, body.branchIds,
    );

    return { data: { partner: partner.name, ...result } };
  });

  // Generate statement PDF
  app.post('/generate', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = generateStatementSchema.parse(request.body);
    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);

    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
      with: { branches: true },
    });
    if (!partner) return reply.notFound('Partner not found');

    const settings = await app.db.query.companySettings.findFirst();

    let branch = null;
    if (body.branchId) {
      branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, body.branchId),
      });
    }

    const result = await computeStatement(
      app.db, body.partnerId, body.branchId, periodFrom, periodTo, body.branchIds,
    );

    // Resolve branch names for multi-branch selection
    let branchName: string | undefined = branch?.name;
    if (!branchName && body.branchIds && body.branchIds.length > 0 && partner.branches) {
      const selected = partner.branches.filter((b: any) => body.branchIds!.includes(b.id));
      if (selected.length > 0) branchName = selected.map((b: any) => b.name).join(', ');
    }

    const html = renderStatementHtml({
      statementDate: new Date().toISOString(),
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      company: settings ? {
        name: settings.companyName,
        tradingAs: settings.tradingAs,
        vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
        addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
        bankDetails: settings.bankDetails ?? undefined,
      } : undefined,
      recipient: {
        name: partner.name,
        branchName,
        contactName: partner.contactName,
        contactEmail: partner.contactEmail,
        addressLine1: partner.addressLine1,
        addressLine2: partner.addressLine2,
        city: partner.city,
        province: partner.province,
        postalCode: partner.postalCode,
        vatNumber: partner.vatNumber,
      },
      ...result,
    });

    const pdf = await generatePdf(html);

    const filename = branch
      ? `SOA-${partner.name}-${branch.name}-${periodFrom.toISOString().slice(0, 10)}.pdf`
      : `SOA-${partner.name}-${periodFrom.toISOString().slice(0, 10)}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(pdf);
  });

  // Generate consolidated statement (all branches)
  app.post('/generate-consolidated', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = generateStatementSchema.parse(request.body);
    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);

    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
    });
    if (!partner) return reply.notFound('Partner not found');

    const settings = await app.db.query.companySettings.findFirst();

    // Consolidated = all branches (no branch filter)
    const result = await computeStatement(
      app.db, body.partnerId, undefined, periodFrom, periodTo,
    );

    const html = renderStatementHtml({
      statementDate: new Date().toISOString(),
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      company: settings ? {
        name: settings.companyName,
        tradingAs: settings.tradingAs,
        vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
        addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
        bankDetails: settings.bankDetails ?? undefined,
      } : undefined,
      recipient: {
        name: `${partner.name} (Consolidated)`,
        contactName: partner.contactName,
        contactEmail: partner.contactEmail,
        addressLine1: partner.addressLine1,
        addressLine2: partner.addressLine2,
        city: partner.city,
        province: partner.province,
        postalCode: partner.postalCode,
        vatNumber: partner.vatNumber,
      },
      ...result,
    });

    const pdf = await generatePdf(html);
    const filename = `SOA-${partner.name}-Consolidated-${periodFrom.toISOString().slice(0, 10)}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(pdf);
  });

  // ==========================================
  // SEND STATEMENT VIA EMAIL (PDF attachment to HQ)
  // ==========================================

  const sendStatementSchema = generateStatementSchema.extend({
    recipientEmail: z.string().email().optional(), // override recipient; defaults to partner's contact email
    subject: z.string().optional(),
    message: z.string().optional(),
    includeAllBranches: z.boolean().default(false), // consolidated statement for HQ
  });

  // Send statement PDF as email attachment to HQ or specified email
  app.post('/send', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = sendStatementSchema.parse(request.body);
    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);

    if (!isEmailConfigured()) {
      return reply.badRequest('Email is not configured. Set RESEND_API_KEY in your environment.');
    }

    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
      with: { branches: true },
    });
    if (!partner) return reply.notFound('Partner not found');

    const settings = await app.db.query.companySettings.findFirst();

    const recipientEmail = body.recipientEmail || partner.contactEmail || partner.remittanceEmail;
    if (!recipientEmail) {
      return reply.badRequest('No recipient email found. Provide one or set the partner contact email.');
    }

    // If includeAllBranches or no branch specified, send consolidated to HQ
    const branchId = body.includeAllBranches ? undefined : body.branchId;
    const branchIds = body.includeAllBranches ? undefined : body.branchIds;

    let branch = null;
    if (branchId) {
      branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, branchId),
      });
    }

    const result = await computeStatement(
      app.db, body.partnerId, branchId, periodFrom, periodTo, branchIds,
    );

    let branchName: string | undefined = branch?.name;
    if (!branchName && branchIds && branchIds.length > 0 && partner.branches) {
      const selected = partner.branches.filter((b: any) => branchIds!.includes(b.id));
      if (selected.length > 0) branchName = selected.map((b: any) => b.name).join(', ');
    }
    if (body.includeAllBranches) branchName = 'All Branches (Consolidated)';

    const html = renderStatementHtml({
      statementDate: new Date().toISOString(),
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      company: settings ? {
        name: settings.companyName,
        tradingAs: settings.tradingAs,
        vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
        addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
        bankDetails: settings.bankDetails ?? undefined,
      } : undefined,
      recipient: {
        name: partner.name,
        branchName,
        contactName: partner.contactName,
        contactEmail: partner.contactEmail,
        addressLine1: partner.addressLine1,
        addressLine2: partner.addressLine2,
        city: partner.city,
        province: partner.province,
        postalCode: partner.postalCode,
        vatNumber: partner.vatNumber,
      },
      ...result,
    });

    const pdf = await generatePdf(html);
    const periodLabel = `${periodFrom.toISOString().slice(0, 10)}_to_${periodTo.toISOString().slice(0, 10)}`;
    const filename = branch
      ? `SOA-${partner.name}-${branch.name}-${periodLabel}.pdf`
      : `SOA-${partner.name}-${body.includeAllBranches ? 'Consolidated-' : ''}${periodLabel}.pdf`;

    const subject = body.subject || `Account Statement — ${partner.name} — ${periodFrom.toLocaleDateString('en-ZA')} to ${periodTo.toLocaleDateString('en-ZA')}`;
    const emailHtml = `
      <div style="font-family: 'Inter', sans-serif; max-width: 580px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1f2937; margin-bottom: 16px;">Account Statement</h2>
        <p style="color: #4b5563; line-height: 1.6;">Dear ${partner.contactName || partner.name},</p>
        ${body.message ? `<p style="color: #4b5563; line-height: 1.6;">${body.message}</p>` : ''}
        <p style="color: #4b5563; line-height: 1.6;">
          Please find attached your account statement for the period
          <strong>${periodFrom.toLocaleDateString('en-ZA')}</strong> to
          <strong>${periodTo.toLocaleDateString('en-ZA')}</strong>.
        </p>
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="margin: 4px 0; color: #374151;"><strong>Opening Balance:</strong> R ${result.openingBalance.toFixed(2)}</p>
          <p style="margin: 4px 0; color: #374151;"><strong>Total Invoiced:</strong> R ${result.totalInvoiced.toFixed(2)}</p>
          <p style="margin: 4px 0; color: #374151;"><strong>Total Payments:</strong> R ${result.totalReceived.toFixed(2)}</p>
          <p style="margin: 4px 0; color: #374151;"><strong>Credits:</strong> R ${result.totalCredits.toFixed(2)}</p>
          <p style="margin: 4px 0; font-size: 18px; color: #1f2937;"><strong>Balance Due: R ${result.closingBalance.toFixed(2)}</strong></p>
        </div>
        <p style="color: #4b5563; line-height: 1.6;">
          If you have any queries regarding this statement, please contact us at
          ${settings?.email || 'info@xarrabooks.com'}.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #d1d5db; font-size: 11px; text-align: center;">Xarra Books &mdash; We mainstream the African book</p>
      </div>
    `;

    await sendEmailWithAttachment({
      to: recipientEmail,
      subject,
      html: emailHtml,
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    });

    return {
      data: {
        message: `Statement sent to ${recipientEmail}`,
        filename,
        recipientEmail,
        closingBalance: result.closingBalance,
      },
    };
  });

  // ==========================================
  // SEND STATEMENTS FOR ALL BRANCHES TO HQ
  // ==========================================

  // Generate per-branch statements and send as PDF attachments to the HQ/main contact
  app.post('/send-all-branches', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = z.object({
      partnerId: z.string().uuid(),
      periodFrom: z.string().or(z.date()),
      periodTo: z.string().or(z.date()),
      recipientEmail: z.string().email().optional(),
      subject: z.string().optional(),
      message: z.string().optional(),
    }).parse(request.body);

    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);

    if (!isEmailConfigured()) {
      return reply.badRequest('Email is not configured.');
    }

    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
      with: { branches: true },
    });
    if (!partner) return reply.notFound('Partner not found');

    const settings = await app.db.query.companySettings.findFirst();

    const recipientEmail = body.recipientEmail || partner.contactEmail || partner.remittanceEmail;
    if (!recipientEmail) {
      return reply.badRequest('No recipient email found.');
    }

    const activeBranches = (partner.branches || []).filter((b: any) => b.isActive);

    // Generate a PDF for each branch + one consolidated
    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];

    // Consolidated statement
    const consolidatedResult = await computeStatement(app.db, body.partnerId, undefined, periodFrom, periodTo);
    const consolidatedHtml = renderStatementHtml({
      statementDate: new Date().toISOString(),
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl, bankDetails: settings.bankDetails ?? undefined,
      } : undefined,
      recipient: {
        name: `${partner.name} (Consolidated)`, contactName: partner.contactName,
        contactEmail: partner.contactEmail, addressLine1: partner.addressLine1,
        addressLine2: partner.addressLine2, city: partner.city, province: partner.province,
        postalCode: partner.postalCode, vatNumber: partner.vatNumber,
      },
      ...consolidatedResult,
    });
    const consolidatedPdf = await generatePdf(consolidatedHtml);
    const periodLabel = `${periodFrom.toISOString().slice(0, 10)}_to_${periodTo.toISOString().slice(0, 10)}`;
    attachments.push({
      filename: `SOA-${partner.name}-Consolidated-${periodLabel}.pdf`,
      content: consolidatedPdf,
      contentType: 'application/pdf',
    });

    // Per-branch statements
    for (const branch of activeBranches) {
      const branchResult = await computeStatement(app.db, body.partnerId, branch.id, periodFrom, periodTo);
      if (branchResult.transactions.length === 0 && branchResult.openingBalance === 0) continue; // skip empty

      const branchHtml = renderStatementHtml({
        statementDate: new Date().toISOString(),
        periodFrom: periodFrom.toISOString(),
        periodTo: periodTo.toISOString(),
        company: settings ? {
          name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
          registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
          addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
          postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
          logoUrl: settings.logoUrl, bankDetails: settings.bankDetails ?? undefined,
        } : undefined,
        recipient: {
          name: partner.name, branchName: branch.name,
          contactName: branch.contactName || partner.contactName,
          contactEmail: branch.contactEmail || partner.contactEmail,
          addressLine1: branch.addressLine1, addressLine2: branch.addressLine2,
          city: branch.city, province: branch.province, postalCode: branch.postalCode,
          vatNumber: partner.vatNumber,
        },
        ...branchResult,
      });
      const branchPdf = await generatePdf(branchHtml);
      attachments.push({
        filename: `SOA-${partner.name}-${branch.name}-${periodLabel}.pdf`,
        content: branchPdf,
        contentType: 'application/pdf',
      });
    }

    const subject = body.subject || `Account Statements — ${partner.name} — All Branches — ${periodFrom.toLocaleDateString('en-ZA')} to ${periodTo.toLocaleDateString('en-ZA')}`;
    const emailHtml = `
      <div style="font-family: 'Inter', sans-serif; max-width: 580px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1f2937; margin-bottom: 16px;">Account Statements — All Branches</h2>
        <p style="color: #4b5563; line-height: 1.6;">Dear ${partner.contactName || partner.name},</p>
        ${body.message ? `<p style="color: #4b5563; line-height: 1.6;">${body.message}</p>` : ''}
        <p style="color: #4b5563; line-height: 1.6;">
          Please find attached ${attachments.length} statement(s) for the period
          <strong>${periodFrom.toLocaleDateString('en-ZA')}</strong> to
          <strong>${periodTo.toLocaleDateString('en-ZA')}</strong>:
        </p>
        <ul style="color: #4b5563;">
          ${attachments.map((a) => `<li>${a.filename}</li>`).join('')}
        </ul>
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="margin: 4px 0; font-size: 18px; color: #1f2937;">
            <strong>Consolidated Balance Due: R ${consolidatedResult.closingBalance.toFixed(2)}</strong>
          </p>
        </div>
        <p style="color: #4b5563; line-height: 1.6;">
          If you have any queries, please contact us at ${settings?.email || 'info@xarrabooks.com'}.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #d1d5db; font-size: 11px; text-align: center;">Xarra Books &mdash; We mainstream the African book</p>
      </div>
    `;

    await sendEmailWithAttachment({
      to: recipientEmail,
      subject,
      html: emailHtml,
      attachments,
    });

    return {
      data: {
        message: `${attachments.length} statement(s) sent to ${recipientEmail}`,
        statementsCount: attachments.length,
        recipientEmail,
        consolidatedBalance: consolidatedResult.closingBalance,
      },
    };
  });

  // ==========================================
  // STATEMENT BATCHES — Review / Approve / Send workflow
  // ==========================================

  // List all statement batches
  app.get('/batches', { preHandler: requireRole('admin', 'finance') }, async (request) => {
    const batches = await app.db.query.statementBatches.findMany({
      orderBy: (b, { desc: d }) => [d(b.createdAt)],
    });
    return { data: batches };
  });

  // Get single batch with items
  app.get<{ Params: { id: string } }>('/batches/:id', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const batch = await app.db.query.statementBatches.findFirst({
      where: eq(statementBatches.id, request.params.id),
      with: {
        items: {
          with: { partner: true, branch: true },
        },
      },
    });
    if (!batch) return reply.notFound('Statement batch not found');

    // Compute closing balance for each item that doesn't have one yet
    for (const item of batch.items) {
      if (!item.closingBalance && item.status === 'PENDING') {
        const result = await computeStatement(
          app.db, item.partnerId, item.branchId ?? undefined,
          batch.periodFrom, batch.periodTo,
        );
        await app.db.update(statementBatchItems).set({
          closingBalance: String(result.closingBalance.toFixed(2)),
        }).where(eq(statementBatchItems.id, item.id));
        (item as any).closingBalance = result.closingBalance.toFixed(2);
      }
    }

    return { data: batch };
  });

  // Mark batch as reviewed
  app.post<{ Params: { id: string } }>('/batches/:id/review', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const batch = await app.db.query.statementBatches.findFirst({
      where: eq(statementBatches.id, request.params.id),
    });
    if (!batch) return reply.notFound('Statement batch not found');
    if (batch.status !== 'DRAFT') return reply.badRequest('Only DRAFT batches can be reviewed');

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(statementBatches).set({
      status: 'REVIEWED',
      reviewedBy: userId,
      reviewedAt: new Date(),
    }).where(eq(statementBatches.id, request.params.id)).returning();

    return { data: updated };
  });

  // Approve batch for sending
  app.post<{ Params: { id: string } }>('/batches/:id/approve', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const batch = await app.db.query.statementBatches.findFirst({
      where: eq(statementBatches.id, request.params.id),
    });
    if (!batch) return reply.notFound('Statement batch not found');
    if (batch.status !== 'REVIEWED') return reply.badRequest('Only REVIEWED batches can be approved');

    const userId = request.session?.user?.id;
    const [updated] = await app.db.update(statementBatches).set({
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
    }).where(eq(statementBatches.id, request.params.id)).returning();

    return { data: updated };
  });

  // Exclude/include individual items
  app.post<{ Params: { id: string; itemId: string } }>('/batches/:id/items/:itemId/exclude', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const [updated] = await app.db.update(statementBatchItems).set({
      status: 'EXCLUDED',
    }).where(eq(statementBatchItems.id, request.params.itemId)).returning();
    if (!updated) return reply.notFound('Item not found');
    return { data: updated };
  });

  app.post<{ Params: { id: string; itemId: string } }>('/batches/:id/items/:itemId/include', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const [updated] = await app.db.update(statementBatchItems).set({
      status: 'PENDING',
    }).where(eq(statementBatchItems.id, request.params.itemId)).returning();
    if (!updated) return reply.notFound('Item not found');
    return { data: updated };
  });

  // Update recipient email for an item
  app.patch<{ Params: { id: string; itemId: string } }>('/batches/:id/items/:itemId', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const { recipientEmail } = request.body as { recipientEmail: string };
    const [updated] = await app.db.update(statementBatchItems).set({
      recipientEmail,
    }).where(eq(statementBatchItems.id, request.params.itemId)).returning();
    if (!updated) return reply.notFound('Item not found');
    return { data: updated };
  });

  // Send all approved batch items
  app.post<{ Params: { id: string } }>('/batches/:id/send', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const batch = await app.db.query.statementBatches.findFirst({
      where: eq(statementBatches.id, request.params.id),
      with: { items: { with: { partner: true, branch: true } } },
    });
    if (!batch) return reply.notFound('Statement batch not found');
    if (batch.status !== 'APPROVED') return reply.badRequest('Only APPROVED batches can be sent');

    if (!isEmailConfigured()) {
      return reply.badRequest('Email is not configured.');
    }

    const settings = await app.db.query.companySettings.findFirst();
    const pendingItems = batch.items.filter((i) => i.status === 'PENDING');

    await app.db.update(statementBatches).set({ status: 'SENDING' })
      .where(eq(statementBatches.id, request.params.id));

    let totalSent = 0;
    let totalFailed = 0;

    for (const item of pendingItems) {
      if (!item.recipientEmail) {
        await app.db.update(statementBatchItems).set({
          status: 'FAILED',
          errorMessage: 'No recipient email',
        }).where(eq(statementBatchItems.id, item.id));
        totalFailed++;
        continue;
      }

      try {
        const branchId = item.sendToType === 'HQ_CONSOLIDATED' ? undefined : item.branchId ?? undefined;
        const result = await computeStatement(
          app.db, item.partnerId, branchId,
          batch.periodFrom, batch.periodTo,
        );

        const branchName = item.sendToType === 'HQ_CONSOLIDATED'
          ? 'All Branches (Consolidated)'
          : item.branch?.name;

        const html = renderStatementHtml({
          statementDate: new Date().toISOString(),
          periodFrom: batch.periodFrom.toISOString(),
          periodTo: batch.periodTo.toISOString(),
          company: settings ? {
            name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
            registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
            addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
            postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
            logoUrl: settings.logoUrl, bankDetails: settings.bankDetails ?? undefined,
          } : undefined,
          recipient: {
            name: item.partner.name,
            branchName,
            contactName: item.branch?.contactName || item.partner.contactName,
            contactEmail: item.branch?.contactEmail || item.partner.contactEmail,
            addressLine1: item.branch?.addressLine1 || item.partner.addressLine1,
            addressLine2: item.branch?.addressLine2 || item.partner.addressLine2,
            city: item.branch?.city || item.partner.city,
            province: item.branch?.province || item.partner.province,
            postalCode: item.branch?.postalCode || item.partner.postalCode,
            vatNumber: item.partner.vatNumber,
          },
          ...result,
        });

        const pdf = await generatePdf(html);
        const periodLabel = `${batch.periodFrom.toISOString().slice(0, 10)}_to_${batch.periodTo.toISOString().slice(0, 10)}`;
        const filename = branchName
          ? `SOA-${item.partner.name}-${branchName}-${periodLabel}.pdf`
          : `SOA-${item.partner.name}-${periodLabel}.pdf`;

        const contactName = item.branch?.contactName || item.partner.contactName || item.partner.name;
        const subject = `Account Statement — ${item.partner.name}${branchName ? ` (${branchName})` : ''} — ${batch.periodLabel}`;
        const emailHtml = `
          <div style="font-family: 'Inter', sans-serif; max-width: 580px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1f2937; margin-bottom: 16px;">Account Statement</h2>
            <p style="color: #4b5563; line-height: 1.6;">Dear ${contactName},</p>
            <p style="color: #4b5563; line-height: 1.6;">
              Please find attached your account statement for <strong>${batch.periodLabel}</strong>.
            </p>
            <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <p style="margin: 4px 0; font-size: 18px; color: #1f2937;">
                <strong>Balance Due: R ${result.closingBalance.toFixed(2)}</strong>
              </p>
            </div>
            <p style="color: #4b5563; line-height: 1.6;">
              If you have any queries regarding this statement, please contact us at
              ${settings?.email || 'info@xarrabooks.com'}.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #d1d5db; font-size: 11px; text-align: center;">Xarra Books</p>
          </div>
        `;

        await sendEmailWithAttachment({
          to: item.recipientEmail,
          subject,
          html: emailHtml,
          attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
        });

        await app.db.update(statementBatchItems).set({
          status: 'SENT',
          sentAt: new Date(),
          closingBalance: String(result.closingBalance.toFixed(2)),
        }).where(eq(statementBatchItems.id, item.id));

        totalSent++;
      } catch (err: any) {
        await app.db.update(statementBatchItems).set({
          status: 'FAILED',
          errorMessage: err.message || 'Unknown error',
        }).where(eq(statementBatchItems.id, item.id));
        totalFailed++;
      }
    }

    // Update batch status
    await app.db.update(statementBatches).set({
      status: 'SENT',
      sentAt: new Date(),
      totalItems: pendingItems.length,
      totalSent,
      totalFailed,
    }).where(eq(statementBatches.id, request.params.id));

    createBroadcastNotification(app, {
      type: 'SYSTEM',
      priority: totalFailed > 0 ? 'HIGH' : 'NORMAL',
      title: `Monthly statements sent — ${batch.periodLabel}`,
      message: `${totalSent} sent, ${totalFailed} failed out of ${pendingItems.length} statements`,
      actionUrl: `/statements/batches/${batch.id}`,
    }).catch(() => {});

    return {
      data: {
        message: `Sent ${totalSent} of ${pendingItems.length} statements`,
        totalSent,
        totalFailed,
      },
    };
  });

  // Manually trigger statement batch compilation for a specific period
  app.post('/batches/compile', { preHandler: requireRole('admin', 'finance') }, async (request, reply) => {
    const body = z.object({
      periodFrom: z.string().or(z.date()),
      periodTo: z.string().or(z.date()),
    }).parse(request.body);

    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);
    const periodLabel = `${periodFrom.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`;

    // Check if batch already exists
    const existing = await app.db.execute(sql`
      SELECT id FROM statement_batches
      WHERE period_from = ${periodFrom} AND period_to = ${periodTo}
    `);
    if (existing.length > 0) {
      return reply.badRequest(`Statement batch already exists for this period (ID: ${existing[0].id})`);
    }

    // Find active partners with activity
    const partners = await app.db.execute(sql`
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
    `) as unknown as Array<{ id: string; name: string; contactEmail: string | null; remittanceEmail: string | null; branchCount: number }>;

    if (!partners.length) {
      return reply.badRequest('No partners with activity for this period');
    }

    const [batch] = await app.db.insert(statementBatches).values({
      periodFrom,
      periodTo,
      periodLabel,
      status: 'DRAFT',
    }).returning();

    let itemsCreated = 0;

    for (const partner of partners) {
      if (partner.branchCount > 0) {
        const branches = await app.db.execute(sql`
          SELECT id, partner_id AS "partnerId", name, contact_email AS "contactEmail"
          FROM partner_branches
          WHERE partner_id = ${partner.id} AND is_active = true
          ORDER BY name ASC
        `) as unknown as Array<{ id: string; partnerId: string; name: string; contactEmail: string | null }>;

        for (const branch of branches) {
          await app.db.insert(statementBatchItems).values({
            batchId: batch.id,
            partnerId: partner.id,
            branchId: branch.id,
            recipientEmail: branch.contactEmail || partner.contactEmail || partner.remittanceEmail,
            sendToType: 'BRANCH',
            status: 'PENDING',
          });
          itemsCreated++;
        }

        // HQ consolidated
        await app.db.insert(statementBatchItems).values({
          batchId: batch.id,
          partnerId: partner.id,
          recipientEmail: partner.contactEmail || partner.remittanceEmail,
          sendToType: 'HQ_CONSOLIDATED',
          status: 'PENDING',
        });
        itemsCreated++;
      } else {
        await app.db.insert(statementBatchItems).values({
          batchId: batch.id,
          partnerId: partner.id,
          recipientEmail: partner.contactEmail || partner.remittanceEmail,
          sendToType: 'DIRECT',
          status: 'PENDING',
        });
        itemsCreated++;
      }
    }

    return reply.status(201).send({
      data: {
        batch,
        itemsCreated,
        partnersCount: partners.length,
      },
    });
  });
}
