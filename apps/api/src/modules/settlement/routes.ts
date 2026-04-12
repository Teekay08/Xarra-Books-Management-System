import type { FastifyInstance } from 'fastify';
import { eq, sql, and, or, lte, gt, isNull, isNotNull, inArray, desc, asc } from 'drizzle-orm';
import {
  consignments, consignmentLines, channelPartners, partnerBranches,
  invoices, invoiceLines, creditNotes, returnsAuthorizations, returnInspectionLines,
  companySettings,
} from '@xarra/db';
import { requireRole } from '../../middleware/require-auth.js';
import { VAT_RATE, roundAmount } from '@xarra/shared';
import { nextInvoiceNumber } from '../finance/invoice-number.js';

export async function settlementRoutes(app: FastifyInstance) {

  // ==========================================
  // STATS
  // ==========================================

  app.get('/stats', { preHandler: requireRole('admin', 'finance', 'operations') }, async () => {
    const now = new Date();

    const [activeSors, expiredSors, invoicePending, invoiceIssued, overdue, paymentReceived, settled] = await Promise.all([
      // Active SORs — dispatched/delivered, not yet expired
      app.db.execute(sql`
        SELECT COUNT(*) AS count FROM consignments
        WHERE status IN ('DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN')
          AND sor_expiry_date > ${now.toISOString()}::timestamptz
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.consignment_id = consignments.id AND i.status != 'VOIDED')
      `),
      // Expired SORs — past expiry, no invoice yet
      app.db.execute(sql`
        SELECT COUNT(*) AS count FROM consignments
        WHERE status IN ('DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN')
          AND sor_expiry_date IS NOT NULL
          AND sor_expiry_date <= ${now.toISOString()}::timestamptz
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.consignment_id = consignments.id AND i.status != 'VOIDED')
      `),
      // Invoices generated (DRAFT — pending review/send)
      app.db.execute(sql`
        SELECT COUNT(*) AS count FROM invoices
        WHERE status = 'DRAFT' AND consignment_id IS NOT NULL
      `),
      // Invoices issued (ISSUED — awaiting payment)
      app.db.execute(sql`
        SELECT COUNT(*) AS count FROM invoices
        WHERE status IN ('ISSUED', 'PARTIAL') AND consignment_id IS NOT NULL
      `),
      // Overdue invoices
      app.db.execute(sql`
        SELECT COUNT(*) AS count FROM invoices
        WHERE status IN ('ISSUED', 'PARTIAL')
          AND consignment_id IS NOT NULL
          AND due_date < ${now.toISOString()}::timestamptz
      `),
      // Remittances pending review
      app.db.execute(sql`
        SELECT COUNT(*) AS count FROM remittances WHERE status = 'PENDING'
      `),
      // Settled — paid invoices from SORs this year
      app.db.execute(sql`
        SELECT COUNT(*) AS count FROM invoices
        WHERE status = 'PAID'
          AND consignment_id IS NOT NULL
          AND EXTRACT(YEAR FROM invoice_date) = ${now.getFullYear()}
      `),
    ]);

    return {
      data: {
        activeSors: Number((activeSors as any)[0]?.count ?? 0),
        expiredSors: Number((expiredSors as any)[0]?.count ?? 0),
        invoicePending: Number((invoicePending as any)[0]?.count ?? 0),
        invoiceIssued: Number((invoiceIssued as any)[0]?.count ?? 0),
        overdue: Number((overdue as any)[0]?.count ?? 0),
        paymentReceived: Number((paymentReceived as any)[0]?.count ?? 0),
        settled: Number((settled as any)[0]?.count ?? 0),
      },
    };
  });

  // ==========================================
  // SOR PERIODS
  // ==========================================

  // List SORs with settlement context
  app.get('/sors', { preHandler: requireRole('admin', 'finance', 'operations') }, async (request) => {
    const { filter = 'active', page = 1, limit = 50, search = '', partnerId } = request.query as any;
    const offset = (Number(page) - 1) * Number(limit);
    const now = new Date();

    let whereClause = `c.status NOT IN ('CLOSED', 'DRAFT')`;

    if (filter === 'active') {
      whereClause += ` AND (c.sor_expiry_date IS NULL OR c.sor_expiry_date > '${now.toISOString()}'::timestamptz)`;
      whereClause += ` AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.consignment_id = c.id AND i.status != 'VOIDED')`;
    } else if (filter === 'expired') {
      whereClause += ` AND c.sor_expiry_date IS NOT NULL AND c.sor_expiry_date <= '${now.toISOString()}'::timestamptz`;
      whereClause += ` AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.consignment_id = c.id AND i.status != 'VOIDED')`;
    } else if (filter === 'invoiced') {
      whereClause += ` AND EXISTS (SELECT 1 FROM invoices i WHERE i.consignment_id = c.id AND i.status != 'VOIDED')`;
    }

    if (search) {
      whereClause += ` AND (c.proforma_number ILIKE '%${search}%' OR cp.name ILIKE '%${search}%')`;
    }
    if (partnerId) {
      whereClause += ` AND c.partner_id = '${partnerId}'`;
    }

    const rows = await app.db.execute(sql`
      SELECT
        c.id,
        c.proforma_number AS "proformaNumber",
        c.partner_id AS "partnerId",
        cp.name AS "partnerName",
        c.branch_id AS "branchId",
        pb.name AS "branchName",
        c.status,
        c.settlement_status AS "settlementStatus",
        c.dispatch_date AS "dispatchDate",
        c.delivery_date AS "deliveryDate",
        c.sor_expiry_date AS "sorExpiryDate",
        c.invoice_id AS "invoiceId",
        c.notes,
        c.created_at AS "createdAt",
        -- Aggregate line stats
        COALESCE(SUM(cl.qty_dispatched), 0) AS "totalDispatched",
        COALESCE(SUM(cl.qty_sold), 0) AS "totalSold",
        COALESCE(SUM(cl.qty_returned), 0) AS "totalReturned",
        -- Net sellable
        COALESCE(SUM(cl.qty_dispatched - cl.qty_sold - cl.qty_returned - cl.qty_damaged), 0) AS "totalOutstanding",
        -- Estimated invoice value (sold qty × net price)
        COALESCE(SUM(cl.qty_sold * cl.unit_rrp::numeric * (1 - cl.discount_pct::numeric / 100)), 0) AS "estimatedValue",
        -- Linked invoice (if any)
        inv.number AS "invoiceNumber",
        inv.status AS "invoiceStatus",
        inv.total AS "invoiceTotal",
        inv.due_date AS "invoiceDueDate",
        -- Days left / overdue
        CASE
          WHEN c.sor_expiry_date IS NULL THEN NULL
          ELSE EXTRACT(DAY FROM (c.sor_expiry_date - NOW()))::integer
        END AS "daysUntilExpiry",
        -- Return count
        (SELECT COUNT(*) FROM returns_authorizations ra WHERE ra.consignment_id = c.id) AS "returnCount"
      FROM consignments c
      JOIN channel_partners cp ON cp.id = c.partner_id
      LEFT JOIN partner_branches pb ON pb.id = c.branch_id
      LEFT JOIN consignment_lines cl ON cl.consignment_id = c.id
      LEFT JOIN invoices inv ON inv.consignment_id = c.id AND inv.status != 'VOIDED'
      WHERE ${sql.raw(whereClause)}
      GROUP BY c.id, cp.name, pb.name, inv.number, inv.status, inv.total, inv.due_date
      ORDER BY
        CASE WHEN c.sor_expiry_date IS NULL THEN 1 ELSE 0 END,
        c.sor_expiry_date ASC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    const totalResult = await app.db.execute(sql`
      SELECT COUNT(DISTINCT c.id) AS count
      FROM consignments c
      JOIN channel_partners cp ON cp.id = c.partner_id
      WHERE ${sql.raw(whereClause)}
    `);

    return {
      data: rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number((totalResult as any)[0]?.count ?? 0),
        totalPages: Math.ceil(Number((totalResult as any)[0]?.count ?? 0) / Number(limit)),
      },
    };
  });

  // Get single SOR with full settlement timeline
  app.get<{ Params: { id: string } }>('/sors/:id', {
    preHandler: requireRole('admin', 'finance', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: {
        partner: true,
        lines: { with: { title: true } },
      },
    });
    if (!consignment) return reply.notFound('Consignment not found');

    // Load linked invoice
    const invoice = consignment.invoiceId
      ? await app.db.query.invoices.findFirst({
          where: eq(invoices.id, consignment.invoiceId),
          with: { lines: true },
        })
      : null;

    // Load returns for this SOR
    const returns = await app.db.query.returnsAuthorizations.findMany({
      where: eq(returnsAuthorizations.consignmentId, consignment.id),
      with: { lines: true },
    });

    // Load credit notes for this SOR
    const credits = await app.db.execute(sql`
      SELECT cn.id, cn.number, cn.total, cn.status, cn.created_at AS "createdAt",
             ra.number AS "raNumber"
      FROM credit_notes cn
      LEFT JOIN returns_authorizations ra ON ra.id = cn.returns_auth_id
      WHERE cn.consignment_id = ${consignment.id}
         OR cn.returns_auth_id IN (
           SELECT id FROM returns_authorizations WHERE consignment_id = ${consignment.id}
         )
    `);

    return {
      data: {
        consignment,
        invoice,
        returns,
        creditNotes: credits,
      },
    };
  });

  // Manually generate invoice from expired SOR
  app.post<{ Params: { id: string } }>('/sors/:id/generate-invoice', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const sorId = request.params.id;
    const userId = (request as any).session?.user?.id;

    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, sorId),
      with: { partner: true, lines: { with: { title: true } } },
    });
    if (!consignment) return reply.notFound('SOR not found');
    if (['CLOSED', 'DRAFT'].includes(consignment.status)) {
      return reply.badRequest('This SOR cannot be invoiced in its current status');
    }

    // Check no active invoice already exists
    const existing = await app.db.query.invoices.findFirst({
      where: and(
        eq(invoices.consignmentId, sorId),
        sql`status != 'VOIDED'`
      ),
    });
    if (existing) {
      return reply.badRequest(`Invoice ${existing.number} already exists for this SOR`);
    }

    const isTaxInclusive = true;
    let subtotal = 0;
    let totalVat = 0;
    const now = new Date();

    const lineData = consignment.lines
      .filter(l => l.qtySold > 0)
      .map((line, i) => {
        const unitPrice = roundAmount(Number(line.unitRrp) * (1 - Number(line.discountPct) / 100));
        const lineTotal = roundAmount(line.qtySold * unitPrice);
        const lineTax = roundAmount(lineTotal - lineTotal / (1 + VAT_RATE));
        const lineExVat = roundAmount(lineTotal - lineTax);
        subtotal += lineExVat;
        totalVat += lineTax;
        return {
          lineNumber: i + 1,
          titleId: line.titleId,
          description: `${(line as any).title?.title ?? 'Unknown Title'}${(line as any).title?.isbn13 ? ` (ISBN: ${(line as any).title.isbn13})` : ''}`,
          quantity: String(line.qtySold),
          unitPrice: String(unitPrice),
          discountPct: '0',
          lineTotal: String(roundAmount(lineTotal)),
          lineTax: String(roundAmount(lineTax)),
        };
      });

    if (!lineData.length) {
      return reply.badRequest('No sold quantities recorded on this SOR — nothing to invoice');
    }

    subtotal = roundAmount(subtotal);
    totalVat = roundAmount(totalVat);
    const total = roundAmount(subtotal + totalVat);

    const number = await nextInvoiceNumber(app.db as any);
    const invoiceDate = now;
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + (consignment.partner.paymentTermsDays ?? 30));

    const result = await app.db.transaction(async (tx) => {
      const [inv] = await tx.insert(invoices).values({
        number,
        partnerId: consignment.partnerId,
        branchId: consignment.branchId,
        consignmentId: sorId,
        invoiceDate,
        dueDate,
        subtotal: String(subtotal),
        vatAmount: String(totalVat),
        total: String(total),
        taxInclusive: isTaxInclusive,
        status: 'DRAFT',
        notes: `Invoice for SOR ${consignment.proformaNumber}. SOR expired ${consignment.sorExpiryDate ? new Date(consignment.sorExpiryDate).toLocaleDateString('en-ZA') : 'N/A'}.`,
        createdBy: userId,
      }).returning();

      await tx.insert(invoiceLines).values(
        lineData.map(l => ({ ...l, invoiceId: inv.id }))
      );

      // Update settlement status on SOR
      await tx.update(consignments).set({
        settlementStatus: 'INVOICE_PENDING',
        invoiceId: inv.id,
        updatedAt: now,
      }).where(eq(consignments.id, sorId));

      return inv;
    });

    return reply.status(201).send({ data: result });
  });

  // Update settlement status manually (e.g. mark overdue, mark awaiting payment)
  app.patch<{ Params: { id: string } }>('/sors/:id/settlement-status', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const { settlementStatus } = request.body as { settlementStatus: string };
    if (!settlementStatus) return reply.badRequest('settlementStatus is required');

    const [updated] = await app.db.update(consignments)
      .set({ settlementStatus: settlementStatus as any, updatedAt: new Date() })
      .where(eq(consignments.id, request.params.id))
      .returning();

    if (!updated) return reply.notFound('SOR not found');
    return { data: updated };
  });

  // ==========================================
  // RETURNS & CREDITS (financial side)
  // ==========================================

  // Returns ready for credit issuance (INSPECTED/VERIFIED but no credit note yet)
  app.get('/returns-pending-credit', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request) => {
    const { page = 1, limit = 50 } = request.query as any;
    const offset = (Number(page) - 1) * Number(limit);

    const rows = await app.db.execute(sql`
      SELECT
        ra.id,
        ra.number AS "raNumber",
        ra.status,
        ra.partner_id AS "partnerId",
        cp.name AS "partnerName",
        ra.consignment_id AS "consignmentId",
        c.proforma_number AS "sorNumber",
        ra.created_at AS "createdAt",
        ra.inspected_at AS "inspectedAt",
        -- Inspection totals
        COALESCE(SUM(ril.qty_good), 0) AS "qtyGood",
        COALESCE(SUM(ril.qty_damaged), 0) AS "qtyDamaged",
        COALESCE(SUM(ril.qty_unsaleable), 0) AS "qtyUnsaleable",
        -- Estimated credit (good + damaged, not unsaleable)
        COALESCE(SUM((ril.qty_good + ril.qty_damaged) *
          (cl.unit_rrp::numeric * (1 - cl.discount_pct::numeric / 100))), 0) AS "estimatedCredit"
      FROM returns_authorizations ra
      JOIN channel_partners cp ON cp.id = ra.partner_id
      LEFT JOIN consignments c ON c.id = ra.consignment_id
      LEFT JOIN return_inspection_lines ril ON ril.returns_auth_id = ra.id
      LEFT JOIN returns_authorization_lines ral ON ral.id = ril.returns_auth_line_id
      LEFT JOIN consignment_lines cl ON cl.consignment_id = ra.consignment_id AND cl.title_id = ril.title_id
      WHERE ra.status IN ('INSPECTED', 'VERIFIED')
        AND ra.id NOT IN (SELECT returns_auth_id FROM credit_notes WHERE returns_auth_id IS NOT NULL)
      GROUP BY ra.id, cp.name, c.proforma_number
      ORDER BY ra.inspected_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    const totalResult = await app.db.execute(sql`
      SELECT COUNT(*) AS count FROM returns_authorizations ra
      WHERE ra.status IN ('INSPECTED', 'VERIFIED')
        AND ra.id NOT IN (SELECT returns_auth_id FROM credit_notes WHERE returns_auth_id IS NOT NULL)
    `);

    return {
      data: rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number((totalResult as any)[0]?.count ?? 0),
        totalPages: Math.ceil(Number((totalResult as any)[0]?.count ?? 0) / Number(limit)),
      },
    };
  });

  // Credit notes linked to SOR returns
  app.get('/credit-notes', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request) => {
    const { page = 1, limit = 50, status, partnerId } = request.query as any;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = `cn.returns_auth_id IS NOT NULL OR cn.consignment_id IS NOT NULL`;
    if (status) whereClause = `(${whereClause}) AND cn.status = '${status}'`;
    if (partnerId) whereClause = `(${whereClause}) AND cn.partner_id = '${partnerId}'`;

    const rows = await app.db.execute(sql`
      SELECT
        cn.id,
        cn.number,
        cn.total,
        cn.status,
        cn.created_at AS "createdAt",
        cn.voided_at AS "voidedAt",
        cn.partner_id AS "partnerId",
        cp.name AS "partnerName",
        ra.number AS "raNumber",
        c.proforma_number AS "sorNumber",
        inv.number AS "invoiceNumber"
      FROM credit_notes cn
      JOIN channel_partners cp ON cp.id = cn.partner_id
      LEFT JOIN returns_authorizations ra ON ra.id = cn.returns_auth_id
      LEFT JOIN consignments c ON c.id = cn.consignment_id
      LEFT JOIN invoices inv ON inv.id = cn.invoice_id
      WHERE ${sql.raw(whereClause)}
      ORDER BY cn.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    const totalResult = await app.db.execute(sql`
      SELECT COUNT(*) AS count FROM credit_notes cn
      WHERE ${sql.raw(whereClause)}
    `);

    return {
      data: rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number((totalResult as any)[0]?.count ?? 0),
        totalPages: Math.ceil(Number((totalResult as any)[0]?.count ?? 0) / Number(limit)),
      },
    };
  });

  // ==========================================
  // SETTLED
  // ==========================================

  app.get('/settled', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request) => {
    const { page = 1, limit = 50, year, partnerId } = request.query as any;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = `inv.status = 'PAID'`;
    if (year) whereClause += ` AND EXTRACT(YEAR FROM inv.invoice_date) = ${Number(year)}`;
    if (partnerId) whereClause += ` AND inv.partner_id = '${partnerId}'`;

    const rows = await app.db.execute(sql`
      SELECT
        c.id AS "consignmentId",
        c.proforma_number AS "sorNumber",
        c.partner_id AS "partnerId",
        cp.name AS "partnerName",
        c.dispatch_date AS "dispatchDate",
        c.sor_expiry_date AS "sorExpiryDate",
        inv.number AS "invoiceNumber",
        inv.total AS "invoiceTotal",
        inv.invoice_date AS "invoiceDate",
        inv.id AS "invoiceId",
        -- Duration from dispatch to paid
        EXTRACT(DAY FROM (inv.updated_at - c.dispatch_date))::integer AS "daysToSettle",
        -- Sold vs dispatched ratio
        COALESCE(SUM(cl.qty_sold), 0) AS "totalSold",
        COALESCE(SUM(cl.qty_dispatched), 0) AS "totalDispatched",
        COALESCE(SUM(cl.qty_returned), 0) AS "totalReturned"
      FROM invoices inv
      JOIN consignments c ON c.id = inv.consignment_id
      JOIN channel_partners cp ON cp.id = inv.partner_id
      LEFT JOIN consignment_lines cl ON cl.consignment_id = c.id
      WHERE ${sql.raw(whereClause)}
      GROUP BY c.id, cp.name, inv.id
      ORDER BY inv.updated_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    const totalResult = await app.db.execute(sql`
      SELECT COUNT(*) AS count FROM invoices inv
      WHERE ${sql.raw(whereClause)}
    `);

    return {
      data: rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number((totalResult as any)[0]?.count ?? 0),
        totalPages: Math.ceil(Number((totalResult as any)[0]?.count ?? 0) / Number(limit)),
      },
    };
  });
}
