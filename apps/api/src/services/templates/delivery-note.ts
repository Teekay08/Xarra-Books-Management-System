interface DeliveryNoteItem {
  title: string;
  isbn13?: string | null;
  quantity: number;
}

interface DeliveryNoteData {
  deliveryNoteNumber: string;  // DN-YYYY-NNNN
  orderNumber: string;          // POR-YYYY-NNNN
  sorNumber?: string | null;    // SOR-YYYY-NNNN
  invoiceNumber?: string | null;// INV-YYYY-NNNN
  partnerPoNumber?: string | null;
  dispatchDate: string;
  expectedDelivery?: string | null;
  partnerName: string;
  branchName?: string | null;
  deliveryAddress?: string | null;
  courierCompany?: string | null;
  courierWaybill?: string | null;
  courierTrackingUrl?: string | null;
  items: DeliveryNoteItem[];
  notes?: string | null;
  company?: {
    name: string;
    logoUrl?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    phone?: string | null;
    email?: string | null;
    vatNumber?: string | null;
  };
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function renderDeliveryNoteHtml(data: DeliveryNoteData): string {
  const company = data.company ?? { name: 'Xarra Books' };
  const totalUnits = data.items.reduce((s, i) => s + i.quantity, 0);
  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;object-fit:contain;margin-bottom:6px;display:block">`
    : '';

  const itemsHtml = data.items.map((item, i) => `
    <tr>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i + 1}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb">
        ${item.title}
        ${item.isbn13 ? `<br><span style="font-size:11px;color:#9ca3af">ISBN: ${item.isbn13}</span>` : ''}
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600">${item.quantity}</td>
    </tr>
  `).join('');

  const refsHtml = [
    `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">`,
    `<span style="background:#e0f2fe;color:#0369a1;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">Order: ${data.orderNumber}</span>`,
    data.sorNumber ? `<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">SOR: ${data.sorNumber}</span>` : '',
    data.invoiceNumber ? `<span style="background:#f0fdf4;color:#166534;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">Invoice: ${data.invoiceNumber}</span>` : '',
    data.partnerPoNumber ? `<span style="background:#f3f4f6;color:#374151;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">Partner PO: ${data.partnerPoNumber}</span>` : '',
    `</div>`,
  ].join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @media print { body { margin: 0; } }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #8B1A1A; padding-bottom: 16px; }
    .brand { font-size: 22px; font-weight: bold; color: #8B1A1A; }
    .doc-title { font-size: 26px; font-weight: bold; color: #111; text-align: right; }
    .doc-sub { font-size: 12px; color: #6b7280; margin-top: 4px; text-align: right; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
    .info-box { background: #f9fafb; border-radius: 6px; padding: 14px; }
    .info-box h3 { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin: 0 0 8px; }
    .info-box p { margin: 3px 0; font-size: 12px; }
    .courier-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 14px; margin-bottom: 20px; }
    .courier-box h3 { font-size: 10px; text-transform: uppercase; color: #3b82f6; font-weight: 600; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { text-align: left; padding: 10px 8px; background: #8B1A1A; color: white; font-size: 11px; text-transform: uppercase; }
    th.center { text-align: center; }
    .totals-row td { padding: 10px 8px; background: #f3f4f6; font-weight: 600; border-top: 2px solid #8B1A1A; }
    .receipt-box { border: 2px solid #374151; border-radius: 6px; padding: 20px; margin-top: 24px; }
    .receipt-box h3 { font-size: 12px; text-transform: uppercase; color: #374151; font-weight: 700; margin: 0 0 16px; }
    .receipt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .receipt-field { border-top: 1px solid #9ca3af; padding-top: 6px; }
    .receipt-field label { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600; display: block; margin-bottom: 14px; }
    .condition-row { display: flex; gap: 16px; margin-top: 8px; }
    .condition-opt { font-size: 12px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div class="brand">${company.name}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px">${company.addressLine1 ?? 'Midrand, Gauteng, South Africa'}</div>
      ${company.phone ? `<div style="font-size:11px;color:#6b7280">Tel: ${company.phone}</div>` : ''}
      ${company.email ? `<div style="font-size:11px;color:#6b7280">${company.email}</div>` : ''}
      ${company.vatNumber ? `<div style="font-size:11px;color:#6b7280">VAT: ${company.vatNumber}</div>` : ''}
    </div>
    <div>
      <div class="doc-title">DELIVERY NOTE</div>
      <div class="doc-sub"><strong>${data.deliveryNoteNumber}</strong></div>
      <div class="doc-sub">Date: ${formatDate(data.dispatchDate)}</div>
    </div>
  </div>

  ${refsHtml}

  <div class="two-col">
    <div class="info-box">
      <h3>Deliver To</h3>
      <p><strong>${data.partnerName}</strong></p>
      ${data.branchName ? `<p>${data.branchName}</p>` : ''}
      ${data.deliveryAddress ? `<p style="margin-top:6px;color:#4b5563">${data.deliveryAddress.replace(/\n/g, '<br>')}</p>` : ''}
    </div>
    <div class="info-box">
      <h3>Dispatch Details</h3>
      <p><strong>Dispatch Date:</strong> ${formatDate(data.dispatchDate)}</p>
      ${data.expectedDelivery ? `<p><strong>Expected:</strong> ${formatDate(data.expectedDelivery)}</p>` : ''}
    </div>
  </div>

  ${(data.courierCompany || data.courierWaybill) ? `
  <div class="courier-box">
    <h3>Courier Information</h3>
    <div style="display:flex;gap:40px">
      ${data.courierCompany ? `<div><strong>Company:</strong> ${data.courierCompany}</div>` : ''}
      ${data.courierWaybill ? `<div><strong>Waybill:</strong> ${data.courierWaybill}</div>` : ''}
      ${data.courierTrackingUrl ? `<div><strong>Track:</strong> <span style="color:#3b82f6">${data.courierTrackingUrl}</span></div>` : ''}
    </div>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th class="center" style="width:36px">#</th>
        <th>Title / ISBN</th>
        <th class="center" style="width:80px">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
    <tfoot>
      <tr class="totals-row">
        <td colspan="2">Total Units</td>
        <td style="text-align:center">${totalUnits}</td>
      </tr>
    </tfoot>
  </table>

  ${data.notes ? `<div style="margin-bottom:20px;padding:10px;background:#fef3c7;border-radius:4px;font-size:12px"><strong>Notes:</strong> ${data.notes}</div>` : ''}

  <div class="receipt-box">
    <h3>Proof of Delivery — To Be Completed by Recipient</h3>
    <div class="receipt-grid">
      <div class="receipt-field"><label>Received By (Print Name)</label></div>
      <div class="receipt-field"><label>Date Received</label></div>
      <div class="receipt-field"><label>Signature</label></div>
      <div class="receipt-field">
        <label>Condition of Goods</label>
        <div class="condition-row">
          <span class="condition-opt">☐ Good</span>
          <span class="condition-opt">☐ Damaged</span>
          <span class="condition-opt">☐ Partial</span>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>${company.name} — We mainstream the African book</span>
    <span>Generated ${new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
  </div>
</body>
</html>`;
}
