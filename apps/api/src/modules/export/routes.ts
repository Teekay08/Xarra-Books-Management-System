import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

/** Parse optional from/to date range query params (validates YYYY-MM-DD format) */
function parseDateRange(query: any): { from?: string; to?: string } {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof query?.from === 'string' && dateRe.test(query.from) ? query.from : undefined;
  const to = typeof query?.to === 'string' && dateRe.test(query.to) ? query.to : undefined;
  return { from, to };
}

/** Build a WHERE clause fragment for a date column with optional range */
function dateFilter(column: string, from?: string, to?: string): string {
  const conditions: string[] = [];
  if (from) conditions.push(`${column} >= '${from}'`);
  if (to) conditions.push(`${column} <= '${to}'`);
  return conditions.length > 0 ? conditions.join(' AND ') : '';
}

/** Convert rows to CSV string */
function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  const headers = columns.map((c) => `"${c.header}"`).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(','),
  );
  return '\uFEFF' + [headers, ...lines].join('\r\n');
}

function csvReply(reply: any, csv: string, filename: string) {
  return reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv);
}

export async function exportRoutes(app: FastifyInstance) {

  // ========== TITLES ==========
  app.get('/titles', { preHandler: requireAuth }, async (_request, reply) => {
    const rows = await app.db.execute(sql`
      SELECT t.title, t.subtitle, t.isbn_13 AS isbn, a.legal_name AS author, a.pen_name AS author_pen_name,
             t.rrp_zar AS rrp, t.cost_price_zar AS cost_price, t.formats, t.status,
             t.publish_date, t.page_count, t.weight_grams, t.created_at
      FROM titles t
      LEFT JOIN authors a ON a.id = t.primary_author_id
      ORDER BY t.title ASC
    `);
    const csv = toCsv(rows as any[], [
      { key: 'title', header: 'Title' }, { key: 'subtitle', header: 'Subtitle' },
      { key: 'isbn', header: 'ISBN-13' }, { key: 'author', header: 'Author' },
      { key: 'author_pen_name', header: 'Pen Name' }, { key: 'rrp', header: 'RRP (ZAR)' },
      { key: 'cost_price', header: 'Cost Price (ZAR)' }, { key: 'formats', header: 'Formats' },
      { key: 'status', header: 'Status' }, { key: 'publish_date', header: 'Publish Date' },
      { key: 'page_count', header: 'Page Count' }, { key: 'weight_grams', header: 'Weight (g)' },
      { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `titles-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== AUTHORS ==========
  app.get('/authors', { preHandler: requireAuth }, async (_request, reply) => {
    const rows = await app.db.execute(sql`
      SELECT legal_name, pen_name, type, email, phone, city, province, country,
             tax_number, is_active, created_at
      FROM authors ORDER BY legal_name ASC
    `);
    const csv = toCsv(rows as any[], [
      { key: 'legal_name', header: 'Legal Name' }, { key: 'pen_name', header: 'Pen Name' },
      { key: 'type', header: 'Type' }, { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' }, { key: 'city', header: 'City' },
      { key: 'province', header: 'Province' }, { key: 'country', header: 'Country' },
      { key: 'tax_number', header: 'Tax Number' }, { key: 'is_active', header: 'Active' },
      { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `authors-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== CHANNEL PARTNERS ==========
  app.get('/partners', { preHandler: requireAuth }, async (_request, reply) => {
    const rows = await app.db.execute(sql`
      SELECT name, discount_pct, sor_days, payment_terms_days, contact_name, contact_email,
             contact_phone, city, province, vat_number, is_active, created_at
      FROM channel_partners ORDER BY name ASC
    `);
    const csv = toCsv(rows as any[], [
      { key: 'name', header: 'Name' }, { key: 'discount_pct', header: 'Discount %' },
      { key: 'sor_days', header: 'SOR Days' }, { key: 'payment_terms_days', header: 'Payment Terms (Days)' },
      { key: 'contact_name', header: 'Contact' }, { key: 'contact_email', header: 'Email' },
      { key: 'contact_phone', header: 'Phone' }, { key: 'city', header: 'City' },
      { key: 'province', header: 'Province' }, { key: 'vat_number', header: 'VAT Number' },
      { key: 'is_active', header: 'Active' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `partners-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== INVOICES ==========
  app.get('/invoices', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('i.invoice_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT i.number, cp.name AS partner, i.invoice_date, i.due_date, i.subtotal, i.vat_amount,
             i.total, i.status, i.purchase_order_number, i.customer_reference, i.notes, i.created_at
      FROM invoices i
      LEFT JOIN channel_partners cp ON cp.id = i.partner_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY i.invoice_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Invoice #' }, { key: 'partner', header: 'Partner' },
      { key: 'invoice_date', header: 'Invoice Date' }, { key: 'due_date', header: 'Due Date' },
      { key: 'subtotal', header: 'Subtotal' }, { key: 'vat_amount', header: 'VAT' },
      { key: 'total', header: 'Total' }, { key: 'status', header: 'Status' },
      { key: 'purchase_order_number', header: 'PO Number' },
      { key: 'customer_reference', header: 'Customer Ref' },
      { key: 'notes', header: 'Notes' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `invoices-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== INVOICE LINES ==========
  app.get('/invoice-lines', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('i.invoice_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT i.number AS invoice_number, il.description, il.quantity, il.unit_price,
             il.discount_pct, il.line_total, il.line_tax
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY i.invoice_date DESC, il.line_number ASC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'invoice_number', header: 'Invoice #' }, { key: 'description', header: 'Description' },
      { key: 'quantity', header: 'Quantity' }, { key: 'unit_price', header: 'Unit Price' },
      { key: 'discount_pct', header: 'Discount %' }, { key: 'line_total', header: 'Line Total' },
      { key: 'line_tax', header: 'Line Tax' },
    ]);
    return csvReply(reply, csv, `invoice-lines-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== PAYMENTS ==========
  app.get('/payments', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('p.payment_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT cp.name AS partner, p.amount, p.payment_date, p.payment_method,
             p.bank_reference, p.notes, p.created_at
      FROM payments p
      LEFT JOIN channel_partners cp ON cp.id = p.partner_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY p.payment_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'partner', header: 'Partner' }, { key: 'amount', header: 'Amount' },
      { key: 'payment_date', header: 'Payment Date' }, { key: 'payment_method', header: 'Method' },
      { key: 'bank_reference', header: 'Bank Reference' }, { key: 'notes', header: 'Notes' },
      { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `payments-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== QUOTATIONS ==========
  app.get('/quotations', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('q.quotation_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT q.number, cp.name AS partner, q.quotation_date, q.valid_until,
             q.subtotal, q.vat_amount, q.total, q.status, q.notes, q.created_at
      FROM quotations q
      LEFT JOIN channel_partners cp ON cp.id = q.partner_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY q.quotation_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Quotation #' }, { key: 'partner', header: 'Partner' },
      { key: 'quotation_date', header: 'Date' }, { key: 'valid_until', header: 'Valid Until' },
      { key: 'subtotal', header: 'Subtotal' }, { key: 'vat_amount', header: 'VAT' },
      { key: 'total', header: 'Total' }, { key: 'status', header: 'Status' },
      { key: 'notes', header: 'Notes' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `quotations-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== PURCHASE ORDERS ==========
  app.get('/purchase-orders', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('po.order_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT po.number, COALESCE(cp.name, po.supplier_name) AS supplier,
             po.order_date, po.expected_delivery_date, po.subtotal, po.vat_amount,
             po.total, po.status, po.notes, po.created_at
      FROM purchase_orders po
      LEFT JOIN channel_partners cp ON cp.id = po.supplier_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY po.order_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'PO #' }, { key: 'supplier', header: 'Supplier' },
      { key: 'order_date', header: 'Order Date' }, { key: 'expected_delivery_date', header: 'Expected Delivery' },
      { key: 'subtotal', header: 'Subtotal' }, { key: 'vat_amount', header: 'VAT' },
      { key: 'total', header: 'Total' }, { key: 'status', header: 'Status' },
      { key: 'notes', header: 'Notes' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `purchase-orders-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== CREDIT NOTES ==========
  app.get('/credit-notes', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('cn.created_at', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT cn.number, cp.name AS partner, i.number AS invoice_number,
             cn.subtotal, cn.vat_amount, cn.total, cn.reason, cn.created_at
      FROM credit_notes cn
      LEFT JOIN channel_partners cp ON cp.id = cn.partner_id
      LEFT JOIN invoices i ON i.id = cn.invoice_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY cn.created_at DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Credit Note #' }, { key: 'partner', header: 'Partner' },
      { key: 'invoice_number', header: 'Invoice #' }, { key: 'subtotal', header: 'Subtotal' },
      { key: 'vat_amount', header: 'VAT' }, { key: 'total', header: 'Total' },
      { key: 'reason', header: 'Reason' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `credit-notes-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== DEBIT NOTES ==========
  app.get('/debit-notes', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('dn.created_at', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT dn.number, cp.name AS partner, i.number AS invoice_number,
             dn.subtotal, dn.vat_amount, dn.total, dn.reason, dn.created_at
      FROM debit_notes dn
      LEFT JOIN channel_partners cp ON cp.id = dn.partner_id
      LEFT JOIN invoices i ON i.id = dn.invoice_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY dn.created_at DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Debit Note #' }, { key: 'partner', header: 'Partner' },
      { key: 'invoice_number', header: 'Invoice #' }, { key: 'subtotal', header: 'Subtotal' },
      { key: 'vat_amount', header: 'VAT' }, { key: 'total', header: 'Total' },
      { key: 'reason', header: 'Reason' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `debit-notes-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== REMITTANCES ==========
  app.get('/remittances', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('r.created_at', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT cp.name AS partner, r.partner_ref, r.period_from, r.period_to,
             r.total_amount, r.parse_method, r.status, r.notes, r.created_at
      FROM remittances r
      LEFT JOIN channel_partners cp ON cp.id = r.partner_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY r.created_at DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'partner', header: 'Partner' }, { key: 'partner_ref', header: 'Partner Ref' },
      { key: 'period_from', header: 'Period From' }, { key: 'period_to', header: 'Period To' },
      { key: 'total_amount', header: 'Total Amount' }, { key: 'parse_method', header: 'Parse Method' },
      { key: 'status', header: 'Status' }, { key: 'notes', header: 'Notes' },
      { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `remittances-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== CONSIGNMENTS ==========
  app.get('/consignments', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('c.dispatch_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT c.number, cp.name AS partner, c.dispatch_date, c.status,
             c.courier_company, c.courier_waybill, c.notes, c.created_at
      FROM consignments c
      LEFT JOIN channel_partners cp ON cp.id = c.partner_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY c.dispatch_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Consignment #' }, { key: 'partner', header: 'Partner' },
      { key: 'dispatch_date', header: 'Dispatch Date' }, { key: 'status', header: 'Status' },
      { key: 'courier_company', header: 'Courier' }, { key: 'courier_waybill', header: 'Waybill' },
      { key: 'notes', header: 'Notes' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `consignments-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== CONSIGNMENT LINES ==========
  app.get('/consignment-lines', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('c.dispatch_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT c.number AS consignment_number, t.title, cl.qty_dispatched, cl.qty_sold,
             cl.qty_returned, cl.sor_expiry_date
      FROM consignment_lines cl
      JOIN consignments c ON c.id = cl.consignment_id
      LEFT JOIN titles t ON t.id = cl.title_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY c.dispatch_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'consignment_number', header: 'Consignment #' }, { key: 'title', header: 'Title' },
      { key: 'qty_dispatched', header: 'Qty Dispatched' }, { key: 'qty_sold', header: 'Qty Sold' },
      { key: 'qty_returned', header: 'Qty Returned' }, { key: 'sor_expiry_date', header: 'SOR Expiry' },
    ]);
    return csvReply(reply, csv, `consignment-lines-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== INVENTORY ==========
  app.get('/inventory', { preHandler: requireAuth }, async (_request, reply) => {
    const rows = await app.db.execute(sql`
      SELECT t.title, t.isbn_13 AS isbn, t.rrp_zar AS rrp,
             COALESCE(SUM(im.quantity), 0) AS stock_on_hand
      FROM titles t
      LEFT JOIN inventory_movements im ON im.title_id = t.id
      WHERE t.status != 'OUT_OF_PRINT'
      GROUP BY t.id, t.title, t.isbn_13, t.rrp_zar
      ORDER BY t.title ASC
    `);
    const csv = toCsv(rows as any[], [
      { key: 'title', header: 'Title' }, { key: 'isbn', header: 'ISBN-13' },
      { key: 'rrp', header: 'RRP (ZAR)' }, { key: 'stock_on_hand', header: 'Stock on Hand' },
    ]);
    return csvReply(reply, csv, `inventory-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== INVENTORY MOVEMENTS ==========
  app.get('/inventory-movements', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('im.created_at', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT t.title, im.movement_type, im.quantity, im.location, im.reason,
             im.reference, im.notes, im.created_at
      FROM inventory_movements im
      LEFT JOIN titles t ON t.id = im.title_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY im.created_at DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'title', header: 'Title' }, { key: 'movement_type', header: 'Type' },
      { key: 'quantity', header: 'Quantity' }, { key: 'location', header: 'Location' },
      { key: 'reason', header: 'Reason' }, { key: 'reference', header: 'Reference' },
      { key: 'notes', header: 'Notes' }, { key: 'created_at', header: 'Date' },
    ]);
    return csvReply(reply, csv, `inventory-movements-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== RETURNS ==========
  app.get('/returns', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('ra.return_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT ra.number, cp.name AS partner, ra.return_date, ra.status,
             ra.reason, ra.notes, ra.created_at
      FROM returns_authorizations ra
      LEFT JOIN channel_partners cp ON cp.id = ra.partner_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY ra.return_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Return #' }, { key: 'partner', header: 'Partner' },
      { key: 'return_date', header: 'Return Date' }, { key: 'status', header: 'Status' },
      { key: 'reason', header: 'Reason' }, { key: 'notes', header: 'Notes' },
      { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `returns-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== CASH SALES ==========
  app.get('/cash-sales', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('sale_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT number, sale_date, customer_name, subtotal, vat_amount, total,
             payment_method, payment_reference, notes,
             CASE WHEN voided_at IS NOT NULL THEN 'VOIDED' ELSE 'COMPLETED' END AS status,
             created_at
      FROM cash_sales
      ${df ? 'WHERE ' + df : ''}
      ORDER BY sale_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Sale #' }, { key: 'sale_date', header: 'Sale Date' },
      { key: 'customer_name', header: 'Customer' }, { key: 'subtotal', header: 'Subtotal' },
      { key: 'vat_amount', header: 'VAT' }, { key: 'total', header: 'Total' },
      { key: 'payment_method', header: 'Payment Method' }, { key: 'payment_reference', header: 'Reference' },
      { key: 'status', header: 'Status' }, { key: 'notes', header: 'Notes' },
      { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `cash-sales-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== EXPENSES ==========
  app.get('/expenses', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('e.expense_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT ec.name AS category, e.description, e.amount, e.tax_amount,
             e.expense_date, e.payment_method, e.reference, e.notes, e.created_at
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY e.expense_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'category', header: 'Category' }, { key: 'description', header: 'Description' },
      { key: 'amount', header: 'Amount' }, { key: 'tax_amount', header: 'Tax Amount' },
      { key: 'expense_date', header: 'Expense Date' }, { key: 'payment_method', header: 'Payment Method' },
      { key: 'reference', header: 'Reference' }, { key: 'notes', header: 'Notes' },
      { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `expenses-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== EXPENSE CLAIMS ==========
  app.get('/expense-claims', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('ec.claim_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT ec.number, u.name AS claimant, ec.claim_date, ec.total_amount,
             ec.status, ec.notes, ec.created_at
      FROM expense_claims ec
      LEFT JOIN "user" u ON u.id = ec.claimant_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY ec.claim_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Claim #' }, { key: 'claimant', header: 'Claimant' },
      { key: 'claim_date', header: 'Claim Date' }, { key: 'total_amount', header: 'Total Amount' },
      { key: 'status', header: 'Status' }, { key: 'notes', header: 'Notes' },
      { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `expense-claims-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== REQUISITIONS ==========
  app.get('/requisitions', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('r.created_at', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT r.number, u.name AS requested_by, r.department, r.required_by_date,
             r.total_estimate, r.status, r.notes, r.created_at
      FROM requisitions r
      LEFT JOIN "user" u ON u.id = r.requested_by
      ${df ? 'WHERE ' + df : ''}
      ORDER BY r.created_at DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'number', header: 'Requisition #' }, { key: 'requested_by', header: 'Requested By' },
      { key: 'department', header: 'Department' }, { key: 'required_by_date', header: 'Required By' },
      { key: 'total_estimate', header: 'Total Estimate' }, { key: 'status', header: 'Status' },
      { key: 'notes', header: 'Notes' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `requisitions-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== SALE RECORDS ==========
  app.get('/sale-records', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('sr.sale_date', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT t.title, sr.channel, cp.name AS partner, sr.quantity, sr.unit_price,
             sr.commission, sr.net_revenue, sr.currency, sr.exchange_rate,
             sr.order_ref, sr.customer_name, sr.sale_date, sr.source, sr.status
      FROM sale_records sr
      LEFT JOIN titles t ON t.id = sr.title_id
      LEFT JOIN channel_partners cp ON cp.id = sr.partner_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY sr.sale_date DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'title', header: 'Title' }, { key: 'channel', header: 'Channel' },
      { key: 'partner', header: 'Partner' }, { key: 'quantity', header: 'Quantity' },
      { key: 'unit_price', header: 'Unit Price' }, { key: 'commission', header: 'Commission' },
      { key: 'net_revenue', header: 'Net Revenue' }, { key: 'currency', header: 'Currency' },
      { key: 'exchange_rate', header: 'Exchange Rate' }, { key: 'order_ref', header: 'Order Ref' },
      { key: 'customer_name', header: 'Customer' }, { key: 'sale_date', header: 'Sale Date' },
      { key: 'source', header: 'Source' }, { key: 'status', header: 'Status' },
    ]);
    return csvReply(reply, csv, `sale-records-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== ROYALTY LEDGER ==========
  app.get('/royalty-ledger', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = parseDateRange(request.query);
    const df = dateFilter('rl.created_at', from, to);
    const rows = await app.db.execute(sql.raw(`
      SELECT a.legal_name AS author, t.title, rl.entry_type, rl.description,
             rl.gross_amount, rl.royalty_rate, rl.royalty_amount, rl.period_from,
             rl.period_to, rl.created_at
      FROM royalty_ledger rl
      LEFT JOIN authors a ON a.id = rl.author_id
      LEFT JOIN titles t ON t.id = rl.title_id
      ${df ? 'WHERE ' + df : ''}
      ORDER BY rl.created_at DESC
    `));
    const csv = toCsv(rows as any[], [
      { key: 'author', header: 'Author' }, { key: 'title', header: 'Title' },
      { key: 'entry_type', header: 'Entry Type' }, { key: 'description', header: 'Description' },
      { key: 'gross_amount', header: 'Gross Amount' }, { key: 'royalty_rate', header: 'Royalty Rate' },
      { key: 'royalty_amount', header: 'Royalty Amount' }, { key: 'period_from', header: 'Period From' },
      { key: 'period_to', header: 'Period To' }, { key: 'created_at', header: 'Created' },
    ]);
    return csvReply(reply, csv, `royalty-ledger-export-${new Date().toISOString().split('T')[0]}.csv`);
  });

  // ========== FULL SYSTEM EXPORT (admin only) ==========
  app.get('/full', { preHandler: requireRole('admin') }, async (_request, reply) => {
    // Returns a JSON manifest of all data for system migration
    const [
      titleRows, authorRows, partnerRows, invoiceRows, invoiceLineRows,
      paymentRows, allocationRows, quotationRows, quotationLineRows,
      creditNoteRows, debitNoteRows, consignmentRows, consignmentLineRows,
      inventoryRows, expenseRows, expenseCategoryRows, saleRecordRows,
      remittanceRows, cashSaleRows, cashSaleLineRows,
      purchaseOrderRows, purchaseOrderLineRows,
    ] = await Promise.all([
      app.db.execute(sql`SELECT * FROM titles ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM authors ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM channel_partners ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM invoices ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM invoice_lines ORDER BY invoice_id, line_number`),
      app.db.execute(sql`SELECT * FROM payments ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM payment_allocations`),
      app.db.execute(sql`SELECT * FROM quotations ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM quotation_lines ORDER BY quotation_id, line_number`),
      app.db.execute(sql`SELECT * FROM credit_notes ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM debit_notes ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM consignments ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM consignment_lines ORDER BY consignment_id`),
      app.db.execute(sql`SELECT * FROM inventory_movements ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM expenses ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM expense_categories ORDER BY name`),
      app.db.execute(sql`SELECT * FROM sale_records ORDER BY sale_date`),
      app.db.execute(sql`SELECT * FROM remittances ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM cash_sales ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM cash_sale_lines ORDER BY cash_sale_id`),
      app.db.execute(sql`SELECT * FROM purchase_orders ORDER BY created_at`),
      app.db.execute(sql`SELECT * FROM purchase_order_lines ORDER BY purchase_order_id`),
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      system: 'Xarra Books Management System',
      data: {
        titles: titleRows,
        authors: authorRows,
        channelPartners: partnerRows,
        invoices: invoiceRows,
        invoiceLines: invoiceLineRows,
        payments: paymentRows,
        paymentAllocations: allocationRows,
        quotations: quotationRows,
        quotationLines: quotationLineRows,
        creditNotes: creditNoteRows,
        debitNotes: debitNoteRows,
        consignments: consignmentRows,
        consignmentLines: consignmentLineRows,
        inventoryMovements: inventoryRows,
        expenses: expenseRows,
        expenseCategories: expenseCategoryRows,
        saleRecords: saleRecordRows,
        remittances: remittanceRows,
        cashSales: cashSaleRows,
        cashSaleLines: cashSaleLineRows,
        purchaseOrders: purchaseOrderRows,
        purchaseOrderLines: purchaseOrderLineRows,
      },
    };

    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="xarra-books-full-export-${new Date().toISOString().split('T')[0]}.json"`)
      .send(JSON.stringify(exportData, null, 2));
  });
}
