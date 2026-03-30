import type { FastifyInstance } from 'fastify';
import { eq, sql, and } from 'drizzle-orm';
import {
  suspenseLedger, suspenseSnapshots, cashFlowForecasts,
  sellThroughPredictions, sellThroughActuals,
  consignments, consignmentLines, invoices, channelPartners,
} from '@xarra/db';
import { paginationSchema, confirmSuspenseSchema, writeOffSuspenseSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

export async function suspenseRoutes(app: FastifyInstance) {

  // ==========================================
  // SUSPENSE ACCOUNTING
  // ==========================================

  // Summary KPIs
  app.get('/summary', { preHandler: requireAuth }, async () => {
    const statusSums = await app.db.execute<{ status: string; total: string; count: string }>(sql`
      SELECT status, COALESCE(SUM(amount::numeric), 0) as total, COUNT(*) as count
      FROM suspense_ledger GROUP BY status
    `);

    const partnerBreakdown = await app.db.execute<{
      partner_id: string; partner_name: string; suspense: string; confirmed: string; refund_due: string;
    }>(sql`
      SELECT sl.partner_id, cp.name as partner_name,
        COALESCE(SUM(CASE WHEN sl.status = 'SUSPENSE' THEN sl.amount::numeric ELSE 0 END), 0) as suspense,
        COALESCE(SUM(CASE WHEN sl.status = 'CONFIRMED' THEN sl.amount::numeric ELSE 0 END), 0) as confirmed,
        COALESCE(SUM(CASE WHEN sl.status = 'REFUND_DUE' THEN sl.amount::numeric ELSE 0 END), 0) as refund_due
      FROM suspense_ledger sl
      JOIN channel_partners cp ON cp.id = sl.partner_id
      GROUP BY sl.partner_id, cp.name
      ORDER BY suspense DESC
    `);

    const byStatus: Record<string, { total: number; count: number }> = {};
    for (const row of statusSums) {
      byStatus[row.status] = { total: Number(row.total), count: Number(row.count) };
    }

    return {
      data: {
        suspense: byStatus['SUSPENSE'] || { total: 0, count: 0 },
        confirmed: byStatus['CONFIRMED'] || { total: 0, count: 0 },
        refundDue: byStatus['REFUND_DUE'] || { total: 0, count: 0 },
        refunded: byStatus['REFUNDED'] || { total: 0, count: 0 },
        writtenOff: byStatus['WRITTEN_OFF'] || { total: 0, count: 0 },
        partnerBreakdown,
      },
    };
  });

  // Paginated ledger
  app.get('/ledger', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const statusFilter = (request.query as any).status;
    const partnerFilter = (request.query as any).partnerId;

    let where = sql`1=1`;
    if (statusFilter && statusFilter !== 'ALL') {
      where = sql`${where} AND ${suspenseLedger.status} = ${statusFilter}`;
    }
    if (partnerFilter) {
      where = sql`${where} AND ${suspenseLedger.partnerId} = ${partnerFilter}`;
    }

    const [items, countResult] = await Promise.all([
      app.db.query.suspenseLedger.findMany({
        where: () => where,
        with: { consignment: true, partner: true, invoice: true },
        orderBy: (s, { desc }) => [desc(s.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(suspenseLedger).where(where),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // By consignment
  app.get<{ Params: { id: string } }>('/by-consignment/:id', { preHandler: requireAuth }, async (request) => {
    const items = await app.db.query.suspenseLedger.findMany({
      where: eq(suspenseLedger.consignmentId, request.params.id),
      with: { invoice: true, partner: true },
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });
    return { data: items };
  });

  // By partner
  app.get<{ Params: { id: string } }>('/by-partner/:id', { preHandler: requireAuth }, async (request) => {
    const items = await app.db.query.suspenseLedger.findMany({
      where: eq(suspenseLedger.partnerId, request.params.id),
      with: { consignment: true, invoice: true },
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });
    return { data: items };
  });

  // Timeline: expected conversion dates
  app.get('/timeline', { preHandler: requireAuth }, async () => {
    const weeks = await app.db.execute<{ week: string; total: string; count: string }>(sql`
      SELECT DATE_TRUNC('week', sor_expiry_date) as week,
             COALESCE(SUM(amount::numeric), 0) as total,
             COUNT(*) as count
      FROM suspense_ledger
      WHERE status = 'SUSPENSE' AND sor_expiry_date IS NOT NULL
      GROUP BY week ORDER BY week
    `);
    return { data: weeks };
  });

  // Manually confirm
  app.post<{ Params: { id: string } }>('/:id/confirm', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = confirmSuspenseSchema.parse(request.body);
    const entry = await app.db.query.suspenseLedger.findFirst({
      where: eq(suspenseLedger.id, request.params.id),
    });
    if (!entry) return reply.notFound('Suspense entry not found');
    if (entry.status !== 'SUSPENSE') return reply.badRequest('Only SUSPENSE entries can be confirmed');

    const [updated] = await app.db.update(suspenseLedger).set({
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      confirmedBy: request.session?.user?.id || 'MANUAL',
      notes: body.notes || entry.notes,
      updatedAt: new Date(),
    }).where(eq(suspenseLedger.id, request.params.id)).returning();

    return { data: updated };
  });

  // Write off
  app.post<{ Params: { id: string } }>('/:id/write-off', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const { reason } = writeOffSuspenseSchema.parse(request.body);
    const entry = await app.db.query.suspenseLedger.findFirst({
      where: eq(suspenseLedger.id, request.params.id),
    });
    if (!entry) return reply.notFound('Suspense entry not found');
    if (entry.status !== 'SUSPENSE' && entry.status !== 'REFUND_DUE') {
      return reply.badRequest('Only SUSPENSE or REFUND_DUE entries can be written off');
    }

    const [updated] = await app.db.update(suspenseLedger).set({
      status: 'WRITTEN_OFF',
      notes: reason,
      updatedAt: new Date(),
    }).where(eq(suspenseLedger.id, request.params.id)).returning();

    return { data: updated };
  });

  // Snapshots
  app.get('/snapshots', { preHandler: requireAuth }, async (request) => {
    const from = (request.query as any).from;
    const to = (request.query as any).to;
    let where = sql`1=1`;
    if (from) where = sql`${where} AND ${suspenseSnapshots.snapshotDate} >= ${from}`;
    if (to) where = sql`${where} AND ${suspenseSnapshots.snapshotDate} <= ${to}`;

    const items = await app.db.query.suspenseSnapshots.findMany({
      where: () => where,
      orderBy: (s, { desc }) => [desc(s.snapshotDate)],
      limit: 365,
    });
    return { data: items };
  });

  // ==========================================
  // CASH FLOW / SAFE SPENDING
  // ==========================================

  app.get('/safe-spending', { preHandler: requireAuth }, async () => {
    // Current suspense totals
    const totals = await app.db.execute<{ status: string; total: string }>(sql`
      SELECT status, COALESCE(SUM(amount::numeric), 0) as total
      FROM suspense_ledger WHERE status IN ('SUSPENSE', 'CONFIRMED', 'REFUNDED', 'WRITTEN_OFF')
      GROUP BY status
    `);

    const totalMap: Record<string, number> = {};
    for (const r of totals) totalMap[r.status] = Number(r.total);

    const confirmed = totalMap['CONFIRMED'] || 0;
    const suspense = totalMap['SUSPENSE'] || 0;
    const refunded = totalMap['REFUNDED'] || 0;
    const writtenOff = totalMap['WRITTEN_OFF'] || 0;

    // Historical conversion rate (last 12 months)
    const settled = confirmed + refunded + writtenOff;
    const conversionRate = settled > 0 ? confirmed / settled : 0.75;
    const likelyRevenue = suspense * conversionRate;

    // Current month spending (from expenses)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const spendingResult = await app.db.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) as total
      FROM expenses WHERE expense_date >= ${monthStart.toISOString()}
    `);
    const currentSpending = Number(spendingResult[0]?.total || 0);

    // Risk level
    let riskLevel = 'GREEN';
    if (currentSpending > confirmed + likelyRevenue * 0.5) riskLevel = 'RED';
    else if (currentSpending > confirmed) riskLevel = 'YELLOW';

    return {
      data: {
        confirmed,
        suspense,
        conversionRate: Math.round(conversionRate * 10000) / 100, // as percentage
        likelyRevenue: Math.round(likelyRevenue * 100) / 100,
        safeSpending: {
          conservative: Math.round(confirmed * 100) / 100,
          moderate: Math.round((confirmed + likelyRevenue * 0.7) * 100) / 100,
          aggressive: Math.round((confirmed + likelyRevenue - suspense * 0.15) * 100) / 100,
        },
        riskLevel,
        currentMonthSpending: currentSpending,
      },
    };
  });

  app.get('/working-capital', { preHandler: requireAuth }, async () => {
    // Total payments received this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [paymentsResult, suspenseResult, expensesResult] = await Promise.all([
      app.db.execute<{ total: string }>(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) as total
        FROM payments WHERE payment_date >= ${monthStart.toISOString()}
      `),
      app.db.execute<{ status: string; total: string }>(sql`
        SELECT status, COALESCE(SUM(amount::numeric), 0) as total
        FROM suspense_ledger WHERE status IN ('SUSPENSE', 'CONFIRMED')
        GROUP BY status
      `),
      app.db.execute<{ total: string }>(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) as total
        FROM expenses WHERE expense_date >= ${monthStart.toISOString()}
      `),
    ]);

    const cashReceived = Number(paymentsResult[0]?.total || 0);
    const suspenseMap: Record<string, number> = {};
    for (const r of suspenseResult) suspenseMap[r.status] = Number(r.total);

    return {
      data: {
        cashReceived,
        confirmedRevenue: suspenseMap['CONFIRMED'] || 0,
        suspenseBalance: suspenseMap['SUSPENSE'] || 0,
        expenses: Number(expensesResult[0]?.total || 0),
        netWorkingCapital: cashReceived - Number(expensesResult[0]?.total || 0),
      },
    };
  });

  app.get('/forecast', { preHandler: requireAuth }, async () => {
    const now = new Date();
    const periods = [30, 60, 90].map((days) => {
      const end = new Date(now);
      end.setDate(end.getDate() + days);
      return { label: `${days} days`, days, end };
    });

    const results = [];
    for (const period of periods) {
      // Inflows: invoices due in period + suspense converting
      const [invoiceDue, suspenseConverting, avgDailyCash] = await Promise.all([
        app.db.execute<{ total: string }>(sql`
          SELECT COALESCE(SUM(total::numeric), 0) as total
          FROM invoices WHERE status IN ('ISSUED', 'PARTIAL', 'OVERDUE')
          AND due_date <= ${period.end.toISOString()} AND due_date >= ${now.toISOString()}
        `),
        app.db.execute<{ total: string }>(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) as total
          FROM suspense_ledger WHERE status = 'SUSPENSE'
          AND sor_expiry_date <= ${period.end.toISOString()} AND sor_expiry_date >= ${now.toISOString()}
        `),
        app.db.execute<{ avg: string }>(sql`
          SELECT COALESCE(AVG(daily_total), 0) as avg FROM (
            SELECT DATE(payment_date) as d, SUM(amount::numeric) as daily_total
            FROM payments WHERE payment_date >= NOW() - INTERVAL '90 days'
            GROUP BY d
          ) sub
        `),
      ]);

      const inflows = {
        payments: Number(invoiceDue[0]?.total || 0),
        sorConversions: Number(suspenseConverting[0]?.total || 0) * 0.75,
        cashSales: Number(avgDailyCash[0]?.avg || 0) * period.days,
      };

      // Outflows: estimate from historical
      const avgMonthlyExpense = await app.db.execute<{ avg: string }>(sql`
        SELECT COALESCE(AVG(monthly_total), 0) as avg FROM (
          SELECT DATE_TRUNC('month', expense_date) as m, SUM(amount::numeric) as monthly_total
          FROM expenses WHERE expense_date >= NOW() - INTERVAL '6 months'
          GROUP BY m
        ) sub
      `);

      const monthlyExpense = Number(avgMonthlyExpense[0]?.avg || 0);
      const outflows = {
        production: 0,
        royalties: 0,
        expenses: monthlyExpense * (period.days / 30),
        refunds: 0,
      };

      const totalIn = inflows.payments + inflows.sorConversions + inflows.cashSales;
      const totalOut = outflows.expenses;

      results.push({
        label: period.label,
        days: period.days,
        inflows,
        outflows,
        totalInflows: Math.round(totalIn * 100) / 100,
        totalOutflows: Math.round(totalOut * 100) / 100,
        net: Math.round((totalIn - totalOut) * 100) / 100,
      });
    }

    return { data: results };
  });

  // ==========================================
  // PREDICTIVE ANALYTICS
  // ==========================================

  // Active predictions
  app.get('/predictions/active', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      app.db.query.sellThroughPredictions.findMany({
        with: { consignment: true, title: true, partner: true },
        orderBy: (p, { asc }) => [asc(p.riskLevel)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(sellThroughPredictions),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Predictions for a specific consignment
  app.get<{ Params: { id: string } }>('/predictions/consignment/:id', { preHandler: requireAuth }, async (request) => {
    const items = await app.db.query.sellThroughPredictions.findMany({
      where: eq(sellThroughPredictions.consignmentId, request.params.id),
      with: { title: true, partner: true },
    });
    return { data: items };
  });

  // High-risk predictions
  app.get('/predictions/high-risk', { preHandler: requireAuth }, async () => {
    const items = await app.db.query.sellThroughPredictions.findMany({
      where: eq(sellThroughPredictions.riskLevel, 'HIGH'),
      with: { consignment: true, title: true, partner: true },
      orderBy: (p, { asc }) => [asc(p.predictedSellThroughPct)],
    });
    return { data: items };
  });

  // Revenue forecast from predictions
  app.get('/predictions/revenue-forecast', { preHandler: requireAuth }, async () => {
    const forecast = await app.db.execute<{ month: string; predicted: string; count: string }>(sql`
      SELECT DATE_TRUNC('month', c.sor_expiry_date) as month,
             COALESCE(SUM(stp.predicted_revenue::numeric), 0) as predicted,
             COUNT(*) as count
      FROM sell_through_predictions stp
      JOIN consignments c ON c.id = stp.consignment_id
      WHERE c.sor_expiry_date >= NOW()
      GROUP BY month ORDER BY month
    `);
    return { data: forecast };
  });

  // Seasonal trends
  app.get('/predictions/trends/seasonal', { preHandler: requireAuth }, async () => {
    const trends = await app.db.execute<{ month: string; avg_sell_through: string; data_points: string }>(sql`
      SELECT dispatch_month as month,
             ROUND(AVG(sell_through_pct::numeric), 1) as avg_sell_through,
             COUNT(*) as data_points
      FROM sell_through_actuals
      GROUP BY dispatch_month ORDER BY dispatch_month
    `);
    return { data: trends };
  });

  // Partner trends
  app.get<{ Params: { id: string } }>('/predictions/trends/partner/:id', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const items = await app.db.query.sellThroughActuals.findMany({
      where: eq(sellThroughActuals.partnerId, request.params.id),
      with: { title: true },
      orderBy: (a, { desc }) => [desc(a.dispatchDate)],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    return { data: items };
  });

  // Title trends
  app.get<{ Params: { id: string } }>('/predictions/trends/title/:id', { preHandler: requireAuth }, async (request) => {
    const items = await app.db.query.sellThroughActuals.findMany({
      where: eq(sellThroughActuals.titleId, request.params.id),
      with: { partner: true },
      orderBy: (a, { desc }) => [desc(a.dispatchDate)],
    });
    return { data: items };
  });

  // Recalculate predictions
  app.post('/predictions/recalculate', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    // Get all active consignments
    const activeConsignments = await app.db.query.consignments.findMany({
      where: sql`${consignments.status} IN ('DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN')`,
      with: { lines: { with: { title: true } }, partner: true },
    });

    let processed = 0;
    let highRisk = 0;

    for (const consignment of activeConsignments) {
      for (const line of consignment.lines) {
        // Factor 1: Title history (30%)
        const titleHistory = await app.db.execute<{ avg: string; cnt: string }>(sql`
          SELECT ROUND(AVG(sell_through_pct::numeric), 2) as avg, COUNT(*) as cnt
          FROM sell_through_actuals WHERE title_id = ${line.titleId}
        `);

        // Factor 2: Partner history (25%)
        const partnerHistory = await app.db.execute<{ avg: string; cnt: string }>(sql`
          SELECT ROUND(AVG(sell_through_pct::numeric), 2) as avg, COUNT(*) as cnt
          FROM sell_through_actuals WHERE partner_id = ${consignment.partnerId}
        `);

        // Factor 3: Title-at-partner (20%)
        const titlePartnerHistory = await app.db.execute<{ avg: string; cnt: string }>(sql`
          SELECT ROUND(AVG(sell_through_pct::numeric), 2) as avg, COUNT(*) as cnt
          FROM sell_through_actuals WHERE title_id = ${line.titleId} AND partner_id = ${consignment.partnerId}
        `);

        // Factor 4: Seasonal (10%)
        const currentMonth = new Date().getMonth() + 1;
        const seasonalHistory = await app.db.execute<{ avg: string; cnt: string }>(sql`
          SELECT ROUND(AVG(sell_through_pct::numeric), 2) as avg, COUNT(*) as cnt
          FROM sell_through_actuals WHERE dispatch_month = ${currentMonth}
        `);

        // Factor 5: Velocity (10%)
        const dispatchDate = consignment.dispatchDate ? new Date(consignment.dispatchDate) : new Date(consignment.createdAt);
        const sorExpiry = consignment.sorExpiryDate ? new Date(consignment.sorExpiryDate) : new Date(Date.now() + 90 * 86400000);
        const daysOnShelf = Math.max(1, Math.floor((Date.now() - dispatchDate.getTime()) / 86400000));
        const totalDays = Math.max(1, Math.floor((sorExpiry.getTime() - dispatchDate.getTime()) / 86400000));
        const shelfProgress = Math.min(daysOnShelf / totalDays, 1);
        const currentSellPct = line.qtyDispatched > 0 ? (line.qtySold / line.qtyDispatched) * 100 : 0;
        const velocityProjection = shelfProgress > 0.15 ? Math.min(currentSellPct / shelfProgress, 100) : null;

        // Weighted calculation
        const factors: Array<{ name: string; value: number; weight: number; dataPoints: number }> = [];
        const addFactor = (name: string, result: { avg: string; cnt: string }[], weight: number) => {
          const avg = Number(result[0]?.avg || 0);
          const cnt = Number(result[0]?.cnt || 0);
          if (cnt >= 2) factors.push({ name, value: avg, weight, dataPoints: cnt });
        };

        addFactor('title_history', titleHistory, 0.30);
        addFactor('partner_history', partnerHistory, 0.25);
        addFactor('title_partner', titlePartnerHistory, 0.20);
        addFactor('seasonal', seasonalHistory, 0.10);
        if (velocityProjection !== null) {
          factors.push({ name: 'velocity', value: velocityProjection, weight: 0.10, dataPoints: 1 });
        }

        // Calculate weighted average
        let predicted: number;
        if (factors.length > 0) {
          const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
          predicted = factors.reduce((s, f) => s + f.value * (f.weight / totalWeight), 0);
        } else {
          predicted = currentSellPct > 0 ? currentSellPct : 50; // default if no data
        }

        predicted = Math.max(0, Math.min(100, Math.round(predicted * 100) / 100));
        const totalDataPoints = factors.reduce((s, f) => s + f.dataPoints, 0);

        const confidenceLevel = totalDataPoints >= 20 ? 'HIGH' : totalDataPoints >= 5 ? 'MEDIUM' : 'LOW';
        const riskLevel = predicted < 30 ? 'HIGH' : predicted < 50 ? 'MEDIUM' : 'LOW';
        if (riskLevel === 'HIGH') highRisk++;

        const predictedQtySold = Math.round(line.qtyDispatched * predicted / 100);
        const predictedQtyReturned = line.qtyDispatched - predictedQtySold;
        const unitPrice = Number(line.unitRrp) * (1 - Number(line.discountPct) / 100);
        const predictedRevenue = predictedQtySold * unitPrice;

        // Upsert prediction
        const existing = await app.db.query.sellThroughPredictions.findFirst({
          where: and(
            eq(sellThroughPredictions.consignmentId, consignment.id),
            eq(sellThroughPredictions.consignmentLineId, line.id),
          ),
        });

        const values = {
          consignmentId: consignment.id,
          consignmentLineId: line.id,
          titleId: line.titleId,
          partnerId: consignment.partnerId,
          predictedSellThroughPct: String(predicted),
          predictedQtySold,
          predictedQtyReturned,
          predictedRevenue: String(Math.round(predictedRevenue * 100) / 100),
          confidenceLevel,
          confidenceScore: String(Math.min(totalDataPoints / 30, 1)),
          riskLevel,
          factors: factors as any,
          modelVersion: 'v1-rules',
          predictedAt: new Date(),
        };

        if (existing) {
          await app.db.update(sellThroughPredictions).set(values).where(eq(sellThroughPredictions.id, existing.id));
        } else {
          await app.db.insert(sellThroughPredictions).values(values);
        }

        processed++;
      }
    }

    return { data: { processed, highRisk, consignments: activeConsignments.length } };
  });
}
