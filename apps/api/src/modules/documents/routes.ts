import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../../middleware/require-auth.js';

/**
 * Cross-module document search — returns results from all major document types.
 * Supports filtering by type and full-text search on document number, partner/author name.
 */
export async function documentRoutes(app: FastifyInstance) {
  app.get('/search', { preHandler: requireAuth }, async (request) => {
    const { q = '', type = '', page = '1', limit = '20' } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;
    const search = `%${q.toLowerCase()}%`;

    // Each union arm returns: type, number, partner_name, date, amount, status, id, url
    const subqueries: string[] = [];

    if (!type || type === 'invoice') {
      subqueries.push(`
        SELECT
          'invoice' AS doc_type,
          i.number AS doc_number,
          cp.name AS entity_name,
          i.invoice_date::text AS doc_date,
          i.total::text AS amount,
          i.status,
          i.id,
          '/invoices/' || i.id AS url,
          to_tsvector('english', i.number || ' ' || cp.name) AS search_vec
        FROM invoices i
        JOIN channel_partners cp ON cp.id = i.partner_id
        WHERE (LOWER(i.number) LIKE '${search}' OR LOWER(cp.name) LIKE '${search}')
      `);
    }

    if (!type || type === 'credit_note') {
      subqueries.push(`
        SELECT
          'credit_note' AS doc_type,
          cn.number AS doc_number,
          cp.name AS entity_name,
          cn.created_at::date::text AS doc_date,
          cn.total::text AS amount,
          CASE WHEN cn.voided_at IS NOT NULL THEN 'VOIDED' ELSE 'ACTIVE' END AS status,
          cn.id,
          '/credit-notes/' || cn.id AS url,
          to_tsvector('english', cn.number || ' ' || cp.name) AS search_vec
        FROM credit_notes cn
        JOIN channel_partners cp ON cp.id = cn.partner_id
        WHERE (LOWER(cn.number) LIKE '${search}' OR LOWER(cp.name) LIKE '${search}')
      `);
    }

    if (!type || type === 'debit_note') {
      subqueries.push(`
        SELECT
          'debit_note' AS doc_type,
          dn.number AS doc_number,
          cp.name AS entity_name,
          dn.created_at::date::text AS doc_date,
          dn.total::text AS amount,
          CASE WHEN dn.voided_at IS NOT NULL THEN 'VOIDED' ELSE 'ACTIVE' END AS status,
          dn.id,
          '/debit-notes/' || dn.id AS url,
          to_tsvector('english', dn.number || ' ' || cp.name) AS search_vec
        FROM debit_notes dn
        JOIN channel_partners cp ON cp.id = dn.partner_id
        WHERE (LOWER(dn.number) LIKE '${search}' OR LOWER(cp.name) LIKE '${search}')
      `);
    }

    if (!type || type === 'quotation') {
      subqueries.push(`
        SELECT
          'quotation' AS doc_type,
          q.number AS doc_number,
          cp.name AS entity_name,
          q.quotation_date::text AS doc_date,
          q.total::text AS amount,
          q.status,
          q.id,
          '/quotations/' || q.id AS url,
          to_tsvector('english', q.number || ' ' || cp.name) AS search_vec
        FROM quotations q
        JOIN channel_partners cp ON cp.id = q.partner_id
        WHERE (LOWER(q.number) LIKE '${search}' OR LOWER(cp.name) LIKE '${search}')
      `);
    }

    if (!type || type === 'purchase_order') {
      subqueries.push(`
        SELECT
          'purchase_order' AS doc_type,
          po.number AS doc_number,
          po.supplier_name AS entity_name,
          po.order_date::text AS doc_date,
          po.total::text AS amount,
          po.status,
          po.id,
          '/finance/purchase-orders/' || po.id AS url,
          to_tsvector('english', po.number || ' ' || po.supplier_name) AS search_vec
        FROM purchase_orders po
        WHERE (LOWER(po.number) LIKE '${search}' OR LOWER(po.supplier_name) LIKE '${search}')
      `);
    }

    if (!type || type === 'return') {
      subqueries.push(`
        SELECT
          'return' AS doc_type,
          r.number AS doc_number,
          cp.name AS entity_name,
          r.created_at::date::text AS doc_date,
          '0' AS amount,
          r.status,
          r.id,
          '/returns/' || r.id AS url,
          to_tsvector('english', r.number || ' ' || cp.name) AS search_vec
        FROM returns r
        JOIN channel_partners cp ON cp.id = r.partner_id
        WHERE (LOWER(r.number) LIKE '${search}' OR LOWER(cp.name) LIKE '${search}')
      `);
    }

    if (!type || type === 'cash_sale') {
      subqueries.push(`
        SELECT
          'cash_sale' AS doc_type,
          cs.number AS doc_number,
          COALESCE(cs.customer_name, 'Walk-in') AS entity_name,
          cs.sale_date::text AS doc_date,
          cs.total::text AS amount,
          CASE WHEN cs.voided_at IS NOT NULL THEN 'VOIDED' ELSE 'COMPLETED' END AS status,
          cs.id,
          '/sales/cash-sales/' || cs.id AS url,
          to_tsvector('english', cs.number || ' ' || COALESCE(cs.customer_name, '')) AS search_vec
        FROM cash_sales cs
        WHERE (LOWER(cs.number) LIKE '${search}' OR LOWER(COALESCE(cs.customer_name, '')) LIKE '${search}')
      `);
    }

    if (!type || type === 'royalty_payment') {
      subqueries.push(`
        SELECT
          'royalty_payment' AS doc_type,
          ap.number AS doc_number,
          a.legal_name AS entity_name,
          ap.created_at::date::text AS doc_date,
          ap.amount_due::text AS amount,
          ap.status,
          ap.id,
          '/royalties' AS url,
          to_tsvector('english', ap.number || ' ' || a.legal_name) AS search_vec
        FROM author_payments ap
        JOIN authors a ON a.id = ap.author_id
        WHERE (LOWER(ap.number) LIKE '${search}' OR LOWER(a.legal_name) LIKE '${search}')
      `);
    }

    if (subqueries.length === 0) {
      return { data: [], pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 } };
    }

    const unionQuery = subqueries.join('\nUNION ALL\n');

    const rows = await app.db.execute(sql.raw(`
      SELECT doc_type, doc_number, entity_name, doc_date, amount, status, id, url
      FROM (${unionQuery}) combined
      ORDER BY doc_date DESC, doc_number DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `)) as any[];

    const countRow = await app.db.execute(sql.raw(`
      SELECT COUNT(*) AS total FROM (${unionQuery}) combined
    `)) as any[];

    const total = Number(countRow[0]?.total ?? 0);

    return {
      data: rows.map((r: any) => ({
        type: r.doc_type,
        number: r.doc_number,
        entityName: r.entity_name,
        date: r.doc_date,
        amount: r.amount,
        status: r.status,
        id: r.id,
        url: r.url,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  });
}
