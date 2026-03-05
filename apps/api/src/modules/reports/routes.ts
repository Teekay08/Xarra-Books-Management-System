import type { FastifyInstance } from 'fastify';
import { sql, eq } from 'drizzle-orm';
import { requireAuth } from '../../middleware/require-auth.js';
import { renderAuthorRoyaltyReportHtml } from '../../services/templates/author-royalty-report.js';
import { generatePdf } from '../../services/pdf.js';
import { roundAmount } from '@xarra/shared';

export async function reportRoutes(app: FastifyInstance) {

  // Profit & Loss report
  app.get('/profit-loss', { preHandler: requireAuth }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    const [revenueRows, expenseRows] = await Promise.all([
      app.db.execute(sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', invoice_date), 'YYYY-MM') AS month,
          COALESCE(SUM(subtotal::numeric), 0) AS revenue,
          COALESCE(SUM(vat_amount::numeric), 0) AS vat
        FROM invoices
        WHERE status != 'VOIDED'
          AND invoice_date >= ${periodFrom}
          AND invoice_date <= ${periodTo}
        GROUP BY DATE_TRUNC('month', invoice_date)
        ORDER BY month ASC
      `),
      app.db.execute(sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', expense_date), 'YYYY-MM') AS month,
          COALESCE(SUM(amount::numeric), 0) AS expenses
        FROM expenses
        WHERE expense_date >= ${periodFrom}
          AND expense_date <= ${periodTo}
        GROUP BY DATE_TRUNC('month', expense_date)
        ORDER BY month ASC
      `),
    ]);

    // Merge into monthly P&L
    const monthMap: Record<string, { revenue: number; vat: number; expenses: number }> = {};
    for (const r of revenueRows as any[]) {
      monthMap[r.month] = { revenue: Number(r.revenue), vat: Number(r.vat), expenses: 0 };
    }
    for (const r of expenseRows as any[]) {
      if (!monthMap[r.month]) monthMap[r.month] = { revenue: 0, vat: 0, expenses: 0 };
      monthMap[r.month].expenses = Number(r.expenses);
    }

    const months = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        revenue: d.revenue,
        vat: d.vat,
        expenses: d.expenses,
        net: d.revenue - d.expenses,
      }));

    const totals = months.reduce(
      (acc, m) => ({
        revenue: acc.revenue + m.revenue,
        vat: acc.vat + m.vat,
        expenses: acc.expenses + m.expenses,
        net: acc.net + m.net,
      }),
      { revenue: 0, vat: 0, expenses: 0, net: 0 },
    );

    return { data: { months, totals, periodFrom: periodFrom.toISOString(), periodTo: periodTo.toISOString() } };
  });

  // Sales report by title/partner
  app.get('/sales', { preHandler: requireAuth }, async (request) => {
    const { from, to, groupBy } = request.query as { from?: string; to?: string; groupBy?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    if (groupBy === 'partner') {
      const rows = await app.db.execute(sql`
        SELECT cp.name AS label,
               COUNT(DISTINCT i.id)::int AS invoice_count,
               COALESCE(SUM(il.quantity::int), 0) AS units_sold,
               COALESCE(SUM(i.total::numeric), 0) AS revenue
        FROM invoices i
        JOIN channel_partners cp ON cp.id = i.partner_id
        LEFT JOIN invoice_lines il ON il.invoice_id = i.id
        WHERE i.status != 'VOIDED'
          AND i.invoice_date >= ${periodFrom}
          AND i.invoice_date <= ${periodTo}
        GROUP BY cp.name
        ORDER BY revenue DESC
      `);
      return { data: rows.map((r: any) => ({ label: r.label, invoiceCount: Number(r.invoice_count), unitsSold: Number(r.units_sold), revenue: Number(r.revenue) })) };
    }

    // Default: group by title
    const rows = await app.db.execute(sql`
      SELECT t.title AS label,
             COALESCE(SUM(il.quantity::int), 0) AS units_sold,
             COALESCE(SUM(il.line_total::numeric), 0) AS revenue
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      LEFT JOIN titles t ON t.id = il.title_id
      WHERE i.status != 'VOIDED'
        AND i.invoice_date >= ${periodFrom}
        AND i.invoice_date <= ${periodTo}
      GROUP BY t.title
      ORDER BY revenue DESC
    `);
    return { data: rows.map((r: any) => ({ label: r.label ?? 'Unknown', unitsSold: Number(r.units_sold), revenue: Number(r.revenue) })) };
  });

  // Overdue aging report
  app.get('/overdue-aging', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      SELECT
        i.id, i.number, i.total::numeric AS total, i.due_date, i.invoice_date,
        cp.name AS partner_name,
        CURRENT_DATE - i.due_date::date AS days_overdue
      FROM invoices i
      JOIN channel_partners cp ON cp.id = i.partner_id
      WHERE i.status IN ('ISSUED', 'PARTIAL')
        AND i.due_date < CURRENT_DATE
      ORDER BY i.due_date ASC
    `);

    const buckets = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyPlus: 0 };
    const items = rows.map((r: any) => {
      const days = Number(r.days_overdue);
      const total = Number(r.total);
      if (days <= 30) buckets.current += total;
      else if (days <= 60) buckets.thirtyDays += total;
      else if (days <= 90) buckets.sixtyDays += total;
      else buckets.ninetyPlus += total;

      return {
        id: r.id,
        number: r.number,
        total,
        dueDate: r.due_date,
        partnerName: r.partner_name,
        daysOverdue: days,
        bucket: days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+',
      };
    });

    return { data: { buckets, items } };
  });

  // Inventory report (stock levels by title)
  app.get('/inventory', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      SELECT
        t.id, t.title, t.isbn13,
        COALESCE(SUM(
          CASE
            WHEN im.movement_type IN ('IN', 'RETURN') THEN im.quantity
            WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -im.quantity
            WHEN im.movement_type = 'ADJUST' THEN im.quantity
            ELSE 0
          END
        ), 0)::int AS stock_on_hand,
        COALESCE(SUM(CASE WHEN im.movement_type = 'CONSIGN' THEN im.quantity ELSE 0 END), 0)::int AS total_consigned,
        COALESCE(SUM(CASE WHEN im.movement_type = 'SELL' THEN im.quantity ELSE 0 END), 0)::int AS total_sold
      FROM titles t
      LEFT JOIN inventory_movements im ON im.title_id = t.id
      GROUP BY t.id, t.title, t.isbn13
      ORDER BY t.title ASC
    `);

    return {
      data: rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        isbn13: r.isbn13,
        stockOnHand: Number(r.stock_on_hand),
        totalConsigned: Number(r.total_consigned),
        totalSold: Number(r.total_sold),
      })),
    };
  });

  // Author royalty/sales report
  app.get('/author-royalty', { preHandler: requireAuth }, async (request) => {
    const { authorId, from, to } = request.query as { authorId: string; from?: string; to?: string };
    if (!authorId) throw app.httpErrors.badRequest('authorId is required');

    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    // Get author info
    const authorRows = await app.db.execute(sql`
      SELECT legal_name, pen_name FROM authors WHERE id = ${authorId}
    `) as any[];
    if (!authorRows.length) throw app.httpErrors.notFound('Author not found');
    const author = authorRows[0];
    const authorName = author.pen_name || author.legal_name;

    // Get contracts + titles for this author
    const contractRows = await app.db.execute(sql`
      SELECT
        ac.id AS contract_id,
        ac.royalty_rate_print,
        ac.royalty_rate_ebook,
        ac.advance_amount,
        ac.advance_recovered,
        ac.payment_frequency,
        ac.minimum_payment,
        t.id AS title_id,
        t.title AS book_title,
        t.rrp_zar AS retail_price
      FROM author_contracts ac
      JOIN titles t ON t.id = ac.title_id
      WHERE ac.author_id = ${authorId}
      ORDER BY t.title ASC
    `) as any[];

    const titleIds = contractRows.map((c: any) => c.title_id);
    if (!titleIds.length) {
      return { data: { authorName, lines: [], totals: emptyTotals(), balanceSummary: emptyBalanceSummary(), paymentHistory: [], paymentSchedule: [], periodFrom: periodFrom.toISOString(), periodTo: periodTo.toISOString() } };
    }

    // Physical sales from consignment lines
    const physicalRows = await app.db.execute(sql`
      SELECT
        cl.title_id,
        COALESCE(SUM(cl.qty_dispatched), 0)::int AS qty_supplied,
        COALESCE(SUM(cl.qty_sold), 0)::int AS qty_sold,
        COALESCE(SUM(cl.qty_returned), 0)::int AS qty_returned
      FROM consignment_lines cl
      JOIN consignments c ON c.id = cl.consignment_id
      WHERE cl.title_id = ANY(${titleIds}::uuid[])
        AND c.dispatch_date >= ${periodFrom}
        AND c.dispatch_date <= ${periodTo}
      GROUP BY cl.title_id
    `) as any[];

    const physicalMap: Record<string, { supplied: number; sold: number; returned: number }> = {};
    for (const r of physicalRows) {
      physicalMap[r.title_id] = { supplied: Number(r.qty_supplied), sold: Number(r.qty_sold), returned: Number(r.qty_returned) };
    }

    // Physical sales revenue from invoice lines
    const revenueRows = await app.db.execute(sql`
      SELECT
        il.title_id,
        COALESCE(SUM(il.line_total::numeric), 0) AS revenue
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      WHERE il.title_id = ANY(${titleIds}::uuid[])
        AND i.status != 'VOIDED'
        AND i.invoice_date >= ${periodFrom}
        AND i.invoice_date <= ${periodTo}
      GROUP BY il.title_id
    `) as any[];

    const revenueMap: Record<string, number> = {};
    for (const r of revenueRows) {
      revenueMap[r.title_id] = Number(r.revenue);
    }

    // Ebook/Kindle sales from sale_records
    const ebookRows = await app.db.execute(sql`
      SELECT
        sr.title_id,
        COALESCE(SUM(sr.quantity), 0)::int AS kindle_qty,
        COALESCE(SUM(
          CASE WHEN sr.currency = 'ZAR' THEN sr.net_revenue::numeric
               ELSE sr.net_revenue::numeric * COALESCE(sr.exchange_rate::numeric, 18.0)
          END
        ), 0) AS ebook_revenue
      FROM sale_records sr
      WHERE sr.title_id = ANY(${titleIds}::uuid[])
        AND sr.channel IN ('AMAZON_KDP', 'KINDLE')
        AND sr.sale_date >= ${periodFrom}
        AND sr.sale_date <= ${periodTo}
      GROUP BY sr.title_id
    `) as any[];

    const ebookMap: Record<string, { qty: number; revenue: number }> = {};
    for (const r of ebookRows) {
      ebookMap[r.title_id] = { qty: Number(r.kindle_qty), revenue: Number(r.ebook_revenue) };
    }

    const salesPeriod = `${periodFrom.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })} - ${periodTo.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}`;

    const lines = contractRows.map((c: any) => {
      const titleId = c.title_id;
      const physical = physicalMap[titleId] || { supplied: 0, sold: 0, returned: 0 };
      const ebook = ebookMap[titleId] || { qty: 0, revenue: 0 };
      const revenue = revenueMap[titleId] || 0;
      const retailPrice = Number(c.retail_price);

      const totalPhysicalSalesAmount = roundAmount(revenue);
      const totalEbookSalesAmount = roundAmount(ebook.revenue);
      const randAmountReceived = roundAmount(totalPhysicalSalesAmount + totalEbookSalesAmount);

      // Royalty calculations using contract rates
      const royaltyRatePrint = Number(c.royalty_rate_print);
      const royaltyRateEbook = Number(c.royalty_rate_ebook);
      const royaltyPayoutPhysical = roundAmount(totalPhysicalSalesAmount * royaltyRatePrint);
      const royaltyPayoutEbook = roundAmount(totalEbookSalesAmount * royaltyRateEbook);

      const advanceAmount = Number(c.advance_amount);
      const advanceRecovered = Number(c.advance_recovered);
      const advanceOutstanding = roundAmount(Math.max(0, advanceAmount - advanceRecovered));
      const grossRoyalty = roundAmount(royaltyPayoutPhysical + royaltyPayoutEbook);
      const lessOwingAdvance = roundAmount(Math.min(advanceOutstanding, grossRoyalty));
      const disbursement = roundAmount(Math.max(0, grossRoyalty - lessOwingAdvance));

      return {
        bookTitle: c.book_title,
        authorName,
        retailPrice,
        salesPeriod,
        printRoyaltyRate: royaltyRatePrint,
        ebookRoyaltyRate: royaltyRateEbook,
        qtySorSupplied: physical.supplied,
        qtySold: physical.sold,
        qtyReturned: physical.returned,
        kindleSalesQty: ebook.qty,
        randAmountReceived,
        totalEbookSalesAmount,
        totalPhysicalSalesAmount,
        royaltyPayoutPhysical,
        royaltyPayoutEbook,
        lessOwingAdvance,
        disbursement,
      };
    });

    const totals = lines.reduce((acc, l) => ({
      qtySorSupplied: acc.qtySorSupplied + l.qtySorSupplied,
      qtySold: acc.qtySold + l.qtySold,
      qtyReturned: acc.qtyReturned + l.qtyReturned,
      kindleSalesQty: acc.kindleSalesQty + l.kindleSalesQty,
      randAmountReceived: roundAmount(acc.randAmountReceived + l.randAmountReceived),
      totalEbookSalesAmount: roundAmount(acc.totalEbookSalesAmount + l.totalEbookSalesAmount),
      totalPhysicalSalesAmount: roundAmount(acc.totalPhysicalSalesAmount + l.totalPhysicalSalesAmount),
      royaltyPayoutPhysical: roundAmount(acc.royaltyPayoutPhysical + l.royaltyPayoutPhysical),
      royaltyPayoutEbook: roundAmount(acc.royaltyPayoutEbook + l.royaltyPayoutEbook),
      lessOwingAdvance: roundAmount(acc.lessOwingAdvance + l.lessOwingAdvance),
      disbursement: roundAmount(acc.disbursement + l.disbursement),
    }), emptyTotals());

    // ---- PAYMENT HISTORY: all payments ever made to this author ----
    const paymentRows = await app.db.execute(sql`
      SELECT
        ap.id,
        ap.number,
        ap.period_from,
        ap.period_to,
        ap.total_gross_royalty::numeric AS gross,
        ap.total_advance_deducted::numeric AS advance_deducted,
        ap.total_net_payable::numeric AS net_payable,
        ap.total_previously_paid::numeric AS previously_paid,
        ap.amount_due::numeric AS amount_due,
        ap.amount_paid::numeric AS amount_paid,
        ap.status,
        ap.payment_method,
        ap.bank_reference,
        ap.paid_at,
        ap.created_at
      FROM author_payments ap
      WHERE ap.author_id = ${authorId}
      ORDER BY ap.created_at DESC
    `) as any[];

    const paymentHistory = paymentRows.map((p: any) => ({
      id: p.id,
      number: p.number,
      periodFrom: p.period_from,
      periodTo: p.period_to,
      grossRoyalty: roundAmount(Number(p.gross)),
      advanceDeducted: roundAmount(Number(p.advance_deducted)),
      netPayable: roundAmount(Number(p.net_payable)),
      previouslyPaid: roundAmount(Number(p.previously_paid)),
      amountDue: roundAmount(Number(p.amount_due)),
      amountPaid: roundAmount(Number(p.amount_paid)),
      status: p.status,
      paymentMethod: p.payment_method,
      bankReference: p.bank_reference,
      paidAt: p.paid_at,
      createdAt: p.created_at,
    }));

    // ---- BALANCE SUMMARY: lifetime financial picture ----
    const balanceRows = await app.db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN rl.status != 'VOIDED' THEN rl.gross_royalty::numeric ELSE 0 END), 0) AS lifetime_gross,
        COALESCE(SUM(CASE WHEN rl.status != 'VOIDED' THEN rl.advance_deducted::numeric ELSE 0 END), 0) AS lifetime_advance_deducted,
        COALESCE(SUM(CASE WHEN rl.status != 'VOIDED' THEN rl.net_payable::numeric ELSE 0 END), 0) AS lifetime_net,
        COALESCE(SUM(CASE WHEN rl.status = 'PAID' THEN rl.net_payable::numeric ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN rl.status IN ('CALCULATED','APPROVED') THEN rl.net_payable::numeric ELSE 0 END), 0) AS total_unpaid
      FROM royalty_ledger rl
      JOIN author_contracts ac ON ac.id = rl.contract_id
      WHERE ac.author_id = ${authorId}
    `) as any[];

    const bal = balanceRows[0] || {};
    const balanceSummary = {
      lifetimeGrossRoyalty: roundAmount(Number(bal.lifetime_gross || 0)),
      lifetimeAdvanceDeducted: roundAmount(Number(bal.lifetime_advance_deducted || 0)),
      lifetimeNetPayable: roundAmount(Number(bal.lifetime_net || 0)),
      totalPaid: roundAmount(Number(bal.total_paid || 0)),
      totalUnpaid: roundAmount(Number(bal.total_unpaid || 0)),
      totalAdvanceOriginal: roundAmount(contractRows.reduce((s: number, c: any) => s + Number(c.advance_amount), 0)),
      totalAdvanceRecovered: roundAmount(contractRows.reduce((s: number, c: any) => s + Number(c.advance_recovered), 0)),
    };

    // ---- PAYMENT SCHEDULE: per contract with next-due dates ----
    const now = new Date();
    const paymentSchedule = contractRows.map((c: any) => {
      const freq = c.payment_frequency || 'QUARTERLY';
      const minPay = Number(c.minimum_payment || 100);
      const nextDue = computeNextPaymentDue(freq, now);
      return {
        titleId: c.title_id,
        bookTitle: c.book_title,
        frequency: freq,
        minimumPayment: minPay,
        nextPeriodFrom: nextDue.periodFrom.toISOString(),
        nextPeriodTo: nextDue.periodTo.toISOString(),
        nextDueDate: nextDue.dueDate.toISOString(),
        isOverdue: nextDue.dueDate < now,
      };
    });

    return {
      data: {
        authorName,
        lines,
        totals,
        balanceSummary,
        paymentHistory,
        paymentSchedule,
        periodFrom: periodFrom.toISOString(),
        periodTo: periodTo.toISOString(),
      },
    };
  });

  // Author royalty report PDF
  app.get('/author-royalty/pdf', { preHandler: requireAuth }, async (request, reply) => {
    const { authorId, from, to } = request.query as { authorId: string; from?: string; to?: string };

    // Reuse the JSON endpoint logic
    const url = `/api/v1/reports/author-royalty?authorId=${authorId}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;
    const res = await app.inject({ method: 'GET', url, headers: request.headers as Record<string, string> });
    const json = JSON.parse(res.body) as { data: any };
    const reportData = json.data;

    // Get company settings for logo
    const settings = await app.db.query.companySettings.findFirst();

    const html = renderAuthorRoyaltyReportHtml({
      authorName: reportData.authorName,
      reportDate: new Date().toISOString(),
      periodFrom: reportData.periodFrom,
      periodTo: reportData.periodTo,
      lines: reportData.lines,
      totals: reportData.totals,
      balanceSummary: reportData.balanceSummary,
      paymentHistory: reportData.paymentHistory,
      paymentSchedule: reportData.paymentSchedule,
      company: settings ? {
        name: settings.companyName,
        logoUrl: settings.logoUrl,
        email: settings.email,
        phone: settings.phone,
      } : undefined,
    });

    const pdf = await generatePdf(html);
    return reply
      .type('application/pdf')
      .header('Content-Disposition', `inline; filename="royalty-report-${authorId}.pdf"`)
      .send(pdf);
  });

  // ==========================================
  // TITLE PERFORMANCE — Revenue, margin, units per title
  // ==========================================
  app.get('/title-performance', { preHandler: requireAuth }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    const rows = await app.db.execute(sql`
      SELECT
        t.id,
        t.title,
        t.isbn13,
        t.rrp_zar::numeric AS rrp,
        COALESCE(SUM(il.quantity::int), 0) AS units_sold,
        COALESCE(SUM(il.line_total::numeric), 0) AS revenue,
        COALESCE(SUM(il.line_total::numeric - il.line_tax::numeric), 0) AS revenue_ex_vat,
        COUNT(DISTINCT i.id)::int AS invoice_count,
        COUNT(DISTINCT i.partner_id)::int AS partner_count,
        COALESCE(SUM(
          CASE
            WHEN im.movement_type IN ('IN', 'RETURN') THEN im.quantity
            WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -im.quantity
            WHEN im.movement_type = 'ADJUST' THEN im.quantity
            ELSE 0
          END
        ), 0)::int AS current_stock
      FROM titles t
      LEFT JOIN invoice_lines il ON il.title_id = t.id
      LEFT JOIN invoices i ON i.id = il.invoice_id
        AND i.status != 'VOIDED'
        AND i.invoice_date >= ${periodFrom}
        AND i.invoice_date <= ${periodTo}
      LEFT JOIN inventory_movements im ON im.title_id = t.id
      GROUP BY t.id, t.title, t.isbn13, t.rrp_zar
      ORDER BY revenue DESC
    `);

    return {
      data: (rows as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        isbn13: r.isbn13,
        rrp: Number(r.rrp),
        unitsSold: Number(r.units_sold),
        revenue: Number(r.revenue),
        revenueExVat: Number(r.revenue_ex_vat),
        invoiceCount: Number(r.invoice_count),
        partnerCount: Number(r.partner_count),
        currentStock: Number(r.current_stock),
        avgPrice: Number(r.units_sold) > 0 ? Number(r.revenue) / Number(r.units_sold) : 0,
      })),
    };
  });

  // ==========================================
  // PARTNER PERFORMANCE — Revenue, payment speed, return rates
  // ==========================================
  app.get('/partner-performance', { preHandler: requireAuth }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    const rows = await app.db.execute(sql`
      SELECT
        cp.id,
        cp.name,
        cp.discount_pct::numeric AS discount_pct,
        COALESCE(inv.invoice_count, 0)::int AS invoice_count,
        COALESCE(inv.total_revenue, 0) AS total_revenue,
        COALESCE(inv.units_sold, 0)::int AS units_sold,
        COALESCE(pay.total_paid, 0) AS total_paid,
        COALESCE(inv.total_revenue, 0) - COALESCE(pay.total_paid, 0) AS outstanding,
        COALESCE(overdue.overdue_count, 0)::int AS overdue_count,
        COALESCE(overdue.overdue_amount, 0) AS overdue_amount,
        COALESCE(ret.qty_returned, 0)::int AS qty_returned,
        COALESCE(ret.qty_dispatched, 0)::int AS qty_dispatched
      FROM channel_partners cp
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS invoice_count,
          SUM(i.total::numeric) AS total_revenue,
          SUM(il_agg.total_qty) AS units_sold
        FROM invoices i
        LEFT JOIN LATERAL (
          SELECT SUM(il.quantity::int) AS total_qty FROM invoice_lines il WHERE il.invoice_id = i.id
        ) il_agg ON true
        WHERE i.partner_id = cp.id AND i.status != 'VOIDED'
          AND i.invoice_date >= ${periodFrom} AND i.invoice_date <= ${periodTo}
      ) inv ON true
      LEFT JOIN LATERAL (
        SELECT SUM(p.amount::numeric) AS total_paid
        FROM payments p
        WHERE p.partner_id = cp.id
          AND p.payment_date >= ${periodFrom} AND p.payment_date <= ${periodTo}
      ) pay ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS overdue_count, SUM(i.total::numeric) AS overdue_amount
        FROM invoices i
        WHERE i.partner_id = cp.id AND i.status IN ('ISSUED', 'PARTIAL') AND i.due_date < CURRENT_DATE
      ) overdue ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(cl.qty_returned + cl.qty_damaged), 0)::int AS qty_returned,
          COALESCE(SUM(cl.qty_dispatched), 0)::int AS qty_dispatched
        FROM consignments c
        JOIN consignment_lines cl ON cl.consignment_id = c.id
        WHERE c.partner_id = cp.id
          AND c.dispatch_date >= ${periodFrom} AND c.dispatch_date <= ${periodTo}
      ) ret ON true
      WHERE cp.is_active = true
      ORDER BY inv.total_revenue DESC NULLS LAST
    `);

    return {
      data: (rows as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        discountPct: Number(r.discount_pct),
        invoiceCount: Number(r.invoice_count),
        totalRevenue: Number(r.total_revenue),
        unitsSold: Number(r.units_sold),
        totalPaid: Number(r.total_paid),
        outstanding: Number(r.outstanding),
        overdueCount: Number(r.overdue_count),
        overdueAmount: Number(r.overdue_amount),
        qtyReturned: Number(r.qty_returned),
        qtyDispatched: Number(r.qty_dispatched),
        returnRate: Number(r.qty_dispatched) > 0 ? (Number(r.qty_returned) / Number(r.qty_dispatched) * 100) : 0,
      })),
    };
  });

  // ==========================================
  // CHANNEL REVENUE — Revenue by sales channel
  // ==========================================
  app.get('/channel-revenue', { preHandler: requireAuth }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    // Sale records by channel (covers all channels including KDP, Takealot direct)
    const saleRows = await app.db.execute(sql`
      SELECT
        sr.channel,
        COUNT(*)::int AS sale_count,
        COALESCE(SUM(sr.quantity), 0)::int AS units_sold,
        COALESCE(SUM(sr.net_revenue_zar::numeric), 0) AS revenue
      FROM sale_records sr
      WHERE sr.sale_date >= ${periodFrom} AND sr.sale_date <= ${periodTo}
      GROUP BY sr.channel
      ORDER BY revenue DESC
    `);

    // Invoice revenue by partner (for PARTNER channel breakdown)
    const invoiceRows = await app.db.execute(sql`
      SELECT
        'PARTNER' AS channel,
        cp.name AS partner_name,
        COUNT(DISTINCT i.id)::int AS invoice_count,
        COALESCE(SUM(il.quantity::int), 0) AS units_sold,
        COALESCE(SUM(i.total::numeric), 0) AS revenue
      FROM invoices i
      JOIN channel_partners cp ON cp.id = i.partner_id
      LEFT JOIN invoice_lines il ON il.invoice_id = i.id
      WHERE i.status != 'VOIDED'
        AND i.invoice_date >= ${periodFrom} AND i.invoice_date <= ${periodTo}
      GROUP BY cp.name
      ORDER BY revenue DESC
    `);

    // Monthly trend
    const trendRows = await app.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', sr.sale_date), 'YYYY-MM') AS month,
        sr.channel,
        COALESCE(SUM(sr.net_revenue_zar::numeric), 0) AS revenue
      FROM sale_records sr
      WHERE sr.sale_date >= ${periodFrom} AND sr.sale_date <= ${periodTo}
      GROUP BY DATE_TRUNC('month', sr.sale_date), sr.channel
      ORDER BY month ASC
    `);

    return {
      data: {
        byChannel: (saleRows as any[]).map((r) => ({
          channel: r.channel,
          saleCount: Number(r.sale_count),
          unitsSold: Number(r.units_sold),
          revenue: Number(r.revenue),
        })),
        partnerBreakdown: (invoiceRows as any[]).map((r) => ({
          partnerName: r.partner_name,
          invoiceCount: Number(r.invoice_count),
          unitsSold: Number(r.units_sold),
          revenue: Number(r.revenue),
        })),
        monthlyTrend: (trendRows as any[]).map((r) => ({
          month: r.month,
          channel: r.channel,
          revenue: Number(r.revenue),
        })),
      },
    };
  });

  // ==========================================
  // BESTSELLERS & UNDERPERFORMERS
  // ==========================================
  app.get('/bestsellers', { preHandler: requireAuth }, async (request) => {
    const { from, to, limit: lim } = request.query as { from?: string; to?: string; limit?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();
    const topN = Math.min(parseInt(lim || '20'), 100);

    // Best sellers by revenue
    const bestByRevenue = await app.db.execute(sql`
      SELECT
        t.id, t.title, t.isbn13,
        COALESCE(SUM(il.quantity::int), 0) AS units_sold,
        COALESCE(SUM(il.line_total::numeric), 0) AS revenue
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      JOIN titles t ON t.id = il.title_id
      WHERE i.status != 'VOIDED'
        AND i.invoice_date >= ${periodFrom} AND i.invoice_date <= ${periodTo}
      GROUP BY t.id, t.title, t.isbn13
      ORDER BY revenue DESC
      LIMIT ${topN}
    `);

    // Best sellers by units
    const bestByUnits = await app.db.execute(sql`
      SELECT
        t.id, t.title, t.isbn13,
        COALESCE(SUM(il.quantity::int), 0) AS units_sold,
        COALESCE(SUM(il.line_total::numeric), 0) AS revenue
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      JOIN titles t ON t.id = il.title_id
      WHERE i.status != 'VOIDED'
        AND i.invoice_date >= ${periodFrom} AND i.invoice_date <= ${periodTo}
      GROUP BY t.id, t.title, t.isbn13
      ORDER BY units_sold DESC
      LIMIT ${topN}
    `);

    // Least performing (titles with zero or lowest sales in the period)
    const leastPerforming = await app.db.execute(sql`
      SELECT
        t.id, t.title, t.isbn13,
        COALESCE(sales.units_sold, 0)::int AS units_sold,
        COALESCE(sales.revenue, 0) AS revenue
      FROM titles t
      LEFT JOIN LATERAL (
        SELECT
          SUM(il.quantity::int) AS units_sold,
          SUM(il.line_total::numeric) AS revenue
        FROM invoice_lines il
        JOIN invoices i ON i.id = il.invoice_id
        WHERE il.title_id = t.id AND i.status != 'VOIDED'
          AND i.invoice_date >= ${periodFrom} AND i.invoice_date <= ${periodTo}
      ) sales ON true
      WHERE t.status = 'ACTIVE'
      ORDER BY COALESCE(sales.revenue, 0) ASC, COALESCE(sales.units_sold, 0) ASC
      LIMIT ${topN}
    `);

    // Highest earning authors
    const topAuthors = await app.db.execute(sql`
      SELECT
        a.id,
        COALESCE(a.pen_name, a.legal_name) AS name,
        COALESCE(SUM(il.line_total::numeric), 0) AS revenue,
        COALESCE(SUM(il.quantity::int), 0) AS units_sold,
        COUNT(DISTINCT t.id)::int AS title_count
      FROM authors a
      JOIN author_contracts ac ON ac.author_id = a.id
      JOIN titles t ON t.id = ac.title_id
      LEFT JOIN invoice_lines il ON il.title_id = t.id
      LEFT JOIN invoices i ON i.id = il.invoice_id
        AND i.status != 'VOIDED'
        AND i.invoice_date >= ${periodFrom} AND i.invoice_date <= ${periodTo}
      GROUP BY a.id, a.pen_name, a.legal_name
      ORDER BY revenue DESC
      LIMIT ${topN}
    `);

    // Most profitable (revenue minus royalties and production cost)
    const profitability = await app.db.execute(sql`
      SELECT
        t.id, t.title,
        COALESCE(SUM(il.line_total::numeric), 0) AS revenue,
        COALESCE(SUM(il.quantity::int), 0) AS units_sold,
        COALESCE(pc.total_cost, 0) AS production_cost,
        COALESCE(rl.total_royalty, 0) AS royalty_paid,
        COALESCE(SUM(il.line_total::numeric), 0) - COALESCE(pc.total_cost, 0) - COALESCE(rl.total_royalty, 0) AS net_profit
      FROM titles t
      LEFT JOIN invoice_lines il ON il.title_id = t.id
      LEFT JOIN invoices i ON i.id = il.invoice_id
        AND i.status != 'VOIDED'
        AND i.invoice_date >= ${periodFrom} AND i.invoice_date <= ${periodTo}
      LEFT JOIN LATERAL (
        SELECT SUM(cost::numeric) AS total_cost FROM production_costs WHERE title_id = t.id
      ) pc ON true
      LEFT JOIN LATERAL (
        SELECT SUM(net_payable::numeric) AS total_royalty FROM royalty_ledger WHERE title_id = t.id AND status != 'VOIDED'
      ) rl ON true
      GROUP BY t.id, t.title, pc.total_cost, rl.total_royalty
      HAVING COALESCE(SUM(il.line_total::numeric), 0) > 0
      ORDER BY net_profit DESC
      LIMIT ${topN}
    `);

    const mapRow = (r: any) => ({
      id: r.id, title: r.title, isbn13: r.isbn13,
      unitsSold: Number(r.units_sold), revenue: Number(r.revenue),
    });

    return {
      data: {
        bestByRevenue: (bestByRevenue as any[]).map(mapRow),
        bestByUnits: (bestByUnits as any[]).map(mapRow),
        leastPerforming: (leastPerforming as any[]).map(mapRow),
        topAuthors: (topAuthors as any[]).map((r) => ({
          id: r.id, name: r.name, revenue: Number(r.revenue),
          unitsSold: Number(r.units_sold), titleCount: Number(r.title_count),
        })),
        profitability: (profitability as any[]).map((r) => ({
          id: r.id, title: r.title, revenue: Number(r.revenue),
          unitsSold: Number(r.units_sold), productionCost: Number(r.production_cost),
          royaltyPaid: Number(r.royalty_paid), netProfit: Number(r.net_profit),
        })),
      },
    };
  });

  // ==========================================
  // EXPENSE TRENDS — By category over time
  // ==========================================
  app.get('/expense-trends', { preHandler: requireAuth }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    // By category
    const categoryRows = await app.db.execute(sql`
      SELECT
        ec.name AS category,
        COALESCE(SUM(e.amount::numeric), 0) AS total,
        COUNT(*)::int AS count
      FROM expenses e
      JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.expense_date >= ${periodFrom} AND e.expense_date <= ${periodTo}
      GROUP BY ec.name
      ORDER BY total DESC
    `);

    // Monthly trend by category
    const trendRows = await app.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', e.expense_date), 'YYYY-MM') AS month,
        ec.name AS category,
        COALESCE(SUM(e.amount::numeric), 0) AS total
      FROM expenses e
      JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.expense_date >= ${periodFrom} AND e.expense_date <= ${periodTo}
      GROUP BY DATE_TRUNC('month', e.expense_date), ec.name
      ORDER BY month ASC
    `);

    // Month-over-month totals
    const monthlyTotals = await app.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', e.expense_date), 'YYYY-MM') AS month,
        COALESCE(SUM(e.amount::numeric), 0) AS total,
        COALESCE(SUM(e.tax_amount::numeric), 0) AS tax_total
      FROM expenses e
      WHERE e.expense_date >= ${periodFrom} AND e.expense_date <= ${periodTo}
      GROUP BY DATE_TRUNC('month', e.expense_date)
      ORDER BY month ASC
    `);

    return {
      data: {
        byCategory: (categoryRows as any[]).map((r) => ({
          category: r.category, total: Number(r.total), count: Number(r.count),
        })),
        categoryTrend: (trendRows as any[]).map((r) => ({
          month: r.month, category: r.category, total: Number(r.total),
        })),
        monthlyTotals: (monthlyTotals as any[]).map((r) => ({
          month: r.month, total: Number(r.total), taxTotal: Number(r.tax_total),
        })),
      },
    };
  });

  // ==========================================
  // CASH FLOW & CONVERSION — Payment timing analysis
  // ==========================================
  app.get('/cash-flow-analysis', { preHandler: requireAuth }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    // Monthly cash inflows vs outflows
    const [inflowRows, outflowRows] = await Promise.all([
      app.db.execute(sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', p.payment_date), 'YYYY-MM') AS month,
          COALESCE(SUM(p.amount::numeric), 0) AS amount
        FROM payments p
        WHERE p.payment_date >= ${periodFrom} AND p.payment_date <= ${periodTo}
        GROUP BY DATE_TRUNC('month', p.payment_date)
        ORDER BY month ASC
      `),
      app.db.execute(sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', e.expense_date), 'YYYY-MM') AS month,
          COALESCE(SUM(e.amount::numeric), 0) AS amount
        FROM expenses e
        WHERE e.expense_date >= ${periodFrom} AND e.expense_date <= ${periodTo}
        GROUP BY DATE_TRUNC('month', e.expense_date)
        ORDER BY month ASC
      `),
    ]);

    const monthMap: Record<string, { inflow: number; outflow: number }> = {};
    for (const r of inflowRows as any[]) {
      monthMap[r.month] = { inflow: Number(r.amount), outflow: 0 };
    }
    for (const r of outflowRows as any[]) {
      if (!monthMap[r.month]) monthMap[r.month] = { inflow: 0, outflow: 0 };
      monthMap[r.month].outflow = Number(r.amount);
    }

    const monthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, inflow: d.inflow, outflow: d.outflow, net: d.inflow - d.outflow }));

    // Average days to payment (invoice issued to payment received)
    const avgDays = await app.db.execute(sql`
      SELECT
        AVG(EXTRACT(day FROM p.payment_date - i.issued_at))::int AS avg_days,
        MIN(EXTRACT(day FROM p.payment_date - i.issued_at))::int AS min_days,
        MAX(EXTRACT(day FROM p.payment_date - i.issued_at))::int AS max_days
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      JOIN invoices i ON i.id = pa.invoice_id
      WHERE i.issued_at IS NOT NULL
        AND p.payment_date >= ${periodFrom} AND p.payment_date <= ${periodTo}
    `) as any[];

    // Receivables vs payables
    const [receivable, payable] = await Promise.all([
      app.db.execute(sql`
        SELECT COALESCE(SUM(total::numeric), 0) AS amount
        FROM invoices WHERE status IN ('ISSUED', 'PARTIAL')
      `),
      app.db.execute(sql`
        SELECT COALESCE(SUM(net_payable::numeric), 0) AS amount
        FROM royalty_ledger WHERE status IN ('CALCULATED', 'APPROVED')
      `),
    ]);

    return {
      data: {
        monthly,
        paymentSpeed: {
          avgDays: avgDays[0]?.avg_days ?? 0,
          minDays: avgDays[0]?.min_days ?? 0,
          maxDays: avgDays[0]?.max_days ?? 0,
        },
        balances: {
          totalReceivable: Number((receivable as any[])[0]?.amount ?? 0),
          totalPayable: Number((payable as any[])[0]?.amount ?? 0),
        },
      },
    };
  });

  // ==========================================
  // TAX / VAT REPORT — For SARS reporting
  // ==========================================
  app.get('/tax-report', { preHandler: requireAuth }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const periodFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodTo = to ? new Date(to) : new Date();

    // Output VAT (collected from customers via invoices)
    const outputVat = await app.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', invoice_date), 'YYYY-MM') AS month,
        COALESCE(SUM(subtotal::numeric), 0) AS taxable_amount,
        COALESCE(SUM(vat_amount::numeric), 0) AS vat_collected,
        COUNT(*)::int AS invoice_count
      FROM invoices
      WHERE status != 'VOIDED'
        AND invoice_date >= ${periodFrom} AND invoice_date <= ${periodTo}
      GROUP BY DATE_TRUNC('month', invoice_date)
      ORDER BY month ASC
    `);

    // Input VAT (paid on expenses)
    const inputVat = await app.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', expense_date), 'YYYY-MM') AS month,
        COALESCE(SUM(amount::numeric), 0) AS expense_amount,
        COALESCE(SUM(tax_amount::numeric), 0) AS vat_paid,
        COUNT(*)::int AS expense_count
      FROM expenses
      WHERE expense_date >= ${periodFrom} AND expense_date <= ${periodTo}
      GROUP BY DATE_TRUNC('month', expense_date)
      ORDER BY month ASC
    `);

    // Credit note VAT adjustments
    const creditVat = await app.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', cn.created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(cn.vat_amount::numeric), 0) AS vat_adjustment
      FROM credit_notes cn
      WHERE cn.voided_at IS NULL
        AND cn.created_at >= ${periodFrom} AND cn.created_at <= ${periodTo}
      GROUP BY DATE_TRUNC('month', cn.created_at)
      ORDER BY month ASC
    `);

    // Merge into monthly summary
    const monthMap: Record<string, {
      taxableIncome: number; vatCollected: number; invoiceCount: number;
      expenseAmount: number; vatPaid: number; expenseCount: number;
      vatAdjustment: number;
    }> = {};

    const initMonth = () => ({
      taxableIncome: 0, vatCollected: 0, invoiceCount: 0,
      expenseAmount: 0, vatPaid: 0, expenseCount: 0, vatAdjustment: 0,
    });

    for (const r of outputVat as any[]) {
      monthMap[r.month] = { ...initMonth(), taxableIncome: Number(r.taxable_amount), vatCollected: Number(r.vat_collected), invoiceCount: Number(r.invoice_count) };
    }
    for (const r of inputVat as any[]) {
      if (!monthMap[r.month]) monthMap[r.month] = initMonth();
      monthMap[r.month].expenseAmount = Number(r.expense_amount);
      monthMap[r.month].vatPaid = Number(r.vat_paid);
      monthMap[r.month].expenseCount = Number(r.expense_count);
    }
    for (const r of creditVat as any[]) {
      if (!monthMap[r.month]) monthMap[r.month] = initMonth();
      monthMap[r.month].vatAdjustment = Number(r.vat_adjustment);
    }

    const monthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        ...d,
        netVat: d.vatCollected - d.vatPaid - d.vatAdjustment,
      }));

    const totals = monthly.reduce((acc, m) => ({
      taxableIncome: acc.taxableIncome + m.taxableIncome,
      vatCollected: acc.vatCollected + m.vatCollected,
      expenseAmount: acc.expenseAmount + m.expenseAmount,
      vatPaid: acc.vatPaid + m.vatPaid,
      vatAdjustment: acc.vatAdjustment + m.vatAdjustment,
      netVat: acc.netVat + m.netVat,
    }), { taxableIncome: 0, vatCollected: 0, expenseAmount: 0, vatPaid: 0, vatAdjustment: 0, netVat: 0 });

    return { data: { monthly, totals, periodFrom: periodFrom.toISOString(), periodTo: periodTo.toISOString() } };
  });
}

function computeNextPaymentDue(frequency: string, now: Date) {
  const year = now.getFullYear();
  const month = now.getMonth();
  let periodFrom: Date, periodTo: Date, dueDate: Date;

  switch (frequency) {
    case 'MONTHLY': {
      periodFrom = new Date(year, month, 1);
      periodTo = new Date(year, month + 1, 0);
      dueDate = new Date(year, month + 1, 15);
      break;
    }
    case 'SEMI_ANNUAL': {
      const half = month < 6 ? 0 : 1;
      periodFrom = new Date(year, half * 6, 1);
      periodTo = new Date(year, half * 6 + 6, 0);
      dueDate = new Date(year, half * 6 + 6, 30);
      break;
    }
    case 'ANNUAL': {
      periodFrom = new Date(year, 0, 1);
      periodTo = new Date(year, 11, 31);
      dueDate = new Date(year + 1, 0, 31);
      break;
    }
    default: { // QUARTERLY
      const quarter = Math.floor(month / 3);
      periodFrom = new Date(year, quarter * 3, 1);
      periodTo = new Date(year, quarter * 3 + 3, 0);
      dueDate = new Date(year, quarter * 3 + 3, 30);
      break;
    }
  }
  return { periodFrom, periodTo, dueDate };
}

function emptyTotals() {
  return {
    qtySorSupplied: 0,
    qtySold: 0,
    qtyReturned: 0,
    kindleSalesQty: 0,
    randAmountReceived: 0,
    totalEbookSalesAmount: 0,
    totalPhysicalSalesAmount: 0,
    royaltyPayoutPhysical: 0,
    royaltyPayoutEbook: 0,
    lessOwingAdvance: 0,
    disbursement: 0,
  };
}

function emptyBalanceSummary() {
  return {
    lifetimeGrossRoyalty: 0,
    lifetimeAdvanceDeducted: 0,
    lifetimeNetPayable: 0,
    totalPaid: 0,
    totalUnpaid: 0,
    totalAdvanceOriginal: 0,
    totalAdvanceRecovered: 0,
  };
}
