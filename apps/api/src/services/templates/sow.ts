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

interface ContractorInfo {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  address?: string | null;
}

interface Deliverable {
  description: string;
  dueDate: string;
  acceptanceCriteria: string;
}

interface Milestone {
  name: string;
  date: string;
}

interface CostLine {
  description: string;
  hours: number;
  rate: number;
  total: number;
}

interface SowData {
  number: string;
  version: string;
  date: string;
  validUntil: string;
  company?: CompanyInfo;
  contractor?: ContractorInfo;
  staffName?: string;
  staffEmail?: string;
  project: {
    name: string;
    number: string;
    titleName?: string | null;
    authorName?: string | null;
  };
  scope: string;
  deliverables: Deliverable[];
  timeline: {
    startDate: string;
    endDate: string;
    milestones: Milestone[];
  };
  costBreakdown: CostLine[];
  totalAmount: number;
  terms?: string | null;
}

function formatCurrency(value: string | number): string {
  return `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function renderSowHtml(data: SowData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const deliverablesHtml = data.deliverables.map((d, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${d.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${formatDate(d.dueDate)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${d.acceptanceCriteria}</td>
    </tr>
  `).join('');

  const milestonesHtml = data.timeline.milestones.map((m) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${m.name}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${formatDate(m.date)}</td>
    </tr>
  `).join('');

  const costHtml = data.costBreakdown.map((c) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${c.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${c.hours}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(c.rate)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(c.total)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.6; margin: 0; padding: 32px 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 3px solid #166534; }
    .company-name { font-size: 22px; font-weight: bold; color: #166534; margin-top: 6px; }
    .company-sub { font-size: 11px; color: #666; margin-top: 3px; }
    .doc-badge { background: #166534; color: #fff; display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 10px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
    .doc-title { font-size: 26px; font-weight: bold; color: #166534; text-align: right; line-height: 1.2; }
    .doc-meta { text-align: right; font-size: 11px; color: #555; margin-top: 10px; line-height: 1.8; }
    .doc-meta strong { color: #1a1a1a; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 28px; gap: 24px; }
    .party { flex: 1; padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fafafa; }
    .party h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #999; margin: 0 0 10px; }
    .party p { margin: 3px 0; font-size: 12px; }
    .party .party-name { font-size: 14px; font-weight: bold; color: #1a1a1a; margin-bottom: 6px; }
    .project-band { padding: 14px 18px; background: #f0f7f0; border-left: 4px solid #166534; border-radius: 0 6px 6px 0; margin-bottom: 28px; font-size: 12px; }
    .project-band strong { color: #166534; }
    .section { margin-bottom: 28px; page-break-inside: avoid; }
    .section-title { font-size: 13px; font-weight: bold; color: #166534; border-bottom: 2px solid #166534; padding-bottom: 5px; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .scope-text { padding: 14px 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; white-space: pre-wrap; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
    th { text-align: left; padding: 9px 10px; border-bottom: 2px solid #166534; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; background: #f9fafb; }
    td { padding: 9px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 12px; }
    .totals { width: 300px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .totals tr td { padding: 8px 14px; border-bottom: 1px solid #f0f0f0; }
    .totals tr:last-child td { border-bottom: none; }
    .grand-total { background: #166534 !important; }
    .grand-total td { color: #fff !important; font-weight: bold; font-size: 15px; border-bottom: none !important; }
    .signatures { display: flex; justify-content: space-between; gap: 32px; margin-top: 60px; page-break-inside: avoid; }
    .sig-block { flex: 1; }
    .sig-block h4 { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #166534; margin: 0 0 8px; }
    .sig-party-name { font-size: 13px; font-weight: bold; margin-bottom: 36px; color: #1a1a1a; }
    .sig-line { border-top: 1px solid #ccc; padding-top: 6px; margin-bottom: 18px; font-size: 11px; color: #666; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #aaa; display: flex; justify-content: space-between; }
    .terms-box { padding: 14px 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; white-space: pre-wrap; line-height: 1.7; }
    .validity-notice { padding: 10px 14px; background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px; font-size: 11px; color: #92400e; margin-bottom: 28px; }
    @media print {
      body { padding: 20px 32px; }
      .section { page-break-inside: avoid; }
      .signatures { page-break-inside: avoid; }
      table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div>
      ${logoHtml}
      <div class="company-name">${company.name}</div>
      ${company.tradingAs ? `<div class="company-sub">Trading as ${company.tradingAs}</div>` : ''}
      <div class="company-sub">${company.city ? [company.city, company.province, 'South Africa'].filter(Boolean).join(', ') : 'Midrand, Gauteng, South Africa'}</div>
      ${company.vatNumber ? `<div class="company-sub">VAT Reg: ${company.vatNumber}</div>` : ''}
      ${company.phone ? `<div class="company-sub">Tel: ${company.phone}</div>` : ''}
      ${company.email ? `<div class="company-sub">${company.email}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="doc-badge">Statement of Work</div>
      <div class="doc-title">${data.number}</div>
      <div class="doc-meta">
        Version: <strong>${data.version}</strong><br>
        Date: <strong>${formatDate(data.date)}</strong><br>
        ${data.validUntil ? `Valid Until: <strong>${formatDate(data.validUntil)}</strong>` : ''}
      </div>
    </div>
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="party">
      <h3>Client / Company</h3>
      <div class="party-name">${company.name}</div>
      <p>${company.city ? [company.city, company.province, 'South Africa'].filter(Boolean).join(', ') : 'Midrand, Gauteng, South Africa'}</p>
      ${company.email ? `<p>${company.email}</p>` : ''}
      ${company.phone ? `<p>${company.phone}</p>` : ''}
    </div>
    <div class="party">
      <h3>${data.contractor ? 'Contractor' : 'Staff Member'}</h3>
      <div class="party-name">${data.contractor?.name || data.staffName || 'Staff Member'}</div>
      ${data.contractor?.contactName ? `<p>${data.contractor.contactName}</p>` : ''}
      ${data.contractor?.address ? `<p>${data.contractor.address}</p>` : ''}
      ${data.contractor?.contactEmail ? `<p>${data.contractor.contactEmail}</p>` : ''}
      ${!data.contractor && data.staffEmail ? `<p>${data.staffEmail}</p>` : ''}
    </div>
  </div>

  <!-- Project Band -->
  <div class="project-band">
    <strong>Project:</strong> ${data.project.name}&nbsp;&nbsp;<span style="color:#666">(${data.project.number})</span>
    ${data.project.titleName ? `&nbsp;&nbsp;|&nbsp;&nbsp;<strong>Title:</strong> ${data.project.titleName}` : ''}
    ${data.project.authorName ? `&nbsp;&nbsp;|&nbsp;&nbsp;<strong>Author:</strong> ${data.project.authorName}` : ''}
  </div>

  ${data.validUntil ? `<div class="validity-notice">This Statement of Work is valid until <strong>${formatDate(data.validUntil)}</strong>. Please review and sign before the expiry date.</div>` : ''}

  <!-- Scope -->
  <div class="section">
    <div class="section-title">1. Scope of Work</div>
    <div class="scope-text">${data.scope}</div>
  </div>

  <!-- Deliverables -->
  ${data.deliverables.length > 0 ? `
  <div class="section">
    <div class="section-title">2. Deliverables</div>
    <table>
      <thead>
        <tr>
          <th style="width:36px">#</th>
          <th>Deliverable</th>
          <th style="width:120px">Due Date</th>
          <th>Acceptance Criteria</th>
        </tr>
      </thead>
      <tbody>
        ${deliverablesHtml}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- Timeline -->
  <div class="section">
    <div class="section-title">${data.deliverables.length > 0 ? '3' : '2'}. Timeline</div>
    <div style="display:flex;gap:32px;margin-bottom:${data.timeline.milestones.length > 0 ? '14px' : '0'}">
      <div>
        <div style="font-size:10px;text-transform:uppercase;color:#999;margin-bottom:4px">Start Date</div>
        <div style="font-weight:bold">${formatDate(data.timeline.startDate)}</div>
      </div>
      <div>
        <div style="font-size:10px;text-transform:uppercase;color:#999;margin-bottom:4px">End Date</div>
        <div style="font-weight:bold">${formatDate(data.timeline.endDate)}</div>
      </div>
    </div>
    ${data.timeline.milestones.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Milestone</th>
          <th style="width:140px">Target Date</th>
        </tr>
      </thead>
      <tbody>
        ${milestonesHtml}
      </tbody>
    </table>
    ` : ''}
  </div>

  <!-- Cost Breakdown -->
  <div class="section">
    <div class="section-title">${data.deliverables.length > 0 ? '4' : '3'}. Cost Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Description / Task</th>
          <th style="text-align:right;width:80px">Hours</th>
          <th style="text-align:right;width:110px">Rate (ZAR)</th>
          <th style="text-align:right;width:120px">Amount (ZAR)</th>
        </tr>
      </thead>
      <tbody>
        ${costHtml}
      </tbody>
    </table>
    <div class="totals-wrap">
      <table class="totals">
        <tr class="grand-total">
          <td>Total Contract Value</td>
          <td style="text-align:right">${formatCurrency(data.totalAmount)}</td>
        </tr>
      </table>
    </div>
  </div>

  ${data.terms ? `
  <div class="section">
    <div class="section-title">${data.deliverables.length > 0 ? '5' : '4'}. Terms &amp; Conditions</div>
    <div class="terms-box">${data.terms}</div>
  </div>
  ` : ''}

  <!-- Signatures -->
  <div class="signatures">
    <div class="sig-block">
      <h4>For and on behalf of</h4>
      <div class="sig-party-name">${company.name}</div>
      <div class="sig-line">Signature</div>
      <div class="sig-line">Full Name</div>
      <div class="sig-line">Designation</div>
      <div class="sig-line">Date</div>
    </div>
    <div class="sig-block">
      <h4>${data.contractor ? 'Contractor' : 'Accepted by'}</h4>
      <div class="sig-party-name">${data.contractor?.name || data.staffName || 'Staff Member'}</div>
      <div class="sig-line">Signature</div>
      <div class="sig-line">Full Name</div>
      <div class="sig-line">ID / Registration No.</div>
      <div class="sig-line">Date</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${company.name}${company.registrationNumber ? ` — Reg: ${company.registrationNumber}` : ''}${company.vatNumber ? ` | VAT: ${company.vatNumber}` : ''}</span>
    <span>${data.number} | v${data.version} | ${formatDate(data.date)}</span>
  </div>
</body>
</html>`;
}
