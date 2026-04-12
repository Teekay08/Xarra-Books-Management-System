import type { FastifyPluginAsync } from 'fastify';
import { desc, isNotNull, sql } from 'drizzle-orm';
import { syncOperations, titles as titlesTable } from '@xarra/db';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SyncEngine } from '../../integrations/sync-engine.js';
import { WooCommerceAdapter } from '../../integrations/woocommerce.js';
import { TakealotAdapter } from '../../integrations/takealot.js';
import { KdpAdapter } from '../../integrations/kdp.js';
import { config } from '../../config.js';
import { requirePermission } from '../../middleware/require-auth.js';

export const syncRoutes: FastifyPluginAsync = async (app) => {
  // List sync history
  app.get('/', { preHandler: requirePermission('sync', 'read') }, async (request) => {
    const { page = '1', limit = '20' } = request.query as Record<string, string>;
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, parseInt(limit));

    const data = await request.server.db.query.syncOperations.findMany({
      orderBy: [desc(syncOperations.startedAt)],
      limit: l,
      offset: (p - 1) * l,
    });

    return { data };
  });

  // Trigger WooCommerce sync
  app.post('/woocommerce', { preHandler: requirePermission('sync', 'create') }, async (request, reply) => {
    const { since, until, baseUrl, consumerKey, consumerSecret } = request.body as {
      since: string;
      until?: string;
      baseUrl: string;
      consumerKey: string;
      consumerSecret: string;
    };

    if (!since || !baseUrl || !consumerKey || !consumerSecret) {
      return reply.badRequest('since, baseUrl, consumerKey, and consumerSecret are required');
    }

    const adapter = new WooCommerceAdapter({ baseUrl, consumerKey, consumerSecret });
    const engine = new SyncEngine(request.server.db);
    const result = await engine.importSales(adapter, new Date(since), until ? new Date(until) : undefined);

    return { data: result };
  });

  // Upload Takealot CSV report (file upload or raw body)
  app.post('/takealot', { preHandler: requirePermission('sync', 'create') }, async (request, reply) => {
    let csvContent: string;

    if (request.isMultipart()) {
      const file = await request.file();
      if (!file) return reply.badRequest('CSV file is required');
      csvContent = (await file.toBuffer()).toString('utf-8');
    } else {
      const body = request.body as { csvContent?: string };
      if (!body?.csvContent) return reply.badRequest('csvContent or CSV file is required');
      csvContent = body.csvContent;
    }

    const adapter = new TakealotAdapter({ apiKey: '' });
    const sales = adapter.parseCsvReport(csvContent);

    const engine = new SyncEngine(request.server.db);

    const syncResult = await engine.importSales(
      { platform: 'TAKEALOT', fetchSales: async () => sales },
      new Date(0)
    );

    return { data: syncResult };
  });

  // Takealot API poll (requires TAKEALOT_API_KEY)
  app.post('/takealot/poll', { preHandler: requirePermission('sync', 'create') }, async (request, reply) => {
    const { since, until } = request.body as { since: string; until?: string };

    if (!since) {
      return reply.badRequest('since date is required');
    }

    const apiKey = config.takealot.apiKey;
    if (!apiKey) {
      return reply.badRequest('TAKEALOT_API_KEY not configured');
    }

    const adapter = new TakealotAdapter({ apiKey });
    const engine = new SyncEngine(request.server.db);
    const result = await engine.importSales(adapter, new Date(since), until ? new Date(until) : undefined);

    return { data: result };
  });

  // WooCommerce webhook receiver (real-time order events)
  // Register with WooCommerce: WooCommerce > Settings > Advanced > Webhooks
  // Delivery URL: https://api.xarrabooks.com/api/v1/sync/woocommerce/webhook
  // Topic: Order updated (or Order created), Content type: application/json
  // Note: For byte-perfect HMAC verification, add @fastify/raw-body to preserve the original payload.
  // The current implementation re-serialises the parsed body for signature comparison, which works
  // when WooCommerce sends canonical JSON (the common case).
  app.post('/woocommerce/webhook', async (request, reply) => {
    const webhookSecret = config.woocommerce.webhookSecret;

    // Verify signature if secret is configured
    if (webhookSecret) {
      const signature = request.headers['x-wc-webhook-signature'] as string | undefined;
      if (!signature) {
        return reply.status(401).send({ error: 'Missing webhook signature' });
      }

      // WooCommerce sends base64(HMAC-SHA256(rawBody, secret))
      const bodyStr = JSON.stringify(request.body);
      const expected = createHmac('sha256', webhookSecret).update(bodyStr).digest('base64');

      try {
        const sigBuf = Buffer.from(signature, 'base64');
        const expBuf = Buffer.from(expected, 'base64');
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return reply.status(401).send({ error: 'Invalid webhook signature' });
        }
      } catch {
        return reply.status(401).send({ error: 'Invalid webhook signature' });
      }
    }

    const order = request.body as any;
    if (!order || !order.id) {
      return reply.status(200).send({ ok: true }); // Ack unknown payloads
    }

    // Only process completed orders
    if (order.status !== 'completed') {
      return reply.status(200).send({ ok: true, skipped: true, reason: 'not completed' });
    }

    if (!config.woocommerce.url) {
      return reply.status(200).send({ ok: true, skipped: true, reason: 'not configured' });
    }

    // Normalise the webhook order payload directly (no extra API call needed)
    const lineItems: Array<{ id: number; product_id: number; sku: string; name: string; quantity: number; total: string }> =
      order.line_items ?? [];

    if (lineItems.length === 0) {
      return reply.status(200).send({ ok: true, skipped: true, reason: 'no line items' });
    }

    const sales = lineItems.map((item) => ({
      externalId: `woo-${order.id}-${item.id}`,
      channel: 'XARRA_WEBSITE' as const,
      isbn13: item.sku?.length === 13 ? item.sku : undefined,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Number(item.total) / item.quantity,
      netRevenue: Number(item.total),
      currency: 'ZAR' as const,
      orderRef: String(order.number),
      customerName: `${order.billing?.first_name ?? ''} ${order.billing?.last_name ?? ''}`.trim() || undefined,
      saleDate: new Date(order.date_created),
      fulfilmentType: 'SHIP' as const,
      source: 'WEBHOOK' as const,
    }));

    const engine = new SyncEngine(request.server.db);
    await engine.importSales(
      { platform: 'WOOCOMMERCE', fetchSales: async () => sales },
      new Date(0)
    );

    return reply.status(200).send({ ok: true, processed: sales.length });
  });

  // Push current inventory stock levels from Xarra back to WooCommerce
  // Only titles with woocommerceProductId set will be synced
  app.post('/woocommerce/push-inventory', { preHandler: requirePermission('sync', 'create') }, async (request, reply) => {
    const { url, consumerKey, consumerSecret } = config.woocommerce;
    if (!url || !consumerKey || !consumerSecret) {
      return reply.badRequest('WooCommerce credentials not configured');
    }

    const db = request.server.db;

    // Get all titles that have a WooCommerce product ID
    const linkedTitles = await db.select({
      id: titlesTable.id,
      title: titlesTable.title,
      woocommerceProductId: titlesTable.woocommerceProductId,
    })
    .from(titlesTable)
    .where(isNotNull(titlesTable.woocommerceProductId));

    if (linkedTitles.length === 0) {
      return { data: { pushed: 0, message: 'No titles have woocommerceProductId set' } };
    }

    // Get current stock from XARRA_WEBSITE location (or sum all non-consignment locations)
    const results: { titleId: string; productId: number; stock: number; success: boolean; error?: string }[] = [];
    const adapter = new WooCommerceAdapter({ baseUrl: url, consumerKey, consumerSecret });

    for (const t of linkedTitles) {
      try {
        // Sum all inventory movements for this title (net stock, excluding consignment/damaged/writeoff locations)
        const stockResult = await db.execute(sql`
          SELECT COALESCE(SUM(im.quantity_change), 0)::int as stock
          FROM inventory_movements im
          JOIN inventory_locations il ON il.id = im.location_id
          WHERE im.title_id = ${t.id}
            AND il.location_name NOT IN ('CONSIGNMENT', 'DAMAGED', 'WRITE_OFF')
        `);
        const stock = Math.max(0, Number((stockResult as any)[0]?.stock ?? 0));
        await adapter.pushInventoryStock(t.woocommerceProductId!, stock);
        results.push({ titleId: t.id, productId: t.woocommerceProductId!, stock, success: true });
      } catch (err: any) {
        results.push({ titleId: t.id, productId: t.woocommerceProductId!, stock: -1, success: false, error: err.message });
      }
    }

    const pushed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return { data: { pushed, failed, results } };
  });

  // Upload KDP CSV report (file upload or raw body)
  app.post('/kdp', { preHandler: requirePermission('sync', 'create') }, async (request, reply) => {
    let csvContent: string;
    let exchangeRate: number | undefined;

    if (request.isMultipart()) {
      const file = await request.file();
      if (!file) return reply.badRequest('CSV file is required');
      csvContent = (await file.toBuffer()).toString('utf-8');
      // Exchange rate can be passed as a field in multipart
      const rateField = file.fields?.exchangeRate;
      if (rateField && 'value' in rateField) {
        exchangeRate = parseFloat(rateField.value as string) || undefined;
      }
    } else {
      const body = request.body as { csvContent?: string; exchangeRate?: number };
      if (!body?.csvContent) return reply.badRequest('csvContent or CSV file is required');
      csvContent = body.csvContent;
      exchangeRate = body.exchangeRate;
    }

    const adapter = new KdpAdapter(exchangeRate);
    const sales = adapter.parseCsvReport(csvContent, exchangeRate);

    const engine = new SyncEngine(request.server.db);

    const syncResult = await engine.importSales(
      { platform: 'AMAZON_KDP', fetchSales: async () => sales },
      new Date(0)
    );

    return { data: syncResult };
  });
};
