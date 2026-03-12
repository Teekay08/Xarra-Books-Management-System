import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { titles, authors, channelPartners, inventoryMovements, invoices, expenses, expenseCategories, purchaseOrders, cashSales, expenseClaims, requisitions, partnerOrders } from '@xarra/db';
import { requireAuth } from '../../middleware/require-auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
  // Original stats endpoint
  app.get('/stats', { preHandler: requireAuth }, async () => {
    const [titleCount, authorCount, partnerCount, stockSummary, openPOs, pendingClaims, mtdCashSales, pendingPartnerOrders] = await Promise.all([
      app.db.select({ count: sql<number>`count(*)` }).from(titles),
      app.db.select({ count: sql<number>`count(*)` }).from(authors).where(sql`${authors.isActive} = true`),
      app.db.select({ count: sql<number>`count(*)` }).from(channelPartners).where(sql`${channelPartners.isActive} = true`),
      app.db.execute<{ totalStock: number }>(sql`
        SELECT COALESCE(SUM(
          CASE
            WHEN movement_type IN ('IN', 'RETURN') THEN quantity
            WHEN movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -quantity
            WHEN movement_type = 'ADJUST' THEN quantity
            ELSE 0
          END
        ), 0)::int AS "totalStock"
        FROM ${inventoryMovements}
      `),
      app.db.execute(sql`SELECT count(*)::int AS count FROM purchase_orders WHERE status IN ('DRAFT', 'ISSUED', 'PARTIAL')`),
      app.db.execute(sql`SELECT count(*)::int AS count FROM expense_claims WHERE status IN ('SUBMITTED')`),
      app.db.execute(sql`SELECT COALESCE(SUM(total::numeric), 0) AS total FROM cash_sales WHERE voided_at IS NULL AND sale_date >= DATE_TRUNC('month', CURRENT_DATE)`),
      app.db.execute(sql`SELECT count(*)::int AS count FROM partner_orders WHERE status IN ('SUBMITTED', 'CONFIRMED', 'PROCESSING')`),
    ]);

    return {
      data: {
        totalTitles: Number(titleCount[0].count),
        activeAuthors: Number(authorCount[0].count),
        activePartners: Number(partnerCount[0].count),
        totalStock: stockSummary[0]?.totalStock ?? 0,
        openPurchaseOrders: (openPOs[0] as any)?.count ?? 0,
        pendingExpenseClaims: (pendingClaims[0] as any)?.count ?? 0,
        mtdCashSales: Number((mtdCashSales[0] as any)?.total ?? 0),
        pendingPartnerOrders: (pendingPartnerOrders[0] as any)?.count ?? 0,
      },
    };
  });

  // Revenue chart — monthly revenue for last 12 months
  app.get('/revenue-chart', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', invoice_date), 'YYYY-MM') AS month,
        COALESCE(SUM(total::numeric), 0) AS revenue
      FROM invoices
      WHERE status != 'VOIDED'
        AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
      GROUP BY DATE_TRUNC('month', invoice_date)
      ORDER BY month ASC
    `);
    return { data: rows.map((r: any) => ({ month: r.month, revenue: Number(r.revenue) })) };
  });

  // Expense chart — expenses by category (for pie chart)
  app.get('/expense-chart', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      SELECT
        COALESCE(ec.name, 'Uncategorized') AS category,
        COALESCE(SUM(e.amount::numeric), 0) AS total
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.expense_date >= DATE_TRUNC('year', CURRENT_DATE)
      GROUP BY ec.name
      ORDER BY total DESC
    `);
    return { data: rows.map((r: any) => ({ category: r.category, total: Number(r.total) })) };
  });

  // Overdue invoices
  app.get('/overdue-invoices', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      SELECT i.id, i.number, i.total::numeric AS total, i.due_date, i.invoice_date,
             cp.name AS partner_name
      FROM invoices i
      JOIN channel_partners cp ON cp.id = i.partner_id
      WHERE i.status IN ('ISSUED', 'PARTIAL')
        AND i.due_date < CURRENT_DATE
      ORDER BY i.due_date ASC
      LIMIT 20
    `);
    return {
      data: rows.map((r: any) => ({
        id: r.id,
        number: r.number,
        total: Number(r.total),
        dueDate: r.due_date,
        invoiceDate: r.invoice_date,
        partnerName: r.partner_name,
        daysOverdue: Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000),
      })),
    };
  });

  // P&L summary (current month + YTD + YoY comparison)
  app.get('/pnl-summary', { preHandler: requireAuth }, async () => {
    const [revenueYtd, revenueMtd, revenueMtdLy, expensesYtd, expensesMtd, outstandingResult] = await Promise.all([
      app.db.execute(sql`
        SELECT COALESCE(SUM(total::numeric), 0) AS total
        FROM invoices
        WHERE status != 'VOIDED'
          AND invoice_date >= DATE_TRUNC('year', CURRENT_DATE)
      `),
      app.db.execute(sql`
        SELECT COALESCE(SUM(total::numeric), 0) AS total
        FROM invoices
        WHERE status != 'VOIDED'
          AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),
      // Same calendar month last year
      app.db.execute(sql`
        SELECT COALESCE(SUM(total::numeric), 0) AS total
        FROM invoices
        WHERE status != 'VOIDED'
          AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 year')
          AND invoice_date < DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 year') + INTERVAL '1 month'
      `),
      app.db.execute(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) AS total
        FROM expenses
        WHERE expense_date >= DATE_TRUNC('year', CURRENT_DATE)
      `),
      app.db.execute(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) AS total
        FROM expenses
        WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),
      app.db.execute(sql`
        SELECT COALESCE(SUM(total::numeric), 0) AS total
        FROM invoices
        WHERE status IN ('ISSUED', 'PARTIAL')
      `),
    ]);

    const ytdRevenue = Number(revenueYtd[0]?.total ?? 0);
    const ytdExpenses = Number(expensesYtd[0]?.total ?? 0);
    const mtdRevenue = Number(revenueMtd[0]?.total ?? 0);
    const mtdRevenueLy = Number(revenueMtdLy[0]?.total ?? 0);
    const mtdExpenses = Number(expensesMtd[0]?.total ?? 0);
    const mtdYoYChange = mtdRevenueLy > 0 ? ((mtdRevenue - mtdRevenueLy) / mtdRevenueLy) * 100 : null;

    return {
      data: {
        ytdRevenue,
        ytdExpenses,
        ytdNet: ytdRevenue - ytdExpenses,
        mtdRevenue,
        mtdRevenueLy,
        mtdYoYChange,
        mtdExpenses,
        mtdNet: mtdRevenue - mtdExpenses,
        outstanding: Number(outstandingResult[0]?.total ?? 0),
      },
    };
  });

  // Top 5 performing titles (by revenue, current month and YTD)
  app.get('/top-titles', { preHandler: requireAuth }, async () => {
    const [mtdRows, ytdRows] = await Promise.all([
      app.db.execute(sql`
        SELECT t.title, t.id,
               COALESCE(SUM(il.quantity::int), 0) AS units_sold,
               COALESCE(SUM(il.line_total::numeric), 0) AS revenue
        FROM invoice_lines il
        JOIN invoices i ON i.id = il.invoice_id
        JOIN titles t ON t.id = il.title_id
        WHERE i.status != 'VOIDED'
          AND i.invoice_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY t.id, t.title
        ORDER BY revenue DESC
        LIMIT 5
      `),
      app.db.execute(sql`
        SELECT t.title, t.id,
               COALESCE(SUM(il.quantity::int), 0) AS units_sold,
               COALESCE(SUM(il.line_total::numeric), 0) AS revenue
        FROM invoice_lines il
        JOIN invoices i ON i.id = il.invoice_id
        JOIN titles t ON t.id = il.title_id
        WHERE i.status != 'VOIDED'
          AND i.invoice_date >= DATE_TRUNC('year', CURRENT_DATE)
        GROUP BY t.id, t.title
        ORDER BY revenue DESC
        LIMIT 5
      `),
    ]);
    return {
      data: {
        mtd: (mtdRows as any[]).map((r) => ({ id: r.id, title: r.title, unitsSold: Number(r.units_sold), revenue: Number(r.revenue) })),
        ytd: (ytdRows as any[]).map((r) => ({ id: r.id, title: r.title, unitsSold: Number(r.units_sold), revenue: Number(r.revenue) })),
      },
    };
  });

  // Outstanding SORs — consignments with overdue or approaching return dates
  app.get('/outstanding-sors', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      SELECT
        c.id, c.number, c.dispatch_date, c.return_by_date, c.status,
        cp.name AS partner_name,
        COALESCE(SUM(cl.qty_dispatched - COALESCE(cl.qty_sold, 0) - COALESCE(cl.qty_returned, 0)), 0)::int AS outstanding_units
      FROM consignments c
      JOIN channel_partners cp ON cp.id = c.partner_id
      LEFT JOIN consignment_lines cl ON cl.consignment_id = c.id
      WHERE c.status IN ('ACTIVE', 'PARTIAL')
        AND c.return_by_date IS NOT NULL
        AND c.return_by_date <= CURRENT_DATE + INTERVAL '30 days'
      GROUP BY c.id, c.number, c.dispatch_date, c.return_by_date, c.status, cp.name
      ORDER BY c.return_by_date ASC
      LIMIT 10
    `);
    return {
      data: (rows as any[]).map((r) => ({
        id: r.id,
        number: r.number,
        partnerName: r.partner_name,
        dispatchDate: r.dispatch_date,
        returnByDate: r.return_by_date,
        status: r.status,
        outstandingUnits: Number(r.outstanding_units),
        isOverdue: new Date(r.return_by_date) < new Date(),
        daysUntilDue: Math.ceil((new Date(r.return_by_date).getTime() - Date.now()) / 86400000),
      })),
    };
  });

  // Royalties due within 60 days
  app.get('/royalties-due', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      SELECT
        a.id, a.legal_name, a.pen_name,
        COALESCE(SUM(ap.amount_due::numeric - COALESCE(ap.amount_paid::numeric, 0)), 0) AS amount_pending,
        COUNT(ap.id)::int AS entry_count,
        MIN(ap.period_to) AS earliest_period_end
      FROM authors a
      JOIN author_contracts ac ON ac.author_id = a.id AND ac.is_active = true
      LEFT JOIN author_payments ap ON ap.author_id = a.id
        AND ap.status IN ('AWAITING_APPROVAL', 'APPROVED')
      WHERE a.is_active = true
      GROUP BY a.id, a.legal_name, a.pen_name
      HAVING COALESCE(SUM(ap.amount_due::numeric - COALESCE(ap.amount_paid::numeric, 0)), 0) > 0
      ORDER BY amount_pending DESC
      LIMIT 8
    `);
    return {
      data: (rows as any[]).map((r) => ({
        id: r.id,
        authorName: r.pen_name || r.legal_name,
        amountPending: Number(r.amount_pending),
        entryCount: Number(r.entry_count),
        earliestPeriodEnd: r.earliest_period_end,
      })),
    };
  });

  // Low stock alerts — titles with warehouse stock below threshold
  app.get('/low-stock', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      SELECT
        t.id, t.title, t.isbn_13 AS isbn13,
        COALESCE(SUM(
          CASE
            WHEN im.movement_type IN ('IN', 'RETURN') THEN im.quantity
            WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -im.quantity
            WHEN im.movement_type = 'ADJUST' THEN im.quantity
            ELSE 0
          END
        ), 0)::int AS stock_on_hand
      FROM titles t
      LEFT JOIN inventory_movements im ON im.title_id = t.id
      WHERE t.is_active = true
      GROUP BY t.id, t.title, t.isbn_13
      HAVING COALESCE(SUM(
        CASE
          WHEN im.movement_type IN ('IN', 'RETURN') THEN im.quantity
          WHEN im.movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -im.quantity
          WHEN im.movement_type = 'ADJUST' THEN im.quantity
          ELSE 0
        END
      ), 0) <= 10
      ORDER BY stock_on_hand ASC
      LIMIT 8
    `);
    return {
      data: (rows as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        isbn13: r.isbn13,
        stockOnHand: Number(r.stock_on_hand),
      })),
    };
  });

  // Cash flow — monthly net (revenue - expenses) for last 12 months
  app.get('/cash-flow', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      WITH months AS (
        SELECT TO_CHAR(DATE_TRUNC('month', d), 'YYYY-MM') AS month
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'
        ) d
      ),
      rev AS (
        SELECT TO_CHAR(DATE_TRUNC('month', invoice_date), 'YYYY-MM') AS month,
               COALESCE(SUM(total::numeric), 0) AS revenue
        FROM invoices WHERE status != 'VOIDED'
          AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
        GROUP BY 1
      ),
      exp AS (
        SELECT TO_CHAR(DATE_TRUNC('month', expense_date), 'YYYY-MM') AS month,
               COALESCE(SUM(amount::numeric), 0) AS expenses
        FROM expenses
        WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
        GROUP BY 1
      )
      SELECT m.month,
             COALESCE(r.revenue, 0) AS revenue,
             COALESCE(e.expenses, 0) AS expenses,
             COALESCE(r.revenue, 0) - COALESCE(e.expenses, 0) AS net
      FROM months m
      LEFT JOIN rev r ON r.month = m.month
      LEFT JOIN exp e ON e.month = m.month
      ORDER BY m.month ASC
    `);
    return { data: rows.map((r: any) => ({ month: r.month, revenue: Number(r.revenue), expenses: Number(r.expenses), net: Number(r.net) })) };
  });

  // Recent activity
  app.get('/recent-activity', { preHandler: requireAuth }, async () => {
    const rows = await app.db.execute(sql`
      (
        SELECT 'INVOICE' AS type, number AS reference, total::numeric AS amount,
               invoice_date AS date
        FROM invoices
        WHERE status != 'VOIDED'
        ORDER BY created_at DESC LIMIT 10
      )
      UNION ALL
      (
        SELECT 'PAYMENT' AS type, bank_reference AS reference, amount::numeric AS amount,
               payment_date AS date
        FROM payments
        ORDER BY created_at DESC LIMIT 10
      )
      UNION ALL
      (
        SELECT 'CASH SALE' AS type, number AS reference, total::numeric AS amount,
               sale_date AS date
        FROM cash_sales
        WHERE voided_at IS NULL
        ORDER BY created_at DESC LIMIT 5
      )
      UNION ALL
      (
        SELECT 'PARTNER ORDER' AS type, number AS reference, total::numeric AS amount,
               order_date AS date
        FROM partner_orders
        WHERE status != 'CANCELLED'
        ORDER BY created_at DESC LIMIT 5
      )
      ORDER BY date DESC
      LIMIT 15
    `);

    return {
      data: rows.map((r: any) => ({
        type: r.type,
        reference: r.reference,
        amount: Number(r.amount),
        date: r.date,
      })),
    };
  });
}
