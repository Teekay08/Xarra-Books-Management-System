import { sql, eq } from 'drizzle-orm';
import { saleRecords, titles, syncOperations, type Database } from '@xarra/db';
import type { NormalizedSale, PlatformAdapter, SyncResult } from './types.js';

/**
 * Central sync engine that takes normalized sales from any adapter
 * and inserts them into the database with deduplication.
 */
export class SyncEngine {
  constructor(private db: Database) {}

  async importSales(adapter: PlatformAdapter, since: Date, until?: Date): Promise<SyncResult> {
    const result: SyncResult = {
      platform: adapter.platform,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsSkipped: 0,
      errors: [],
    };

    // Create sync operation record
    const [syncOp] = await this.db.insert(syncOperations).values({
      platform: adapter.platform as 'WOOCOMMERCE' | 'TAKEALOT' | 'AMAZON_KDP',
      operationType: 'SALES_IMPORT',
      status: 'RUNNING',
    }).returning();

    try {
      // Fetch from platform
      const sales = await adapter.fetchSales(since, until);
      result.recordsProcessed = sales.length;

      // Build ISBN/SKU → titleId map
      const titleMap = await this.buildTitleMap();

      for (const sale of sales) {
        try {
          const titleId = this.resolveTitleId(sale, titleMap);
          if (!titleId) {
            result.errors.push({
              message: `Title not found for ISBN=${sale.isbn13} SKU=${sale.sku}`,
              detail: `Order: ${sale.orderRef}, External ID: ${sale.externalId}`,
            });
            result.recordsSkipped++;
            continue;
          }

          // Upsert with dedup on channel + externalId
          const inserted = await this.db.execute(sql`
            INSERT INTO sale_records (
              external_id, title_id, channel, quantity, unit_price,
              commission, net_revenue, currency, exchange_rate,
              order_ref, customer_name, sale_date, source, fulfilment_type
            ) VALUES (
              ${sale.externalId}, ${titleId}, ${sale.channel},
              ${sale.quantity}, ${sale.unitPrice.toFixed(2)},
              ${sale.commission?.toFixed(2) ?? null}, ${sale.netRevenue?.toFixed(2) ?? null},
              ${sale.currency}, ${sale.exchangeRate?.toString() ?? null},
              ${sale.orderRef ?? null}, ${sale.customerName ?? null},
              ${sale.saleDate.toISOString()}, ${sale.source},
              ${sale.fulfilmentType ?? null}
            )
            ON CONFLICT (channel, external_id) DO NOTHING
            RETURNING id
          `);

          if (Array.isArray(inserted) && inserted.length > 0) {
            result.recordsCreated++;
          } else {
            result.recordsSkipped++;
          }
        } catch (err) {
          result.errors.push({
            message: `Failed to import sale ${sale.externalId}`,
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Update sync operation
      await this.db
        .update(syncOperations)
        .set({
          status: result.errors.length > 0 ? 'PARTIAL' : 'COMPLETED',
          completedAt: new Date(),
          recordsProcessed: result.recordsProcessed,
          recordsCreated: result.recordsCreated,
          recordsSkipped: result.recordsSkipped,
          errorCount: result.errors.length,
          errorDetails: result.errors.length > 0 ? result.errors : null,
        })
        .where(eq(syncOperations.id, syncOp.id));
    } catch (err) {
      await this.db
        .update(syncOperations)
        .set({
          status: 'FAILED',
          completedAt: new Date(),
          errorCount: 1,
          errorDetails: [{ message: err instanceof Error ? err.message : String(err) }],
        })
        .where(eq(syncOperations.id, syncOp.id));
      throw err;
    }

    return result;
  }

  private async buildTitleMap() {
    const allTitles = await this.db
      .select({
        id: titles.id,
        isbn13: titles.isbn13,
        asin: titles.asin,
        takealotSku: titles.takealotSku,
      })
      .from(titles);

    return {
      byIsbn: new Map(allTitles.filter((t) => t.isbn13).map((t) => [t.isbn13!, t.id])),
      byAsin: new Map(allTitles.filter((t) => t.asin).map((t) => [t.asin!, t.id])),
      byTakealotSku: new Map(allTitles.filter((t) => t.takealotSku).map((t) => [t.takealotSku!, t.id])),
    };
  }

  private resolveTitleId(
    sale: NormalizedSale,
    map: { byIsbn: Map<string, string>; byAsin: Map<string, string>; byTakealotSku: Map<string, string> }
  ): string | undefined {
    if (sale.isbn13 && map.byIsbn.has(sale.isbn13)) return map.byIsbn.get(sale.isbn13);
    if (sale.sku) {
      if (map.byAsin.has(sale.sku)) return map.byAsin.get(sale.sku);
      if (map.byTakealotSku.has(sale.sku)) return map.byTakealotSku.get(sale.sku);
    }
    return undefined;
  }
}
