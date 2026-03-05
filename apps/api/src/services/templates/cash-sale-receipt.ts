interface CashSaleReceiptLine {
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
}

interface CashSaleReceiptData {
  number: string;
  saleDate: string;
  customerName?: string | null;
  paymentMethod: string;
  paymentReference?: string | null;
  company?: {
    name: string;
    tradingAs?: string | null;
    vatNumber?: string | null;
    registrationNumber?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  lines: CashSaleReceiptLine[];
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

export function renderCashSaleReceiptHtml(data: CashSaleReceiptData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const addressParts = [
    company.addressLine1,
    company.addressLine2,
    [company.city, company.province].filter(Boolean).join(', '),
    company.postalCode,
  ].filter(Boolean);

  const companyAddressHtml = addressParts.length > 0
    ? addressParts.join(' &middot; ')
    : 'Midrand, Gauteng, South Africa';

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:50px;max-width:180px;margin-bottom:8px">`
    : '';

  const linesHtml = data.lines.map((line) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${line.description}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${line.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.unitPrice)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.lineTotal)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #166534; }
    .company-name { font-size: 22px; font-weight: bold; color: #166534; }
    .company-sub { font-size: 11px; color: #666; margin-top: 2px; }
    .receipt-title { font-size: 20px; font-weight: bold; color: #166534; text-align: center; margin: 16px 0 20px; letter-spacing: 1px; }
    .meta { margin-bottom: 20px; font-size: 12px; }
    .meta-row { display: flex; justify-content: space-between; padding: 3px 0; }
    .meta-label { color: #666; }
    .meta-value { font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #166534; font-size: 11px; text-transform: uppercase; color: #555; }
    .totals { margin-left: auto; width: 240px; }
    .totals tr td { padding: 4px 8px; font-size: 12px; }
    .totals .grand-total td { border-top: 2px solid #166534; font-weight: bold; font-size: 15px; padding-top: 8px; }
    .notes { margin-top: 16px; padding: 10px; background: #f9f9f9; border-radius: 4px; font-size: 12px; }
    .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <div class="company-name">${company.name}</div>
    ${company.tradingAs ? `<div class="company-sub">Trading as ${company.tradingAs}</div>` : ''}
    <div class="company-sub">${companyAddressHtml}</div>
    ${company.phone ? `<div class="company-sub">Tel: ${company.phone}</div>` : ''}
    ${company.email ? `<div class="company-sub">${company.email}</div>` : ''}
    ${company.vatNumber ? `<div class="company-sub">VAT No: ${company.vatNumber}</div>` : ''}
    ${company.registrationNumber ? `<div class="company-sub">Reg No: ${company.registrationNumber}</div>` : ''}
  </div>

  <div class="receipt-title">CASH SALE RECEIPT</div>

  <div class="meta">
    <div class="meta-row">
      <span class="meta-label">Receipt No:</span>
      <span class="meta-value">${data.number}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Date:</span>
      <span class="meta-value">${formatDate(data.saleDate)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Payment Method:</span>
      <span class="meta-value">${data.paymentMethod}</span>
    </div>
    ${data.paymentReference ? `
    <div class="meta-row">
      <span class="meta-label">Reference:</span>
      <span class="meta-value">${data.paymentReference}</span>
    </div>
    ` : ''}
    ${data.customerName ? `
    <div class="meta-row">
      <span class="meta-label">Customer:</span>
      <span class="meta-value">${data.customerName}</span>
    </div>
    ` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Price</th>
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
    <p>${company.name}${company.registrationNumber ? ` | Reg: ${company.registrationNumber}` : ''}${company.vatNumber ? ` | VAT: ${company.vatNumber}` : ''}</p>
    <p>Thank you for your purchase</p>
  </div>
</body>
</html>`;
}
