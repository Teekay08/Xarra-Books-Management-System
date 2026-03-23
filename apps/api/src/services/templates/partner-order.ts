interface OrderLine {
  title: string;
  isbn13?: string | null;
  quantity: number;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
  rrp?: string | null;
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

interface PartnerOrderData {
  number: string;
  orderDate: string;
  customerPoNumber?: string | null;
  expectedDeliveryDate?: string | null;
  deliveryAddress?: string | null;
  status: string;
  partnerName: string;
  branchName?: string | null;
  placedByName?: string | null;
  confirmedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  deliverySignedBy?: string | null;
  deliveryCondition?: string | null;
  courierCompany?: string | null;
  courierWaybill?: string | null;
  company?: CompanyInfo;
  lines: OrderLine[];
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

export function renderPartnerOrderHtml(data: PartnerOrderData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const linesHtml = data.lines.map((line, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">
        ${line.title}
        ${line.isbn13 ? `<br><span style="font-size:11px;color:#888">ISBN: ${line.isbn13}</span>` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${line.rrp ? formatCurrency(line.rrp) : '-'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${Number(line.discountPct)}%</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.unitPrice)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${line.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.lineTax)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(line.lineTotal)}</td>
    </tr>
  `).join('');

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const companyAddressHtml = formatAddress(company as any);

  const statusColor: Record<string, string> = {
    DRAFT: '#6b7280', SUBMITTED: '#2563eb', CONFIRMED: '#d97706',
    PROCESSING: '#ea580c', DISPATCHED: '#7c3aed', DELIVERED: '#16a34a', CANCELLED: '#dc2626',
  };

  // Build timeline entries
  const timeline: string[] = [];
  timeline.push(`<strong>Ordered:</strong> ${formatDate(data.orderDate)}`);
  if (data.placedByName) timeline[0] += ` by ${data.placedByName}`;
  if (data.confirmedAt) timeline.push(`<strong>Confirmed:</strong> ${formatDate(data.confirmedAt)}`);
  if (data.dispatchedAt) {
    let dispatchLine = `<strong>Dispatched:</strong> ${formatDate(data.dispatchedAt)}`;
    if (data.courierCompany) dispatchLine += ` via ${data.courierCompany}`;
    if (data.courierWaybill) dispatchLine += ` (Waybill: ${data.courierWaybill})`;
    timeline.push(dispatchLine);
  }
  if (data.deliveredAt) {
    let deliverLine = `<strong>Delivered:</strong> ${formatDate(data.deliveredAt)}`;
    if (data.deliverySignedBy) deliverLine += ` &mdash; signed by ${data.deliverySignedBy}`;
    if (data.deliveryCondition) deliverLine += ` &mdash; Condition: ${data.deliveryCondition}`;
    timeline.push(deliverLine);
  }

  const timelineHtml = timeline.map(t => `<div style="padding:3px 0;font-size:12px;color:#444">${t}</div>`).join('');

  // Calculate total RRP and total discount
  const totalRrp = data.lines.reduce((sum, l) => {
    const rrp = l.rrp ? Number(l.rrp) : Number(l.unitPrice);
    return sum + (rrp * l.quantity);
  }, 0);
  const subtotalNum = Number(data.subtotal);
  const totalDiscount = totalRrp - subtotalNum;
  const hasDiscount = totalDiscount > 0.01;
  // Use the first line's discount pct as the uniform rate (they're all the same per partner)
  const discountPct = data.lines.length > 0 ? Number(data.lines[0].discountPct) : 0;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .company { font-size: 24px; font-weight: bold; color: #8B1A1A; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .order-title { font-size: 28px; font-weight: bold; color: #8B1A1A; text-align: right; }
    .order-meta { text-align: right; font-size: 12px; color: #555; margin-top: 8px; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; color: white; font-size: 11px; font-weight: 600; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party { width: 48%; }
    .party h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 8px; }
    .party p { margin: 2px 0; }
    .delivery-address { margin-bottom: 20px; padding: 12px; background: #fef7f7; border-radius: 4px; font-size: 12px; }
    .timeline { margin-bottom: 24px; padding: 12px; background: #f8f8f8; border-radius: 4px; border-left: 3px solid #8B1A1A; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #8B1A1A; font-size: 11px; text-transform: uppercase; color: #555; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td { padding: 6px 8px; }
    .totals .grand-total td { border-top: 2px solid #8B1A1A; font-weight: bold; font-size: 16px; }
    .totals .discount td { color: #16a34a; }
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
      ${companyAddressHtml ? `<div class="company-sub">${companyAddressHtml}</div>` : '<div class="company-sub">Midrand, Gauteng, South Africa</div>'}
      ${company.vatNumber ? `<div class="company-sub">VAT: ${company.vatNumber}</div>` : ''}
      ${company.registrationNumber ? `<div class="company-sub">Reg: ${company.registrationNumber}</div>` : ''}
      ${company.phone ? `<div class="company-sub">Tel: ${company.phone}</div>` : ''}
      ${company.email ? `<div class="company-sub">Email: ${company.email}</div>` : ''}
    </div>
    <div>
      <div class="order-title">ORDER CONFIRMATION</div>
      <div class="order-meta">
        <strong>${data.number}</strong><br>
        Date: ${formatDate(data.orderDate)}<br>
        ${data.customerPoNumber ? `Customer PO #: ${data.customerPoNumber}<br>` : ''}
        ${data.expectedDeliveryDate ? `Expected Delivery: ${formatDate(data.expectedDeliveryDate)}<br>` : ''}
        <span class="status-badge" style="background:${statusColor[data.status] ?? '#6b7280'}">${data.status}</span>
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Supplier</h3>
      <p><strong>${company.name}</strong></p>
      ${companyAddressHtml ? companyAddressHtml : '<p>Midrand, Gauteng, South Africa</p>'}
      ${company.vatNumber ? `<p>VAT: ${company.vatNumber}</p>` : ''}
      ${company.email ? `<p>${company.email}</p>` : ''}
      ${company.phone ? `<p>Tel: ${company.phone}</p>` : ''}
    </div>
    <div class="party">
      <h3>Customer</h3>
      <p><strong>${data.partnerName}</strong></p>
      ${data.branchName ? `<p>Branch: ${data.branchName}</p>` : ''}
      ${data.placedByName ? `<p>Ordered by: ${data.placedByName}</p>` : ''}
    </div>
  </div>

  ${data.deliveryAddress ? `
  <div class="delivery-address">
    <strong>Delivery Address:</strong> ${data.deliveryAddress}
  </div>
  ` : ''}

  <div class="timeline">
    <div style="font-size:11px;text-transform:uppercase;color:#999;margin-bottom:4px;font-weight:600">Order Timeline</div>
    ${timelineHtml}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Title</th>
        <th style="text-align:right">RRP</th>
        <th style="text-align:right">Discount</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">VAT</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <table class="totals">
    ${hasDiscount ? `
    <tr>
      <td>Gross Total (RRP)</td>
      <td style="text-align:right">${formatCurrency(totalRrp)}</td>
    </tr>
    <tr class="discount">
      <td>Partner Discount (${discountPct}%)</td>
      <td style="text-align:right">- ${formatCurrency(totalDiscount)}</td>
    </tr>
    ` : ''}
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
    <p>${company.name}${company.registrationNumber ? ` (Reg: ${company.registrationNumber})` : ''} &mdash; We mainstream the African book</p>
    <p>Generated on ${new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  </div>
</body>
</html>`;
}
