interface InvoiceLine {
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  discountType?: string;
  lineTotal: string;
  lineTax: string;
}

interface CompanyInfo {
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
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    branchCode: string;
    accountType: string;
  };
}

interface RecipientInfo {
  name: string;
  branchName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  vatNumber?: string | null;
}

interface InvoiceData {
  number: string;
  invoiceDate: string;
  dueDate: string;
  purchaseOrderNumber?: string | null;
  customerReference?: string | null;
  amountPaid?: string | number | null;
  company?: CompanyInfo;
  recipient: RecipientInfo;
  lines: InvoiceLine[];
  subtotal: string;
  vatAmount: string;
  total: string;
  notes?: string | null;
  paymentTermsText?: string | null;
}

function formatCurrency(value: string | number): string {
  return `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatAddress(addr: { addressLine1?: string | null; addressLine2?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }): string {
  const parts = [addr.addressLine1, addr.addressLine2, [addr.city, addr.province].filter(Boolean).join(', '), addr.postalCode].filter(Boolean);
  return parts.map(p => `<p style="margin:2px 0">${p}</p>`).join('');
}

function formatDiscount(line: InvoiceLine): string {
  if (line.discountType === 'FIXED') {
    return formatCurrency(line.discountPct);
  }
  return `${Number(line.discountPct)}%`;
}

export function renderInvoiceHtml(data: InvoiceData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const linesHtml = data.lines.map((line) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${line.lineNumber}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${line.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${line.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.unitPrice)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatDiscount(line)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.lineTotal)}</td>
    </tr>
  `).join('');

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const companyAddressHtml = formatAddress(company as any);

  const recipientAddressHtml = formatAddress(data.recipient);

  const bankDetailsHtml = company.bankDetails ? `
    <div style="margin-top:20px;padding:12px;background:#f0f7f0;border-radius:4px;font-size:12px">
      <strong>Banking Details</strong><br>
      Bank: ${company.bankDetails.bankName}<br>
      Account: ${company.bankDetails.accountNumber}<br>
      Branch Code: ${company.bankDetails.branchCode}<br>
      Account Type: ${company.bankDetails.accountType}<br>
      Reference: ${data.number}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
    .company { font-size: 24px; font-weight: bold; color: #166534; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .invoice-title { font-size: 28px; font-weight: bold; color: #166534; text-align: right; }
    .invoice-meta { text-align: right; font-size: 12px; color: #555; margin-top: 8px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party { width: 48%; }
    .party h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 8px; letter-spacing: 0.5px; }
    .party p { margin: 2px 0; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #166534; font-size: 11px; text-transform: uppercase; color: #555; }
    .totals { width: 280px; }
    .totals tr td { padding: 6px 8px; }
    .totals .grand-total td { border-top: 2px solid #166534; font-weight: bold; font-size: 16px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
    .notes { margin-top: 20px; padding: 12px; background: #f9f9f9; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div class="company">${company.name}</div>
      ${company.tradingAs ? `<div class="company-sub">Trading as ${company.tradingAs}</div>` : ''}
    </div>
    <div>
      <div class="invoice-title">TAX INVOICE</div>
      <div class="invoice-meta">
        <strong>${data.number}</strong><br>
        Date: ${formatDate(data.invoiceDate)}<br>
        Due: ${formatDate(data.dueDate)}
        ${data.purchaseOrderNumber ? `<br>PO: ${data.purchaseOrderNumber}` : ''}
        ${data.customerReference ? `<br>Ref: ${data.customerReference}` : ''}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>From</h3>
      <p><strong>${company.name}</strong></p>
      ${companyAddressHtml ? companyAddressHtml : '<p>Midrand, Gauteng, South Africa</p>'}
      ${company.vatNumber ? `<p>VAT: ${company.vatNumber}</p>` : ''}
      ${company.registrationNumber ? `<p>Reg: ${company.registrationNumber}</p>` : ''}
      ${company.phone ? `<p>Tel: ${company.phone}</p>` : ''}
      ${company.email ? `<p>${company.email}</p>` : ''}
    </div>
    <div class="party">
      <h3>Bill To</h3>
      <p><strong>${data.recipient.name}</strong></p>
      ${data.recipient.branchName ? `<p><em>Branch: ${data.recipient.branchName}</em></p>` : ''}
      ${data.recipient.contactName ? `<p>${data.recipient.contactName}</p>` : ''}
      ${recipientAddressHtml}
      ${data.recipient.vatNumber ? `<p>VAT: ${data.recipient.vatNumber}</p>` : ''}
      ${data.recipient.contactEmail ? `<p>${data.recipient.contactEmail}</p>` : ''}
    </div>
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

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:20px">
    <div style="width:55%">
      ${bankDetailsHtml}
    </div>
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
      ${data.amountPaid && Number(data.amountPaid) > 0 ? `
      <tr>
        <td>Amount Paid</td>
        <td style="text-align:right;color:#166534">(${formatCurrency(data.amountPaid)})</td>
      </tr>
      <tr class="grand-total">
        <td>Balance Due</td>
        <td style="text-align:right">${formatCurrency(Number(data.total) - Number(data.amountPaid))}</td>
      </tr>
      ` : ''}
    </table>
  </div>

  ${data.notes ? `<div class="notes"><strong>Notes:</strong> ${data.notes}</div>` : ''}

  ${data.paymentTermsText ? `<div class="notes"><strong>Payment Terms:</strong> ${data.paymentTermsText}</div>` : ''}

  <div class="footer">
    <p>${company.name}${company.registrationNumber ? ` (Reg: ${company.registrationNumber})` : ''}</p>
    <p>Payment terms: EFT to account details provided. Reference: ${data.number}</p>
  </div>
</body>
</html>`;
}
