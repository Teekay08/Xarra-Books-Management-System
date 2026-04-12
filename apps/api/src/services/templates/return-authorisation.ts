interface ReturnAuthorisationLine {
  title: string;
  isbn13?: string | null;
  quantity: number;
  reason?: string | null;
}

interface ReturnAuthorisationData {
  raNumber: string;           // RA-YYYY-NNNN
  raDate: string;
  sorNumber?: string | null;  // SOR-YYYY-NNNN
  invoiceNumber?: string | null; // INV-YYYY-NNNN
  partnerPoNumber?: string | null;
  partnerName: string;
  branchName?: string | null;
  returnReason?: string | null;
  lines: ReturnAuthorisationLine[];
  returnAddress?: string | null;
  authorisedByName?: string | null;
  validUntil?: string | null;
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

export function renderReturnAuthorisationHtml(data: ReturnAuthorisationData): string {
  const company = data.company ?? { name: 'Xarra Books' };
  const totalUnits = data.lines.reduce((s, l) => s + l.quantity, 0);
  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;object-fit:contain;margin-bottom:6px;display:block">`
    : '';

  const linesHtml = data.lines.map((line, i) => `
    <tr>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i + 1}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb">
        ${line.title}
        ${line.isbn13 ? `<br><span style="font-size:11px;color:#9ca3af">ISBN: ${line.isbn13}</span>` : ''}
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600">${line.quantity}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${line.reason ?? '—'}</td>
    </tr>
  `).join('');

  const refsHtml = [
    data.invoiceNumber ? `<span style="background:#f0fdf4;color:#166534;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">Invoice: ${data.invoiceNumber}</span>` : '',
    data.sorNumber ? `<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">SOR: ${data.sorNumber}</span>` : '',
    data.partnerPoNumber ? `<span style="background:#f3f4f6;color:#374151;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600">Partner PO: ${data.partnerPoNumber}</span>` : '',
  ].filter(Boolean).join(' &nbsp;');

  const returnAddr = data.returnAddress ?? `${company.name}\n${company.addressLine1 ?? 'Midrand, Gauteng, South Africa'}`;

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
    .auth-badge { background: #dcfce7; border: 1px solid #86efac; color: #166534; padding: 4px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; display: inline-block; margin-bottom: 16px; }
    .refs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
    .info-box { background: #f9fafb; border-radius: 6px; padding: 14px; }
    .info-box h3 { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin: 0 0 8px; }
    .info-box p { margin: 3px 0; font-size: 12px; }
    .return-addr { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 14px; margin-bottom: 20px; }
    .return-addr h3 { font-size: 10px; text-transform: uppercase; color: #3b82f6; font-weight: 600; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { text-align: left; padding: 10px 8px; background: #8B1A1A; color: white; font-size: 11px; text-transform: uppercase; }
    th.center { text-align: center; }
    .totals-row td { padding: 10px 8px; background: #f3f4f6; font-weight: 600; border-top: 2px solid #8B1A1A; }
    .instructions { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 14px; margin-bottom: 20px; }
    .instructions h3 { font-size: 11px; text-transform: uppercase; color: #c2410c; font-weight: 700; margin: 0 0 8px; }
    .instructions ol { margin: 0; padding-left: 20px; font-size: 12px; color: #374151; }
    .instructions li { margin-bottom: 4px; }
    .signature-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
    .sig-block { border-top: 1px solid #374151; padding-top: 8px; }
    .sig-block label { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 24px; }
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
    </div>
    <div>
      <div class="doc-title">RETURN AUTHORISATION</div>
      <div class="doc-sub"><strong>${data.raNumber}</strong></div>
      <div class="doc-sub">Date: ${formatDate(data.raDate)}</div>
      ${data.validUntil ? `<div class="doc-sub" style="color:#dc2626">Valid until: ${formatDate(data.validUntil)}</div>` : ''}
    </div>
  </div>

  <div class="auth-badge">✓ RETURN AUTHORISED</div>

  ${refsHtml ? `<div class="refs">${refsHtml}</div>` : ''}

  <div class="two-col">
    <div class="info-box">
      <h3>Return Authorised For</h3>
      <p><strong>${data.partnerName}</strong></p>
      ${data.branchName ? `<p>${data.branchName}</p>` : ''}
    </div>
    <div class="info-box">
      <h3>Authorisation Details</h3>
      <p><strong>RA Number:</strong> ${data.raNumber}</p>
      <p><strong>Date:</strong> ${formatDate(data.raDate)}</p>
      ${data.authorisedByName ? `<p><strong>Authorised By:</strong> ${data.authorisedByName}</p>` : ''}
      ${data.validUntil ? `<p><strong>Valid Until:</strong> ${formatDate(data.validUntil)}</p>` : ''}
    </div>
  </div>

  ${data.returnReason ? `
  <div style="margin-bottom:20px;padding:12px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:4px;font-size:12px">
    <strong>Return Reason:</strong> ${data.returnReason}
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th class="center" style="width:36px">#</th>
        <th>Title / ISBN</th>
        <th class="center" style="width:60px">Qty</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
    <tfoot>
      <tr class="totals-row">
        <td colspan="2">Total Units Authorised</td>
        <td style="text-align:center">${totalUnits}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="return-addr">
    <h3>Send Goods To</h3>
    <p style="white-space:pre-line;font-size:12px">${returnAddr}</p>
  </div>

  <div class="instructions">
    <h3>Return Instructions</h3>
    <ol>
      <li>Print and include this Return Authorisation document inside the shipment.</li>
      <li>Write <strong>${data.raNumber}</strong> on all boxes and all correspondence.</li>
      <li>Pack goods securely to prevent further damage in transit.</li>
      <li>Send goods to the return address above using a trackable courier.</li>
      <li>Email the waybill number to <strong>${company.email ?? 'orders@xarrabooks.com'}</strong>.</li>
      <li>Goods received without this document may be refused or delayed.</li>
    </ol>
  </div>

  ${data.notes ? `<div style="margin-bottom:20px;padding:10px;background:#fef3c7;border-radius:4px;font-size:12px"><strong>Notes:</strong> ${data.notes}</div>` : ''}

  <div class="signature-area">
    <div class="sig-block">
      <label>Authorised By</label>
      <span style="font-size:12px">${data.authorisedByName ?? ''}</span>
    </div>
    <div class="sig-block">
      <label>Date</label>
      <span style="font-size:12px">${formatDate(data.raDate)}</span>
    </div>
  </div>

  <div class="footer">
    <span>${company.name} — We mainstream the African book | Reference: ${data.raNumber}</span>
    <span>Generated ${new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
  </div>
</body>
</html>`;
}
