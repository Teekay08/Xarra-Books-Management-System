import type { FastifyInstance } from 'fastify';
import { eq, sql, and } from 'drizzle-orm';
import {
  partnerOrders, partnerOrderLines, channelPartners,
  partnerUsers, titles, orderStatusHistory, partnerMagicLinks,
  partnerDocumentDeliveries, partnerUploadedDocuments, partnerOnboardingFunnel,
  notificationEmailPreferences,
} from '@xarra/db';
import { ORDER_PIPELINE_STEPS, paginationSchema } from '@xarra/shared';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import { nextPartnerOrderNumber } from '../finance/invoice-number.js';
import crypto from 'node:crypto';
import { z } from 'zod';

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

const pipelineStepSchema = z.object({
  step: z.enum(ORDER_PIPELINE_STEPS as unknown as [string, ...string[]]),
  notes: z.string().optional(),
});

const createOnBehalfSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  customerPoNumber: z.string().optional().nullable(),
  deliveryAddress: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1, 'At least one line item is required'),
});

const generateMagicLinkSchema = z.object({
  partnerId: z.string().uuid(),
  purpose: z.string().min(1),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  expiresInHours: z.number().positive().default(72),
});

const sendDocumentSchema = z.object({
  documentType: z.string().min(1),
  documentId: z.string().uuid(),
  recipientEmail: z.string().email().optional(),
});

const notificationPrefsSchema = z.object({
  emailEnabled: z.boolean(),
  preferences: z.record(z.any()).default({}),
  digestFrequency: z.string().default('IMMEDIATE'),
  dailyDigestHour: z.number().int().min(0).max(23).default(7),
  weeklyDigestDay: z.number().int().min(0).max(6).default(1),
});

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
    (request.body as any) = { step: 'PICKING' };
    return (app as any).inject({ method: 'POST', url: `/orders/${request.params.id}/pipeline-step`, payload: { step: 'PICKING' }, headers: request.headers });
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
    const body = createOnBehalfSchema.parse(request.body);
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
      const unitPrice = Number(title?.rrpZar || 0);
      const lineTotal = line.quantity * unitPrice * (1 - discount / 100);
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
      subtotal: String(subtotal),
      vatAmount: String(vatAmount),
      total: String(total),
      status: 'SUBMITTED',
      source: 'ADMIN_ENTRY',
      enteredById: userId,
      notes: body.notes || null,
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
    if (new Date() > new Date(link.expiresAt)) return reply.badRequest('Link has expired');

    return { data: link };
  });

  // Use magic link (public - no auth)
  app.post<{ Params: { token: string } }>('/magic-links/:token/use', async (request, reply) => {
    const link = await app.db.query.partnerMagicLinks.findFirst({
      where: eq(partnerMagicLinks.token, request.params.token),
    });

    if (!link) return reply.notFound('Invalid link');
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

    return { data: { purpose: link.purpose, referenceType: link.referenceType, referenceId: link.referenceId } };
  });

  // ==========================================
  // PARTNER DOCUMENT DELIVERY
  // ==========================================

  app.post<{ Params: { partnerId: string } }>('/partners/:partnerId/send-document', {
    preHandler: requireRole('admin', 'finance'),
  }, async (request, reply) => {
    const body = sendDocumentSchema.parse(request.body);
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

    const [doc] = await app.db.insert(partnerUploadedDocuments).values({
      partnerId: request.params.partnerId,
      documentType: (request.query as any).documentType || 'OTHER',
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
    const { linkedEntityType, linkedEntityId } = request.body as { linkedEntityType: string; linkedEntityId: string };
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
    const body = notificationPrefsSchema.parse(request.body);
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
}
