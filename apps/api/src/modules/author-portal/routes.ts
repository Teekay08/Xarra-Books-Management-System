import type { FastifyInstance } from 'fastify';
import { eq, sql, desc, and } from 'drizzle-orm';
import { authors, authorContracts, contractTemplates, royaltyLedger, authorPayments } from '@xarra/db';
import { paginationSchema, roundAmount } from '@xarra/shared';
import { requireRole } from '../../middleware/require-auth.js';
import { createBroadcastNotification } from '../../services/notifications.js';

async function getAuthorForUser(app: FastifyInstance, userId: string) {
  return app.db.query.authors.findFirst({
    where: eq(authors.portalUserId, userId),
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

export async function authorPortalRoutes(app: FastifyInstance) {
  // All portal routes require author role
  const preHandler = requireRole('author');

  // Dashboard summary
  app.get('/dashboard', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found. Contact administrator.');

    // Get contracts with advance info
    const contracts = await app.db.query.authorContracts.findMany({
      where: eq(authorContracts.authorId, author.id),
      with: { title: true },
    });

    // Aggregate royalty stats (excluding VOIDED)
    const stats = await app.db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN status != 'VOIDED' THEN gross_royalty::numeric ELSE 0 END), 0) AS total_earned,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN net_payable::numeric ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN status IN ('CALCULATED','APPROVED') THEN net_payable::numeric ELSE 0 END), 0) AS total_outstanding,
        COALESCE(SUM(CASE WHEN status != 'VOIDED' THEN units_sold ELSE 0 END), 0) AS total_units_sold
      FROM royalty_ledger
      WHERE author_id = ${author.id}
    `);

    const contractSummaries = contracts.map((c) => {
      const freq = (c as any).paymentFrequency || 'QUARTERLY';
      const minPay = Number((c as any).minimumPayment || 100);
      const now = new Date();
      const nextDue = computeNextPaymentDue(freq, now);

      return {
        id: c.id,
        title: c.title.title,
        titleId: c.titleId,
        royaltyRatePrint: c.royaltyRatePrint,
        royaltyRateEbook: c.royaltyRateEbook,
        advanceAmount: c.advanceAmount,
        advanceRecovered: c.advanceRecovered,
        advanceRemaining: roundAmount(Math.max(0, Number(c.advanceAmount) - Number(c.advanceRecovered))),
        isSigned: c.isSigned,
        startDate: c.startDate,
        endDate: c.endDate,
        paymentFrequency: freq,
        minimumPayment: minPay,
        nextDueDate: nextDue.dueDate.toISOString(),
        nextPeriodFrom: nextDue.periodFrom.toISOString(),
        nextPeriodTo: nextDue.periodTo.toISOString(),
        isOverdue: nextDue.dueDate < now,
      };
    });

    // Get the earliest next due date across all contracts
    const nextPaymentDue = contractSummaries
      .filter(c => !c.isOverdue)
      .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())[0]?.nextDueDate ?? null;

    const overdueCount = contractSummaries.filter(c => c.isOverdue).length;

    // Recent payments from author_payments table
    const recentPayments = await app.db.execute(sql`
      SELECT
        ap.number,
        ap.amount_paid::numeric AS amount_paid,
        ap.status,
        ap.paid_at,
        ap.period_from,
        ap.period_to
      FROM author_payments ap
      WHERE ap.author_id = ${author.id}
      ORDER BY ap.created_at DESC
      LIMIT 3
    `) as any[];

    return {
      data: {
        author: {
          id: author.id,
          legalName: author.legalName,
          penName: author.penName,
          type: author.type,
        },
        stats: {
          totalEarned: roundAmount(Number(stats[0]?.total_earned ?? 0)),
          totalPaid: roundAmount(Number(stats[0]?.total_paid ?? 0)),
          totalOutstanding: roundAmount(Number(stats[0]?.total_outstanding ?? 0)),
          totalUnitsSold: Number(stats[0]?.total_units_sold ?? 0),
          nextPaymentDue,
          overdueCount,
        },
        contracts: contractSummaries,
        recentPayments: recentPayments.map((p: any) => ({
          number: p.number,
          amountPaid: roundAmount(Number(p.amount_paid)),
          status: p.status,
          paidAt: p.paid_at,
          periodFrom: p.period_from,
          periodTo: p.period_to,
        })),
      },
    };
  });

  // Royalty ledger entries
  app.get('/royalties', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      app.db.query.royaltyLedger.findMany({
        where: eq(royaltyLedger.authorId, author.id),
        with: { title: true },
        orderBy: (r, { desc }) => [desc(r.periodTo)],
        limit,
        offset,
      }),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(royaltyLedger)
        .where(eq(royaltyLedger.authorId, author.id)),
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

  // Contracts list
  app.get('/contracts', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const contracts = await app.db.query.authorContracts.findMany({
      where: eq(authorContracts.authorId, author.id),
      with: { title: true, template: true },
    });

    return { data: contracts };
  });

  // Contract detail
  app.get<{ Params: { id: string } }>('/contracts/:id', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const contract = await app.db.query.authorContracts.findFirst({
      where: eq(authorContracts.id, request.params.id),
      with: { title: true, template: true },
    });

    if (!contract || contract.authorId !== author.id) {
      return reply.notFound('Contract not found');
    }

    // Get royalty history for this contract's title
    const royalties = await app.db.query.royaltyLedger.findMany({
      where: eq(royaltyLedger.contractId, contract.id),
      orderBy: (r, { desc }) => [desc(r.periodTo)],
      limit: 20,
    });

    // The contract terms to show: use snapshot if available, otherwise current template content
    const contractTerms = contract.contractTermsSnapshot
      ?? contract.template?.content
      ?? null;

    return {
      data: {
        ...contract,
        contractTerms,
        advanceRemaining: Math.max(0, Number(contract.advanceAmount) - Number(contract.advanceRecovered)),
        royaltyHistory: royalties,
      },
    };
  });

  // Sign contract (author accepts terms)
  app.post<{ Params: { id: string } }>('/contracts/:id/sign', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const contract = await app.db.query.authorContracts.findFirst({
      where: eq(authorContracts.id, request.params.id),
      with: { template: true },
    });

    if (!contract || contract.authorId !== author.id) {
      return reply.notFound('Contract not found');
    }

    if (contract.isSigned) {
      return reply.badRequest('Contract is already signed');
    }

    // Ensure there are terms to sign
    const terms = contract.contractTermsSnapshot ?? contract.template?.content;
    if (!terms) {
      return reply.badRequest('No contract terms available to sign');
    }

    // Get IP from request for audit trail
    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || request.ip
      || 'unknown';

    const [updated] = await app.db
      .update(authorContracts)
      .set({
        isSigned: true,
        signedAt: new Date(),
        signedByIp: ip.substring(0, 50),
        // If no snapshot yet, capture it now
        contractTermsSnapshot: contract.contractTermsSnapshot ?? terms,
        updatedAt: new Date(),
      })
      .where(eq(authorContracts.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // Payment history — from author_payments table (comprehensive payment records)
  app.get('/payments', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      app.db.execute(sql`
        SELECT
          ap.id,
          ap.number,
          ap.period_from,
          ap.period_to,
          ap.total_gross_royalty::numeric AS gross_royalty,
          ap.total_advance_deducted::numeric AS advance_deducted,
          ap.total_net_payable::numeric AS net_payable,
          ap.amount_due::numeric AS amount_due,
          ap.amount_paid::numeric AS amount_paid,
          ap.status,
          ap.payment_method,
          ap.bank_reference,
          ap.paid_at,
          ap.created_at
        FROM author_payments ap
        WHERE ap.author_id = ${author.id}
        ORDER BY ap.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      app.db.execute(sql`
        SELECT count(*)::int AS count FROM author_payments WHERE author_id = ${author.id}
      `),
    ]);

    const total = Number((countResult as any[])[0]?.count ?? 0);

    return {
      data: (items as any[]).map((p) => ({
        id: p.id,
        number: p.number,
        periodFrom: p.period_from,
        periodTo: p.period_to,
        grossRoyalty: roundAmount(Number(p.gross_royalty)),
        advanceDeducted: roundAmount(Number(p.advance_deducted)),
        netPayable: roundAmount(Number(p.net_payable)),
        amountDue: roundAmount(Number(p.amount_due)),
        amountPaid: roundAmount(Number(p.amount_paid)),
        status: p.status,
        paymentMethod: p.payment_method,
        bankReference: p.bank_reference,
        paidAt: p.paid_at,
        createdAt: p.created_at,
      })),
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Sales summary — units sold per title per channel for this author's titles
  app.get('/sales', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const { from, to } = request.query as { from?: string; to?: string };
    const fromDate = from ?? new Date(new Date().getFullYear(), 0, 1).toISOString();
    const toDate = to ?? new Date().toISOString();

    const rows = await app.db.execute(sql`
      SELECT
        t.id        AS title_id,
        t.title     AS title_name,
        sr.channel,
        SUM(sr.quantity)::int          AS units_sold,
        SUM(sr.net_revenue::numeric)   AS revenue
      FROM sale_records sr
      JOIN titles t ON t.id = sr.title_id
      JOIN author_contracts ac ON ac.title_id = t.id
      WHERE ac.author_id = ${author.id}
        AND sr.status = 'CONFIRMED'
        AND sr.sale_date >= ${fromDate}::timestamptz
        AND sr.sale_date <= ${toDate}::timestamptz
      GROUP BY t.id, t.title, sr.channel
      ORDER BY t.title, sr.channel
    `) as any[];

    // Group by title
    const titleMap = new Map<string, { titleId: string; titleName: string; channels: { channel: string; unitsSold: number; revenue: number }[]; totalUnits: number; totalRevenue: number }>();
    for (const r of rows) {
      if (!titleMap.has(r.title_id)) {
        titleMap.set(r.title_id, { titleId: r.title_id, titleName: r.title_name, channels: [], totalUnits: 0, totalRevenue: 0 });
      }
      const entry = titleMap.get(r.title_id)!;
      const units = Number(r.units_sold);
      const rev = roundAmount(Number(r.revenue));
      entry.channels.push({ channel: r.channel, unitsSold: units, revenue: rev });
      entry.totalUnits += units;
      entry.totalRevenue = roundAmount(entry.totalRevenue + rev);
    }

    return { data: [...titleMap.values()] };
  });

  // Contact Xarra — submit a message to the Xarra team
  app.post('/contact', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const { subject, message } = request.body as { subject: string; message: string };
    if (!subject?.trim() || !message?.trim()) {
      return reply.badRequest('Subject and message are required');
    }

    await createBroadcastNotification(app, {
      type: 'SYSTEM',
      priority: 'NORMAL',
      title: `Author Query: ${subject.trim()}`,
      message: `From ${author.legalName}: ${message.trim()}`,
      actionUrl: `/authors/${author.id}`,
      referenceType: 'author',
      referenceId: author.id,
    });

    return { data: { success: true } };
  });
}
