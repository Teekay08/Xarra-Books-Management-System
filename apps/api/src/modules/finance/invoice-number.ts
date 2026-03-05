import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Generates the next sequential invoice number in format INV-YYYY-NNNN.
 * Uses a database query to find the max existing number for the current year.
 */
export async function nextInvoiceNumber(db: NodePgDatabase<Record<string, unknown>>, prefix = 'INV'): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const result = await db.execute<{ maxNum: string | null }>(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM invoices
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function nextCreditNoteNumber(db: NodePgDatabase<Record<string, unknown>>): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `CN-${year}-%`;

  const result = await db.execute<{ maxNum: string | null }>(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM credit_notes
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `CN-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function nextDebitNoteNumber(db: NodePgDatabase<Record<string, unknown>>): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `DN-${year}-%`;

  const result = await db.execute<{ maxNum: string | null }>(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM debit_notes
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `DN-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function nextQuotationNumber(db: NodePgDatabase<Record<string, unknown>>): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `PF-${year}-%`;

  const result = await db.execute<{ maxNum: string | null }>(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM quotations
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `PF-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function nextPurchaseOrderNumber(db: NodePgDatabase<Record<string, unknown>>): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `PO-${year}-%`;

  const result = await db.execute<{ maxNum: string | null }>(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM purchase_orders
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `PO-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function nextCashSaleNumber(db: NodePgDatabase<Record<string, unknown>>): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `CS-${year}-%`;

  const result = await db.execute<{ maxNum: string | null }>(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM cash_sales
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `CS-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function nextExpenseClaimNumber(db: NodePgDatabase<Record<string, unknown>>): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `EC-${year}-%`;

  const result = await db.execute<{ maxNum: string | null }>(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM expense_claims
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `EC-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function nextRequisitionNumber(db: NodePgDatabase<Record<string, unknown>>): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `REQ-${year}-%`;

  const result = await db.execute<{ maxNum: string | null }>(sql`
    SELECT MAX(SUBSTRING(number FROM '-(\d+)$')::int) AS "maxNum"
    FROM requisitions
    WHERE number LIKE ${pattern}
  `);

  const nextNum = (Number(result[0]?.maxNum) || 0) + 1;
  return `REQ-${year}-${String(nextNum).padStart(4, '0')}`;
}
