import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../../middleware/require-auth.js';
import { renderAuthorRoyaltyReportHtml } from '../../services/templates/author-royalty-report.js';
import { generatePdf } from '../../services/pdf.js';

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
      return { data: { authorName, lines: [], totals: emptyTotals(), periodFrom: periodFrom.toISOString(), periodTo: periodTo.toISOString() } };
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
        COALESCE(SUM(sr.net_revenue_zar::numeric), 0) AS ebook_revenue
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

      const totalPhysicalSalesAmount = revenue;
      const totalEbookSalesAmount = ebook.revenue;
      const randAmountReceived = totalPhysicalSalesAmount + totalEbookSalesAmount;

      // Royalty calculations using contract rates
      const royaltyRatePrint = Number(c.royalty_rate_print);
      const royaltyRateEbook = Number(c.royalty_rate_ebook);
      const royaltyPayoutPhysical = totalPhysicalSalesAmount * royaltyRatePrint;
      const royaltyPayoutEbook = totalEbookSalesAmount * royaltyRateEbook;

      const advanceAmount = Number(c.advance_amount);
      const advanceRecovered = Number(c.advance_recovered);
      const advanceOutstanding = Math.max(0, advanceAmount - advanceRecovered);
      const grossRoyalty = royaltyPayoutPhysical + royaltyPayoutEbook;
      const lessOwingAdvance = Math.min(advanceOutstanding, grossRoyalty);
      const disbursement = Math.max(0, grossRoyalty - lessOwingAdvance);

      return {
        bookTitle: c.book_title,
        authorName,
        retailPrice,
        salesPeriod,
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
      randAmountReceived: acc.randAmountReceived + l.randAmountReceived,
      totalEbookSalesAmount: acc.totalEbookSalesAmount + l.totalEbookSalesAmount,
      totalPhysicalSalesAmount: acc.totalPhysicalSalesAmount + l.totalPhysicalSalesAmount,
      royaltyPayoutPhysical: acc.royaltyPayoutPhysical + l.royaltyPayoutPhysical,
      royaltyPayoutEbook: acc.royaltyPayoutEbook + l.royaltyPayoutEbook,
      lessOwingAdvance: acc.lessOwingAdvance + l.lessOwingAdvance,
      disbursement: acc.disbursement + l.disbursement,
    }), emptyTotals());

    return {
      data: {
        authorName,
        lines,
        totals,
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
