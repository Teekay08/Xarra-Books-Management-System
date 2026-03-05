import type { FastifyPluginAsync } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { syncOperations } from '@xarra/db';
import { SyncEngine } from '../../integrations/sync-engine.js';
import { WooCommerceAdapter } from '../../integrations/woocommerce.js';
import { TakealotAdapter } from '../../integrations/takealot.js';
import { KdpAdapter } from '../../integrations/kdp.js';
import { config } from '../../config.js';
import { requireAuth, requirePermission } from '../../middleware/require-auth.js';

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
