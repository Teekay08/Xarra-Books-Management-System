interface DebitNoteLine {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: string;
  discountPct: string;
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
  contactName?: string | null;
  contactEmail?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  vatNumber?: string | null;
}

interface DebitNoteData {
  number: string;
  createdAt: string;
  reason: string;
  invoiceNumber?: string | null;
  company?: CompanyInfo;
  recipient: RecipientInfo;
  subtotal: string;
  vatAmount: string;
  total: string;
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

export function renderDebitNoteHtml(data: DebitNoteData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const companyAddressHtml = formatAddress(company as any);
  const recipientAddressHtml = formatAddress(data.recipient);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .company { font-size: 24px; font-weight: bold; color: #991b1b; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .doc-title { font-size: 28px; font-weight: bold; color: #991b1b; text-align: right; }
    .doc-meta { text-align: right; font-size: 12px; color: #555; margin-top: 8px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party { width: 48%; }
    .party h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 8px; }
    .party p { margin: 2px 0; }
    .reason { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; }
    .reason strong { color: #991b1b; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td { padding: 6px 8px; }
    .totals .grand-total td { border-top: 2px solid #991b1b; font-weight: bold; font-size: 16px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div class="company">${company.name}</div>
      ${company.tradingAs ? `<div class="company-sub">Trading as ${company.tradingAs}</div>` : ''}
      ${companyAddressHtml ? `<div class="company-sub">${companyAddressHtml}</div>` : ''}
      ${company.vatNumber ? `<div class="company-sub">VAT: ${company.vatNumber}</div>` : ''}
      ${company.phone ? `<div class="company-sub">Tel: ${company.phone}</div>` : ''}
      ${company.email ? `<div class="company-sub">Email: ${company.email}</div>` : ''}
    </div>
    <div>
      <div class="doc-title">DEBIT NOTE</div>
      <div class="doc-meta">
        <strong>${data.number}</strong><br>
        Date: ${formatDate(data.createdAt)}
        ${data.invoiceNumber ? `<br>Ref Invoice: ${data.invoiceNumber}` : ''}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Issued To</h3>
      <p><strong>${data.recipient.name}</strong></p>
      ${data.recipient.contactName ? `<p>${data.recipient.contactName}</p>` : ''}
      ${recipientAddressHtml}
      ${data.recipient.vatNumber ? `<p>VAT: ${data.recipient.vatNumber}</p>` : ''}
      ${data.recipient.contactEmail ? `<p>${data.recipient.contactEmail}</p>` : ''}
    </div>
  </div>

  <div class="reason">
    <strong>Reason:</strong> ${data.reason}
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
  </table>

  <div class="footer">
    <p>${company.name}${company.registrationNumber ? ` (Reg: ${company.registrationNumber})` : ''}</p>
    <p>This debit note increases the amount owed. Reference: ${data.number}</p>
  </div>
</body>
</html>`;
}
