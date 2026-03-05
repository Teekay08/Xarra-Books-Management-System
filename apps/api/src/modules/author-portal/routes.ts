import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import { authors, authorContracts, royaltyLedger, titles } from '@xarra/db';
import { paginationSchema } from '@xarra/shared';
import { requireRole } from '../../middleware/require-auth.js';

async function getAuthorForUser(app: FastifyInstance, userId: string) {
  return app.db.query.authors.findFirst({
    where: eq(authors.portalUserId, userId),
  });
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

    // Aggregate royalty stats
    const stats = await app.db.execute(sql`
      SELECT
        COALESCE(SUM(gross_royalty::numeric), 0) AS total_earned,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN net_payable::numeric ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN status != 'PAID' THEN net_payable::numeric ELSE 0 END), 0) AS total_outstanding,
        COALESCE(SUM(units_sold), 0) AS total_units_sold
      FROM royalty_ledger
      WHERE author_id = ${author.id}
    `);

    const contractSummaries = contracts.map((c) => ({
      id: c.id,
      title: c.title.title,
      titleId: c.titleId,
      royaltyRatePrint: c.royaltyRatePrint,
      royaltyRateEbook: c.royaltyRateEbook,
      advanceAmount: c.advanceAmount,
      advanceRecovered: c.advanceRecovered,
      advanceRemaining: Math.max(0, Number(c.advanceAmount) - Number(c.advanceRecovered)),
      isSigned: c.isSigned,
      startDate: c.startDate,
      endDate: c.endDate,
    }));

    return {
      data: {
        author: {
          id: author.id,
          legalName: author.legalName,
          penName: author.penName,
          type: author.type,
        },
        stats: {
          totalEarned: Number(stats[0]?.total_earned ?? 0),
          totalPaid: Number(stats[0]?.total_paid ?? 0),
          totalOutstanding: Number(stats[0]?.total_outstanding ?? 0),
          totalUnitsSold: Number(stats[0]?.total_units_sold ?? 0),
        },
        contracts: contractSummaries,
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
      with: { title: true },
    });

    return { data: contracts };
  });

  // Contract detail
  app.get<{ Params: { id: string } }>('/contracts/:id', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const contract = await app.db.query.authorContracts.findFirst({
      where: eq(authorContracts.id, request.params.id),
      with: { title: true },
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

    return {
      data: {
        ...contract,
        advanceRemaining: Math.max(0, Number(contract.advanceAmount) - Number(contract.advanceRecovered)),
        royaltyHistory: royalties,
      },
    };
  });

  // Payment history (PAID entries)
  app.get('/payments', { preHandler }, async (request, reply) => {
    const author = await getAuthorForUser(app, request.session!.user.id);
    if (!author) return reply.notFound('Author profile not found');

    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const paidFilter = sql`${royaltyLedger.authorId} = ${author.id} AND ${royaltyLedger.status} = 'PAID'`;

    const [items, countResult] = await Promise.all([
      app.db.query.royaltyLedger.findMany({
        where: () => paidFilter,
        with: { title: true },
        orderBy: (r, { desc }) => [desc(r.paidAt)],
        limit,
        offset,
      }),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(royaltyLedger)
        .where(paidFilter),
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
}
