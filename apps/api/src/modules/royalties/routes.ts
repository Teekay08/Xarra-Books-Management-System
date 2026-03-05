import type { FastifyInstance } from 'fastify';
import { eq, sql, and, desc, inArray, not, gte, lte, or } from 'drizzle-orm';
import {
  royaltyLedger, authorContracts, saleRecords, authors,
  authorPayments, authorPaymentLines,
} from '@xarra/db';
import {
  paginationSchema,
  createAuthorPaymentRunSchema,
  processAuthorPaymentSchema,
} from '@xarra/shared';
import { roundAmount } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { logAudit } from '../../middleware/audit.js';

// ==========================================
// HELPERS
// ==========================================

/** Generate next author payment number: APAY-YYYY-NNNN */
async function generateAuthorPaymentNumber(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `APAY-${year}-`;

  const result = await db.execute(sql`
    SELECT number FROM author_payments
    WHERE number LIKE ${prefix + '%'}
    ORDER BY number DESC LIMIT 1
  `);

  let seq = 1;
  if (result.length > 0) {
    const last = result[0].number as string;
    const lastSeq = parseInt(last.split('-').pop() ?? '0', 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Compute next payment due date based on frequency and last payment */
function computeNextPaymentDue(
  frequency: string,
  contractStartDate: Date,
  lastPaymentPeriodTo?: Date | null,
): { periodFrom: Date; periodTo: Date; dueDate: Date } {
  const baseDate = lastPaymentPeriodTo ?? contractStartDate;

  let periodFrom: Date;
  let periodTo: Date;

  switch (frequency) {
    case 'MONTHLY': {
      periodFrom = new Date(baseDate.getFullYear(), baseDate.getMonth() + (lastPaymentPeriodTo ? 1 : 0), 1);
      periodTo = new Date(periodFrom.getFullYear(), periodFrom.getMonth() + 1, 0);
      break;
    }
    case 'QUARTERLY': {
      const startMonth = lastPaymentPeriodTo
        ? baseDate.getMonth() + 1
        : Math.floor(baseDate.getMonth() / 3) * 3;
      periodFrom = new Date(baseDate.getFullYear(), startMonth, 1);
      periodTo = new Date(periodFrom.getFullYear(), periodFrom.getMonth() + 3, 0);
      break;
    }
    case 'SEMI_ANNUAL': {
      const startMonth = lastPaymentPeriodTo
        ? baseDate.getMonth() + 1
        : Math.floor(baseDate.getMonth() / 6) * 6;
      periodFrom = new Date(baseDate.getFullYear(), startMonth, 1);
      periodTo = new Date(periodFrom.getFullYear(), periodFrom.getMonth() + 6, 0);
      break;
    }
    case 'ANNUAL': {
      const startMonth = lastPaymentPeriodTo ? baseDate.getMonth() + 1 : 0;
      const startYear = lastPaymentPeriodTo && startMonth > 11
        ? baseDate.getFullYear() + 1
        : baseDate.getFullYear();
      periodFrom = new Date(startYear, startMonth > 11 ? 0 : startMonth, 1);
      periodTo = new Date(periodFrom.getFullYear(), periodFrom.getMonth() + 12, 0);
      break;
    }
    default: {
      const sm = lastPaymentPeriodTo
        ? baseDate.getMonth() + 1
        : Math.floor(baseDate.getMonth() / 3) * 3;
      periodFrom = new Date(baseDate.getFullYear(), sm, 1);
      periodTo = new Date(periodFrom.getFullYear(), periodFrom.getMonth() + 3, 0);
    }
  }

  // Due date is 30 days after period end
  const dueDate = new Date(periodTo);
  dueDate.setDate(dueDate.getDate() + 30);

  return { periodFrom, periodTo, dueDate };
}

export async function royaltyRoutes(app: FastifyInstance) {

  // ==========================================
  // LIST ROYALTY ENTRIES (paginated)
  // ==========================================
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const filterAuthorId = (request.query as any).authorId;
    const filterStatus = (request.query as any).status;

    let whereClause = sql`1=1`;
    if (filterAuthorId) whereClause = sql`${whereClause} AND ${royaltyLedger.authorId} = ${filterAuthorId}`;
    if (filterStatus) whereClause = sql`${whereClause} AND ${royaltyLedger.status} = ${filterStatus}`;

    const [items, countResult] = await Promise.all([
      app.db.query.royaltyLedger.findMany({
        where: () => whereClause,
        with: { author: true, title: true, authorPayment: true },
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(royaltyLedger).where(whereClause),
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

  // ==========================================
  // CALCULATE ROYALTIES for a contract + period
  // ==========================================
  app.post('/calculate', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const { contractId, periodFrom, periodTo } = request.body as {
      contractId: string;
      periodFrom: string;
      periodTo: string;
    };

    const contract = await app.db.query.authorContracts.findFirst({
      where: eq(authorContracts.id, contractId),
      with: { author: true, title: true },
    });
    if (!contract) return reply.notFound('Contract not found');

    const from = new Date(periodFrom);
    const to = new Date(periodTo);

    // ===== SAFEGUARD: Check for overlapping periods =====
    const overlappingEntry = await app.db.execute(sql`
      SELECT id, period_from, period_to, status FROM royalty_ledger
      WHERE contract_id = ${contractId}
        AND status != 'VOIDED'
        AND (
          (period_from <= ${to.toISOString()} AND period_to >= ${from.toISOString()})
        )
      LIMIT 1
    `);
    if (overlappingEntry.length > 0) {
      const existing = overlappingEntry[0] as any;
      return reply.badRequest(
        `Royalty already calculated for overlapping period ` +
        `${new Date(existing.period_from).toISOString().split('T')[0]} to ` +
        `${new Date(existing.period_to).toISOString().split('T')[0]} (status: ${existing.status})`
      );
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
        triggered = true;
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

    // Calculate royalty
    const royaltyRate = Number(contract.royaltyRatePrint);
    const grossRoyalty = roundAmount(totalRevenue * royaltyRate);

    // ===== SAFEGUARD: Re-read advance fresh to avoid stale data =====
    const freshContract = await app.db.query.authorContracts.findFirst({
      where: eq(authorContracts.id, contractId),
    });
    const advanceAmount = Number(freshContract!.advanceAmount);
    const advanceRecovered = Number(freshContract!.advanceRecovered);
    const advanceRemaining = Math.max(0, advanceAmount - advanceRecovered);
    const advanceDeducted = roundAmount(Math.min(grossRoyalty, advanceRemaining));
    const netPayable = roundAmount(grossRoyalty - advanceDeducted);

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
      createdBy: request.session?.user?.id,
    }).returning();

    // Update advance recovered on contract
    if (advanceDeducted > 0) {
      await app.db.update(authorContracts).set({
        advanceRecovered: String(roundAmount(advanceRecovered + advanceDeducted)),
        updatedAt: new Date(),
      }).where(eq(authorContracts.id, contractId));
    }

    await logAudit(app, request, {
      action: 'CREATE',
      entityType: 'royalty_ledger',
      entityId: entry.id,
      metadata: { contractId, periodFrom, periodTo, grossRoyalty, netPayable },
    });

    return reply.status(201).send({ data: entry });
  });

  // ==========================================
  // APPROVE royalty entry
  // ==========================================
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

    await logAudit(app, request, {
      action: 'APPROVE',
      entityType: 'royalty_ledger',
      entityId: updated.id,
      changes: { before: { status: 'CALCULATED' }, after: { status: 'APPROVED' } },
    });

    return { data: updated };
  });

  // ==========================================
  // VOID royalty entry (maintains audit trail)
  // ==========================================
  app.post<{ Params: { id: string } }>('/:id/void', {
    preHandler: requireRole('admin'),
  }, async (request, reply) => {
    const { reason } = request.body as { reason: string };
    if (!reason) return reply.badRequest('Void reason is required');

    const entry = await app.db.query.royaltyLedger.findFirst({
      where: eq(royaltyLedger.id, request.params.id),
    });
    if (!entry) return reply.notFound('Royalty entry not found');
    if (entry.status === 'PAID') return reply.badRequest('Cannot void a PAID entry — reverse the payment first');
    if (entry.status === 'VOIDED') return reply.badRequest('Entry already voided');

    // Reverse any advance deduction
    const advanceDeducted = Number(entry.advanceDeducted);
    if (advanceDeducted > 0 && entry.contractId) {
      const contract = await app.db.query.authorContracts.findFirst({
        where: eq(authorContracts.id, entry.contractId),
      });
      if (contract) {
        const newRecovered = roundAmount(Math.max(0, Number(contract.advanceRecovered) - advanceDeducted));
        await app.db.update(authorContracts).set({
          advanceRecovered: String(newRecovered),
          updatedAt: new Date(),
        }).where(eq(authorContracts.id, entry.contractId));
      }
    }

    const [updated] = await app.db.update(royaltyLedger).set({
      status: 'VOIDED',
      notes: `VOIDED: ${reason}`,
    }).where(eq(royaltyLedger.id, request.params.id)).returning();

    await logAudit(app, request, {
      action: 'VOID',
      entityType: 'royalty_ledger',
      entityId: updated.id,
      metadata: { reason },
    });

    return { data: updated };
  });

  // ==========================================
  // MARK SINGLE royalty as paid (legacy — prefer payment-run)
  // ==========================================
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

    // ===== SAFEGUARD: Check this entry hasn't already been allocated =====
    const existingAlloc = await app.db.query.authorPaymentLines.findFirst({
      where: eq(authorPaymentLines.royaltyLedgerId, request.params.id),
    });
    if (existingAlloc) {
      return reply.badRequest(`This royalty entry is already allocated to payment ${existingAlloc.paymentId}`);
    }

    const [updated] = await app.db.update(royaltyLedger).set({
      status: 'PAID',
      paidAt: new Date(),
      paymentRef,
    }).where(eq(royaltyLedger.id, request.params.id)).returning();

    await logAudit(app, request, {
      action: 'STATUS_CHANGE',
      entityType: 'royalty_ledger',
      entityId: updated.id,
      changes: { before: { status: 'APPROVED' }, after: { status: 'PAID', paymentRef } },
    });

    return { data: updated };
  });

  // ==========================================
  // PAYMENT RUN — batch pay multiple approved entries
  // ==========================================
  app.post('/payment-run', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = createAuthorPaymentRunSchema.parse(request.body);

    // ===== IDEMPOTENCY =====
    if (body.idempotencyKey) {
      const existing = await app.db.query.authorPayments.findFirst({
        where: eq(authorPayments.idempotencyKey, body.idempotencyKey),
      });
      if (existing) {
        return { data: existing, message: 'Payment run already exists (idempotent)' };
      }
    }

    // Fetch all selected ledger entries
    const entries = await app.db.query.royaltyLedger.findMany({
      where: inArray(royaltyLedger.id, body.royaltyLedgerIds),
      with: { title: true },
    });

    if (entries.length !== body.royaltyLedgerIds.length) {
      return reply.badRequest('Some royalty entries not found');
    }

    // ===== SAFEGUARD: All must belong to same author =====
    const wrongAuthor = entries.find(e => e.authorId !== body.authorId);
    if (wrongAuthor) {
      return reply.badRequest('All entries must belong to the specified author');
    }

    // ===== SAFEGUARD: All must be APPROVED =====
    const nonApproved = entries.filter(e => e.status !== 'APPROVED');
    if (nonApproved.length > 0) {
      return reply.badRequest(
        `${nonApproved.length} entry/entries are not APPROVED. Only approved entries can be paid.`
      );
    }

    // ===== SAFEGUARD: None already allocated =====
    const existingAllocations = await app.db.execute(sql`
      SELECT royalty_ledger_id FROM author_payment_lines
      WHERE royalty_ledger_id = ANY(${body.royaltyLedgerIds}::uuid[])
    `);
    if (existingAllocations.length > 0) {
      const dupeIds = existingAllocations.map((a: any) => a.royalty_ledger_id);
      return reply.badRequest(
        `${existingAllocations.length} entry/entries already allocated to another payment: ${dupeIds.join(', ')}`
      );
    }

    // ===== CALCULATE TOTALS =====
    const totalGrossRoyalty = roundAmount(entries.reduce((s, e) => s + Number(e.grossRoyalty), 0));
    const totalAdvanceDeducted = roundAmount(entries.reduce((s, e) => s + Number(e.advanceDeducted), 0));
    const totalNetPayable = roundAmount(entries.reduce((s, e) => s + Number(e.netPayable), 0));

    // ===== SAFEGUARD: Overpayment prevention =====
    const prevPaidResult = await app.db.execute(sql`
      SELECT COALESCE(SUM(amount_paid::numeric), 0) AS total
      FROM author_payments
      WHERE author_id = ${body.authorId}
        AND status IN ('COMPLETED', 'PROCESSING')
    `);
    const totalPreviouslyPaid = Number((prevPaidResult[0] as any)?.total ?? 0);

    const lifetimeGrossResult = await app.db.execute(sql`
      SELECT COALESCE(SUM(net_payable::numeric), 0) AS total
      FROM royalty_ledger
      WHERE author_id = ${body.authorId}
        AND status IN ('CALCULATED', 'APPROVED', 'PAID')
    `);
    const lifetimeNetPayable = Number((lifetimeGrossResult[0] as any)?.total ?? 0);
    const maxPayable = roundAmount(lifetimeNetPayable - totalPreviouslyPaid);

    if (totalNetPayable > maxPayable + 0.01) {
      return reply.badRequest(
        `OVERPAYMENT GUARD: Attempting to pay R ${totalNetPayable.toFixed(2)} but only ` +
        `R ${maxPayable.toFixed(2)} is available (lifetime net: R ${lifetimeNetPayable.toFixed(2)}, ` +
        `previously paid: R ${totalPreviouslyPaid.toFixed(2)})`
      );
    }

    const paymentNumber = await generateAuthorPaymentNumber(app.db);
    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);

    // Create payment record
    const [payment] = await app.db.insert(authorPayments).values({
      number: paymentNumber,
      authorId: body.authorId,
      periodFrom,
      periodTo,
      totalGrossRoyalty: String(totalGrossRoyalty),
      totalAdvanceDeducted: String(totalAdvanceDeducted),
      totalNetPayable: String(totalNetPayable),
      totalPreviouslyPaid: String(totalPreviouslyPaid),
      amountDue: String(totalNetPayable),
      status: 'PENDING',
      notes: body.notes,
      idempotencyKey: body.idempotencyKey,
      createdBy: request.session?.user?.id,
    }).returning();

    // Create line items
    const lineValues = entries.map(e => ({
      paymentId: payment.id,
      royaltyLedgerId: e.id,
      titleId: e.titleId,
      contractId: e.contractId,
      periodFrom: e.periodFrom,
      periodTo: e.periodTo,
      unitsSold: e.unitsSold,
      totalRevenue: e.totalRevenue,
      grossRoyalty: e.grossRoyalty,
      advanceDeducted: e.advanceDeducted,
      netPayable: e.netPayable,
    }));

    await app.db.insert(authorPaymentLines).values(lineValues);

    // Link ledger entries
    await app.db.update(royaltyLedger).set({
      authorPaymentId: payment.id,
    }).where(inArray(royaltyLedger.id, body.royaltyLedgerIds));

    await logAudit(app, request, {
      action: 'CREATE',
      entityType: 'author_payment',
      entityId: payment.id,
      metadata: { paymentNumber, authorId: body.authorId, entryCount: entries.length, totalNetPayable },
    });

    return reply.status(201).send({ data: payment });
  });

  // ==========================================
  // PROCESS PAYMENT — mark as completed with bank ref
  // ==========================================
  app.post<{ Params: { id: string } }>('/payments/:id/process', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = processAuthorPaymentSchema.parse(request.body);
    const payment = await app.db.query.authorPayments.findFirst({
      where: eq(authorPayments.id, request.params.id),
      with: { lines: true },
    });

    if (!payment) return reply.notFound('Author payment not found');
    if (payment.status !== 'PENDING') {
      return reply.badRequest(`Payment is ${payment.status}, only PENDING payments can be processed`);
    }

    // ===== SAFEGUARD: Duplicate bank ref check =====
    const dupeBankRef = await app.db.execute(sql`
      SELECT id FROM author_payments
      WHERE author_id = ${payment.authorId}
        AND bank_reference = ${body.bankReference}
        AND status = 'COMPLETED'
        AND id != ${payment.id}
      LIMIT 1
    `);
    if (dupeBankRef.length > 0) {
      return reply.badRequest(
        `Bank reference "${body.bankReference}" already used for a completed payment to this author. ` +
        `This may be a duplicate payment.`
      );
    }

    const now = new Date();

    const [updated] = await app.db.update(authorPayments).set({
      status: 'COMPLETED',
      paymentMethod: body.paymentMethod,
      bankReference: body.bankReference,
      amountPaid: payment.amountDue,
      paidAt: now,
      processedBy: request.session?.user?.id,
      notes: body.notes ? `${payment.notes ?? ''}\n${body.notes}`.trim() : payment.notes,
      updatedAt: now,
    }).where(eq(authorPayments.id, payment.id)).returning();

    // Mark all linked ledger entries as PAID
    const ledgerIds = payment.lines.map(l => l.royaltyLedgerId);
    if (ledgerIds.length > 0) {
      await app.db.update(royaltyLedger).set({
        status: 'PAID',
        paidAt: now,
        paymentRef: body.bankReference,
      }).where(inArray(royaltyLedger.id, ledgerIds));
    }

    await logAudit(app, request, {
      action: 'STATUS_CHANGE',
      entityType: 'author_payment',
      entityId: payment.id,
      changes: {
        before: { status: 'PENDING' },
        after: { status: 'COMPLETED', bankReference: body.bankReference, paymentMethod: body.paymentMethod },
      },
    });

    return { data: updated };
  });

  // ==========================================
  // REVERSE PAYMENT — undo a completed payment
  // ==========================================
  app.post<{ Params: { id: string } }>('/payments/:id/reverse', {
    preHandler: requireRole('admin'),
  }, async (request, reply) => {
    const { reason } = request.body as { reason: string };
    if (!reason) return reply.badRequest('Reversal reason is required');

    const payment = await app.db.query.authorPayments.findFirst({
      where: eq(authorPayments.id, request.params.id),
      with: { lines: true },
    });

    if (!payment) return reply.notFound('Author payment not found');
    if (payment.status !== 'COMPLETED') {
      return reply.badRequest('Only COMPLETED payments can be reversed');
    }

    const now = new Date();

    const [updated] = await app.db.update(authorPayments).set({
      status: 'REVERSED',
      notes: `${payment.notes ?? ''}\nREVERSED: ${reason}`.trim(),
      updatedAt: now,
    }).where(eq(authorPayments.id, payment.id)).returning();

    // Revert ledger entries to APPROVED
    const ledgerIds = payment.lines.map(l => l.royaltyLedgerId);
    if (ledgerIds.length > 0) {
      await app.db.update(royaltyLedger).set({
        status: 'APPROVED',
        paidAt: null,
        paymentRef: null,
        authorPaymentId: null,
      }).where(inArray(royaltyLedger.id, ledgerIds));
    }

    await logAudit(app, request, {
      action: 'STATUS_CHANGE',
      entityType: 'author_payment',
      entityId: payment.id,
      changes: { before: { status: 'COMPLETED' }, after: { status: 'REVERSED' } },
      metadata: { reason },
    });

    return { data: updated };
  });

  // ==========================================
  // LIST AUTHOR PAYMENTS (payment runs)
  // ==========================================
  app.get('/payments', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const filterAuthorId = (request.query as any).authorId;

    let whereClause = sql`1=1`;
    if (filterAuthorId) {
      whereClause = sql`${authorPayments.authorId} = ${filterAuthorId}`;
    }

    const [items, countResult] = await Promise.all([
      app.db.query.authorPayments.findMany({
        where: () => whereClause,
        with: { author: true, lines: { with: { title: true } } },
        orderBy: (p, { desc }) => [desc(p.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` })
        .from(authorPayments)
        .where(whereClause),
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

  // ==========================================
  // GET SINGLE AUTHOR PAYMENT (with full breakdown)
  // ==========================================
  app.get<{ Params: { id: string } }>('/payments/:id', { preHandler: requireAuth }, async (request, reply) => {
    const payment = await app.db.query.authorPayments.findFirst({
      where: eq(authorPayments.id, request.params.id),
      with: {
        author: true,
        lines: { with: { title: true, contract: true } },
        approvedByUser: true,
        processedByUser: true,
        createdByUser: true,
      },
    });

    if (!payment) return reply.notFound('Author payment not found');
    return { data: payment };
  });

  // ==========================================
  // AUTHOR BALANCE SUMMARY — complete financial picture
  // ==========================================
  app.get('/author/:authorId/balance', { preHandler: requireAuth }, async (request, reply) => {
    const { authorId } = request.params as { authorId: string };

    const author = await app.db.query.authors.findFirst({
      where: eq(authors.id, authorId),
    });
    if (!author) return reply.notFound('Author not found');

    // Lifetime royalty calculations
    const royaltySummary = await app.db.execute(sql`
      SELECT
        COUNT(*)::int AS total_entries,
        COUNT(CASE WHEN status = 'CALCULATED' THEN 1 END)::int AS calculated_count,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END)::int AS approved_count,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END)::int AS paid_count,
        COALESCE(SUM(CASE WHEN status != 'VOIDED' THEN gross_royalty::numeric ELSE 0 END), 0) AS lifetime_gross,
        COALESCE(SUM(CASE WHEN status != 'VOIDED' THEN advance_deducted::numeric ELSE 0 END), 0) AS lifetime_advance_deducted,
        COALESCE(SUM(CASE WHEN status != 'VOIDED' THEN net_payable::numeric ELSE 0 END), 0) AS lifetime_net_payable,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN net_payable::numeric ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN net_payable::numeric ELSE 0 END), 0) AS awaiting_payment,
        COALESCE(SUM(CASE WHEN status = 'CALCULATED' THEN net_payable::numeric ELSE 0 END), 0) AS pending_approval,
        COALESCE(SUM(units_sold), 0)::int AS total_units_sold,
        MIN(period_from) AS first_period,
        MAX(period_to) AS last_period
      FROM royalty_ledger
      WHERE author_id = ${authorId}
    `);

    const s = royaltySummary[0] as any;
    const lifetimeNetPayable = Number(s.lifetime_net_payable);
    const totalPaid = Number(s.total_paid);
    const balance = roundAmount(lifetimeNetPayable - totalPaid);

    // Payment history
    const paymentHistory = await app.db.execute(sql`
      SELECT
        ap.id, ap.number, ap.period_from, ap.period_to,
        ap.total_net_payable::numeric AS amount,
        ap.amount_paid::numeric AS paid,
        ap.status, ap.payment_method, ap.bank_reference,
        ap.paid_at, ap.created_at
      FROM author_payments ap
      WHERE ap.author_id = ${authorId}
      ORDER BY ap.created_at DESC
      LIMIT 20
    `);

    // Contract info with next payment due
    const contracts = await app.db.query.authorContracts.findMany({
      where: eq(authorContracts.authorId, authorId),
      with: { title: true },
    });

    const contractSchedules = await Promise.all(contracts.map(async (c) => {
      const lastPaid = await app.db.execute(sql`
        SELECT MAX(period_to) AS last_period_to
        FROM royalty_ledger
        WHERE contract_id = ${c.id} AND status = 'PAID'
      `);

      const lastPeriodTo = lastPaid[0]?.last_period_to
        ? new Date(lastPaid[0].last_period_to as string)
        : null;

      const schedule = computeNextPaymentDue(
        c.paymentFrequency ?? 'QUARTERLY',
        new Date(c.startDate),
        lastPeriodTo,
      );

      return {
        contractId: c.id,
        title: c.title.title,
        frequency: c.paymentFrequency ?? 'QUARTERLY',
        royaltyRatePrint: c.royaltyRatePrint,
        royaltyRateEbook: c.royaltyRateEbook,
        advanceAmount: c.advanceAmount,
        advanceRecovered: c.advanceRecovered,
        advanceRemaining: roundAmount(Math.max(0, Number(c.advanceAmount) - Number(c.advanceRecovered))),
        minimumPayment: c.minimumPayment ?? '100',
        lastPaidPeriodTo: lastPeriodTo?.toISOString() ?? null,
        nextPayment: {
          periodFrom: schedule.periodFrom.toISOString(),
          periodTo: schedule.periodTo.toISOString(),
          dueDate: schedule.dueDate.toISOString(),
          isOverdue: schedule.dueDate < new Date(),
        },
      };
    }));

    return {
      data: {
        author: {
          id: author.id,
          legalName: author.legalName,
          penName: author.penName,
        },
        summary: {
          lifetimeGrossRoyalty: Number(s.lifetime_gross),
          lifetimeAdvanceDeducted: Number(s.lifetime_advance_deducted),
          lifetimeNetPayable,
          totalPaid,
          awaitingPayment: Number(s.awaiting_payment),
          pendingApproval: Number(s.pending_approval),
          currentBalance: balance,
          totalUnitsSold: Number(s.total_units_sold),
          firstPeriod: s.first_period,
          lastPeriod: s.last_period,
          entryCount: {
            total: Number(s.total_entries),
            calculated: Number(s.calculated_count),
            approved: Number(s.approved_count),
            paid: Number(s.paid_count),
          },
        },
        contractSchedules,
        paymentHistory: paymentHistory.map((p: any) => ({
          id: p.id,
          number: p.number,
          periodFrom: p.period_from,
          periodTo: p.period_to,
          amount: Number(p.amount),
          paid: Number(p.paid),
          status: p.status,
          paymentMethod: p.payment_method,
          bankReference: p.bank_reference,
          paidAt: p.paid_at,
          createdAt: p.created_at,
        })),
      },
    };
  });

  // ==========================================
  // PAYMENT SCHEDULE — all authors with upcoming/overdue payments
  // ==========================================
  app.get('/payment-schedule', { preHandler: requireAuth }, async () => {
    const activeAuthors = await app.db.query.authors.findMany({
      where: eq(authors.isActive, true),
      with: { contracts: { with: { title: true } } },
    });

    const schedule = await Promise.all(activeAuthors
      .filter(a => a.contracts.length > 0)
      .map(async (author) => {
        const owedResult = await app.db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN net_payable::numeric ELSE 0 END), 0) AS awaiting,
            COALESCE(SUM(CASE WHEN status = 'CALCULATED' THEN net_payable::numeric ELSE 0 END), 0) AS pending
          FROM royalty_ledger
          WHERE author_id = ${author.id}
        `);

        const owed = owedResult[0] as any;
        const awaitingPayment = Number(owed.awaiting);
        const pendingApproval = Number(owed.pending);

        // Get next due date across all contracts
        const contractSchedules = await Promise.all(author.contracts.map(async (c) => {
          const lastPaid = await app.db.execute(sql`
            SELECT MAX(period_to) AS last_period_to
            FROM royalty_ledger
            WHERE contract_id = ${c.id} AND status = 'PAID'
          `);

          const lastPeriodTo = lastPaid[0]?.last_period_to
            ? new Date(lastPaid[0].last_period_to as string)
            : null;

          return computeNextPaymentDue(
            c.paymentFrequency ?? 'QUARTERLY',
            new Date(c.startDate),
            lastPeriodTo,
          );
        }));

        const nextDue = contractSchedules.sort((a, b) =>
          a.dueDate.getTime() - b.dueDate.getTime()
        )[0];

        return {
          authorId: author.id,
          authorName: author.penName ?? author.legalName,
          awaitingPayment,
          pendingApproval,
          totalOutstanding: roundAmount(awaitingPayment + pendingApproval),
          nextPaymentDue: nextDue?.dueDate.toISOString() ?? null,
          nextPeriodFrom: nextDue?.periodFrom.toISOString() ?? null,
          nextPeriodTo: nextDue?.periodTo.toISOString() ?? null,
          isOverdue: nextDue ? nextDue.dueDate < new Date() : false,
          contractCount: author.contracts.length,
        };
      })
    );

    // Sort: overdue first, then by due date
    schedule.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return (a.nextPaymentDue ?? '').localeCompare(b.nextPaymentDue ?? '');
    });

    return { data: schedule };
  });

  // ==========================================
  // ROYALTY SUMMARY per author
  // ==========================================
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
        COALESCE(SUM(CASE WHEN r.status != 'VOIDED' THEN r.gross_royalty::numeric ELSE 0 END), 0) AS "totalGross",
        COALESCE(SUM(CASE WHEN r.status != 'VOIDED' THEN r.advance_deducted::numeric ELSE 0 END), 0) AS "totalAdvanceDeducted",
        COALESCE(SUM(CASE WHEN r.status != 'VOIDED' THEN r.net_payable::numeric ELSE 0 END), 0) AS "totalNet",
        COALESCE(SUM(CASE WHEN r.status = 'PAID' THEN r.net_payable::numeric ELSE 0 END), 0) AS "totalPaid",
        COALESCE(SUM(CASE WHEN r.status IN ('CALCULATED', 'APPROVED') THEN r.net_payable::numeric ELSE 0 END), 0) AS "totalOutstanding"
      FROM ${authors} a
      LEFT JOIN ${royaltyLedger} r ON r.author_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id, a.legal_name
      ORDER BY a.legal_name
    `);

    return { data: result };
  });
}
