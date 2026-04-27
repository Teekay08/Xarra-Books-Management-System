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
  '0023_billetterie_tasks_bugs.sql',
  '0024_bil_project_team.sql',
  '0025_bil_milestones_task_cols.sql',
  '0026_bil_time_logs.sql',
  '0027_bil_issues_comments.sql',
  '0028_bil_issue_labels.sql',
  '0029_bil_client_tokens.sql',
  '0030_bil_documents_deliverables.sql',
  '0031_user_product_access.sql',
  '0032_bil_time_logs_deliverable.sql',
  '0033_return_grn.sql',
  '0034_pms_phase1.sql',
  '0035_bil_support_desk.sql',
  '0036_bil_change_requests.sql',
  '0037_bil_testing.sql',
  '0038_billetterie_org_settings.sql',
];

export default fp(async (app) => {
  // Reuse the existing postgres client from the Drizzle DB instance to avoid
  // opening a second connection pool (which can time out on remote / limited DBs).
  const sql = (app.db as any).$client as import('postgres').Sql;

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
        code === '42P16' || // invalid_table_definition (e.g. column already nullable)
        msg.includes('already exists') ||
        msg.includes('already nullable') ||
        msg.includes('duplicate')
      ) {
        app.log.debug({ file }, 'Migration already applied — skipping');
      } else {
        app.log.error({ err, file }, 'Migration failed');
        throw new Error(`Migration ${file} failed: ${msg}`);
      }
    }
  }

  app.log.info('Migrations complete');
}, { name: 'migrations' });
