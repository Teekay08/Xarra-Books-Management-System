import type { FastifyInstance } from 'fastify';
import { eq, sql, and, gte, lte } from 'drizzle-orm';
import {
  invoices, payments, paymentAllocations, creditNotes, debitNotes,
  channelPartners, partnerBranches, companySettings,
} from '@xarra/db';
import { generateStatementSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { generatePdf } from '../../services/pdf.js';
import { renderStatementHtml } from '../../services/templates/statement.js';

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
}
