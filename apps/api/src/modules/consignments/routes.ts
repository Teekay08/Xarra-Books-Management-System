import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import {
  consignments, consignmentLines, channelPartners,
  inventoryMovements, titles, companySettings, partnerBranches,
} from '@xarra/db';
import { createConsignmentSchema, paginationSchema, VAT_RATE, roundAmount } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { createBroadcastNotification } from '../../services/notifications.js';
import { notifyPartner } from '../../services/partner-notifications.js';
import { renderSorProformaHtml } from '../../services/templates/sor-proforma.js';
import { generatePdf } from '../../services/pdf.js';
import { sendEmailWithAttachment, isEmailConfigured } from '../../services/email.js';
import { documentEmails } from '@xarra/db';

export async function consignmentRoutes(app: FastifyInstance) {
  // List consignments (paginated)
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search, sortOrder } = query;
    const offset = (page - 1) * limit;

    const items = await app.db.query.consignments.findMany({
      with: { partner: true, lines: { with: { title: true } } },
      orderBy: sortOrder === 'asc'
        ? (c, { asc }) => [asc(c.dispatchDate)]
        : (c, { desc }) => [desc(c.createdAt)],
      limit,
      offset,
    });

    const countResult = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(consignments);

    return {
      data: items,
      pagination: {
        page, limit,
        total: Number(countResult[0].count),
        totalPages: Math.ceil(Number(countResult[0].count) / limit),
      },
    };
  });

  // Get single consignment with lines
  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: { with: { title: true } } },
    });
    if (!consignment) return reply.notFound('Consignment not found');
    return { data: consignment };
  });

  // Create consignment — auto-dispatches when dispatchDate is provided
  app.post('/', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const body = createConsignmentSchema.parse(request.body);

    // Get partner for discount snapshot
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
    });
    if (!partner) return reply.notFound('Partner not found');

    // Get title RRPs for snapshot
    const titleIds = body.lines.map((l) => l.titleId);
    const titleRows = await app.db
      .select({ id: titles.id, rrpZar: titles.rrpZar })
      .from(titles)
      .where(sql`${titles.id} IN ${titleIds}`);
    const titleMap = new Map(titleRows.map((t) => [t.id, t.rrpZar]));

    // Generate proforma number (SOR-YYYY-NNNN)
    const yearStr = String(new Date().getFullYear());
    const countResult = await app.db.execute<{ count: string }>(sql`
      SELECT COUNT(*) AS count FROM consignments
      WHERE proforma_number LIKE ${'SOR-' + yearStr + '-%'}
    `);
    const nextNum = Number(countResult[0]?.count ?? 0) + 1;
    const proformaNumber = `SOR-${yearStr}-${String(nextNum).padStart(4, '0')}`;

    const userId = request.session?.user?.id;
    const shouldAutoDispatch = !!body.dispatchDate;
    const dispatchDate = body.dispatchDate ? new Date(body.dispatchDate) : undefined;

    // Calculate SOR expiry if dispatching
    const sorDays = partner.sorDays ? Number(partner.sorDays) : 90;
    const sorExpiryDate = dispatchDate ? new Date(dispatchDate) : undefined;
    if (sorExpiryDate) sorExpiryDate.setDate(sorExpiryDate.getDate() + sorDays);

    const result = await app.db.transaction(async (tx) => {
      const [con] = await tx.insert(consignments).values({
        partnerId: body.partnerId,
        proformaNumber,
        partnerPoNumber: body.partnerPoNumber,
        dispatchDate,
        sorExpiryDate,
        courierCompany: body.courierCompany,
        courierWaybill: body.courierWaybill,
        status: shouldAutoDispatch ? 'DISPATCHED' : 'DRAFT',
        notes: body.notes,
      }).returning();

      const lines = await tx.insert(consignmentLines).values(
        body.lines.map((l) => ({
          consignmentId: con.id,
          titleId: l.titleId,
          qtyDispatched: l.qtyDispatched,
          unitRrp: titleMap.get(l.titleId) ?? '0',
          discountPct: partner.discountPct,
        }))
      ).returning();

      // Auto-dispatch: create inventory movements
      if (shouldAutoDispatch) {
        for (const l of body.lines) {
          await tx.insert(inventoryMovements).values({
            titleId: l.titleId,
            movementType: 'CONSIGN',
            fromLocation: 'XARRA_WAREHOUSE',
            toLocation: `CONSIGNED_${partner.name.toUpperCase().replace(/\s+/g, '_')}`,
            quantity: l.qtyDispatched,
            referenceId: con.id,
            referenceType: 'CONSIGNMENT',
            createdBy: userId,
          });
        }
      }

      return { ...con, lines };
    });

    // Notifications for auto-dispatched consignment
    if (shouldAutoDispatch) {
      const totalQty = body.lines.reduce((sum, l) => sum + l.qtyDispatched, 0);
      createBroadcastNotification(app, {
        type: 'CONSIGNMENT_DISPATCHED',
        title: `Consignment dispatched to ${partner.name}`,
        message: `${totalQty} items dispatched to ${partner.name}. SOR expires ${sorExpiryDate!.toLocaleDateString('en-ZA')}.`,
        actionUrl: `/consignments/${result.id}`,
        referenceType: 'CONSIGNMENT',
        referenceId: result.id,
      });

      notifyPartner(app, partner.id, {
        type: 'CONSIGNMENT_DISPATCHED',
        title: `Consignment ${proformaNumber} dispatched`,
        message: `${totalQty} items have been dispatched to you. SOR period: ${sorDays} days.`,
        actionUrl: '/partner/consignments',
        referenceType: 'CONSIGNMENT',
        referenceId: result.id,
      }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));
    }

    return reply.status(201).send({ data: result });
  });

  // Dispatch consignment (DRAFT → DISPATCHED) + inventory deduction
  app.post<{ Params: { id: string } }>('/:id/dispatch', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: true },
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (consignment.status !== 'DRAFT') return reply.badRequest('Only DRAFT consignments can be dispatched');

    const userId = request.session?.user?.id;
    const dispatchDate = new Date();

    // Calculate SOR expiry from partner terms
    const sorDays = consignment.partner.sorDays ? Number(consignment.partner.sorDays) : 90;
    const sorExpiryDate = new Date(dispatchDate);
    sorExpiryDate.setDate(sorExpiryDate.getDate() + sorDays);

    await app.db.transaction(async (tx) => {
      // Update consignment status
      await tx.update(consignments).set({
        status: 'DISPATCHED',
        dispatchDate,
        sorExpiryDate,
        updatedAt: new Date(),
      }).where(eq(consignments.id, request.params.id));

      // Create inventory movements (deduction from warehouse)
      for (const line of consignment.lines) {
        await tx.insert(inventoryMovements).values({
          titleId: line.titleId,
          movementType: 'CONSIGN',
          fromLocation: 'XARRA_WAREHOUSE',
          toLocation: `CONSIGNED_${consignment.partner.name.toUpperCase().replace(/\s+/g, '_')}`,
          quantity: line.qtyDispatched,
          referenceId: consignment.id,
          referenceType: 'CONSIGNMENT',
          createdBy: userId,
        });
      }
    });

    const updated = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: { with: { title: true } } },
    });

    const totalQty = consignment.lines.reduce((sum, l) => sum + l.qtyDispatched, 0);
    createBroadcastNotification(app, {
      type: 'CONSIGNMENT_DISPATCHED',
      title: `Consignment dispatched to ${consignment.partner.name}`,
      message: `${totalQty} items dispatched to ${consignment.partner.name}. SOR expires ${sorExpiryDate.toLocaleDateString('en-ZA')}.`,
      actionUrl: `/consignments/${consignment.id}`,
      referenceType: 'CONSIGNMENT',
      referenceId: consignment.id,
    });

    // Notify partner about the consignment dispatch
    notifyPartner(app, consignment.partnerId, {
      type: 'CONSIGNMENT_DISPATCHED',
      title: 'Consignment dispatched',
      message: `${totalQty} items have been dispatched to you. SOR expires ${sorExpiryDate.toLocaleDateString('en-ZA')}.`,
      actionUrl: '/partner/consignments',
      referenceType: 'CONSIGNMENT',
      referenceId: consignment.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create partner notification'));

    return { data: updated };
  });

  // Mark as delivered
  app.post<{ Params: { id: string } }>('/:id/deliver', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (consignment.status !== 'DISPATCHED') return reply.badRequest('Only DISPATCHED consignments can be delivered');

    const [updated] = await app.db.update(consignments).set({
      status: 'DELIVERED',
      deliveryDate: new Date(),
      updatedAt: new Date(),
    }).where(eq(consignments.id, request.params.id)).returning();

    return { data: updated };
  });

  // Acknowledge consignment
  app.post<{ Params: { id: string } }>('/:id/acknowledge', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (consignment.status !== 'DELIVERED') return reply.badRequest('Only DELIVERED consignments can be acknowledged');

    const [updated] = await app.db.update(consignments).set({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(consignments.id, request.params.id)).returning();

    return { data: updated };
  });

  // Report sales against consignment lines
  app.post<{ Params: { id: string } }>('/:id/report-sales', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const { lines } = request.body as {
      lines: { lineId: string; qtySold: number; qtyReturned?: number; qtyDamaged?: number }[];
    };

    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (!['DELIVERED', 'ACKNOWLEDGED'].includes(consignment.status)) {
      return reply.badRequest('Consignment must be DELIVERED or ACKNOWLEDGED to report sales');
    }

    // Fetch existing lines to compute deltas
    const existingLines = await app.db.query.consignmentLines.findMany({
      where: eq(consignmentLines.consignmentId, consignment.id),
    });
    const prevSold = new Map(existingLines.map((l) => [l.id, l.qtySold]));

    for (const line of lines) {
      await app.db.update(consignmentLines).set({
        qtySold: line.qtySold,
        qtyReturned: line.qtyReturned ?? 0,
        qtyDamaged: line.qtyDamaged ?? 0,
      }).where(eq(consignmentLines.id, line.lineId));
    }

    // Create inventory SELL movements for newly reported sales
    for (const line of lines) {
      const existing = existingLines.find((l) => l.id === line.lineId);
      if (!existing) continue;
      const delta = line.qtySold - (prevSold.get(line.lineId) ?? 0);
      if (delta > 0) {
        await app.db.insert(inventoryMovements).values({
          titleId: existing.titleId,
          movementType: 'SELL',
          quantity: delta,
          reason: `Consignment sales reported — ${consignment.id.slice(0, 8)}`,
          referenceType: 'CONSIGNMENT',
          referenceId: consignment.id,
        });
      }
    }

    return { success: true };
  });

  // Process returns
  app.post<{ Params: { id: string } }>('/:id/process-returns', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: true },
    });
    if (!consignment) return reply.notFound('Consignment not found');

    const userId = request.session?.user?.id;
    const hasReturns = consignment.lines.some((l) => l.qtyReturned > 0 || l.qtyDamaged > 0);
    if (!hasReturns) return reply.badRequest('No returns to process');

    await app.db.transaction(async (tx) => {
      // Inventory movements for returns
      for (const line of consignment.lines) {
        const totalReturned = line.qtyReturned + line.qtyDamaged;
        if (totalReturned <= 0) continue;

        // Good returns go back to warehouse
        if (line.qtyReturned > 0) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'RETURN',
            fromLocation: `CONSIGNED_${consignment.partner.name.toUpperCase().replace(/\s+/g, '_')}`,
            toLocation: 'XARRA_WAREHOUSE',
            quantity: line.qtyReturned,
            referenceId: consignment.id,
            referenceType: 'CONSIGNMENT',
            reason: 'SOR return',
            createdBy: userId,
          });
        }

        // Damaged go to damaged location
        if (line.qtyDamaged > 0) {
          await tx.insert(inventoryMovements).values({
            titleId: line.titleId,
            movementType: 'RETURN',
            fromLocation: `CONSIGNED_${consignment.partner.name.toUpperCase().replace(/\s+/g, '_')}`,
            toLocation: 'DAMAGED',
            quantity: line.qtyDamaged,
            referenceId: consignment.id,
            referenceType: 'CONSIGNMENT',
            reason: 'Damaged return',
            createdBy: userId,
          });
        }
      }

      // Update status
      await tx.update(consignments).set({
        status: 'PARTIAL_RETURN',
        updatedAt: new Date(),
      }).where(eq(consignments.id, request.params.id));
    });

    const totalReturned = consignment.lines.reduce((s, l) => s + l.qtyReturned + l.qtyDamaged, 0);
    createBroadcastNotification(app, {
      type: 'CONSIGNMENT_RETURNS_PROCESSED',
      priority: 'NORMAL',
      title: `Consignment returns processed — ${consignment.partner.name}`,
      message: `${totalReturned} items returned (incl. damaged)`,
      actionUrl: `/consignments/${consignment.id}`,
      referenceType: 'CONSIGNMENT',
      referenceId: consignment.id,
    }).catch((err) => app.log.error({ err }, 'Failed to create consignment returns notification'));

    return { success: true };
  });

  // Reconcile and close consignment
  app.post<{ Params: { id: string } }>('/:id/reconcile', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');

    const [updated] = await app.db.update(consignments).set({
      status: 'RECONCILED',
      reconciledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(consignments.id, request.params.id)).returning();

    return { data: updated };
  });

  // Close consignment
  app.post<{ Params: { id: string } }>('/:id/close', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
    });
    if (!consignment) return reply.notFound('Consignment not found');
    if (consignment.status !== 'RECONCILED') return reply.badRequest('Only RECONCILED consignments can be closed');

    const [updated] = await app.db.update(consignments).set({
      status: 'CLOSED',
      updatedAt: new Date(),
    }).where(eq(consignments.id, request.params.id)).returning();

    return { data: updated };
  });

  // Generate SOR Pro-forma Invoice PDF
  app.get<{ Params: { id: string } }>('/:id/proforma-pdf', { preHandler: requireAuth }, async (request, reply) => {
    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: { with: { title: true } } },
    });
    if (!consignment) return reply.notFound('Consignment not found');

    const settings = await app.db.query.companySettings.findFirst();

    // Get branch info if applicable
    let branch: { name: string; contactEmail: string | null } | null = null;
    if (consignment.branchId) {
      branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, consignment.branchId),
      }) as any;
    }

    // Calculate SOR days from partner terms
    const sorDays = consignment.partner.sorDays ? Number(consignment.partner.sorDays) : 90;

    // Build line items with pricing
    const isTaxInclusive = true; // SA RRP is always tax-inclusive
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
        name: settings.companyName,
        tradingAs: settings.tradingAs,
        vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
        addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      recipient: {
        name: consignment.partner.name,
        branchName: branch?.name,
        contactName: consignment.partner.contactName,
        contactEmail: branch?.contactEmail ?? consignment.partner.contactEmail,
        addressLine1: consignment.partner.addressLine1,
        addressLine2: consignment.partner.addressLine2,
        city: consignment.partner.city,
        province: consignment.partner.province,
        postalCode: consignment.partner.postalCode,
        vatNumber: consignment.partner.vatNumber,
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

  // Send SOR pro-forma via email to partner
  app.post<{ Params: { id: string } }>('/:id/send-proforma', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    if (!isEmailConfigured()) {
      return reply.badRequest('Email service is not configured. Set RESEND_API_KEY in environment.');
    }

    const body = request.body as {
      email?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      message?: string;
    } | undefined;

    const consignment = await app.db.query.consignments.findFirst({
      where: eq(consignments.id, request.params.id),
      with: { partner: true, lines: { with: { title: true } } },
    });
    if (!consignment) return reply.notFound('Consignment not found');

    // Determine recipient email — override from body, or partner contactEmail
    let branch: { name: string; contactEmail: string | null } | null = null;
    if (consignment.branchId) {
      branch = await app.db.query.partnerBranches.findFirst({
        where: eq(partnerBranches.id, consignment.branchId),
      }) as any;
    }

    const recipientEmail = body?.email || branch?.contactEmail || consignment.partner.contactEmail;
    if (!recipientEmail) {
      return reply.badRequest('No email address found for this partner. Please provide one.');
    }

    const settings = await app.db.query.companySettings.findFirst();
    const sorDays = consignment.partner.sorDays ? Number(consignment.partner.sorDays) : 90;

    // Build line items (same logic as proforma-pdf)
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
        name: settings.companyName,
        tradingAs: settings.tradingAs,
        vatNumber: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
        addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2,
        city: settings.city,
        province: settings.province,
        postalCode: settings.postalCode,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
      } : undefined,
      recipient: {
        name: consignment.partner.name,
        branchName: branch?.name,
        contactName: consignment.partner.contactName,
        contactEmail: branch?.contactEmail ?? consignment.partner.contactEmail,
        addressLine1: consignment.partner.addressLine1,
        addressLine2: consignment.partner.addressLine2,
        city: consignment.partner.city,
        province: consignment.partner.province,
        postalCode: consignment.partner.postalCode,
        vatNumber: consignment.partner.vatNumber,
      },
      lines,
      subtotal: String(subtotal),
      vatAmount: String(totalVat),
      total: String(total),
      notes: consignment.notes,
    });

    const pdf = await generatePdf(html);

    const proformaNum = consignment.proformaNumber ?? 'SOR-Proforma';
    const companyName = settings?.companyName ?? 'Xarra Books';
    const totalQty = consignment.lines.reduce((s, l) => s + l.qtyDispatched, 0);

    const emailSubject = body?.subject || `SOR Pro-Forma Invoice ${proformaNum} — ${companyName}`;
    const customMessage = body?.message || '';

    const emailBody = customMessage
      ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <p>${customMessage.replace(/\n/g, '<br>')}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="color:#666;font-size:12px">Attached: ${proformaNum}.pdf</p>
        </div>`
      : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <p>Dear ${consignment.partner.contactName ?? consignment.partner.name},</p>
          <p>Please find attached the SOR Pro-Forma Invoice <strong>${proformaNum}</strong> for ${totalQty} copies.</p>
          ${consignment.sorExpiryDate ? `<p>SOR Period: ${sorDays} days — expires <strong>${new Date(consignment.sorExpiryDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.</p>` : ''}
          ${consignment.courierCompany ? `<p>Courier: ${consignment.courierCompany}${consignment.courierWaybill ? ` (Waybill: ${consignment.courierWaybill})` : ''}</p>` : ''}
          <p>Please print this document and include it with the shipment for your records.</p>
          <p>Kind regards,<br>${companyName}</p>
        </div>`;

    // Build recipient list
    const toEmails = [recipientEmail];
    const ccEmails = body?.cc ? body.cc.split(',').map((e) => e.trim()).filter(Boolean) : [];
    const bccEmails = body?.bcc ? body.bcc.split(',').map((e) => e.trim()).filter(Boolean) : [];
    const allRecipients = [...toEmails, ...ccEmails, ...bccEmails];

    const userId = request.session?.user?.id;

    try {
      await sendEmailWithAttachment({
        to: allRecipients,
        subject: emailSubject,
        html: emailBody,
        attachments: [{
          filename: `${proformaNum}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        }],
      });

      // Log success
      await app.db.insert(documentEmails).values({
        documentType: 'SOR_PROFORMA',
        documentId: consignment.id,
        sentTo: recipientEmail,
        sentBy: userId,
        subject: emailSubject,
        message: customMessage || undefined,
        status: 'SENT',
      });

      return { data: { message: `Pro-forma sent to ${recipientEmail}`, email: recipientEmail } };
    } catch (err: any) {
      // Log failure
      await app.db.insert(documentEmails).values({
        documentType: 'SOR_PROFORMA',
        documentId: consignment.id,
        sentTo: recipientEmail,
        sentBy: userId,
        subject: emailSubject,
        message: customMessage || undefined,
        status: 'FAILED',
        errorMessage: err.message,
      });
      throw err;
    }
  });

  // List SOR pro-forma invoices (paginated)
  app.get('/proformas', { preHandler: requireAuth }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    const searchFilter = search
      ? sql`AND (c.proforma_number ILIKE ${'%' + search + '%'} OR cp.name ILIKE ${'%' + search + '%'} OR c.partner_po_number ILIKE ${'%' + search + '%'})`
      : sql``;

    const items = await app.db.execute(sql`
      SELECT
        c.id,
        c.proforma_number AS "proformaNumber",
        c.partner_po_number AS "partnerPoNumber",
        c.partner_id AS "partnerId",
        cp.name AS "partnerName",
        c.dispatch_date AS "dispatchDate",
        c.sor_expiry_date AS "sorExpiryDate",
        c.status,
        c.created_at AS "createdAt",
        COALESCE(SUM(cl.qty_dispatched), 0)::int AS "totalQty",
        COUNT(cl.id)::int AS "totalTitles"
      FROM consignments c
      JOIN channel_partners cp ON cp.id = c.partner_id
      LEFT JOIN consignment_lines cl ON cl.consignment_id = c.id
      WHERE c.proforma_number IS NOT NULL
      ${searchFilter}
      GROUP BY c.id, cp.name
      ORDER BY c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await app.db.execute(sql`
      SELECT COUNT(DISTINCT c.id)::int AS count
      FROM consignments c
      JOIN channel_partners cp ON cp.id = c.partner_id
      WHERE c.proforma_number IS NOT NULL
      ${searchFilter}
    `);

    const total = Number((countResult[0] as any)?.count ?? 0);

    return {
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // SOR expiry dashboard — active consignments with days remaining
  app.get('/sor/active', { preHandler: requireAuth }, async () => {
    const now = new Date();
    const result = await app.db.execute<{
      id: string;
      partnerId: string;
      partnerName: string;
      dispatchDate: string;
      sorExpiryDate: string;
      daysRemaining: number;
      status: string;
      totalQtyDispatched: number;
      totalQtySold: number;
      totalQtyReturned: number;
    }>(sql`
      SELECT
        c.id,
        c.partner_id AS "partnerId",
        cp.name AS "partnerName",
        c.dispatch_date AS "dispatchDate",
        c.sor_expiry_date AS "sorExpiryDate",
        EXTRACT(DAY FROM c.sor_expiry_date - ${now.toISOString()}::timestamptz)::int AS "daysRemaining",
        c.status,
        COALESCE(SUM(cl.qty_dispatched), 0)::int AS "totalQtyDispatched",
        COALESCE(SUM(cl.qty_sold), 0)::int AS "totalQtySold",
        COALESCE(SUM(cl.qty_returned), 0)::int AS "totalQtyReturned"
      FROM ${consignments} c
      JOIN ${channelPartners} cp ON cp.id = c.partner_id
      LEFT JOIN ${consignmentLines} cl ON cl.consignment_id = c.id
      WHERE c.status IN ('DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN')
      GROUP BY c.id, cp.name
      ORDER BY c.sor_expiry_date ASC
    `);

    return { data: result };
  });
}
