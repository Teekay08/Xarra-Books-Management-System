interface InvoiceLine {
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
}

interface InvoiceData {
  number: string;
  invoiceDate: string;
  dueDate: string;
  partner: { name: string; contactName?: string | null; contactEmail?: string | null };
  lines: InvoiceLine[];
  subtotal: string;
  vatAmount: string;
  total: string;
  notes?: string | null;
}

function formatCurrency(value: string | number): string {
  return `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function renderInvoiceHtml(data: InvoiceData): string {
  const linesHtml = data.lines.map((line) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${line.lineNumber}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${line.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${line.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.unitPrice)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${Number(line.discountPct)}%</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.lineTotal)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .company { font-size: 24px; font-weight: bold; color: #166534; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .invoice-title { font-size: 28px; font-weight: bold; color: #166534; text-align: right; }
    .invoice-meta { text-align: right; font-size: 12px; color: #555; margin-top: 8px; }
    .bill-to { margin-bottom: 30px; }
    .bill-to h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 8px; }
    .bill-to p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #166534; font-size: 11px; text-transform: uppercase; color: #555; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td { padding: 6px 8px; }
    .totals .grand-total td { border-top: 2px solid #166534; font-weight: bold; font-size: 16px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
    .notes { margin-top: 20px; padding: 12px; background: #f9f9f9; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company">Xarra Books</div>
      <div class="company-sub">Publishing & Distribution</div>
      <div class="company-sub">Midrand, Gauteng, South Africa</div>
    </div>
    <div>
      <div class="invoice-title">TAX INVOICE</div>
      <div class="invoice-meta">
        <strong>${data.number}</strong><br>
        Date: ${formatDate(data.invoiceDate)}<br>
        Due: ${formatDate(data.dueDate)}
      </div>
    </div>
  </div>

  <div class="bill-to">
    <h3>Bill To</h3>
    <p><strong>${data.partner.name}</strong></p>
    ${data.partner.contactName ? `<p>${data.partner.contactName}</p>` : ''}
    ${data.partner.contactEmail ? `<p>${data.partner.contactEmail}</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>Description</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Discount</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <table class="totals">
    <tr>
      <td>Subtotal</td>
      <td style="text-align:right">${formatCurrency(data.subtotal)}</td>
    </tr>
    <tr>
      <td>VAT (15%)</td>
      <td style="text-align:right">${formatCurrency(data.vatAmount)}</td>
    </tr>
    <tr class="grand-total">
      <td>Total</td>
      <td style="text-align:right">${formatCurrency(data.total)}</td>
    </tr>
  </table>

  ${data.notes ? `<div class="notes"><strong>Notes:</strong> ${data.notes}</div>` : ''}

  <div class="footer">
    <p>Xarra Books (Pty) Ltd &mdash; Midrand, Gauteng, South Africa</p>
    <p>Payment terms: EFT to account details provided separately. Reference: ${data.number}</p>
  </div>
</body>
</html>`;
}
