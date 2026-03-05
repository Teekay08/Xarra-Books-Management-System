import type { FastifyInstance } from 'fastify';
import { eq, sql, and, desc } from 'drizzle-orm';
import { royaltyLedger, authorContracts, saleRecords, authors } from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

export async function royaltyRoutes(app: FastifyInstance) {
  // List royalty entries (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      app.db.query.royaltyLedger.findMany({
        with: { author: true, title: true },
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(royaltyLedger),
    ]);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Calculate royalties for a contract + period
  app.post('/calculate', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const { contractId, periodFrom, periodTo } = request.body as {
      contractId: string;
      periodFrom: string;
      periodTo: string;
    };

    // Get the contract
    const contract = await app.db.query.authorContracts.findFirst({
      where: eq(authorContracts.id, contractId),
      with: { author: true, title: true },
    });
    if (!contract) return reply.notFound('Contract not found');

    const from = new Date(periodFrom);
    const to = new Date(periodTo);

    // Check for duplicate period
    const existingEntry = await app.db.query.royaltyLedger.findFirst({
      where: and(
        eq(royaltyLedger.contractId, contractId),
        eq(royaltyLedger.periodFrom, from),
        eq(royaltyLedger.periodTo, to),
      ),
    });
    if (existingEntry) {
      return reply.badRequest('Royalty already calculated for this contract and period');
    }

    // Get sales for this title in the period
    const salesResult = await app.db.execute<{ totalUnits: number; totalRevenue: string }>(sql`
      SELECT
        COALESCE(SUM(quantity), 0)::int AS "totalUnits",
        COALESCE(SUM(
          CASE WHEN currency = 'ZAR' THEN net_revenue
               ELSE net_revenue * COALESCE(exchange_rate, 1)
          END
        ), 0) AS "totalRevenue"
      FROM ${saleRecords}
      WHERE title_id = ${contract.titleId}
        AND sale_date >= ${from.toISOString()}
        AND sale_date <= ${to.toISOString()}
        AND status = 'CONFIRMED'
    `);

    const unitsSold = salesResult[0]?.totalUnits ?? 0;
    const totalRevenue = Number(salesResult[0]?.totalRevenue ?? 0);

    // Check trigger conditions
    let triggered = false;
    switch (contract.triggerType) {
      case 'DATE':
        triggered = true; // date-based always triggers at period end
        break;
      case 'UNITS':
        triggered = unitsSold >= Number(contract.triggerValue ?? 0);
        break;
      case 'REVENUE':
        triggered = totalRevenue >= Number(contract.triggerValue ?? 0);
        break;
    }

    if (!triggered) {
      return {
        data: null,
        message: `Trigger not met: ${contract.triggerType} requires ${contract.triggerValue}, current: ${
          contract.triggerType === 'UNITS' ? unitsSold : totalRevenue
        }`,
        unitsSold,
        totalRevenue,
      };
    }

    // Calculate royalty — use print rate for now (could be extended for ebook)
    const royaltyRate = Number(contract.royaltyRatePrint);
    const grossRoyalty = totalRevenue * royaltyRate;

    // Advance recovery for Traditional authors
    const advanceAmount = Number(contract.advanceAmount);
    const advanceRecovered = Number(contract.advanceRecovered);
    const advanceRemaining = Math.max(0, advanceAmount - advanceRecovered);
    const advanceDeducted = Math.min(grossRoyalty, advanceRemaining);
    const netPayable = grossRoyalty - advanceDeducted;

    // Insert royalty entry (append-only ledger)
    const [entry] = await app.db.insert(royaltyLedger).values({
      authorId: contract.authorId,
      titleId: contract.titleId,
      contractId: contract.id,
      triggerType: contract.triggerType,
      periodFrom: from,
      periodTo: to,
      unitsSold,
      totalRevenue: String(totalRevenue),
      grossRoyalty: String(grossRoyalty),
      advanceDeducted: String(advanceDeducted),
      netPayable: String(netPayable),
      status: 'CALCULATED',
    }).returning();

    // Update advance recovered on contract
    if (advanceDeducted > 0) {
      await app.db.update(authorContracts).set({
        advanceRecovered: String(advanceRecovered + advanceDeducted),
        updatedAt: new Date(),
      }).where(eq(authorContracts.id, contractId));
    }

    return reply.status(201).send({ data: entry });
  });

  // Approve royalty entry
  app.post<{ Params: { id: string } }>('/:id/approve', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const entry = await app.db.query.royaltyLedger.findFirst({
      where: eq(royaltyLedger.id, request.params.id),
    });
    if (!entry) return reply.notFound('Royalty entry not found');
    if (entry.status !== 'CALCULATED') return reply.badRequest('Only CALCULATED entries can be approved');

    const [updated] = await app.db.update(royaltyLedger).set({
      status: 'APPROVED',
    }).where(eq(royaltyLedger.id, request.params.id)).returning();

    return { data: updated };
  });

  // Mark royalty as paid
  app.post<{ Params: { id: string } }>('/:id/pay', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const { paymentRef } = request.body as { paymentRef: string };
    if (!paymentRef) return reply.badRequest('Payment reference is required');

    const entry = await app.db.query.royaltyLedger.findFirst({
      where: eq(royaltyLedger.id, request.params.id),
    });
    if (!entry) return reply.notFound('Royalty entry not found');
    if (entry.status !== 'APPROVED') return reply.badRequest('Only APPROVED entries can be paid');

    const [updated] = await app.db.update(royaltyLedger).set({
      status: 'PAID',
      paidAt: new Date(),
      paymentRef,
    }).where(eq(royaltyLedger.id, request.params.id)).returning();

    return { data: updated };
  });

  // Get royalty summary per author
  app.get('/summary/by-author', { preHandler: requireAuth }, async () => {
    const result = await app.db.execute<{
      authorId: string;
      legalName: string;
      totalGross: string;
      totalAdvanceDeducted: string;
      totalNet: string;
      totalPaid: string;
      totalOutstanding: string;
    }>(sql`
      SELECT
        a.id AS "authorId",
        a.legal_name AS "legalName",
        COALESCE(SUM(r.gross_royalty), 0) AS "totalGross",
        COALESCE(SUM(r.advance_deducted), 0) AS "totalAdvanceDeducted",
        COALESCE(SUM(r.net_payable), 0) AS "totalNet",
        COALESCE(SUM(CASE WHEN r.status = 'PAID' THEN r.net_payable ELSE 0 END), 0) AS "totalPaid",
        COALESCE(SUM(CASE WHEN r.status != 'PAID' THEN r.net_payable ELSE 0 END), 0) AS "totalOutstanding"
      FROM ${authors} a
      LEFT JOIN ${royaltyLedger} r ON r.author_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id, a.legal_name
      ORDER BY a.legal_name
    `);

    return { data: result };
  });
}
