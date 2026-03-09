import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import databasePlugin from './plugins/database.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import { createSorExpiryQueue, createSorExpiryWorker, scheduleSorExpiryJob } from './jobs/sor-expiry.js';
import { createTakealotSyncQueue, createTakealotSyncWorker, scheduleTakealotSyncJob } from './jobs/takealot-sync.js';
import { createInvoiceReminderQueue, createInvoiceReminderWorker, scheduleInvoiceReminderJob } from './jobs/invoice-reminders.js';
import { createSorInvoiceQueue, createSorInvoiceWorker, scheduleSorInvoiceJob } from './jobs/sor-invoice.js';
import { createMonthlyStatementQueue, createMonthlyStatementWorker, scheduleMonthlyStatementJob } from './jobs/monthly-statements.js';
import { authorRoutes } from './modules/authors/routes.js';
import { titleRoutes } from './modules/titles/routes.js';
import { partnerRoutes } from './modules/partners/routes.js';
import { inventoryRoutes } from './modules/inventory/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { financeRoutes } from './modules/finance/routes.js';
import { royaltyRoutes } from './modules/royalties/routes.js';
import { consignmentRoutes } from './modules/consignments/routes.js';
import { syncRoutes } from './modules/sync/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { profileRoutes } from './modules/profile/routes.js';
import { statementRoutes } from './modules/statements/routes.js';
import { authorPortalRoutes } from './modules/author-portal/routes.js';
import { expenseRoutes } from './modules/expenses/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { returnRoutes } from './modules/returns/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { salesRoutes } from './modules/sales/routes.js';
import { exportRoutes } from './modules/export/routes.js';
import { partnerPortalRoutes, partnerPortalAdminRoutes } from './modules/partner-portal/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { supplierRoutes } from './modules/suppliers/routes.js';
import { auditPlugin } from './middleware/audit.js';
import { config } from './config.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      transport: config.nodeEnv !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // Core plugins
  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });
  await app.register(helmet);
  await app.register(sensible);
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

  // Serve uploaded files in dev
  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'data', 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Database
  await app.register(databasePlugin);

  // Redis
  await app.register(redisPlugin);

  // Authentication (Better Auth)
  await app.register(authPlugin);

  // Audit trail (auto-log all mutations)
  auditPlugin(app);

  // Background jobs (non-blocking)
  const sorQueue = createSorExpiryQueue(config.redis.url);
  const sorWorker = createSorExpiryWorker(config.redis.url);
  scheduleSorExpiryJob(sorQueue)
    .then(() => app.log.info('SOR expiry alert job scheduled (daily 7:00 AM SAST)'))
    .catch((err) => app.log.warn({ err }, 'Failed to schedule SOR expiry job — Redis may be unavailable'));

  // Takealot API sync (only if API key is configured)
  let takealotQueue: ReturnType<typeof createTakealotSyncQueue> | null = null;
  let takealotWorker: ReturnType<typeof createTakealotSyncWorker> | null = null;
  if (config.takealot.apiKey) {
    takealotQueue = createTakealotSyncQueue(config.redis.url);
    takealotWorker = createTakealotSyncWorker(config.redis.url);
    scheduleTakealotSyncJob(takealotQueue)
      .then(() => app.log.info('Takealot sync job scheduled (daily 6:00 AM SAST)'))
      .catch((err) => app.log.warn({ err }, 'Failed to schedule Takealot sync job'));
  }

  // Invoice payment reminders
  const reminderQueue = createInvoiceReminderQueue(config.redis.url);
  const reminderWorker = createInvoiceReminderWorker(config.redis.url);
  scheduleInvoiceReminderJob(reminderQueue)
    .then(() => app.log.info('Invoice reminder job scheduled (daily 8:00 AM SAST)'))
    .catch((err) => app.log.warn({ err }, 'Failed to schedule invoice reminder job'));

  // SOR auto-invoice: generate invoices for expired SOR consignments
  const sorInvoiceQueue = createSorInvoiceQueue(config.redis.url);
  const sorInvoiceWorker = createSorInvoiceWorker(config.redis.url);
  scheduleSorInvoiceJob(sorInvoiceQueue)
    .then(() => app.log.info('SOR auto-invoice job scheduled (daily 8:00 AM SAST)'))
    .catch((err) => app.log.warn({ err }, 'Failed to schedule SOR auto-invoice job'));

  // Monthly statement compilation: auto-compile statements on 1st of each month
  const stmtQueue = createMonthlyStatementQueue(config.redis.url);
  const stmtWorker = createMonthlyStatementWorker(config.redis.url);
  scheduleMonthlyStatementJob(stmtQueue)
    .then(() => app.log.info('Monthly statement job scheduled (1st of month, 6:00 AM SAST)'))
    .catch((err) => app.log.warn({ err }, 'Failed to schedule monthly statement job'));

  app.addHook('onClose', async () => {
    await sorWorker.close();
    await sorQueue.close();
    await reminderWorker.close();
    await reminderQueue.close();
    await sorInvoiceWorker.close();
    await sorInvoiceQueue.close();
    await stmtWorker.close();
    await stmtQueue.close();
    if (takealotWorker) await takealotWorker.close();
    if (takealotQueue) await takealotQueue.close();
  });

  // Health check (no auth required)
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  }));

  // API version prefix
  app.register(async (api) => {
    api.get('/ping', async () => ({ message: 'Xarra Books API v1' }));

    // Session info endpoint
    api.get('/me', async (request, reply) => {
      if (!request.session?.user) {
        return reply.status(401).send({ error: 'Not authenticated' });
      }
      return {
        user: request.session.user,
        session: {
          id: request.session.session.id,
          expiresAt: request.session.session.expiresAt,
        },
      };
    });

    // Module routes
    api.register(authorRoutes, { prefix: '/authors' });
    api.register(titleRoutes, { prefix: '/titles' });
    api.register(partnerRoutes, { prefix: '/partners' });
    api.register(inventoryRoutes, { prefix: '/inventory' });
    api.register(dashboardRoutes, { prefix: '/dashboard' });
    api.register(financeRoutes, { prefix: '/finance' });
    api.register(royaltyRoutes, { prefix: '/royalties' });
    api.register(consignmentRoutes, { prefix: '/consignments' });
    api.register(syncRoutes, { prefix: '/sync' });
    api.register(settingsRoutes, { prefix: '/settings' });
    api.register(profileRoutes, { prefix: '/profile' });
    api.register(statementRoutes, { prefix: '/statements' });
    api.register(authorPortalRoutes, { prefix: '/portal' });
    api.register(expenseRoutes, { prefix: '/expenses' });
    api.register(reportRoutes, { prefix: '/reports' });
    api.register(userRoutes, { prefix: '/users' });
    api.register(returnRoutes, { prefix: '/returns' });
    api.register(auditRoutes, { prefix: '/audit' });
    api.register(salesRoutes, { prefix: '/sales' });
    api.register(exportRoutes, { prefix: '/export' });
    api.register(notificationRoutes, { prefix: '/notifications' });
    api.register(supplierRoutes, { prefix: '/suppliers' });
    api.register(partnerPortalRoutes, { prefix: '/partner-portal' });
    api.register(partnerPortalAdminRoutes, { prefix: '/partner-admin' });
  }, { prefix: '/api/v1' });

  return app;
}
