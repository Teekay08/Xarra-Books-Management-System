import type { FastifyPluginAsync } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { syncOperations } from '@xarra/db';
import { SyncEngine } from '../../integrations/sync-engine.js';
import { WooCommerceAdapter } from '../../integrations/woocommerce.js';
import { TakealotAdapter } from '../../integrations/takealot.js';
import { KdpAdapter } from '../../integrations/kdp.js';
import { config } from '../../config.js';

export const syncRoutes: FastifyPluginAsync = async (app) => {
  // List sync history
  app.get('/', async (request) => {
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
  app.post('/woocommerce', async (request, reply) => {
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

  // Upload Takealot CSV report
  app.post('/takealot', async (request, reply) => {
    const { csvContent } = request.body as { csvContent: string };

    if (!csvContent) {
      return reply.badRequest('csvContent is required (paste the CSV report content)');
    }

    const adapter = new TakealotAdapter({ apiKey: '' });
    const sales = adapter.parseCsvReport(csvContent);

    const engine = new SyncEngine(request.server.db);

    // Manually run the import with parsed sales
    const syncResult = await engine.importSales(
      { platform: 'TAKEALOT', fetchSales: async () => sales },
      new Date(0) // not used since we pre-parsed
    );

    return { data: syncResult };
  });

  // Takealot API poll (requires TAKEALOT_API_KEY)
  app.post('/takealot/poll', async (request, reply) => {
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

  // Upload KDP CSV report
  app.post('/kdp', async (request, reply) => {
    const { csvContent, exchangeRate } = request.body as { csvContent: string; exchangeRate?: number };

    if (!csvContent) {
      return reply.badRequest('csvContent is required (paste the KDP royalty report content)');
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
