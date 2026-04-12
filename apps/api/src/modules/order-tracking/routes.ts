import type { FastifyInstance } from 'fastify';
import { eq, sql, and } from 'drizzle-orm';
import {
  partnerOrders, partnerOrderLines, channelPartners,
  partnerUsers, titles, orderStatusHistory, partnerMagicLinks,
  partnerDocumentDeliveries, partnerUploadedDocuments, partnerOnboardingFunnel,
  notificationEmailPreferences, companySettings,
} from '@xarra/db';
import {
  ORDER_PIPELINE_STEPS, paginationSchema,
  pipelineStepSchema, createOrderOnBehalfSchema, generateMagicLinkSchema,
  sendPartnerDocumentSchema, notificationPreferencesSchema,
} from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { nextPartnerOrderNumber } from '../finance/invoice-number.js';
import { generatePdf } from '../../services/pdf.js';
import { renderPickingSlipHtml } from '../../services/templates/picking-slip.js';
import { renderPackingListHtml } from '../../services/templates/packing-list.js';
import { renderDeliveryNoteHtml } from '../../services/templates/delivery-note.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { sendEmail, isEmailConfigured } from '../../services/email.js';
import { config } from '../../config.js';

// Pipeline step -> order status mapping
const STEP_TO_STATUS: Record<string, string> = {
  ORDER_RECEIVED: 'SUBMITTED',
  CONFIRMED: 'CONFIRMED',
  PICKING: 'PROCESSING',
  PACKING: 'PROCESSING',
  DISPATCHED: 'DISPATCHED',
  WITH_COURIER: 'DISPATCHED',
  IN_TRANSIT: 'DISPATCHED',
  OUT_FOR_DELIVERY: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
};

export async function orderTrackingRoutes(app: FastifyInstance) {

  // ==========================================
  // ORDER PIPELINE MANAGEMENT
  // ==========================================

  // Advance order to a pipeline step
  app.post<{ Params: { id: string } }>('/orders/:id/pipeline-step', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const { step, notes } = pipelineStepSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
    });
    if (!order) return reply.notFound('Order not found');

    const stepIndex = ORDER_PIPELINE_STEPS.indexOf(step as any);
    if (stepIndex < 0) return reply.badRequest('Invalid pipeline step');

    // Determine the from status
    const lastHistory = await app.db.query.orderStatusHistory.findFirst({
      where: eq(orderStatusHistory.orderId, request.params.id),
      orderBy: (h, { desc }) => [desc(h.changedAt)],
    });
    const fromStatus = lastHistory?.toStatus || order.status;

    // Create history entry
    await app.db.insert(orderStatusHistory).values({
      orderId: request.params.id,
      fromStatus,
      toStatus: step,
      changedBy: userId,
      source: 'MANUAL',
      notes: notes || null,
    });

    // Update order status and pipeline step
    const updates: Record<string, any> = {
      currentPipelineStep: stepIndex,
      updatedAt: new Date(),
    };

    const newStatus = STEP_TO_STATUS[step];
    if (newStatus && newStatus !== order.status) {
      updates.status = newStatus;
    }

    if (step === 'PICKING') updates.pickingStartedAt = new Date();
    if (step === 'PACKING') updates.packingStartedAt = new Date();
    if (step === 'DISPATCHED') updates.dispatchedAt = new Date();
    if (step === 'DELIVERED') updates.deliveredAt = new Date();

    const [updated] = await app.db.update(partnerOrders)
      .set(updates)
      .where(eq(partnerOrders.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // Get order timeline
  app.get<{ Params: { id: string } }>('/orders/:id/timeline', {
    preHandler: requireAuth,
  }, async (request) => {
    const entries = await app.db.query.orderStatusHistory.findMany({
      where: eq(orderStatusHistory.orderId, request.params.id),
      with: { changedByUser: true, changedByPartnerUser: true },
      orderBy: (h, { desc }) => [desc(h.changedAt)],
    });
    return { data: entries };
  });

  // Shorthand: mark as picking
  app.post<{ Params: { id: string } }>('/orders/:id/picking', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
    });
    if (!order) return reply.notFound('Order not found');

    const lastHistory = await app.db.query.orderStatusHistory.findFirst({
      where: eq(orderStatusHistory.orderId, request.params.id),
      orderBy: (h, { desc }) => [desc(h.changedAt)],
    });

    await app.db.insert(orderStatusHistory).values({
      orderId: request.params.id,
      fromStatus: lastHistory?.toStatus || order.status,
      toStatus: 'PICKING',
      changedBy: userId,
      source: 'MANUAL',
    });

    const [updated] = await app.db.update(partnerOrders)
      .set({ currentPipelineStep: 2, pickingStartedAt: new Date(), status: 'PROCESSING', updatedAt: new Date() })
      .where(eq(partnerOrders.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // Shorthand: mark as packing
  app.post<{ Params: { id: string } }>('/orders/:id/packing', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    // Reuse pipeline-step logic directly
    const userId = request.session?.user?.id;
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
    });
    if (!order) return reply.notFound('Order not found');

    const lastHistory = await app.db.query.orderStatusHistory.findFirst({
      where: eq(orderStatusHistory.orderId, request.params.id),
      orderBy: (h, { desc }) => [desc(h.changedAt)],
    });

    await app.db.insert(orderStatusHistory).values({
      orderId: request.params.id,
      fromStatus: lastHistory?.toStatus || order.status,
      toStatus: 'PACKING',
      changedBy: userId,
      source: 'MANUAL',
    });

    const [updated] = await app.db.update(partnerOrders)
      .set({ currentPipelineStep: 3, packingStartedAt: new Date(), status: 'PROCESSING', updatedAt: new Date() })
      .where(eq(partnerOrders.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // ==========================================
  // ADMIN ORDER ENTRY ON BEHALF
  // ==========================================

  app.post('/orders/create-on-behalf', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const body = createOrderOnBehalfSchema.parse(request.body);
    const userId = request.session?.user?.id;

    // Get partner info
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, body.partnerId),
    });
    if (!partner) return reply.notFound('Partner not found');

    // Find or create a system partner user for placedById
    let systemUser = await app.db.query.partnerUsers.findFirst({
      where: and(
        eq(partnerUsers.partnerId, body.partnerId),
        eq(partnerUsers.email, `system@${partner.name.toLowerCase().replace(/\s+/g, '-')}.internal`),
      ),
    });

    if (!systemUser) {
      const [created] = await app.db.insert(partnerUsers).values({
        partnerId: body.partnerId,
        email: `system@${partner.name.toLowerCase().replace(/\s+/g, '-')}.internal`,
        name: `${partner.name} (System)`,
        passwordHash: 'SYSTEM_USER_NO_LOGIN',
        role: 'ADMIN',
        isActive: false,
      }).returning();
      systemUser = created;
    }

    const number = await nextPartnerOrderNumber(app.db as any);
    const discount = Number(partner.discountPct);

    // Fetch title prices
    const titleIds = body.lines.map((l) => l.titleId);
    const titleRecords = await app.db.query.titles.findMany({
      where: sql`${titles.id} IN (${sql.join(titleIds.map((id) => sql`${id}`), sql`, `)})`,
    });
    const titleMap = new Map(titleRecords.map((t) => [t.id, t]));

    let subtotal = 0;
    const orderLines = body.lines.map((line) => {
      const title = titleMap.get(line.titleId);
      // Use provided unitPrice if given (manual capture allows custom pricing), else derive from RRP
      const unitPrice = line.unitPrice ?? (Number(title?.rrpZar || 0) * (1 - discount / 100));
      const lineTotal = line.quantity * unitPrice;
      subtotal += lineTotal;
      return {
        titleId: line.titleId,
        quantity: line.quantity,
        unitPrice: String(unitPrice),
        discountPct: String(discount),
        lineTotal: String(lineTotal),
        lineTax: String(lineTotal * 0.15),
      };
    });

    const vatAmount = subtotal * 0.15;
    const total = subtotal + vatAmount;

    // Create order
    const [order] = await app.db.insert(partnerOrders).values({
      number,
      partnerId: body.partnerId,
      branchId: body.branchId || null,
      placedById: systemUser.id,
      customerPoNumber: body.customerPoNumber || null,
      deliveryAddress: body.deliveryAddress || null,
      expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
      subtotal: String(subtotal),
      vatAmount: String(vatAmount),
      total: String(total),
      status: 'SUBMITTED',
      source: body.source === 'PORTAL' ? 'PORTAL' : 'ADMIN_ENTRY',
      enteredById: userId,
      notes: body.notes || null,
      internalNotes: body.internalNotes || null,
      currentPipelineStep: 0,
    } as any).returning();

    // Insert lines
    await app.db.insert(partnerOrderLines).values(
      orderLines.map((l) => ({ ...l, orderId: order.id })),
    );

    // Create initial status history
    await app.db.insert(orderStatusHistory).values({
      orderId: order.id,
      toStatus: 'ORDER_RECEIVED',
      changedBy: userId,
      source: 'MANUAL',
      notes: 'Order created on behalf of partner',
    });

    // Send intake confirmation email if requested
    if (body.sendIntakeEmail && isEmailConfigured()) {
      const recipientEmail = body.notifyEmail || partner.contactEmail;
      if (recipientEmail) {
        // Generate a magic link so the partner can view their order in the portal
        const magicToken = crypto.randomBytes(32).toString('hex');
        const magicExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await app.db.insert(partnerMagicLinks).values({
          token: magicToken,
          partnerId: partner.id,
          purpose: 'VIEW_ORDER',
          referenceType: 'PARTNER_ORDER',
          referenceId: order.id,
          expiresAt: magicExpiresAt,
        });
        const portalBase = (config.cors.origins[0] ?? 'http://localhost:5173').replace(/\/$/, '');
        const magicUrl = `${portalBase}/partner/magic/${magicToken}`;

        const isPortalUser = partner.portalMode === 'SELF_SERVICE';
        const sourceLabel: Record<string, string> = {
          EMAIL: 'email', PHONE: 'phone call', FAX: 'fax', MANUAL: 'walk-in / manual entry',
        };
        const totalUnits = body.lines.reduce((s, l) => s + l.quantity, 0);
        const formattedTotal = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(total);

        // Portal CTA block — casual for existing portal users, inviting for others
        const portalCtaBlock = isPortalUser
          ? `
    <div style="margin-top:24px;padding:20px 24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#166534">View your order on the Xarra Partner Portal</p>
      <p style="margin:0 0 14px;font-size:13px;color:#15803d;line-height:1.6">
        Track the status of ${order.number}, view your invoices, and manage your account — all in one place.
      </p>
      <a href="${magicUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 20px;border-radius:6px">
        View Order →
      </a>
      <p style="margin:10px 0 0;font-size:11px;color:#6b7280">This link is unique to you and valid for 30 days.</p>
    </div>`
          : `
    <div style="margin-top:24px;padding:20px 24px;background:#fef9f0;border:1px solid #fde68a;border-radius:8px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#92400e">Did you know? You can manage your orders online.</p>
      <p style="margin:0 0 14px;font-size:13px;color:#78350f;line-height:1.6">
        The Xarra Partner Portal lets you place orders, track deliveries, view invoices, and submit returns — without needing to call or email us.
        Click below to view this order and explore the portal.
      </p>
      <a href="${magicUrl}" style="display:inline-block;background:#8B1A1A;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 20px;border-radius:6px">
        View Order &amp; Explore Portal →
      </a>
      <p style="margin:10px 0 0;font-size:11px;color:#6b7280">No password needed — this link signs you in automatically. Valid for 30 days.</p>
    </div>`;

        const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#8B1A1A;padding:24px 32px">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.3px">Xarra Books</h1>
      <p style="margin:4px 0 0;color:#f5c6c6;font-size:13px">Order Acknowledgement</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:15px;color:#111827">Dear ${partner.name},</p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6">
        We have received and logged your order, submitted via ${sourceLabel[body.source ?? 'MANUAL'] ?? body.source?.toLowerCase() ?? 'manual entry'}.
        Our team will review and confirm it shortly.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr>
            <td style="padding:4px 0;color:#6b7280;width:140px">Order Reference</td>
            <td style="padding:4px 0;color:#111827;font-weight:700;font-family:monospace">${order.number}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">Order Date</td>
            <td style="padding:4px 0;color:#111827">${new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
          </tr>
          ${body.customerPoNumber ? `<tr>
            <td style="padding:4px 0;color:#6b7280">Your PO Number</td>
            <td style="padding:4px 0;color:#111827;font-family:monospace">${body.customerPoNumber}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:4px 0;color:#6b7280">Total Units</td>
            <td style="padding:4px 0;color:#111827">${totalUnits} unit${totalUnits !== 1 ? 's' : ''}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">Order Total</td>
            <td style="padding:4px 0;color:#111827;font-weight:700">${formattedTotal} (incl. VAT)</td>
          </tr>
        </table>
      </div>
      ${body.notes ? `<p style="margin:0 0 20px;font-size:13px;color:#374151;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px"><strong>Note from Xarra:</strong> ${body.notes}</p>` : ''}
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.6">
        Once confirmed, you will receive a follow-up notification. If you have any questions, please reply to this email or contact your account manager.
      </p>
      ${portalCtaBlock}
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center">
      <p style="margin:0;font-size:11px;color:#9ca3af">
        Xarra Books · Midrand, South Africa<br>
        This is an automated message — please do not reply to confirm receipt of your order.
      </p>
    </div>
  </div>
</body>
</html>`.trim();

        sendEmail({
          to: recipientEmail,
          subject: `Order Acknowledgement — ${order.number} | Xarra Books`,
          html,
        }).catch((err: Error) => app.log.warn({ err, orderId: order.id }, 'Intake email failed to send'));
      }
    }

    return reply.status(201).send({ data: order });
  });

  // ==========================================
  // MAGIC LINKS
  // ==========================================

  app.post('/magic-links/generate', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const body = generateMagicLinkSchema.parse(request.body);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000);

    const [link] = await app.db.insert(partnerMagicLinks).values({
      token,
      partnerId: body.partnerId,
      purpose: body.purpose,
      referenceType: body.referenceType || null,
      referenceId: body.referenceId || null,
      expiresAt,
    }).returning();

    return reply.status(201).send({
      data: {
        ...link,
        url: `/partner/magic/${token}`,
      },
    });
  });

  // Validate magic link (public - no auth)
  app.get<{ Params: { token: string } }>('/magic-links/:token', async (request, reply) => {
    const link = await app.db.query.partnerMagicLinks.findFirst({
      where: eq(partnerMagicLinks.token, request.params.token),
      with: { partner: true },
    });

    if (!link) return reply.notFound('Invalid link');
    if (link.usedAt) return reply.badRequest('Link has already been used');
    if (new Date() > new Date(link.expiresAt)) return reply.badRequest('Link has expired');

    return { data: link };
  });

  // Use magic link (public - no auth)
  app.post<{ Params: { token: string } }>('/magic-links/:token/use', async (request, reply) => {
    const link = await app.db.query.partnerMagicLinks.findFirst({
      where: eq(partnerMagicLinks.token, request.params.token),
    });

    if (!link) return reply.notFound('Invalid link');
    if (link.usedAt) return reply.badRequest('Link has already been used');
    if (new Date() > new Date(link.expiresAt)) return reply.badRequest('Link has expired');

    // Mark as used
    await app.db.update(partnerMagicLinks)
      .set({ usedAt: new Date() })
      .where(eq(partnerMagicLinks.id, link.id));

    // Update onboarding funnel
    const funnel = await app.db.query.partnerOnboardingFunnel.findFirst({
      where: eq(partnerOnboardingFunnel.partnerId, link.partnerId),
    });

    if (funnel) {
      const updates: Record<string, any> = {
        magicLinksClicked: (funnel.magicLinksClicked || 0) + 1,
        lastMagicLinkClickAt: new Date(),
        updatedAt: new Date(),
      };
      if (funnel.stage === 'UNAWARE' || funnel.stage === 'EMAIL_ONLY') {
        updates.stage = 'MAGIC_LINK_USED';
        updates.stageEnteredAt = new Date();
      }
      await app.db.update(partnerOnboardingFunnel)
        .set(updates)
        .where(eq(partnerOnboardingFunnel.id, funnel.id));
    } else {
      await app.db.insert(partnerOnboardingFunnel).values({
        partnerId: link.partnerId,
        stage: 'MAGIC_LINK_USED',
        magicLinksClicked: 1,
        lastMagicLinkClickAt: new Date(),
      });
    }

    // Load partner info so we can issue a guest session token
    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, link.partnerId),
    });

    // Build a guest partner session (no real user — magic-link visitor)
    const session = {
      userId: `magic:${link.id}`,
      partnerId: link.partnerId,
      branchId: null as string | null,
      role: 'viewer',
      email: partner?.contactEmail ?? '',
      name: partner?.name ?? 'Partner',
    };
    const sessionToken = Buffer.from(JSON.stringify(session)).toString('base64url');

    const partnerUser = {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      partnerId: link.partnerId,
      partnerName: partner?.name ?? '',
      branchId: null,
      branchName: null,
    };

    return {
      data: {
        purpose: link.purpose,
        referenceType: link.referenceType,
        referenceId: link.referenceId,
        sessionToken,
        partnerUser,
      },
    };
  });

  // ==========================================
  // PARTNER DOCUMENT DELIVERY
  // ==========================================

  app.post<{ Params: { partnerId: string } }>('/partners/:partnerId/send-document', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = sendPartnerDocumentSchema.parse(request.body);
    const userId = request.session?.user?.id;

    const partner = await app.db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, request.params.partnerId),
    });
    if (!partner) return reply.notFound('Partner not found');

    const recipientEmail = body.recipientEmail || partner.financeContactEmail || partner.contactEmail;
    if (!recipientEmail) return reply.badRequest('No recipient email available');

    // Create delivery record
    const [delivery] = await app.db.insert(partnerDocumentDeliveries).values({
      partnerId: request.params.partnerId,
      documentType: body.documentType,
      documentId: body.documentId,
      deliveryMethod: 'EMAIL',
      recipientEmail,
      status: 'SENT',
      sentAt: new Date(),
    }).returning();

    return { data: delivery };
  });

  app.get<{ Params: { partnerId: string } }>('/partners/:partnerId/document-deliveries', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      app.db.query.partnerDocumentDeliveries.findMany({
        where: eq(partnerDocumentDeliveries.partnerId, request.params.partnerId),
        orderBy: (d, { desc }) => [desc(d.createdAt)],
        limit,
        offset,
      }),
      app.db.select({ count: sql<number>`count(*)` })
        .from(partnerDocumentDeliveries)
        .where(eq(partnerDocumentDeliveries.partnerId, request.params.partnerId)),
    ]);

    return {
      data: items,
      pagination: { page, limit, total: Number(countResult[0].count), totalPages: Math.ceil(Number(countResult[0].count) / limit) },
    };
  });

  // ==========================================
  // PARTNER UPLOADED DOCUMENTS
  // ==========================================

  app.post<{ Params: { partnerId: string } }>('/partners/:partnerId/upload-document', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const userId = request.session?.user?.id;
    const file = await request.file();
    if (!file) return reply.badRequest('No file uploaded');

    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const uploadDir = path.join(process.cwd(), 'data', 'uploads', 'partner-docs');
    await fs.mkdir(uploadDir, { recursive: true });

    const fileName = `${Date.now()}-${file.filename}`;
    const filePath = path.join(uploadDir, fileName);
    const buffer = await file.toBuffer();
    await fs.writeFile(filePath, buffer);

    const validDocTypes = ['REMITTANCE_PDF', 'PURCHASE_ORDER_PDF', 'OTHER'];
    const docType = validDocTypes.includes((request.query as any).documentType)
      ? (request.query as any).documentType : 'OTHER';

    const [doc] = await app.db.insert(partnerUploadedDocuments).values({
      partnerId: request.params.partnerId,
      documentType: docType,
      fileName: file.filename,
      fileUrl: `/uploads/partner-docs/${fileName}`,
      fileSizeBytes: buffer.length,
      mimeType: file.mimetype,
      uploadedBy: userId!,
    }).returning();

    return reply.status(201).send({ data: doc });
  });

  app.get<{ Params: { partnerId: string } }>('/partners/:partnerId/uploaded-documents', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request) => {
    const items = await app.db.query.partnerUploadedDocuments.findMany({
      where: eq(partnerUploadedDocuments.partnerId, request.params.partnerId),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    });
    return { data: items };
  });

  app.patch<{ Params: { id: string } }>('/uploaded-documents/:id/link', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const linkDocSchema = z.object({
      linkedEntityType: z.enum(['REMITTANCE', 'PARTNER_ORDER']),
      linkedEntityId: z.string().uuid(),
    });
    const { linkedEntityType, linkedEntityId } = linkDocSchema.parse(request.body);
    const [updated] = await app.db.update(partnerUploadedDocuments)
      .set({ linkedEntityType, linkedEntityId })
      .where(eq(partnerUploadedDocuments.id, request.params.id))
      .returning();
    if (!updated) return reply.notFound('Document not found');
    return { data: updated };
  });

  // ==========================================
  // ONBOARDING FUNNEL
  // ==========================================

  app.get('/onboarding-funnel', {
    preHandler: requireRole('admin', 'operations'),
  }, async () => {
    const stages = await app.db.execute<{ stage: string; count: string }>(sql`
      SELECT stage, COUNT(*) as count
      FROM partner_onboarding_funnel
      GROUP BY stage
      ORDER BY CASE stage
        WHEN 'UNAWARE' THEN 1
        WHEN 'EMAIL_ONLY' THEN 2
        WHEN 'MAGIC_LINK_USED' THEN 3
        WHEN 'ACCOUNT_CREATED' THEN 4
        WHEN 'FIRST_LOGIN' THEN 5
        WHEN 'ACTIVE_USER' THEN 6
      END
    `);

    const totalPartners = await app.db.select({ count: sql<number>`count(*)` }).from(channelPartners);

    return {
      data: {
        stages,
        totalPartners: Number(totalPartners[0].count),
      },
    };
  });

  app.get<{ Params: { partnerId: string } }>('/partners/:partnerId/onboarding', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const funnel = await app.db.query.partnerOnboardingFunnel.findFirst({
      where: eq(partnerOnboardingFunnel.partnerId, request.params.partnerId),
      with: { partner: true },
    });
    if (!funnel) return { data: null };
    return { data: funnel };
  });

  // ==========================================
  // NOTIFICATION EMAIL PREFERENCES
  // ==========================================

  app.get('/notification-preferences', {
    preHandler: requireAuth,
  }, async (request) => {
    const userId = request.session?.user?.id;
    const prefs = await app.db.query.notificationEmailPreferences.findFirst({
      where: eq(notificationEmailPreferences.userId, userId!),
    });

    if (!prefs) {
      // Return defaults
      return {
        data: {
          emailEnabled: true,
          preferences: {},
          digestFrequency: 'IMMEDIATE',
          dailyDigestHour: 7,
          weeklyDigestDay: 1,
        },
      };
    }

    return { data: prefs };
  });

  app.put('/notification-preferences', {
    preHandler: requireAuth,
  }, async (request) => {
    const body = notificationPreferencesSchema.parse(request.body);
    const userId = request.session?.user?.id!;

    const existing = await app.db.query.notificationEmailPreferences.findFirst({
      where: eq(notificationEmailPreferences.userId, userId),
    });

    if (existing) {
      const [updated] = await app.db.update(notificationEmailPreferences)
        .set({
          emailEnabled: body.emailEnabled,
          preferences: body.preferences,
          digestFrequency: body.digestFrequency,
          dailyDigestHour: body.dailyDigestHour,
          weeklyDigestDay: body.weeklyDigestDay,
          updatedAt: new Date(),
        })
        .where(eq(notificationEmailPreferences.userId, userId))
        .returning();
      return { data: updated };
    }

    const [created] = await app.db.insert(notificationEmailPreferences).values({
      userId,
      emailEnabled: body.emailEnabled,
      preferences: body.preferences,
      digestFrequency: body.digestFrequency,
      dailyDigestHour: body.dailyDigestHour,
      weeklyDigestDay: body.weeklyDigestDay,
      unsubscribeToken: crypto.randomBytes(32).toString('hex'),
    }).returning();

    return { data: created };
  });

  // ==========================================
  // ORDER PROCESSING DOCUMENTS
  // ==========================================

  // Picking slip — available once order reaches PICKING step
  app.get<{ Params: { id: string } }>('/orders/:id/picking-slip', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
      with: {
        partner: true,
        branch: true,
        lines: { with: { title: true } },
      },
    });
    if (!order) return reply.notFound('Order not found');
    if (!['PROCESSING', 'DISPATCHED', 'DELIVERED'].includes(order.status)) return reply.badRequest('Order has not reached picking stage');

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderPickingSlipHtml({
      orderNumber: order.number,
      orderDate: order.orderDate.toISOString(),
      partnerName: order.partner.name,
      branchName: order.branch?.name ?? null,
      lines: order.lines.map(l => ({
        titleId: l.titleId,
        title: l.title.title,
        isbn13: l.title.isbn13 ?? null,
        shelfLocation: null, // populated by inventory system in future
        quantity: l.quantity,
      })),
      notes: order.internalNotes ?? null,
      company: settings ? { name: settings.companyName ?? 'Xarra Books', logoUrl: settings.logoUrl, addressLine1: settings.addressLine1 } : null,
    });

    const pdf = await generatePdf(html);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="PICKING-${order.number}.pdf"`)
      .send(pdf);
  });

  // Packing list — available once order reaches PACKING step
  app.get<{ Params: { id: string } }>('/orders/:id/packing-list', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
      with: {
        partner: true,
        branch: true,
        lines: { with: { title: true } },
      },
    });
    if (!order) return reply.notFound('Order not found');
    if (!['PROCESSING', 'DISPATCHED', 'DELIVERED'].includes(order.status)) return reply.badRequest('Order has not reached packing stage');

    // Resolve SOR/consignment number if linked
    let sorNumber: string | null = null;
    if (order.consignmentId) {
      const { consignments } = await import('@xarra/db');
      const consignment = await app.db.query.consignments.findFirst({
        where: eq(consignments.id, order.consignmentId),
      });
      sorNumber = consignment?.proformaNumber ?? null;
    }

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderPackingListHtml({
      orderNumber: order.number,
      sorNumber,
      partnerPoNumber: order.customerPoNumber ?? null,
      orderDate: order.orderDate.toISOString(),
      packedDate: new Date().toISOString(),
      partnerName: order.partner.name,
      branchName: order.branch?.name ?? null,
      lines: order.lines.map(l => ({
        title: l.title.title,
        isbn13: l.title.isbn13 ?? null,
        qtyPacked: l.qtyConfirmed ?? l.quantity,
      })),
      notes: order.internalNotes ?? null,
      company: settings ? { name: settings.companyName ?? 'Xarra Books', logoUrl: settings.logoUrl, addressLine1: settings.addressLine1 } : null,
    });

    const pdf = await generatePdf(html);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="PACKING-${order.number}.pdf"`)
      .send(pdf);
  });

  // Delivery note — available at DISPATCHED and beyond; assigns DN number
  app.get<{ Params: { id: string } }>('/orders/:id/delivery-note', {
    preHandler: requireRole('admin', 'operations', 'finance'),
  }, async (request, reply) => {
    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
      with: {
        partner: true,
        branch: true,
        lines: { with: { title: true } },
      },
    });
    if (!order) return reply.notFound('Order not found');
    if (!['DISPATCHED', 'DELIVERED'].includes(order.status)) return reply.badRequest('Order has not been dispatched yet');

    // Resolve SOR/consignment number and invoice number if linked
    let sorNumber: string | null = null;
    let invoiceNumber: string | null = null;

    if (order.consignmentId) {
      const { consignments } = await import('@xarra/db');
      const consignment = await app.db.query.consignments.findFirst({
        where: eq(consignments.id, order.consignmentId),
      });
      sorNumber = consignment?.proformaNumber ?? null;
    }

    if (order.invoiceId) {
      const { invoices } = await import('@xarra/db');
      const invoice = await app.db.query.invoices.findFirst({
        where: eq(invoices.id, order.invoiceId),
      });
      invoiceNumber = invoice?.number ?? null;
    }

    // Use order number as DN number (DN- prefix variant) if no dedicated sequence exists
    const dnNumber = `DN-${order.number.replace('POR-', '')}`;

    const settings = await app.db.query.companySettings.findFirst();

    const html = renderDeliveryNoteHtml({
      deliveryNoteNumber: dnNumber,
      orderNumber: order.number,
      sorNumber,
      invoiceNumber,
      partnerPoNumber: order.customerPoNumber ?? null,
      dispatchDate: (order.dispatchedAt ?? new Date()).toISOString(),
      expectedDelivery: order.expectedDeliveryDate?.toISOString() ?? null,
      partnerName: order.partner.name,
      branchName: order.branch?.name ?? null,
      deliveryAddress: order.deliveryAddress ?? null,
      courierCompany: order.courierCompany ?? null,
      courierWaybill: order.courierWaybill ?? null,
      courierTrackingUrl: order.courierTrackingUrl ?? null,
      items: order.lines.map(l => ({
        title: l.title.title,
        isbn13: l.title.isbn13 ?? null,
        quantity: l.qtyDispatched ?? l.qtyConfirmed ?? l.quantity,
      })),
      notes: order.notes ?? null,
      company: settings ? {
        name: settings.companyName ?? 'Xarra Books',
        logoUrl: settings.logoUrl,
        addressLine1: settings.addressLine1,
        phone: settings.phone,
        email: settings.email,
        vatNumber: settings.vatNumber,
      } : undefined,
    });

    const pdf = await generatePdf(html);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${dnNumber}.pdf"`)
      .send(pdf);
  });

  // Mark order as back-order
  app.patch<{ Params: { id: string } }>('/orders/:id/backorder', {
    preHandler: requireRole('admin', 'operations'),
  }, async (request, reply) => {
    const { backorderEta, holdReason, backorderNotes, lineUpdates } = z.object({
      backorderEta: z.string().optional(),
      holdReason: z.string().optional(),
      backorderNotes: z.string().optional(),
      lineUpdates: z.array(z.object({
        lineId: z.string(),
        backorderQty: z.number().int().min(0),
        backorderEta: z.string().optional(),
      })).optional(),
    }).parse(request.body);

    const order = await app.db.query.partnerOrders.findFirst({
      where: eq(partnerOrders.id, request.params.id),
    });
    if (!order) return reply.notFound('Order not found');

    const [updated] = await app.db.update(partnerOrders).set({
      status: 'BACK_ORDER',
      backorderEta: backorderEta ?? null,
      holdReason: holdReason ?? null,
      backorderNotes: backorderNotes ?? null,
      updatedAt: new Date(),
    }).where(eq(partnerOrders.id, request.params.id)).returning();

    if (lineUpdates?.length) {
      for (const lu of lineUpdates) {
        await app.db.update(partnerOrderLines).set({
          lineStatus: 'BACKORDERED',
          backorderQty: lu.backorderQty,
          backorderEta: lu.backorderEta ?? null,
        }).where(eq(partnerOrderLines.id, lu.lineId));
      }
    }

    return { data: updated };
  });
}
