interface ProformaLine {
  lineNumber: number;
  description: string;
  isbn: string | null;
  quantity: number;
  unitRrp: string;
  discountPct: string;
  netPrice: string;
  lineTotal: string;
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

interface SorProformaData {
  proformaNumber: string;
  partnerPoNumber?: string | null;
  /** Linked order ref (POR-YYYY-NNNN) if this SOR originated from an order */
  orderNumber?: string | null;
  dispatchDate: string;
  sorExpiryDate?: string | null;
  sorDays?: number;
  courierCompany?: string | null;
  courierWaybill?: string | null;
  company?: CompanyInfo;
  recipient: RecipientInfo;
  lines: ProformaLine[];
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

function formatAddress(addr: { addressLine1?: string | null; addressLine2?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }): string {
  const parts = [addr.addressLine1, addr.addressLine2, [addr.city, addr.province].filter(Boolean).join(', '), addr.postalCode].filter(Boolean);
  return parts.map(p => `<p style="margin:2px 0">${p}</p>`).join('');
}

export function renderSorProformaHtml(data: SorProformaData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const linesHtml = data.lines.map((line) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${line.lineNumber}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">
        ${line.description}
        ${line.isbn ? `<br><span style="font-size:11px;color:#888">ISBN: ${line.isbn}</span>` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${line.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.unitRrp)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${Number(line.discountPct)}%</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.netPrice)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.lineTotal)}</td>
    </tr>
  `).join('');

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const companyAddressHtml = formatAddress(company as any);
  const recipientAddressHtml = formatAddress(data.recipient);

  const totalQty = data.lines.reduce((s, l) => s + l.quantity, 0);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
    .company { font-size: 24px; font-weight: bold; color: #166534; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .doc-title { font-size: 24px; font-weight: bold; color: #166534; text-align: right; }
    .doc-meta { text-align: right; font-size: 12px; color: #555; margin-top: 8px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .party { width: 48%; }
    .party h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 8px; }
    .party p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #166534; font-size: 11px; text-transform: uppercase; color: #555; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td { padding: 6px 8px; }
    .totals .grand-total td { border-top: 2px solid #166534; font-weight: bold; font-size: 16px; }
    .sor-banner { background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
    .sor-banner strong { color: #B45309; }
    .courier-info { background: #f0f7ff; border-radius: 4px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
    .notes { margin-top: 20px; padding: 12px; background: #f9f9f9; border-radius: 4px; font-size: 12px; }
    @media print {
      body { margin: 0; }
      button, .no-print { display: none !important; }
    }
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
      <div class="doc-title">SOR PRO-FORMA<br>INVOICE</div>
      <div class="doc-meta">
        <strong>${data.proformaNumber}</strong><br>
        Date: ${formatDate(data.dispatchDate)}
        ${data.partnerPoNumber ? `<br>Partner PO: ${data.partnerPoNumber}` : ''}
        ${data.sorExpiryDate ? `<br>SOR Expiry: ${formatDate(data.sorExpiryDate)}` : ''}
      </div>
    </div>
  </div>

  ${(data.orderNumber || data.partnerPoNumber) ? `
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    ${data.orderNumber ? `<span style="background:#e0f2fe;color:#0369a1;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">Order: ${data.orderNumber}</span>` : ''}
    ${data.partnerPoNumber ? `<span style="background:#f3f4f6;color:#374151;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">Partner PO: ${data.partnerPoNumber}</span>` : ''}
  </div>
  ` : ''}

  <div class="sor-banner">
    <strong>Sale or Return (SOR) Terms</strong><br>
    These goods are supplied on a Sale or Return basis.
    ${data.sorDays ? `The SOR period is <strong>${data.sorDays} days</strong> from date of dispatch.` : ''}
    ${data.sorExpiryDate ? ` SOR expires on <strong>${formatDate(data.sorExpiryDate)}</strong>.` : ''}
    Unsold items must be returned in saleable condition before the SOR expiry date.
    A tax invoice will be issued upon expiry for all sold items.
  </div>

  ${data.courierCompany || data.courierWaybill ? `
  <div class="courier-info">
    <strong>Courier Details</strong><br>
    ${data.courierCompany ? `Courier: ${data.courierCompany}` : ''}
    ${data.courierWaybill ? `${data.courierCompany ? ' · ' : ''}Waybill: ${data.courierWaybill}` : ''}
  </div>
  ` : ''}

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
      <h3>Deliver To</h3>
      <p><strong>${data.recipient.name}</strong></p>
      ${data.recipient.branchName ? `<p><em>Branch: ${data.recipient.branchName}</em></p>` : ''}
      ${data.recipient.contactName ? `<p>${data.recipient.contactName}</p>` : ''}
      ${recipientAddressHtml}
      ${data.recipient.vatNumber ? `<p>VAT: ${data.recipient.vatNumber}</p>` : ''}
      ${data.recipient.contactEmail ? `<p>${data.recipient.contactEmail}</p>` : ''}
      <p style="margin-top:8px;font-size:11px;color:#666">Titles: <strong>${data.lines.length}</strong> · Copies: <strong>${totalQty}</strong></p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:35px">#</th>
        <th>Title</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">RRP</th>
        <th style="text-align:right">Discount</th>
        <th style="text-align:right">Net Price</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <table class="totals">
    <tr>
      <td>Subtotal (excl. VAT)</td>
      <td style="text-align:right">${formatCurrency(data.subtotal)}</td>
    </tr>
    <tr>
      <td>VAT (15%)</td>
      <td style="text-align:right">${formatCurrency(data.vatAmount)}</td>
    </tr>
    <tr class="grand-total">
      <td>Total (incl. VAT)</td>
      <td style="text-align:right">${formatCurrency(data.total)}</td>
    </tr>
  </table>

  ${data.notes ? `<div class="notes"><strong>Notes:</strong> ${data.notes}</div>` : ''}

  <div class="footer">
    <p><strong>This is a pro-forma invoice for Sale or Return goods only and is not a tax invoice.</strong></p>
    <p>A tax invoice will be issued upon SOR expiry for all sold items.</p>
    <p>${company.name}${company.registrationNumber ? ` (Reg: ${company.registrationNumber})` : ''}</p>
  </div>
</body>
</html>`;
}
