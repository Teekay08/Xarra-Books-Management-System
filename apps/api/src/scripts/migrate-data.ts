/**
 * Data Migration CLI Tool
 *
 * Imports CSV data from spreadsheets into the Xarra Books database.
 *
 * Usage:
 *   npx tsx apps/api/src/scripts/migrate-data.ts <entity> <csv-file> [--dry-run]
 *
 * Entities:
 *   authors    - Import authors (legalName, penName, type, email, phone, ...)
 *   titles     - Import titles (title, isbn13, rrpZar, status, authorEmail, ...)
 *   partners   - Import channel partners (name, discountPct, sorDays, ...)
 *   inventory  - Import opening stock balances (isbn13, quantity, location)
 *   contracts  - Import author contracts (authorEmail, isbn13, royaltyRatePrint, ...)
 *
 * Options:
 *   --dry-run  Parse and validate without writing to database
 */

import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { createDb } from '@xarra/db';
import {
  authors, titles, channelPartners, authorContracts,
} from '@xarra/db';
import { sql } from 'drizzle-orm';

dotenvConfig({ path: resolve(import.meta.dirname, '../../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const db = createDb(DATABASE_URL);

// ── CSV Parser ──────────────────────────────────────────────────────────────

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.every((v) => !v.trim())) continue; // skip empty rows
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ── Importers ───────────────────────────────────────────────────────────────

async function importAuthors(rows: Record<string, string>[], dryRun: boolean) {
  const validated = rows.map((r, i) => {
    if (!r.legalName) throw new Error(`Row ${i + 2}: legalName is required`);
    if (!r.type || !['HYBRID', 'TRADITIONAL'].includes(r.type.toUpperCase())) {
      throw new Error(`Row ${i + 2}: type must be HYBRID or TRADITIONAL`);
    }
    return {
      legalName: r.legalName,
      penName: r.penName || null,
      type: r.type.toUpperCase() as 'HYBRID' | 'TRADITIONAL',
      email: r.email || null,
      phone: r.phone || null,
      addressLine1: r.addressLine1 || null,
      addressLine2: r.addressLine2 || null,
      city: r.city || null,
      province: r.province || null,
      postalCode: r.postalCode || null,
      country: r.country || 'South Africa',
      taxNumber: r.taxNumber || null,
      notes: r.notes || null,
    };
  });

  console.log(`Validated ${validated.length} author(s)`);
  if (dryRun) return;

  const result = await db.insert(authors).values(validated).onConflictDoNothing().returning({ id: authors.id });
  console.log(`Inserted ${result.length} author(s)`);
}

async function importTitles(rows: Record<string, string>[], dryRun: boolean) {
  // Look up author IDs by email for matching
  const authorMap = new Map<string, string>();
  const allAuthors = await db.select({ id: authors.id, email: authors.email }).from(authors);
  for (const a of allAuthors) {
    if (a.email) authorMap.set(a.email.toLowerCase(), a.id);
  }

  const validated = rows.map((r, i) => {
    if (!r.title) throw new Error(`Row ${i + 2}: title is required`);
    if (!r.rrpZar) throw new Error(`Row ${i + 2}: rrpZar is required`);

    let primaryAuthorId: string | null = null;
    if (r.authorEmail) {
      primaryAuthorId = authorMap.get(r.authorEmail.toLowerCase()) ?? null;
      if (!primaryAuthorId) {
        console.warn(`Row ${i + 2}: author with email "${r.authorEmail}" not found, skipping author link`);
      }
    }

    const formats = r.formats ? r.formats.split(';').map((f) => f.trim()) : ['PAPERBACK'];

    return {
      title: r.title,
      subtitle: r.subtitle || null,
      isbn13: r.isbn13 || null,
      asin: r.asin || null,
      takealotSku: r.takealotSku || null,
      takealotOfferId: r.takealotOfferId || null,
      primaryAuthorId,
      rrpZar: r.rrpZar,
      costPriceZar: r.costPriceZar || null,
      formats,
      status: (r.status?.toUpperCase() || 'ACTIVE') as 'PRODUCTION' | 'ACTIVE' | 'OUT_OF_PRINT',
      description: r.description || null,
      pageCount: r.pageCount ? parseInt(r.pageCount) : null,
      weightGrams: r.weightGrams ? parseInt(r.weightGrams) : null,
    };
  });

  console.log(`Validated ${validated.length} title(s)`);
  if (dryRun) return;

  const result = await db.insert(titles).values(validated).onConflictDoNothing().returning({ id: titles.id });
  console.log(`Inserted ${result.length} title(s)`);
}

async function importPartners(rows: Record<string, string>[], dryRun: boolean) {
  const validated = rows.map((r, i) => {
    if (!r.name) throw new Error(`Row ${i + 2}: name is required`);
    if (!r.discountPct) throw new Error(`Row ${i + 2}: discountPct is required`);

    return {
      name: r.name,
      discountPct: r.discountPct,
      sorDays: r.sorDays ? parseInt(r.sorDays) : null,
      paymentTermsDays: r.paymentTermsDays ? parseInt(r.paymentTermsDays) : null,
      paymentDay: r.paymentDay ? parseInt(r.paymentDay) : null,
      contactName: r.contactName || null,
      contactEmail: r.contactEmail || null,
      contactPhone: r.contactPhone || null,
      remittanceEmail: r.remittanceEmail || null,
      notes: r.notes || null,
    };
  });

  console.log(`Validated ${validated.length} partner(s)`);
  if (dryRun) return;

  const result = await db.insert(channelPartners).values(validated).onConflictDoNothing().returning({ id: channelPartners.id });
  console.log(`Inserted ${result.length} partner(s)`);
}

async function importInventory(rows: Record<string, string>[], dryRun: boolean) {
  // Look up title IDs by ISBN
  const titleMap = new Map<string, string>();
  const allTitles = await db.select({ id: titles.id, isbn13: titles.isbn13 }).from(titles);
  for (const t of allTitles) {
    if (t.isbn13) titleMap.set(t.isbn13, t.id);
  }

  const movements = rows.map((r, i) => {
    if (!r.isbn13) throw new Error(`Row ${i + 2}: isbn13 is required`);
    if (!r.quantity) throw new Error(`Row ${i + 2}: quantity is required`);

    const titleId = titleMap.get(r.isbn13);
    if (!titleId) throw new Error(`Row ${i + 2}: title with ISBN "${r.isbn13}" not found`);

    return {
      titleId,
      quantity: parseInt(r.quantity),
      location: r.location || 'XARRA_WAREHOUSE',
    };
  });

  console.log(`Validated ${movements.length} inventory row(s)`);
  if (dryRun) return;

  // Insert as OPENING_BALANCE inventory movements
  for (const m of movements) {
    await db.execute(sql`
      INSERT INTO inventory_movements (title_id, movement_type, quantity, from_location, to_location, reason, notes)
      VALUES (
        ${m.titleId},
        'IN',
        ${m.quantity},
        NULL,
        ${m.location},
        'OPENING_BALANCE',
        'Imported from spreadsheet'
      )
    `);
  }
  console.log(`Inserted ${movements.length} inventory movement(s)`);
}

async function importContracts(rows: Record<string, string>[], dryRun: boolean) {
  // Look up IDs
  const authorMap = new Map<string, string>();
  const allAuthors = await db.select({ id: authors.id, email: authors.email }).from(authors);
  for (const a of allAuthors) {
    if (a.email) authorMap.set(a.email.toLowerCase(), a.id);
  }

  const titleMap = new Map<string, string>();
  const allTitles = await db.select({ id: titles.id, isbn13: titles.isbn13 }).from(titles);
  for (const t of allTitles) {
    if (t.isbn13) titleMap.set(t.isbn13, t.id);
  }

  const validated = rows.map((r, i) => {
    if (!r.authorEmail) throw new Error(`Row ${i + 2}: authorEmail is required`);
    if (!r.isbn13) throw new Error(`Row ${i + 2}: isbn13 is required`);
    if (!r.royaltyRatePrint) throw new Error(`Row ${i + 2}: royaltyRatePrint is required`);

    const authorId = authorMap.get(r.authorEmail.toLowerCase());
    if (!authorId) throw new Error(`Row ${i + 2}: author with email "${r.authorEmail}" not found`);

    const titleId = titleMap.get(r.isbn13);
    if (!titleId) throw new Error(`Row ${i + 2}: title with ISBN "${r.isbn13}" not found`);

    return {
      authorId,
      titleId,
      royaltyRatePrint: r.royaltyRatePrint,
      royaltyRateEbook: r.royaltyRateEbook || r.royaltyRatePrint,
      triggerType: (r.triggerType?.toUpperCase() || 'DATE') as 'DATE' | 'UNITS' | 'REVENUE',
      triggerValue: r.triggerValue || null,
      advanceAmount: r.advanceAmount || '0',
      isSigned: r.isSigned?.toLowerCase() === 'true',
      startDate: new Date(r.startDate || Date.now()),
    };
  });

  console.log(`Validated ${validated.length} contract(s)`);
  if (dryRun) return;

  const result = await db.insert(authorContracts).values(validated).onConflictDoNothing().returning({ id: authorContracts.id });
  console.log(`Inserted ${result.length} contract(s)`);
}

// ── CLI Entry ───────────────────────────────────────────────────────────────

const IMPORTERS: Record<string, (rows: Record<string, string>[], dryRun: boolean) => Promise<void>> = {
  authors: importAuthors,
  titles: importTitles,
  partners: importPartners,
  inventory: importInventory,
  contracts: importContracts,
};

async function main() {
  const args = process.argv.slice(2);
  const entity = args[0];
  const csvPath = args[1];
  const dryRun = args.includes('--dry-run');

  if (!entity || !csvPath) {
    console.log(`
Xarra Books — Data Migration Tool

Usage:
  npx tsx apps/api/src/scripts/migrate-data.ts <entity> <csv-file> [--dry-run]

Entities:
  authors     legalName, penName, type, email, phone, addressLine1, city, province, postalCode, taxNumber
  titles      title, subtitle, isbn13, rrpZar, costPriceZar, status, formats, authorEmail, asin, takealotSku
  partners    name, discountPct, sorDays, paymentTermsDays, contactName, contactEmail, contactPhone
  inventory   isbn13, quantity, location
  contracts   authorEmail, isbn13, royaltyRatePrint, royaltyRateEbook, triggerType, advanceAmount, startDate

Options:
  --dry-run   Validate data without inserting

Import order: authors → titles → partners → contracts → inventory
    `);
    process.exit(0);
  }

  const importer = IMPORTERS[entity];
  if (!importer) {
    console.error(`Unknown entity: ${entity}. Valid: ${Object.keys(IMPORTERS).join(', ')}`);
    process.exit(1);
  }

  const filePath = resolve(csvPath);
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`Cannot read file: ${filePath}`);
    process.exit(1);
  }

  const rows = parseCsv(content);
  console.log(`Parsed ${rows.length} row(s) from ${filePath}`);
  if (rows.length === 0) {
    console.log('No data to import');
    process.exit(0);
  }

  // Show column headers found
  console.log(`Columns: ${Object.keys(rows[0]).join(', ')}`);

  if (dryRun) console.log('\n=== DRY RUN MODE ===\n');

  try {
    await importer(rows, dryRun);
    console.log(dryRun ? '\nDry run complete — no data written' : '\nMigration complete!');
  } catch (err) {
    console.error('\nMigration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  process.exit(0);
}

main();
