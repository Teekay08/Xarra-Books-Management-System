import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { titles, authors, channelPartners, inventoryMovements } from '@xarra/db';
import { requireAuth } from '../../middleware/require-auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/stats', { preHandler: requireAuth }, async () => {
    const [titleCount, authorCount, partnerCount, stockSummary] = await Promise.all([
      app.db.select({ count: sql<number>`count(*)` }).from(titles),
      app.db.select({ count: sql<number>`count(*)` }).from(authors).where(sql`${authors.isActive} = true`),
      app.db.select({ count: sql<number>`count(*)` }).from(channelPartners).where(sql`${channelPartners.isActive} = true`),
      app.db.execute<{ totalStock: number }>(sql`
        SELECT COALESCE(SUM(
          CASE
            WHEN movement_type IN ('IN', 'RETURN') THEN quantity
            WHEN movement_type IN ('CONSIGN', 'SELL', 'WRITEOFF') THEN -quantity
            WHEN movement_type = 'ADJUST' THEN quantity
            ELSE 0
          END
        ), 0)::int AS "totalStock"
        FROM ${inventoryMovements}
      `),
    ]);

    return {
      data: {
        totalTitles: Number(titleCount[0].count),
        activeAuthors: Number(authorCount[0].count),
        activePartners: Number(partnerCount[0].count),
        totalStock: stockSummary[0]?.totalStock ?? 0,
      },
    };
  });
}
