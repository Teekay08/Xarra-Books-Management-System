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

  // P&L summary (current month + YTD)
  app.get('/pnl-summary', { preHandler: requireAuth }, async () => {
    const [revenueYtd, revenueMtd, expensesYtd, expensesMtd, outstandingResult] = await Promise.all([
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
    const mtdExpenses = Number(expensesMtd[0]?.total ?? 0);

    return {
      data: {
        ytdRevenue,
        ytdExpenses,
        ytdNet: ytdRevenue - ytdExpenses,
        mtdRevenue,
        mtdExpenses,
        mtdNet: mtdRevenue - mtdExpenses,
        outstanding: Number(outstandingResult[0]?.total ?? 0),
      },
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
