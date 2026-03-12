import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, or, isNull, sql, desc } from 'drizzle-orm';
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  partnerUsers,
  partnerOrders,
  partnerOrderLines,
  partnerReturnRequests,
  partnerReturnRequestLines,
  channelPartners,
  partnerBranches,
  titles,
  invoices,
  creditNotes,
  consignments,
  courierShipments,
  inventoryMovements,
  partnerNotifications,
  remittances,
  remittanceInvoices,
  remittanceCreditNotes,
  paymentAllocations,
  returnsAuthorizations,
  returnsAuthorizationLines,
} from '@xarra/db';
import {
  partnerLoginSchema,
  createPartnerOrderSchema,
  createPartnerReturnRequestSchema,
  createPartnerUserSchema,
  updatePartnerUserSchema,
  paginationSchema,
  VAT_RATE,
  roundAmount,
} from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { nextPartnerOrderNumber, nextPartnerReturnRequestNumber, nextCreditNoteNumber, nextReturnNumber } from '../finance/invoice-number.js';
import { createBroadcastNotification } from '../../services/notifications.js';
import { notifyPartner } from '../../services/partner-notifications.js';
import { renderSorProformaHtml } from '../../services/templates/sor-proforma.js';
import { generatePdf } from '../../services/pdf.js';

// Password hashing using Node.js built-in scrypt
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex');
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(timingSafeEqual(Buffer.from(key, 'hex'), derivedKey));
    });
  });
}

// ==========================================
// PARTNER PORTAL AUTH
// ==========================================

interface PartnerSession {
  userId: string;
  partnerId: string;
  branchId: string | null;
  role: string;
  email: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    partnerSession: PartnerSession | null;
  }
}

async function resolvePartnerSession(request: FastifyRequest): Promise<PartnerSession | null> {
  // Token from Authorization: Bearer <token> or X-Partner-Token header
  const authHeader = request.headers.authorization;
  const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)
    || request.headers['x-partner-token'] as string;
  if (!token) return null;

  try {
    // Simple base64-encoded JSON token (in production, use JWT)
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    if (!decoded.userId || !decoded.partnerId) return null;
    return decoded as PartnerSession;
  } catch {
    return null;
  }
}

function createPartnerToken(session: PartnerSession): string {
  return Buffer.from(JSON.stringify(session)).toString('base64url');
}

async function requirePartnerAuth(request: FastifyRequest, reply: FastifyReply) {
  const session = await resolvePartnerSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Partner authentication required' });
  }
  request.partnerSession = session;
}

async function requirePartnerAdmin(request: FastifyRequest, reply: FastifyReply) {
  const session = await resolvePartnerSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Partner authentication required' });
  }
  if (session.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Partner admin access required' });
  }
  request.partnerSession = session;
}

export async function partnerPortalRoutes(app: FastifyInstance) {
  // Decorate request
  app.decorateRequest('partnerSession', null);

  // ==========================================
  // AUTH ENDPOINTS
  // ==========================================

  // Partner login
  app.post('/auth/login', async (request, reply) => {
    const { email, password } = partnerLoginSchema.parse(request.body);

    const user = await app.db.query.partnerUsers.findFirst({
      where: eq(partnerUsers.email, email),
      with: { partner: true, branch: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Update last login
    await app.db.update(partnerUsers).set({ lastLoginAt: new Date() }).where(eq(partnerUsers.id, user.id));

    const session: PartnerSession = {
      userId: user.id,
      partnerId: user.partnerId,
      branchId: user.branchId,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    const token = createPartnerToken(session);

    reply.send({
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            partnerId: user.partnerId,
            partnerName: user.partner?.name,
            branchId: user.branchId,
            branchName: user.branch?.name,
          },
        },
      });
  });

  // Partner logout (client just discards the token)
  app.post('/auth/logout', async (_request, reply) => {
    reply.send({ message: 'Logged out' });
  });

  // Get current partner session
  app.get('/auth/me', { preHandler: requirePartnerAuth }, async (request) => {
    const user = await app.db.query.partnerUsers.findFirst({
      where: eq(partnerUsers.id, request.partnerSession!.userId),
      with: { partner: true, branch: true },
    });

    return {
      data: {
        id: user!.id,
        name: user!.name,
        email: user!.email,
        role: user!.role,
        partnerId: user!.partnerId,
        partnerName: user!.partner?.name,
        branchId: user!.branchId,
        branchName: user!.branch?.name,
      },
    };
  });

  // ==========================================
  // DASHBOARD STATS
  // ==========================================

  app.get('/dashboard/stats', { preHandler: requirePartnerAuth }, async (request) => {
    const session = request.partnerSession!;
    const partnerId = session.partnerId;

    const [recentOrdersResult, pendingDeliveriesResult, outstandingInvoicesResult, activeReturnsResult] = await Promise.all([
      app.db.select({ count: sql<number>`count(*)` }).from(partnerOrders)
        .where(eq(partnerOrders.partnerId, partnerId)),
      app.db.select({ count: sql<number>`count(*)` }).from(partnerOrders)
        .where(and(eq(partnerOrders.partnerId, partnerId), sql`${partnerOrders.status} IN ('CONFIRMED', 'PROCESSING', 'DISPATCHED')`)),
      app.db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(and(eq(invoices.partnerId, partnerId), sql`${invoices.status} IN ('ISSUED', 'PARTIAL')`)),
      app.db.select({ count: sql<number>`count(*)` }).from(partnerReturnRequests)
        .where(and(eq(partnerReturnRequests.partnerId, partnerId), sql`${partnerReturnRequests.status} IN ('SUBMITTED', 'UNDER_REVIEW', 'AUTHORIZED', 'AWAITING_PICKUP', 'IN_TRANSIT')`)),
    ]);

    return {
      data: {
        recentOrdersCount: Number(recentOrdersResult[0].count),
        pendingDeliveries: Number(pendingDeliveriesResult[0].count),
        outstandingInvoices: Number(outstandingInvoicesResult[0].count),
        activeReturns: Number(activeReturnsResult[0].count),
      },
    };
  });

  // ==========================================
  // CATALOG (browse available titles)
  // ==========================================

  app.get('/catalog', { preHandler: requirePartnerAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${titles.title} ILIKE ${'%' + search + '%'} OR ${titles.isbn13} ILIKE ${'%' + search + '%'})`
      : undefined;

    const statusFilter = sql`${titles.status} = 'ACTIVE'`;
    const combinedWhere = where ? sql`${statusFilter} AND ${where}` : statusFilter;

    const [items, countResult] = await Promise.all([
      app.db
        .select()
        .from(titles)
        .where(combinedWhere)
        .orderBy(titles.title)
        .limit(limit)
        .offset(offset),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(titles)
        .where(combinedWhere),
    ]);

    // Get the partner's discount rate
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, request.partnerSession!.partnerId),
    });

    const discountPct = Number(partner?.discountPct ?? 0);

    // Include discounted pricing for each title
    const catalogItems = items.map((t) => {
      const rrp = Number(t.rrpZar);
      const discountedPrice = roundAmount(rrp * (1 - discountPct / 100));
      return {
        ...t,
        partnerPrice: discountedPrice,
        discountPct,
      };
    });

    return {
      data: catalogItems,
      pagination: {
        page,
        limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // ==========================================
  // ORDERS (place & track orders)
  // ==========================================

  // List orders for this partner
  app.get('/orders', { preHandler: requirePartnerAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const session = request.partnerSession!;
    const { status, branchId: filterBranchId } = request.query as Record<string, string | undefined>;

    // Branch users only see their branch's orders; HQ can optionally filter by branch
    const effectiveBranchId = session.branchId ?? filterBranchId ?? null;
    const branchFilter = effectiveBranchId
      ? and(eq(partnerOrders.partnerId, session.partnerId), eq(partnerOrders.branchId, effectiveBranchId))
      : eq(partnerOrders.partnerId, session.partnerId);
    const statusFilter = status ? and(branchFilter, eq(partnerOrders.status, status as any)) : branchFilter;
    const whereClause = statusFilter;

    const [items, countResult] = await Promise.all([
      app.db.query.partnerOrders.findMany({
        where: whereClause,
        with: { branch: true, lines: { with: { title: true } }, placedBy: true },
        orderBy: [desc(partnerOrders.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(partnerOrders).where(whereClause),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get order detail
  app.get<{ Params: { id: string } }>('/orders/:id', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const order = await app.db.query.partnerOrders.findFirst({
      where: and(eq(partnerOrders.id, request.params.id), eq(partnerOrders.partnerId, session.partnerId)),
      with: {
        partner: true,
        branch: true,
        lines: { with: { title: true } },
        placedBy: true,
      },
    });

    if (!order) return reply.notFound('Order not found');
    return { data: order };
  });

  // Place new order
  app.post('/orders', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const body = createPartnerOrderSchema.parse(request.body);
    const session = request.partnerSession!;

    // Get partner discount
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, session.partnerId),
    });
    if (!partner) return reply.badRequest('Partner not found');

    const discountPct = Number(partner.discountPct);

    // Resolve title prices
    const titleIds = body.lines.map((l) => l.titleId);
    const titleRecords = await app.db.select().from(titles).where(sql`${titles.id} IN (${sql.join(titleIds.map(id => sql`${id}`), sql`, `)})`);
    const titleMap = new Map(titleRecords.map((t) => [t.id, t]));

    // Calculate order totals
    let subtotal = 0;
    const orderLines = body.lines.map((l) => {
      const title = titleMap.get(l.titleId);
      if (!title) throw new Error(`Title ${l.titleId} not found`);

      const rrp = Number(title.rrpZar);
      const unitPrice = roundAmount(rrp * (1 - discountPct / 100));
      const lineTotal = roundAmount(unitPrice * l.quantity);
      const lineTax = roundAmount(lineTotal * VAT_RATE);
      subtotal += lineTotal;

      return {
        titleId: l.titleId,
        quantity: l.quantity,
        unitPrice: String(unitPrice),
        discountPct: String(discountPct),
        lineTotal: String(lineTotal),
        lineTax: String(lineTax),
      };
    });

    const vatAmount = roundAmount(subtotal * VAT_RATE);
    const total = roundAmount(subtotal + vatAmount);

    // Use branch from session if user is branch-level, otherwise from body
    const branchId = session.branchId || body.branchId || null;

    // Get delivery address from branch or partner
    let deliveryAddress = body.deliveryAddress;
    if (!deliveryAddress && branchId) {
      const branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, branchId),
      });
      if (branch) {
        deliveryAddress = [branch.addressLine1, branch.addressLine2, branch.city, branch.province, branch.postalCode]
          .filter(Boolean).join(', ');
      }
    }
    if (!deliveryAddress) {
      deliveryAddress = [partner.addressLine1, partner.addressLine2, partner.city, partner.province, partner.postalCode]
        .filter(Boolean).join(', ');
    }

    const number = await nextPartnerOrderNumber(app.db as any);

    // Auto-generate PO number if partner didn't provide one
    const customerPoNumber = body.customerPoNumber?.trim() || `PO-${number}`;

    const [order] = await app.db.insert(partnerOrders).values({
      number,
      customerPoNumber,
      partnerId: session.partnerId,
      branchId,
      placedById: session.userId,
      deliveryAddress,
      subtotal: String(subtotal),
      vatAmount: String(vatAmount),
      total: String(total),
      status: 'SUBMITTED',
      notes: body.notes,
    }).returning();

    await app.db.insert(partnerOrderLines).values(
      orderLines.map((l) => ({ ...l, orderId: order.id })),
    );

    // Notify Xarra staff of new partner order
    createBroadcastNotification(app, {
      type: 'PARTNER_ORDER_SUBMITTED',
      priority: 'HIGH',
      title: `New order from ${partner.name}`,
      message: `Order ${number} submitted — ${orderLines.length} line item(s), total R ${total.toFixed(2)}`,
      actionUrl: `/partners/portal-orders`,
      referenceType: 'PARTNER_ORDER',
      referenceId: order.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create order notification'));

    return reply.status(201).send({ data: order });
  });

  // Cancel own order (only DRAFT or SUBMITTED)
  app.post<{ Params: { id: string } }>('/orders/:id/cancel', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const order = await app.db.query.partnerOrders.findFirst({
      where: and(eq(partnerOrders.id, request.params.id), eq(partnerOrders.partnerId, session.partnerId)),
    });

    if (!order) return reply.notFound('Order not found');
    if (!['DRAFT', 'SUBMITTED'].includes(order.status)) {
      return reply.badRequest('Can only cancel draft or submitted orders');
    }

    await app.db.update(partnerOrders).set({
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: 'Cancelled by partner',
      updatedAt: new Date(),
    }).where(eq(partnerOrders.id, order.id));

    createBroadcastNotification(app, {
      type: 'PARTNER_ORDER_CANCELLED',
      priority: 'NORMAL',
      title: `Order cancelled by partner`,
      message: `Order ${order.number} was cancelled by ${session.name}`,
      actionUrl: `/partners/portal-orders`,
      referenceType: 'PARTNER_ORDER',
      referenceId: order.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create cancellation notification'));

    return { data: { message: 'Order cancelled' } };
  });

  // Update PO number on own order
  app.patch<{ Params: { id: string } }>('/orders/:id', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const body = request.body as { customerPoNumber?: string };

    const order = await app.db.query.partnerOrders.findFirst({
      where: and(eq(partnerOrders.id, request.params.id), eq(partnerOrders.partnerId, session.partnerId)),
    });
    if (!order) return reply.notFound('Order not found');

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.customerPoNumber !== undefined) {
      updates.customerPoNumber = body.customerPoNumber.trim() || null;
    }

    await app.db.update(partnerOrders).set(updates).where(eq(partnerOrders.id, order.id));

    const updated = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, order.id),
      with: { lines: { with: { title: true } } },
    });

    return { data: updated };
  });

  // ==========================================
  // DOCUMENTS (view invoices, statements, credit notes)
  // ==========================================

  // List invoices for this partner
  app.get('/documents/invoices', { preHandler: requirePartnerAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const session = request.partnerSession!;
    const { branchId: filterBranchId } = request.query as Record<string, string | undefined>;

    // Branch users only see their branch; HQ can optionally filter by branch
    const effectiveBranchId = session.branchId ?? filterBranchId ?? null;
    const branchFilter = effectiveBranchId
      ? and(eq(invoices.partnerId, session.partnerId), eq(invoices.branchId, effectiveBranchId))
      : eq(invoices.partnerId, session.partnerId);

    const [items, countResult] = await Promise.all([
      app.db.query.invoices.findMany({
        where: branchFilter,
        with: { lines: true },
        orderBy: [desc(invoices.invoiceDate)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(invoices).where(branchFilter),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get invoice detail (with credit notes and balance)
  app.get<{ Params: { id: string } }>('/documents/invoices/:id', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const invoice = await app.db.query.invoices.findFirst({
      where: and(eq(invoices.id, request.params.id), eq(invoices.partnerId, session.partnerId)),
      with: { lines: true, partner: true, creditNotes: true },
    });
    if (!invoice) return reply.notFound('Invoice not found');

    // Compute balance: total − credit notes − payments
    const [paidResult, creditResult] = await Promise.all([
      app.db.execute(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) AS total
        FROM payment_allocations WHERE invoice_id = ${invoice.id}
      `),
      app.db.execute(sql`
        SELECT COALESCE(SUM(total::numeric), 0) AS total
        FROM credit_notes WHERE invoice_id = ${invoice.id} AND voided_at IS NULL
      `),
    ]);
    const amountPaid = Number(paidResult[0]?.total ?? 0);
    const creditTotal = Number(creditResult[0]?.total ?? 0);
    const effectiveTotal = Math.max(0, Number(invoice.total) - creditTotal);
    const amountDue = Math.max(0, effectiveTotal - amountPaid);

    return {
      data: {
        ...invoice,
        amountPaid: String(amountPaid.toFixed(2)),
        creditNotesTotal: String(creditTotal.toFixed(2)),
        effectiveTotal: String(effectiveTotal.toFixed(2)),
        amountDue: String(amountDue.toFixed(2)),
      },
    };
  });

  // List credit notes for this partner
  app.get('/documents/credit-notes', { preHandler: requirePartnerAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const session = request.partnerSession!;

    const [items, countResult] = await Promise.all([
      app.db.query.creditNotes.findMany({
        where: eq(creditNotes.partnerId, session.partnerId),
        with: { invoice: true },
        orderBy: [desc(creditNotes.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(creditNotes).where(eq(creditNotes.partnerId, session.partnerId)),
    ]);

    // Compute consumption status for each credit note
    const data = await Promise.all(items.map(async (cn) => {
      if (cn.voidedAt) {
        return { ...cn, allocatedAmount: '0.00', availableAmount: '0.00', consumptionStatus: 'VOIDED' as const };
      }
      const appliedResult = await app.db.execute(sql`
        SELECT COALESCE(SUM(rcn.amount::numeric), 0) AS applied
        FROM remittance_credit_notes rcn
        JOIN remittances r ON r.id = rcn.remittance_id
        WHERE rcn.credit_note_id = ${cn.id}
          AND r.status IN ('APPROVED', 'MATCHED', 'UNDER_REVIEW', 'PENDING')
      `);
      const allocated = Number(appliedResult[0]?.applied ?? 0);
      const total = Number(cn.total);
      const available = roundAmount(total - allocated);
      const consumptionStatus = available <= 0 ? 'FULLY_ALLOCATED' : allocated > 0 ? 'PARTIALLY_ALLOCATED' : 'AVAILABLE';
      return { ...cn, allocatedAmount: allocated.toFixed(2), availableAmount: available.toFixed(2), consumptionStatus };
    }));

    return {
      data,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get credit note detail
  app.get<{ Params: { id: string } }>('/documents/credit-notes/:id', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const cn = await app.db.query.creditNotes.findFirst({
      where: and(eq(creditNotes.id, request.params.id), eq(creditNotes.partnerId, session.partnerId)),
      with: { invoice: true },
    });
    if (!cn) return reply.notFound('Credit note not found');
    return { data: cn };
  });

  // List consignments for this partner
  app.get('/documents/consignments', { preHandler: requirePartnerAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const session = request.partnerSession!;
    const { branchId: filterBranchId } = request.query as Record<string, string | undefined>;

    // Branch users see their branch + unassigned; HQ can optionally filter by branch
    const effectiveBranchId = session.branchId ?? filterBranchId ?? null;
    const branchFilter = effectiveBranchId
      ? and(eq(consignments.partnerId, session.partnerId), or(eq(consignments.branchId, effectiveBranchId), isNull(consignments.branchId)))
      : eq(consignments.partnerId, session.partnerId);

    const [items, countResult] = await Promise.all([
      app.db.query.consignments.findMany({
        where: branchFilter,
        with: { lines: { with: { title: true } } },
        orderBy: [desc(consignments.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(consignments).where(branchFilter),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get consignment detail
  app.get<{ Params: { id: string } }>('/documents/consignments/:id', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const consignment = await app.db.query.consignments.findFirst({
      where: and(eq(consignments.id, request.params.id), eq(consignments.partnerId, session.partnerId)),
      with: { lines: { with: { title: true } } },
    });
    if (!consignment) return reply.notFound('Consignment not found');
    return { data: consignment };
  });

  // Partner consignment proforma PDF
  app.get<{ Params: { id: string } }>('/documents/consignments/:id/proforma-pdf', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const consignment = await app.db.query.consignments.findFirst({
      where: and(eq(consignments.id, request.params.id), eq(consignments.partnerId, session.partnerId)),
      with: { partner: true, lines: { with: { title: true } } },
    });
    if (!consignment) return reply.notFound('Consignment not found');

    const settings = await app.db.query.companySettings.findFirst();

    let branch: { name: string; contactEmail: string | null } | null = null;
    if (consignment.branchId) {
      branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, consignment.branchId),
      }) as any;
    }

    const sorDays = consignment.partner.sorDays ? Number(consignment.partner.sorDays) : 90;
    let subtotal = 0;
    let totalVat = 0;

    const lines = consignment.lines.map((line, i) => {
      const unitRrp = Number(line.unitRrp);
      const discPct = Number(line.discountPct);
      const netPrice = roundAmount(unitRrp * (1 - discPct / 100));
      const lineTotal = roundAmount(line.qtyDispatched * netPrice);
      const lineTax = roundAmount(lineTotal - (lineTotal / (1 + VAT_RATE)));
      const lineExVat = roundAmount(lineTotal - lineTax);
      subtotal += lineExVat;
      totalVat += lineTax;
      return {
        lineNumber: i + 1,
        description: line.title?.title ?? 'Unknown Title',
        isbn: line.title?.isbn13 ?? null,
        quantity: line.qtyDispatched,
        unitRrp: String(unitRrp),
        discountPct: String(discPct),
        netPrice: String(netPrice),
        lineTotal: String(lineTotal),
      };
    });

    subtotal = roundAmount(subtotal);
    totalVat = roundAmount(totalVat);
    const total = roundAmount(subtotal + totalVat);

    const html = renderSorProformaHtml({
      proformaNumber: consignment.proformaNumber ?? consignment.id.slice(0, 8).toUpperCase(),
      partnerPoNumber: consignment.partnerPoNumber,
      dispatchDate: (consignment.dispatchDate ?? consignment.createdAt).toISOString(),
      sorExpiryDate: consignment.sorExpiryDate?.toISOString(),
      sorDays,
      courierCompany: consignment.courierCompany,
      courierWaybill: consignment.courierWaybill,
      company: settings ? {
        name: settings.companyName, tradingAs: settings.tradingAs, vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber, addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2, city: settings.city, province: settings.province,
        postalCode: settings.postalCode, phone: settings.phone, email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      recipient: {
        name: consignment.partner.name, branchName: branch?.name,
        contactName: consignment.partner.contactName,
        contactEmail: branch?.contactEmail ?? consignment.partner.contactEmail,
        addressLine1: consignment.partner.addressLine1, addressLine2: consignment.partner.addressLine2,
        city: consignment.partner.city, province: consignment.partner.province,
        postalCode: consignment.partner.postalCode, vatNumber: consignment.partner.vatNumber,
      },
      lines,
      subtotal: String(subtotal),
      vatAmount: String(totalVat),
      total: String(total),
      notes: consignment.notes,
    });

    const pdf = await generatePdf(html);

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${consignment.proformaNumber ?? 'SOR-Proforma'}.pdf"`)
      .send(pdf);
  });

  // ==========================================
  // REMITTANCES (HQ-only self-service)
  // ==========================================

  // List remittances for this partner
  app.get('/remittances', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    if (session.branchId) return reply.forbidden('Remittances are managed by head office');

    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const where = eq(remittances.partnerId, session.partnerId);

    const [items, countResult] = await Promise.all([
      app.db.query.remittances.findMany({
        where,
        orderBy: [desc(remittances.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(remittances).where(where),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get remittance detail
  app.get<{ Params: { id: string } }>('/remittances/:id', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    if (session.branchId) return reply.forbidden('Remittances are managed by head office');

    const remittance = await app.db.query.remittances.findFirst({
      where: and(eq(remittances.id, request.params.id), eq(remittances.partnerId, session.partnerId)),
      with: {
        invoiceAllocations: { with: { invoice: true } },
        creditNoteAllocations: { with: { creditNote: true, invoice: true } },
      },
    });
    if (!remittance) return reply.notFound('Remittance not found');
    return { data: remittance };
  });

  // Create remittance (partner self-service)
  app.post('/remittances', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    if (session.branchId) return reply.forbidden('Remittances are managed by head office');

    const body = request.body as {
      partnerRef?: string;
      totalAmount: number;
      periodFrom?: string;
      periodTo?: string;
      invoiceAllocations: { invoiceId: string; amount: number }[];
      creditNoteAllocations?: { creditNoteId: string; invoiceId: string; amount: number }[];
      notes?: string;
    };

    if (!body.invoiceAllocations?.length) {
      return reply.badRequest('At least one invoice allocation is required');
    }

    if (!body.totalAmount || body.totalAmount <= 0) {
      return reply.badRequest('A valid total amount is required');
    }

    // Validate all invoices belong to this partner
    for (const alloc of body.invoiceAllocations) {
      const inv = await app.db.query.invoices.findFirst({
        where: and(eq(invoices.id, alloc.invoiceId), eq(invoices.partnerId, session.partnerId)),
      });
      if (!inv) return reply.badRequest(`Invoice ${alloc.invoiceId} not found or not yours`);
    }

    // Validate all credit notes belong to this partner
    if (body.creditNoteAllocations?.length) {
      for (const alloc of body.creditNoteAllocations) {
        const cn = await app.db.query.creditNotes.findFirst({
          where: and(eq(creditNotes.id, alloc.creditNoteId), eq(creditNotes.partnerId, session.partnerId)),
        });
        if (!cn) return reply.badRequest(`Credit note ${alloc.creditNoteId} not found or not yours`);
        if (cn.voidedAt) return reply.badRequest(`Credit note ${cn.number} has been voided`);
      }
    }

    const result = await app.db.transaction(async (tx) => {
      const [remittance] = await tx.insert(remittances).values({
        partnerId: session.partnerId,
        partnerRef: body.partnerRef?.trim() || null,
        periodFrom: body.periodFrom ? new Date(body.periodFrom) : undefined,
        periodTo: body.periodTo ? new Date(body.periodTo) : undefined,
        totalAmount: String(body.totalAmount),
        parseMethod: 'MANUAL',
        status: 'PENDING',
        notes: body.notes?.trim() || null,
        createdBy: session.userId,
      }).returning();

      await tx.insert(remittanceInvoices).values(
        body.invoiceAllocations.map((a) => ({
          remittanceId: remittance.id,
          invoiceId: a.invoiceId,
          amount: String(a.amount),
        })),
      );

      if (body.creditNoteAllocations?.length) {
        await tx.insert(remittanceCreditNotes).values(
          body.creditNoteAllocations.map((a) => ({
            remittanceId: remittance.id,
            creditNoteId: a.creditNoteId,
            invoiceId: a.invoiceId,
            amount: String(a.amount),
          })),
        );
      }

      return remittance;
    });

    // Notify Xarra admin
    createBroadcastNotification(app, {
      type: 'SYSTEM',
      priority: 'NORMAL',
      title: 'New Remittance Submitted',
      message: `A partner submitted a remittance of R ${Number(body.totalAmount).toFixed(2)}${body.partnerRef ? ` (ref: ${body.partnerRef})` : ''}`,
      referenceType: 'REMITTANCE',
      referenceId: result.id,
      actionUrl: `/remittances/${result.id}`,
    });

    return reply.status(201).send({ data: result });
  });

  // Outstanding invoices for this partner (HQ-only)
  app.get('/invoices/outstanding', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    if (session.branchId) return reply.forbidden('Outstanding invoices are managed by head office');

    const items = await app.db.query.invoices.findMany({
      where: sql`${invoices.partnerId} = ${session.partnerId} AND ${invoices.status} IN ('ISSUED', 'PARTIAL', 'OVERDUE')`,
      orderBy: [desc(invoices.invoiceDate)],
    });

    const result = await Promise.all(items.map(async (inv) => {
      const [paidResult, creditResult] = await Promise.all([
        app.db.execute(sql`SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM payment_allocations WHERE invoice_id = ${inv.id}`),
        app.db.execute(sql`SELECT COALESCE(SUM(total::numeric), 0) AS total FROM credit_notes WHERE invoice_id = ${inv.id} AND voided_at IS NULL`),
      ]);
      const amountPaid = Number(paidResult[0]?.total ?? 0);
      const creditTotal = Number(creditResult[0]?.total ?? 0);
      const effectiveTotal = Math.max(0, roundAmount(Number(inv.total) - creditTotal));
      const amountDue = Math.max(0, roundAmount(effectiveTotal - amountPaid));
      return {
        id: inv.id,
        number: inv.number,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        status: inv.status,
        total: inv.total,
        creditNotesTotal: creditTotal.toFixed(2),
        amountPaid: amountPaid.toFixed(2),
        effectiveTotal: effectiveTotal.toFixed(2),
        amountDue: amountDue.toFixed(2),
      };
    }));

    return { data: result.filter((inv) => Number(inv.amountDue) > 0) };
  });

  // Available credit notes for this partner (HQ-only)
  app.get('/credit-notes/available', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    if (session.branchId) return reply.forbidden('Credit note allocation is managed by head office');

    const items = await app.db.query.creditNotes.findMany({
      where: sql`${creditNotes.partnerId} = ${session.partnerId} AND ${creditNotes.voidedAt} IS NULL`,
      with: { invoice: true },
      orderBy: [desc(creditNotes.createdAt)],
    });

    const result = await Promise.all(items.map(async (cn) => {
      const appliedResult = await app.db.execute(sql`
        SELECT COALESCE(SUM(rcn.amount::numeric), 0) AS applied
        FROM remittance_credit_notes rcn
        JOIN remittances r ON r.id = rcn.remittance_id
        WHERE rcn.credit_note_id = ${cn.id}
          AND r.status IN ('APPROVED', 'MATCHED', 'UNDER_REVIEW', 'PENDING')
      `);
      const applied = Number(appliedResult[0]?.applied ?? 0);
      const available = roundAmount(Number(cn.total) - applied);
      return {
        id: cn.id,
        number: cn.number,
        invoiceId: cn.invoiceId,
        invoiceNumber: cn.invoice?.number,
        total: cn.total,
        applied: applied.toFixed(2),
        available: available.toFixed(2),
        reason: cn.reason,
        createdAt: cn.createdAt,
      };
    }));

    return { data: result.filter((cn) => Number(cn.available) > 0) };
  });

  // Branch activity summary (HQ-only)
  app.get('/branches/activity-summary', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    if (session.branchId) return reply.forbidden('Branch activity is only available for head office');

    const branches = await app.db.query.partnerBranches.findMany({
      where: and(eq(partnerBranches.partnerId, session.partnerId), eq(partnerBranches.isActive, true)),
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const result = await Promise.all(branches.map(async (branch) => {
      const [orderCount, returnCount, lastOrder] = await Promise.all([
        app.db.execute(sql`
          SELECT COUNT(*) AS count FROM partner_orders
          WHERE partner_id = ${session.partnerId} AND branch_id = ${branch.id}
            AND created_at >= ${thirtyDaysAgo}
        `),
        app.db.execute(sql`
          SELECT COUNT(*) AS count FROM partner_return_requests
          WHERE partner_id = ${session.partnerId} AND branch_id = ${branch.id}
            AND status IN ('SUBMITTED', 'UNDER_REVIEW', 'AUTHORIZED', 'AWAITING_PICKUP', 'IN_TRANSIT')
        `),
        app.db.execute(sql`
          SELECT MAX(created_at) AS last_date FROM partner_orders
          WHERE partner_id = ${session.partnerId} AND branch_id = ${branch.id}
        `),
      ]);

      return {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        ordersLast30Days: Number(orderCount[0]?.count ?? 0),
        pendingReturns: Number(returnCount[0]?.count ?? 0),
        lastOrderDate: lastOrder[0]?.last_date ?? null,
      };
    }));

    return { data: result };
  });

  // ==========================================
  // RETURN REQUESTS
  // ==========================================

  // List return requests
  app.get('/returns', { preHandler: requirePartnerAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const session = request.partnerSession!;
    const { branchId: filterBranchId } = request.query as Record<string, string | undefined>;

    // Branch users only see their branch; HQ can optionally filter by branch
    const effectiveBranchId = session.branchId ?? filterBranchId ?? null;
    const branchFilter = effectiveBranchId
      ? and(eq(partnerReturnRequests.partnerId, session.partnerId), eq(partnerReturnRequests.branchId, effectiveBranchId))
      : eq(partnerReturnRequests.partnerId, session.partnerId);

    const [items, countResult] = await Promise.all([
      app.db.query.partnerReturnRequests.findMany({
        where: branchFilter,
        with: { lines: { with: { title: true } }, requestedBy: true },
        orderBy: [desc(partnerReturnRequests.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(partnerReturnRequests).where(branchFilter),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get return request detail
  app.get<{ Params: { id: string } }>('/returns/:id', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const rr = await app.db.query.partnerReturnRequests.findFirst({
      where: and(eq(partnerReturnRequests.id, request.params.id), eq(partnerReturnRequests.partnerId, session.partnerId)),
      with: { lines: { with: { title: true } }, requestedBy: true, reviewedBy: true },
    });
    if (!rr) return reply.notFound('Return request not found');
    return { data: rr };
  });

  // Submit new return request
  app.post('/returns', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const body = createPartnerReturnRequestSchema.parse(request.body);
    const session = request.partnerSession!;

    // Prevent duplicate submissions: check for existing return on same consignment within last 60 seconds
    if (body.consignmentId) {
      const recentDuplicate = await app.db.query.partnerReturnRequests.findFirst({
        where: and(
          eq(partnerReturnRequests.partnerId, session.partnerId),
          eq(partnerReturnRequests.consignmentId, body.consignmentId),
          sql`${partnerReturnRequests.createdAt} > NOW() - INTERVAL '60 seconds'`,
        ),
      });
      if (recentDuplicate) {
        return reply.status(409).send({ error: 'A return request for this consignment was just submitted. Please check your returns list.' });
      }
    }

    const branchId = session.branchId || body.branchId || null;
    const number = await nextPartnerReturnRequestNumber(app.db as any);

    const [rr] = await app.db.insert(partnerReturnRequests).values({
      number,
      partnerId: session.partnerId,
      branchId,
      requestedById: session.userId,
      consignmentId: body.consignmentId,
      reason: body.reason,
      status: 'SUBMITTED',
      notes: body.notes,
    }).returning();

    await app.db.insert(partnerReturnRequestLines).values(
      body.lines.map((l) => ({
        returnRequestId: rr.id,
        titleId: l.titleId,
        quantity: l.quantity,
        condition: l.condition,
        reason: l.reason,
      })),
    );

    // Notify Xarra staff of return request
    const returnPartner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, session.partnerId),
    });
    createBroadcastNotification(app, {
      type: 'PARTNER_RETURN_SUBMITTED',
      priority: 'HIGH',
      title: `Return request from ${returnPartner?.name ?? 'Partner'}`,
      message: `Return ${number} submitted — ${body.lines.length} item(s). Reason: ${body.reason}`,
      actionUrl: `/partners/return-requests`,
      referenceType: 'RETURN_REQUEST',
      referenceId: rr.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create return notification'));

    return reply.status(201).send({ data: rr });
  });

  // ==========================================
  // COURIER TRACKING (partner can view delivery status)
  // ==========================================

  app.get('/shipments', { preHandler: requirePartnerAuth }, async (request) => {
    const session = request.partnerSession!;

    // Get shipments from courier_shipments table
    const dbShipments = await app.db
      .select()
      .from(courierShipments)
      .where(sql`${courierShipments.partnerOrderId} IN (
        SELECT id FROM partner_orders WHERE partner_id = ${session.partnerId}
      )`)
      .orderBy(desc(courierShipments.createdAt));

    // Also include orders with courier info that don't have a courierShipments record
    const existingOrderIds = new Set(dbShipments.map(s => s.partnerOrderId).filter(Boolean));
    const ordersWithCourier = await app.db.query.partnerOrders.findMany({
      where: and(
        eq(partnerOrders.partnerId, session.partnerId),
        sql`${partnerOrders.courierWaybill} IS NOT NULL`,
      ),
    });

    const fallbackShipments = ordersWithCourier
      .filter(o => !existingOrderIds.has(o.id))
      .map(o => ({
        id: `order-${o.id}`,
        courierCompany: o.courierCompany ?? 'Unknown',
        waybillNumber: o.courierWaybill ?? '',
        trackingUrl: o.courierTrackingUrl ?? null,
        partnerOrderId: o.id,
        consignmentId: null,
        returnRequestId: null,
        status: o.status === 'DELIVERED' ? 'DELIVERED' : 'IN_TRANSIT',
        estimatedDelivery: null,
        deliveredAt: o.deliveredAt?.toISOString() ?? null,
        deliverySignedBy: null,
        createdAt: o.dispatchedAt?.toISOString() ?? o.createdAt.toISOString(),
      }));

    return { data: [...dbShipments, ...fallbackShipments] };
  });

  app.get<{ Params: { id: string } }>('/shipments/:id', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const shipment = await app.db.query.courierShipments.findFirst({
      where: eq(courierShipments.id, request.params.id),
    });
    if (!shipment) return reply.notFound('Shipment not found');
    return { data: shipment };
  });

  // ==========================================
  // PARTNER BRANCHES (for HQ-level users)
  // ==========================================

  app.get('/branches', { preHandler: requirePartnerAuth }, async (request) => {
    const session = request.partnerSession!;

    const branches = await app.db
      .select()
      .from(partnerBranches)
      .where(eq(partnerBranches.partnerId, session.partnerId))
      .orderBy(partnerBranches.name);

    return { data: branches };
  });

  // ==========================================
  // ACCOUNT (partner views own info, changes password)
  // ==========================================

  app.get('/account/partner', { preHandler: requirePartnerAuth }, async (request) => {
    const session = request.partnerSession!;
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, session.partnerId),
    });

    if (!partner) return { data: null };

    const address = [partner.addressLine1, partner.addressLine2, partner.city, partner.province, partner.postalCode]
      .filter(Boolean).join(', ');

    return {
      data: {
        id: partner.id,
        name: partner.name,
        contactEmail: partner.contactEmail ?? '',
        contactPhone: partner.contactPhone ?? '',
        address,
        discountRate: Number(partner.discountPct ?? 0),
        paymentTerms: partner.paymentTermsDays ?? 30,
        sorDays: partner.sorDays ?? 90,
      },
    };
  });

  app.get('/account/branches', { preHandler: requirePartnerAuth }, async (request) => {
    const session = request.partnerSession!;
    const branchRows = await app.db
      .select()
      .from(partnerBranches)
      .where(eq(partnerBranches.partnerId, session.partnerId))
      .orderBy(partnerBranches.name);

    return {
      data: branchRows.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code ?? '',
        city: b.city ?? '',
        contact: b.contactName ?? '',
      })),
    };
  });

  app.post('/account/change-password', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;
    const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return reply.badRequest('New password must be at least 8 characters');
    }

    const user = await app.db.query.partnerUsers.findFirst({
      where: eq(partnerUsers.id, session.userId),
    });
    if (!user) return reply.notFound('User not found');

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) return reply.badRequest('Current password is incorrect');

    const newHash = await hashPassword(newPassword);
    await app.db.update(partnerUsers).set({
      passwordHash: newHash,
      updatedAt: new Date(),
    }).where(eq(partnerUsers.id, session.userId));

    return { data: { message: 'Password changed successfully' } };
  });

  // ==========================================
  // PARTNER NOTIFICATIONS
  // ==========================================

  // Unread notification count
  app.get('/notifications/count', { preHandler: requirePartnerAuth }, async (request) => {
    const session = request.partnerSession!;

    const result = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(partnerNotifications)
      .where(
        and(
          eq(partnerNotifications.partnerId, session.partnerId),
          or(eq(partnerNotifications.partnerUserId, session.userId), isNull(partnerNotifications.partnerUserId)),
          eq(partnerNotifications.isRead, false),
        ),
      );

    return { data: { unread: Number(result[0].count) } };
  });

  // List partner notifications (paginated)
  app.get('/notifications', { preHandler: requirePartnerAuth }, async (request) => {
    const session = request.partnerSession!;
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const filter = (request.query as any).filter as string | undefined;

    const baseWhere = and(
      eq(partnerNotifications.partnerId, session.partnerId),
      or(eq(partnerNotifications.partnerUserId, session.userId), isNull(partnerNotifications.partnerUserId)),
    );
    const where = filter === 'unread'
      ? and(baseWhere, eq(partnerNotifications.isRead, false))
      : baseWhere;

    const [items, countResult] = await Promise.all([
      app.db
        .select()
        .from(partnerNotifications)
        .where(where)
        .orderBy(desc(partnerNotifications.createdAt))
        .limit(limit)
        .offset(offset),
      app.db
        .select({ count: sql<number>`count(*)` })
        .from(partnerNotifications)
        .where(where),
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

  // Mark single notification as read
  app.patch<{ Params: { id: string } }>('/notifications/:id/read', { preHandler: requirePartnerAuth }, async (request, reply) => {
    const session = request.partnerSession!;

    const [updated] = await app.db
      .update(partnerNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(partnerNotifications.id, request.params.id),
          eq(partnerNotifications.partnerId, session.partnerId),
          or(eq(partnerNotifications.partnerUserId, session.userId), isNull(partnerNotifications.partnerUserId)),
        ),
      )
      .returning();

    if (!updated) return reply.notFound('Notification not found');
    return { data: updated };
  });

  // Mark all notifications as read
  app.post('/notifications/read-all', { preHandler: requirePartnerAuth }, async (request) => {
    const session = request.partnerSession!;

    await app.db
      .update(partnerNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(partnerNotifications.partnerId, session.partnerId),
          or(eq(partnerNotifications.partnerUserId, session.userId), isNull(partnerNotifications.partnerUserId)),
          eq(partnerNotifications.isRead, false),
        ),
      );

    return { data: { success: true } };
  });
}

// ==========================================
// ADMIN ROUTES (Xarra staff managing partner portal)
// ==========================================

export async function partnerPortalAdminRoutes(app: FastifyInstance) {
  // Manage partner portal users
  app.get('/users', { preHandler: requireRole('admin', 'operations') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`(${partnerUsers.name} ILIKE ${'%' + search + '%'} OR ${partnerUsers.email} ILIKE ${'%' + search + '%'})`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.partnerUsers.findMany({
        where: where ? () => where : undefined,
        with: { partner: true, branch: true },
        orderBy: [desc(partnerUsers.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(partnerUsers).where(where),
    ]);

    // Strip password hashes from response
    const safeItems = items.map(({ passwordHash, ...rest }) => rest);

    return {
      data: safeItems,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Create partner portal user
  app.post('/users', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const body = createPartnerUserSchema.parse(request.body);

    // Check email uniqueness
    const existing = await app.db.query.partnerUsers.findFirst({
      where: eq(partnerUsers.email, body.email),
    });
    if (existing) return reply.badRequest('Email already registered');

    const passwordHash = await hashPassword(body.password);

    const [user] = await app.db.insert(partnerUsers).values({
      partnerId: body.partnerId,
      branchId: body.branchId,
      email: body.email,
      name: body.name,
      passwordHash,
      role: body.role,
      phone: body.phone,
      isActive: body.isActive,
    }).returning();

    const { passwordHash: _, ...safeUser } = user;
    return reply.status(201).send({ data: safeUser });
  });

  // Update partner portal user
  app.patch<{ Params: { id: string } }>('/users/:id', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const body = updatePartnerUserSchema.parse(request.body);
    const values: Record<string, unknown> = { ...body, updatedAt: new Date() };

    if (body.password) {
      values.passwordHash = await hashPassword(body.password);
      delete values.password;
    } else {
      delete values.password;
    }

    const [updated] = await app.db
      .update(partnerUsers)
      .set(values)
      .where(eq(partnerUsers.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('Partner user not found');
    const { passwordHash: _, ...safeUser } = updated;
    return { data: safeUser };
  });

  // Deactivate partner user
  app.delete<{ Params: { id: string } }>('/users/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const [updated] = await app.db
      .update(partnerUsers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(partnerUsers.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('Partner user not found');
    return { data: { message: 'Partner user deactivated' } };
  });

  // ==========================================
  // ORDER MANAGEMENT (Xarra staff processing partner orders)
  // ==========================================

  // List all partner orders (admin view)
  app.get('/orders', { preHandler: requireRole('admin', 'operations', 'finance') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${partnerOrders.number} ILIKE ${'%' + search + '%'}`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.partnerOrders.findMany({
        where: where ? () => where : undefined,
        with: { partner: true, branch: true, lines: { with: { title: true } }, placedBy: true },
        orderBy: [desc(partnerOrders.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(partnerOrders).where(where),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get order detail (admin view)
  app.get<{ Params: { id: string } }>('/orders/:id', { preHandler: requireRole('admin', 'operations', 'finance') }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
      with: { partner: true, branch: true, lines: { with: { title: true } }, placedBy: true, confirmedBy: true },
    });
    if (!order) return reply.notFound('Order not found');
    return { data: order };
  });

  // Confirm order (SUBMITTED → CONFIRMED)
  app.post<{ Params: { id: string } }>('/orders/:id/confirm', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
      with: { lines: true },
    });
    if (!order) return reply.notFound('Order not found');
    if (order.status !== 'SUBMITTED') return reply.badRequest('Order must be in SUBMITTED status');

    const userId = request.session?.user?.id;

    // Confirm all line quantities (default to requested qty)
    for (const line of order.lines) {
      await app.db.update(partnerOrderLines).set({
        qtyConfirmed: line.quantity,
      }).where(eq(partnerOrderLines.id, line.id));
    }

    await app.db.update(partnerOrders).set({
      status: 'CONFIRMED',
      confirmedById: userId,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(partnerOrders.id, order.id));

    notifyPartner(app, order.partnerId, {
      type: 'ORDER_STATUS_CHANGED',
      title: `Order ${order.number} confirmed`,
      message: 'Your order has been confirmed and will be processed shortly.',
      actionUrl: `/partner/orders/${order.id}`,
      referenceType: 'PARTNER_ORDER',
      referenceId: order.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

    return { data: { message: 'Order confirmed' } };
  });

  // Move to PROCESSING
  app.post<{ Params: { id: string } }>('/orders/:id/process', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
    });
    if (!order) return reply.notFound('Order not found');
    if (order.status !== 'CONFIRMED') return reply.badRequest('Order must be confirmed first');

    await app.db.update(partnerOrders).set({
      status: 'PROCESSING',
      updatedAt: new Date(),
    }).where(eq(partnerOrders.id, order.id));

    return { data: { message: 'Order is now being processed' } };
  });

  // Mark as DISPATCHED (with courier details)
  app.post<{ Params: { id: string } }>('/orders/:id/dispatch', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
      with: { lines: true, partner: true },
    });
    if (!order) return reply.notFound('Order not found');
    if (!['CONFIRMED', 'PROCESSING'].includes(order.status)) {
      return reply.badRequest('Order must be confirmed or processing');
    }

    const body = request.body as any;

    // Update dispatched quantities and create inventory movements
    for (const line of order.lines) {
      const qtyDispatched = line.qtyConfirmed ?? line.quantity;
      await app.db.update(partnerOrderLines).set({
        qtyDispatched,
      }).where(eq(partnerOrderLines.id, line.id));

      // Deduct stock from warehouse
      if (line.titleId && qtyDispatched > 0) {
        await app.db.insert(inventoryMovements).values({
          titleId: line.titleId,
          movementType: 'CONSIGN',
          fromLocation: 'XARRA_WAREHOUSE',
          toLocation: `CONSIGNED_${order.partner.name.toUpperCase().replace(/\s+/g, '_')}`,
          quantity: qtyDispatched,
          reason: `Partner order ${order.number} dispatched`,
          referenceType: 'PARTNER_ORDER',
          referenceId: order.id,
        });
      }
    }

    await app.db.update(partnerOrders).set({
      status: 'DISPATCHED',
      courierCompany: body?.courierCompany,
      courierWaybill: body?.courierWaybill,
      courierTrackingUrl: body?.courierTrackingUrl,
      dispatchedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(partnerOrders.id, order.id));

    // Auto-create courier shipment record for partner tracking
    if (body?.courierWaybill) {
      await app.db.insert(courierShipments).values({
        courierCompany: body.courierCompany || 'FASTWAY',
        waybillNumber: body.courierWaybill,
        trackingUrl: body.courierTrackingUrl || null,
        partnerOrderId: order.id,
        status: 'IN_TRANSIT',
        createdBy: request.session?.user?.id,
      });
    }

    notifyPartner(app, order.partnerId, {
      type: 'ORDER_STATUS_CHANGED',
      title: `Order ${order.number} dispatched`,
      message: body?.courierWaybill
        ? `Your order has been dispatched. Waybill: ${body.courierWaybill}`
        : 'Your order has been dispatched.',
      actionUrl: `/partner/orders/${order.id}`,
      referenceType: 'PARTNER_ORDER',
      referenceId: order.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

    return { data: { message: 'Order dispatched, inventory updated' } };
  });

  // Mark as DELIVERED
  app.post<{ Params: { id: string } }>('/orders/:id/deliver', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
    });
    if (!order) return reply.notFound('Order not found');
    if (order.status !== 'DISPATCHED') return reply.badRequest('Order must be dispatched first');

    const body = request.body as any;

    await app.db.update(partnerOrders).set({
      status: 'DELIVERED',
      deliveredAt: new Date(),
      deliverySignedBy: body?.deliverySignedBy,
      updatedAt: new Date(),
    }).where(eq(partnerOrders.id, order.id));

    notifyPartner(app, order.partnerId, {
      type: 'ORDER_STATUS_CHANGED',
      title: `Order ${order.number} delivered`,
      message: 'Your order has been delivered.',
      actionUrl: `/partner/orders/${order.id}`,
      referenceType: 'PARTNER_ORDER',
      referenceId: order.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

    return { data: { message: 'Order marked as delivered' } };
  });

  // Cancel order (admin)
  app.post<{ Params: { id: string } }>('/orders/:id/cancel', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
    });
    if (!order) return reply.notFound('Order not found');
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      return reply.badRequest('Cannot cancel a delivered or already cancelled order');
    }

    const body = request.body as any;

    await app.db.update(partnerOrders).set({
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: body?.cancelReason || 'Cancelled by Xarra staff',
      updatedAt: new Date(),
    }).where(eq(partnerOrders.id, order.id));

    return { data: { message: 'Order cancelled' } };
  });

  // Link documents to order (consignment, invoice, quotation)
  app.patch<{ Params: { id: string } }>('/orders/:id/link', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const body = request.body as any;

    const [updated] = await app.db.update(partnerOrders).set({
      consignmentId: body.consignmentId,
      invoiceId: body.invoiceId,
      quotationId: body.quotationId,
      internalNotes: body.internalNotes,
      updatedAt: new Date(),
    }).where(eq(partnerOrders.id, request.params.id)).returning();

    if (!updated) return reply.notFound('Order not found');
    return { data: updated };
  });

  // ==========================================
  // RETURN REQUEST MANAGEMENT (Xarra staff reviewing)
  // ==========================================

  // List all return requests
  app.get('/return-requests', { preHandler: requireRole('admin', 'operations') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const where = search
      ? sql`${partnerReturnRequests.number} ILIKE ${'%' + search + '%'}`
      : undefined;

    const [items, countResult] = await Promise.all([
      app.db.query.partnerReturnRequests.findMany({
        where: where ? () => where : undefined,
        with: { partner: true, branch: true, lines: { with: { title: true } }, requestedBy: true, reviewedBy: true },
        orderBy: [desc(partnerReturnRequests.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` }).from(partnerReturnRequests).where(where),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // Get return request detail (admin view)
  app.get<{ Params: { id: string } }>('/return-requests/:id', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const rr = await app.db.query.partnerReturnRequests.findFirst({
      where: eq(partnerReturnRequests.id, request.params.id),
      with: { partner: true, branch: true, lines: { with: { title: true } }, requestedBy: true, reviewedBy: true },
    });
    if (!rr) return reply.notFound('Return request not found');
    return { data: rr };
  });

  // Review return request (authorize or reject)
  app.post<{ Params: { id: string } }>('/return-requests/:id/review', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const body = request.body as { action: 'authorize' | 'reject'; reviewNotes?: string; rejectionReason?: string };
    const rr = await app.db.query.partnerReturnRequests.findFirst({
      where: eq(partnerReturnRequests.id, request.params.id),
    });
    if (!rr) return reply.notFound('Return request not found');
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(rr.status)) {
      return reply.badRequest('Return request is not in a reviewable state');
    }

    const userId = request.session?.user?.id;

    if (body.action === 'authorize') {
      // Fetch request with lines for RA creation
      const rrWithLines = await app.db.query.partnerReturnRequests.findFirst({
        where: eq(partnerReturnRequests.id, rr.id),
        with: { lines: true },
      });

      // Generate RA number and create Return Authorization
      const raNumber = await nextReturnNumber(app.db as any);
      const [ra] = await app.db.insert(returnsAuthorizations).values({
        number: raNumber,
        partnerId: rr.partnerId,
        branchId: rr.branchId,
        consignmentId: rr.consignmentId,
        returnDate: new Date(),
        reason: rr.reason,
        status: 'AUTHORIZED',
        notes: body.reviewNotes || rr.notes,
        createdBy: userId,
      }).returning();

      // Create RA lines from partner return request lines
      if (rrWithLines?.lines && rrWithLines.lines.length > 0) {
        await app.db.insert(returnsAuthorizationLines).values(
          rrWithLines.lines.map((line: any) => ({
            returnsAuthId: ra.id,
            titleId: line.titleId,
            quantity: line.quantity,
            condition: (line.condition === 'GOOD' || line.condition === 'DAMAGED' || line.condition === 'UNSALEABLE') ? line.condition : 'GOOD',
            notes: line.reason,
          })),
        );
      }

      // Update partner return request with status and link to RA
      await app.db.update(partnerReturnRequests).set({
        status: 'AUTHORIZED',
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNotes: body.reviewNotes,
        returnsAuthorizationId: ra.id,
        updatedAt: new Date(),
      }).where(eq(partnerReturnRequests.id, rr.id));

      notifyPartner(app, rr.partnerId, {
        type: 'RETURN_STATUS_CHANGED',
        title: `Return ${rr.number} authorized`,
        message: 'Your return request has been authorized. Please arrange collection or drop-off.',
        actionUrl: '/partner/returns',
        referenceType: 'RETURN_REQUEST',
        referenceId: rr.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

      return { data: { message: 'Return request authorized', returnsAuthorizationId: ra.id, raNumber } };
    } else {
      await app.db.update(partnerReturnRequests).set({
        status: 'REJECTED',
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNotes: body.reviewNotes,
        rejectionReason: body.rejectionReason,
        updatedAt: new Date(),
      }).where(eq(partnerReturnRequests.id, rr.id));

      notifyPartner(app, rr.partnerId, {
        type: 'RETURN_STATUS_CHANGED',
        title: `Return ${rr.number} rejected`,
        message: body.rejectionReason || 'Your return request has been rejected.',
        actionUrl: '/partner/returns',
        referenceType: 'RETURN_REQUEST',
        referenceId: rr.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

      return { data: { message: 'Return request rejected' } };
    }
  });

  // Mark return as received
  app.post<{ Params: { id: string } }>('/return-requests/:id/receive', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const rr = await app.db.query.partnerReturnRequests.findFirst({
      where: eq(partnerReturnRequests.id, request.params.id),
    });
    if (!rr) return reply.notFound('Return request not found');
    if (!['AUTHORIZED', 'AWAITING_PICKUP', 'IN_TRANSIT'].includes(rr.status)) {
      return reply.badRequest('Return must be authorized or in transit');
    }

    await app.db.update(partnerReturnRequests).set({
      status: 'RECEIVED',
      receivedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(partnerReturnRequests.id, rr.id));

    notifyPartner(app, rr.partnerId, {
      type: 'RETURN_STATUS_CHANGED',
      title: `Return ${rr.number} received`,
      message: 'Your returned goods have been received at our warehouse and will be inspected.',
      actionUrl: '/partner/returns',
      referenceType: 'RETURN_REQUEST',
      referenceId: rr.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

    return { data: { message: 'Return marked as received' } };
  });

  // Inspect return and set accepted quantities
  app.post<{ Params: { id: string } }>('/return-requests/:id/inspect', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const body = request.body as { inspectionNotes?: string; lines: Array<{ lineId: string; qtyAccepted: number }> };
    const rr = await app.db.query.partnerReturnRequests.findFirst({
      where: eq(partnerReturnRequests.id, request.params.id),
      with: { lines: true },
    });
    if (!rr) return reply.notFound('Return request not found');
    if (rr.status !== 'RECEIVED') return reply.badRequest('Return must be received first');

    // Update accepted quantities per line
    for (const lineUpdate of body.lines) {
      await app.db.update(partnerReturnRequestLines).set({
        qtyAccepted: lineUpdate.qtyAccepted,
      }).where(eq(partnerReturnRequestLines.id, lineUpdate.lineId));
    }

    await app.db.update(partnerReturnRequests).set({
      status: 'INSPECTED',
      inspectedAt: new Date(),
      inspectionNotes: body.inspectionNotes,
      updatedAt: new Date(),
    }).where(eq(partnerReturnRequests.id, rr.id));

    // Create inventory movements for accepted items (add back to stock)
    const updatedRr = await app.db.query.partnerReturnRequests.findFirst({
      where: eq(partnerReturnRequests.id, rr.id),
      with: { lines: { with: { title: true } } },
    });
    if (updatedRr) {
      for (const line of updatedRr.lines) {
        const qty = line.qtyAccepted ?? 0;
        if (qty > 0) {
          await app.db.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'RETURN',
            quantity: qty,
            toLocation: 'XARRA_WAREHOUSE',
            reason: `Partner return ${rr.number} — ${line.condition} (${qty} of ${line.quantity} accepted)`,
            referenceType: 'RETURN',
            referenceId: rr.id,
          });
        }
      }
    }

    // Auto-create credit note for accepted items
    let creditNote = null;
    if (updatedRr) {
      // Find invoice via consignment or most recent invoice for partner
      let invoiceRecord = null;
      if (rr.consignmentId) {
        invoiceRecord = await app.db.query.invoices.findFirst({
          where: eq(invoices.consignmentId, rr.consignmentId),
        });
      }
      if (!invoiceRecord) {
        // Fallback: find most recent non-voided invoice for this partner
        const [latest] = await app.db.select().from(invoices)
          .where(sql`${invoices.partnerId} = ${rr.partnerId} AND ${invoices.status} != 'VOIDED'`)
          .orderBy(sql`${invoices.createdAt} DESC`)
          .limit(1);
        invoiceRecord = latest;
      }

      if (invoiceRecord) {
        const partner = await app.db.query.channelPartners.findFirst({
          where: eq(channelPartners.id, rr.partnerId),
        });
        const discountPct = Number(partner?.discountPct ?? 0);

        let subtotal = 0;
        const creditLineDescs: string[] = [];
        for (const line of updatedRr.lines) {
          const qty = line.qtyAccepted ?? 0;
          if (qty <= 0) continue;
          const rrp = Number(line.title?.rrpZar ?? 0);
          if (rrp <= 0) continue;

          const unitPrice = roundAmount(rrp * (1 - discountPct / 100));
          subtotal += roundAmount(unitPrice * qty);
          creditLineDescs.push(`${line.title?.title ?? 'Unknown'} x${qty}`);
        }

        if (subtotal > 0) {
          subtotal = roundAmount(subtotal);
          const isTaxInclusive = invoiceRecord.taxInclusive ?? false;
          const vatAmount = roundAmount(isTaxInclusive
            ? subtotal - (subtotal / (1 + VAT_RATE))
            : subtotal * VAT_RATE);
          const creditSubtotal = roundAmount(isTaxInclusive ? subtotal - vatAmount : subtotal);
          const total = roundAmount(creditSubtotal + vatAmount);

          const cnNumber = await nextCreditNoteNumber(app.db as any);
          const [cn] = await app.db.insert(creditNotes).values({
            number: cnNumber,
            invoiceId: invoiceRecord.id,
            partnerId: rr.partnerId,
            subtotal: String(creditSubtotal),
            vatAmount: String(vatAmount),
            total: String(total),
            reason: `Partner return ${rr.number} — ${creditLineDescs.join(', ')}`,
            createdBy: request.session?.user?.id,
          }).returning();
          creditNote = cn;

          // Link credit note to return request and mark as CREDIT_ISSUED
          await app.db.update(partnerReturnRequests).set({
            status: 'CREDIT_ISSUED',
            creditNoteId: cn.id,
            updatedAt: new Date(),
          }).where(eq(partnerReturnRequests.id, rr.id));
        }
      }
    }

    if (creditNote) {
      notifyPartner(app, rr.partnerId, {
        type: 'CREDIT_NOTE_ISSUED',
        title: `Credit note ${creditNote.number} issued`,
        message: `R ${Number(creditNote.total).toFixed(2)} credited for return ${rr.number}. Apply this to your next remittance.`,
        actionUrl: '/partner/credit-notes',
        referenceType: 'CREDIT_NOTE',
        referenceId: creditNote.id,
      }).catch((err) => app.log.error({ err }, 'Failed to notify partner of credit note'));

      createBroadcastNotification(app, {
        type: 'CREDIT_NOTE_CREATED',
        priority: 'NORMAL',
        title: `Credit note ${creditNote.number} auto-created`,
        message: `R ${Number(creditNote.total).toFixed(2)} for partner return ${rr.number}`,
        actionUrl: `/credit-notes/${creditNote.id}`,
        referenceType: 'CREDIT_NOTE',
        referenceId: creditNote.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create credit note notification'));
    } else {
      notifyPartner(app, rr.partnerId, {
        type: 'RETURN_STATUS_CHANGED',
        title: `Return ${rr.number} inspected`,
        message: 'Your returned goods have been inspected.',
        actionUrl: '/partner/returns',
        referenceType: 'RETURN_REQUEST',
        referenceId: rr.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));
    }

    return { data: { message: 'Return inspected', creditNoteId: creditNote?.id ?? null } };
  });

  // Link credit note to return request (manual fallback if auto-creation didn't apply)
  app.post<{ Params: { id: string } }>('/return-requests/:id/credit', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = request.body as { creditNoteId: string };
    const rr = await app.db.query.partnerReturnRequests.findFirst({
      where: eq(partnerReturnRequests.id, request.params.id),
    });
    if (!rr) return reply.notFound('Return request not found');
    if (!['INSPECTED', 'CREDIT_ISSUED'].includes(rr.status)) return reply.badRequest('Return must be inspected first');

    await app.db.update(partnerReturnRequests).set({
      status: 'CREDIT_ISSUED',
      creditNoteId: body.creditNoteId,
      updatedAt: new Date(),
    }).where(eq(partnerReturnRequests.id, rr.id));

    return { data: { message: 'Credit note linked, return complete' } };
  });

  // ==========================================
  // COURIER SHIPMENT MANAGEMENT
  // ==========================================

  // Create shipment
  app.post('/shipments', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const body = request.body as any;
    const userId = request.session?.user?.id;

    const [shipment] = await app.db.insert(courierShipments).values({
      courierCompany: body.courierCompany || 'FASTWAY',
      waybillNumber: body.waybillNumber,
      trackingUrl: body.trackingUrl,
      consignmentId: body.consignmentId,
      partnerOrderId: body.partnerOrderId,
      returnRequestId: body.returnRequestId,
      senderName: body.senderName,
      senderAddress: body.senderAddress,
      recipientName: body.recipientName,
      recipientAddress: body.recipientAddress,
      recipientPhone: body.recipientPhone,
      packageCount: body.packageCount,
      totalWeightKg: body.totalWeightKg ? String(body.totalWeightKg) : undefined,
      estimatedDelivery: body.estimatedDelivery ? new Date(body.estimatedDelivery) : undefined,
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: shipment });
  });

  // Update shipment status
  app.patch<{ Params: { id: string } }>('/shipments/:id', { preHandler: requireRole('admin', 'operations') }, async (request, reply) => {
    const body = request.body as any;

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) values.status = body.status;
    if (body.pickedUpAt) values.pickedUpAt = new Date(body.pickedUpAt);
    if (body.deliveredAt) values.deliveredAt = new Date(body.deliveredAt);
    if (body.deliverySignedBy) values.deliverySignedBy = body.deliverySignedBy;
    if (body.deliveryProofUrl) values.deliveryProofUrl = body.deliveryProofUrl;
    if (body.failureReason) values.failureReason = body.failureReason;

    const [updated] = await app.db
      .update(courierShipments)
      .set(values)
      .where(eq(courierShipments.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('Shipment not found');
    return { data: updated };
  });

  // List all shipments
  app.get('/shipments', { preHandler: requireRole('admin', 'operations') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      app.db.select().from(courierShipments).orderBy(desc(courierShipments.createdAt)).limit(limit).offset(offset),
      app.db.select({ count: sql<number>`count(*)` }).from(courierShipments),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });
}
