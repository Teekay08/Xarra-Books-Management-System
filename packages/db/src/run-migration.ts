/**
 * One-shot migration runner for manually-written SQL files.
 * Usage: npx tsx packages/db/src/run-migration.ts
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';

const dir = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));

config({ path: resolve(dir, '../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const PENDING = [
  '0011_add_task_code_to_timesheet_entries.sql',
  '0012_link_timesheet_entries_to_tasks.sql',
  '0013_add_task_requests.sql',
  '0014_planner_entry_spans.sql',
  '0015_monthly_capacity.sql',
  '0016_order_management_statuses.sql',
];

async function run() {
  const sql = postgres(DATABASE_URL!, { max: 1 });

  for (const file of PENDING) {
    const filePath = resolve(dir, '../drizzle', file);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      console.warn(`  SKIP  ${file} (file not found)`);
      continue;
    }

    try {
      await sql.unsafe(content);
      console.log(`  OK    ${file}`);
    } catch (err: any) {
      // IF NOT EXISTS guards mean most errors are duplicate-object safe,
      // but log anything unexpected so you can inspect.
      if (
        err.message?.includes('already exists') ||
        err.message?.includes('duplicate') ||
        err.code === '42701' || // duplicate_column
        err.code === '42P07'    // duplicate_table
      ) {
        console.log(`  SKIP  ${file} (already applied)`);
      } else {
        console.error(`  FAIL  ${file}: ${err.message}`);
        await sql.end();
        process.exit(1);
      }
    }
  }

  await sql.end();
  console.log('\nAll done.');
}

run();
