// ─── Goods Return Note (GRN) PDF template ────────────────────────────────────
// Generated automatically when returned goods are physically received at the
// warehouse. Serves as the official receipt document for the return process.

interface GRNLine {
  title: string;
  isbn: string | null;
  quantityAuthorized: number;
  condition: string;            // GOOD | DAMAGED | UNSALEABLE
  notes: string | null;
}

interface GRNData {
  grnNumber: string;            // GRN-YYYY-NNNN
  raNumber: string;             // RA-YYYY-NNNN
  receivedAt: string;           // ISO timestamp
  receivedBy: string | null;    // staff user ID / name
  deliverySignedBy: string | null;
  courierCompany: string | null;
  courierWaybill: string | null;
  reason: string;
  notes: string | null;
  partner: { name: string };
  lines: GRNLine[];
  company: {
    name: string;
    tradingAs: string | null;
    addressLine1: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
  };
}

const CONDITION_LABELS: Record<string, string> = {
  GOOD: 'Good / Resaleable',
  DAMAGED: 'Damaged',
  UNSALEABLE: 'Unsaleable',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function renderGRNHtml(data: GRNData): string {
  const logo = data.company.logoUrl
    ? `<img src="${data.company.logoUrl}" alt="${data.company.name}" style="max-height:55px;max-width:180px;">`
    : '';

  const addrParts = [data.company.addressLine1, data.company.city, data.company.province, data.company.postalCode].filter(Boolean);
  const companyAddress = addrParts.join(', ');

  const lineRows = data.lines.map((l, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${l.title}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:11px;color:#6b7280;">${l.isbn ?? '—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;">${l.quantityAuthorized}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;
          background:${l.condition === 'GOOD' ? '#d1fae5' : l.condition === 'DAMAGED' ? '#fef3c7' : '#fee2e2'};
          color:${l.condition === 'GOOD' ? '#065f46' : l.condition === 'DAMAGED' ? '#92400e' : '#991b1b'};">
          ${CONDITION_LABELS[l.condition] ?? l.condition}
        </span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;">${l.notes ?? ''}</td>
    </tr>
  `).join('');

  const totalQty = data.lines.reduce((s, l) => s + l.quantityAuthorized, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #111827; background: #fff; padding: 32px; }
  h1 { font-size: 22px; font-weight: 800; color: #8B1A1A; letter-spacing: -0.5px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; border-bottom: 2px solid #d1d5db; }
  .label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-bottom: 2px; }
  .value { font-size: 12px; color: #111827; font-weight: 500; }
  .signature-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 12px 16px; min-height: 60px; }
  .watermark { color: #d1fae5; font-size: 8px; }
</style>
</head>
<body>

  <!-- Header -->
  <table style="margin-bottom:24px;">
    <tr>
      <td style="width:50%;vertical-align:top;">
        ${logo}
        <div style="margin-top:6px;">
          <div style="font-weight:700;font-size:13px;">${data.company.name}${data.company.tradingAs ? ` (${data.company.tradingAs})` : ''}</div>
          ${companyAddress ? `<div style="color:#6b7280;font-size:11px;margin-top:2px;">${companyAddress}</div>` : ''}
          ${data.company.phone ? `<div style="color:#6b7280;font-size:11px;">Tel: ${data.company.phone}</div>` : ''}
          ${data.company.email ? `<div style="color:#6b7280;font-size:11px;">${data.company.email}</div>` : ''}
        </div>
      </td>
      <td style="width:50%;text-align:right;vertical-align:top;">
        <h1>GOODS RETURN NOTE</h1>
        <div style="margin-top:8px;">
          <div style="font-size:22px;font-weight:800;font-family:monospace;color:#111827;">${data.grnNumber}</div>
          <div style="color:#6b7280;font-size:11px;margin-top:2px;">Date received: ${fmtDateTime(data.receivedAt)}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- Reference & Partner strip -->
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
    <table>
      <tr>
        <td style="width:25%;padding-right:16px;">
          <div class="label">Return Authority (RA)</div>
          <div class="value" style="font-family:monospace;color:#8B1A1A;">${data.raNumber}</div>
        </td>
        <td style="width:35%;padding-right:16px;">
          <div class="label">Returned by</div>
          <div class="value">${data.partner.name}</div>
        </td>
        <td style="width:20%;padding-right:16px;">
          <div class="label">Courier</div>
          <div class="value">${data.courierCompany ?? '—'}</div>
        </td>
        <td style="width:20%;">
          <div class="label">Waybill</div>
          <div class="value" style="font-family:monospace;">${data.courierWaybill ?? '—'}</div>
        </td>
      </tr>
    </table>
  </div>

  <div style="margin-bottom:6px;">
    <div class="label">Return reason</div>
    <div class="value">${data.reason}</div>
  </div>
  ${data.notes ? `
  <div style="margin-bottom:16px;margin-top:6px;">
    <div class="label">Notes</div>
    <div class="value">${data.notes}</div>
  </div>` : '<div style="margin-bottom:16px;"></div>'}

  <!-- Line items -->
  <table style="margin-bottom:20px;">
    <thead>
      <tr>
        <th>Title</th>
        <th>ISBN</th>
        <th style="text-align:center;">Qty Authorised</th>
        <th>Condition (as received)</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="padding:8px 10px;font-weight:700;font-size:11px;color:#374151;border-top:2px solid #d1d5db;">
          Total units
        </td>
        <td style="padding:8px 10px;font-weight:800;text-align:center;border-top:2px solid #d1d5db;">${totalQty}</td>
        <td colspan="2" style="border-top:2px solid #d1d5db;"></td>
      </tr>
    </tfoot>
  </table>

  <!-- Signatures -->
  <table style="margin-bottom:24px;">
    <tr>
      <td style="width:48%;padding-right:16px;vertical-align:top;">
        <div class="label" style="margin-bottom:8px;">Received at warehouse by</div>
        <div class="signature-box">
          ${data.deliverySignedBy ? `<div class="value">${data.deliverySignedBy}</div>` : ''}
          <div style="margin-top:28px;border-top:1px solid #9ca3af;padding-top:4px;font-size:10px;color:#9ca3af;">Signature &amp; date</div>
        </div>
      </td>
      <td style="width:4%;"></td>
      <td style="width:48%;vertical-align:top;">
        <div class="label" style="margin-bottom:8px;">Authorised (partner representative)</div>
        <div class="signature-box">
          <div style="margin-top:28px;border-top:1px solid #9ca3af;padding-top:4px;font-size:10px;color:#9ca3af;">Signature, name &amp; date</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding-top:10px;color:#9ca3af;font-size:10px;text-align:center;">
    This Goods Return Note confirms physical receipt of the items listed above at ${data.company.name}'s warehouse.
    It does not constitute acceptance of a credit or acknowledgment of any claim until a formal inspection has been completed.
    GRN ${data.grnNumber} | RA ${data.raNumber}
  </div>

</body>
</html>`;
}
