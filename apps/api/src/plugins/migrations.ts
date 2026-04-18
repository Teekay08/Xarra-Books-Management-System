/**
 * Auto-migration runner.
 * Applies hand-written SQL files that aren't tracked by drizzle-kit's journal.
 * Called once on server startup, right after the database plugin.
 *
 * Each SQL file must be idempotent (IF NOT EXISTS / ADD VALUE IF NOT EXISTS guards).
 */
import fp from 'fastify-plugin';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config } from '../config.js';

const dir = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));

// Path to the drizzle migrations folder (relative to this file's location)
const MIGRATIONS_DIR = resolve(dir, '../../../../packages/db/drizzle');

// Files to apply in order — add new entries here as migrations are written
const PENDING_MIGRATIONS = [
  '0011_add_task_code_to_timesheet_entries.sql',
  '0012_link_timesheet_entries_to_tasks.sql',
  '0013_add_task_requests.sql',
  '0014_planner_entry_spans.sql',
  '0015_monthly_capacity.sql',
  '0016_order_management_statuses.sql',
  '0017_consignment_settlement_status.sql',
  '0018_woocommerce_product_id.sql',
  '0019_notification_type_pm_values.sql',
  '0020_task_deliverables.sql',
  '0021_companies.sql',
  '0022_billetterie_projects.sql',
];

export default fp(async (app) => {
  const sql = postgres(config.database.url, { max: 1 });

  for (const file of PENDING_MIGRATIONS) {
    const filePath = resolve(MIGRATIONS_DIR, file);

    if (!existsSync(filePath)) {
      app.log.warn({ file }, 'Migration file not found — skipping');
      continue;
    }

    const content = readFileSync(filePath, 'utf8');

    try {
      await sql.unsafe(content);
      app.log.info({ file }, 'Migration applied');
    } catch (err: any) {
      // Idempotency: ignore "already exists" / duplicate errors
      const msg: string = err.message ?? '';
      const code: string = err.code ?? '';
      if (
        code === '42701' || // duplicate_column
        code === '42P07' || // duplicate_table
        code === '42710' || // duplicate_object (enum value)
        msg.includes('already exists') ||
        msg.includes('duplicate')
      ) {
        app.log.debug({ file }, 'Migration already applied — skipping');
      } else {
        app.log.error({ err, file }, 'Migration failed');
        await sql.end();
        throw new Error(`Migration ${file} failed: ${msg}`);
      }
    }
  }

  await sql.end();
  app.log.info('Migrations complete');
}, { name: 'migrations' });
