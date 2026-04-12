interface PackingListLine {
  title: string;
  isbn13?: string | null;
  qtyPacked: number;
}

interface PackingListData {
  orderNumber: string;       // POR-YYYY-NNNN
  sorNumber?: string | null; // SOR-YYYY-NNNN (if SOR order)
  partnerPoNumber?: string | null;
  orderDate: string;
  packedDate: string;
  partnerName: string;
  branchName?: string | null;
  packerName?: string | null;
  lines: PackingListLine[];
  notes?: string | null;
  company?: { name?: string | null; logoUrl?: string | null; addressLine1?: string | null } | null;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function renderPackingListHtml(data: PackingListData): string {
  const totalUnits = data.lines.reduce((s, l) => s + l.qtyPacked, 0);
  const companyName = data.company?.name ?? 'Xarra Books';
  const companyAddr = data.company?.addressLine1 ?? 'Midrand, Gauteng, South Africa';
  const logoHtml = data.company?.logoUrl
    ? `<img src="${data.company.logoUrl}" alt="${companyName}" style="max-height:60px;max-width:200px;object-fit:contain;margin-bottom:6px;display:block">`
    : '';

  const linesHtml = data.lines.map((line, i) => `
    <tr>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i + 1}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb">
        ${line.title}
        ${line.isbn13 ? `<br><span style="font-size:11px;color:#9ca3af">ISBN: ${line.isbn13}</span>` : ''}
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600">${line.qtyPacked}</td>
    </tr>
  `).join('');

  const refsHtml = [
    data.orderNumber && `<span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${data.orderNumber}</span>`,
    data.sorNumber && `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${data.sorNumber}</span>`,
    data.partnerPoNumber && `<span style="background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">PO: ${data.partnerPoNumber}</span>`,
  ].filter(Boolean).join(' &nbsp;');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @media print { body { margin: 0; } }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #8B1A1A; padding-bottom: 16px; }
    .brand { font-size: 22px; font-weight: bold; color: #8B1A1A; }
    .doc-title { font-size: 26px; font-weight: bold; color: #111; text-align: right; }
    .doc-sub { font-size: 12px; color: #6b7280; margin-top: 4px; text-align: right; }
    .refs { margin-bottom: 20px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px; background: #f9fafb; border-radius: 6px; padding: 16px; }
    .meta-item label { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600; display: block; }
    .meta-item span { font-size: 13px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 8px; background: #8B1A1A; color: white; font-size: 11px; text-transform: uppercase; }
    th.center { text-align: center; }
    .totals-row td { padding: 10px 8px; background: #f3f4f6; font-weight: 600; border-top: 2px solid #8B1A1A; }
    .box-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
    .box-field { border: 1px solid #d1d5db; border-radius: 4px; padding: 10px; }
    .box-field label { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600; display: block; margin-bottom: 4px; }
    .signature-area { margin-top: 40px; display: flex; gap: 60px; }
    .sig-block { flex: 1; border-top: 1px solid #374151; padding-top: 8px; }
    .sig-block label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
    .notice { margin-top: 20px; padding: 10px 14px; background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 4px; font-size: 12px; color: #1e40af; }
    .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div class="brand">${companyName}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px">${companyAddr}</div>
    </div>
    <div>
      <div class="doc-title">PACKING LIST</div>
      <div class="doc-sub">${data.orderNumber}</div>
    </div>
  </div>

  <div class="refs">${refsHtml}</div>

  <div class="meta-grid">
    <div class="meta-item"><label>Order Number</label><span>${data.orderNumber}</span></div>
    <div class="meta-item"><label>Packed Date</label><span>${formatDate(data.packedDate)}</span></div>
    <div class="meta-item"><label>Partner</label><span>${data.partnerName}</span></div>
    <div class="meta-item"><label>Branch</label><span>${data.branchName ?? 'N/A'}</span></div>
    ${data.partnerPoNumber ? `<div class="meta-item"><label>Partner PO</label><span>${data.partnerPoNumber}</span></div>` : ''}
    ${data.sorNumber ? `<div class="meta-item"><label>SOR Ref</label><span>${data.sorNumber}</span></div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width:36px">#</th>
        <th>Title / ISBN</th>
        <th class="center" style="width:80px">Qty Packed</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
    <tfoot>
      <tr class="totals-row">
        <td colspan="2">Total Units</td>
        <td style="text-align:center">${totalUnits}</td>
      </tr>
    </tfoot>
  </table>

  <div class="box-grid">
    <div class="box-field"><label>Number of Boxes</label>&nbsp;</div>
    <div class="box-field"><label>Total Weight (kg)</label>&nbsp;</div>
    <div class="box-field"><label>Packed By</label><span style="font-size:12px">${data.packerName ?? ''}</span></div>
  </div>

  ${data.notes ? `<div style="margin-top:16px;padding:10px;background:#fef3c7;border-radius:4px;font-size:12px"><strong>Notes:</strong> ${data.notes}</div>` : ''}

  <div class="signature-area">
    <div class="sig-block">
      <label>Packer Signature</label><br>
      <span style="font-size:11px;color:#9ca3af">I confirm all items listed above have been packed.</span>
    </div>
    <div class="sig-block">
      <label>QC Verified By</label>
    </div>
  </div>

  <div class="notice">
    This packing list accompanies the shipment. Please verify contents on receipt. Any discrepancies must be reported to Xarra Books within 24 hours of delivery.
  </div>

  <div class="footer">
    <span>${companyName} — We mainstream the African book</span>
    <span>Generated ${new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
  </div>
</body>
</html>`;
}
