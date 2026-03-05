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

interface ReceiptData {
  paymentDate: string;
  amount: string;
  paymentMethod: string;
  bankReference: string;
  partnerName: string;
  invoiceAllocations: { invoiceNumber: string; amount: string }[];
  company?: CompanyInfo;
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

export function renderReceiptHtml(data: ReceiptData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const companyAddressHtml = formatAddress(company as any);

  const allocationsHtml = data.invoiceAllocations.length > 0 ? `
    <div style="margin-top:24px">
      <h3 style="font-size:12px;text-transform:uppercase;color:#555;margin:0 0 8px">Applied To</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:2px solid #166534;font-size:11px;text-transform:uppercase;color:#555">Invoice</th>
            <th style="text-align:right;padding:8px;border-bottom:2px solid #166534;font-size:11px;text-transform:uppercase;color:#555">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.invoiceAllocations.map(a => `
            <tr>
              <td style="padding:6px 8px;border-bottom:1px solid #eee">${a.invoiceNumber}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(a.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .company { font-size: 24px; font-weight: bold; color: #166534; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .doc-title { font-size: 28px; font-weight: bold; color: #166534; text-align: right; }
    .doc-meta { text-align: right; font-size: 12px; color: #555; margin-top: 8px; }
    .details { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .details table { width: 100%; font-size: 14px; }
    .details td { padding: 6px 0; }
    .details .label { color: #6b7280; width: 160px; }
    .details .value { font-weight: 600; }
    .amount { font-size: 24px; font-weight: 700; color: #166534; }
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
      <div class="doc-title">PAYMENT RECEIPT</div>
      <div class="doc-meta">
        Ref: <strong>${data.bankReference}</strong><br>
        Date: ${formatDate(data.paymentDate)}
      </div>
    </div>
  </div>

  <div class="details">
    <table>
      <tr>
        <td class="label">Received From:</td>
        <td class="value">${data.partnerName}</td>
      </tr>
      <tr>
        <td class="label">Payment Date:</td>
        <td class="value">${formatDate(data.paymentDate)}</td>
      </tr>
      <tr>
        <td class="label">Payment Method:</td>
        <td class="value">${data.paymentMethod}</td>
      </tr>
      <tr>
        <td class="label">Bank Reference:</td>
        <td class="value">${data.bankReference}</td>
      </tr>
      <tr>
        <td class="label">Amount Received:</td>
        <td class="amount">${formatCurrency(data.amount)}</td>
      </tr>
    </table>
  </div>

  ${allocationsHtml}

  <div class="footer">
    <p>${company.name}${company.registrationNumber ? ` (Reg: ${company.registrationNumber})` : ''}</p>
    <p>This receipt confirms payment received. Thank you for your business.</p>
  </div>
</body>
</html>`;
}
