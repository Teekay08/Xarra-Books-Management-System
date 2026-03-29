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
  contractor: ContractorInfo;
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
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .company { font-size: 24px; font-weight: bold; color: #166534; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .doc-title { font-size: 28px; font-weight: bold; color: #166534; text-align: right; }
    .doc-meta { text-align: right; font-size: 12px; color: #555; margin-top: 8px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party { width: 48%; }
    .party h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 8px; }
    .party p { margin: 2px 0; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: bold; color: #166534; border-bottom: 2px solid #166534; padding-bottom: 4px; margin-bottom: 12px; }
    .scope-text { padding: 12px; background: #f9f9f9; border-radius: 4px; font-size: 12px; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #166534; font-size: 11px; text-transform: uppercase; color: #555; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td { padding: 6px 8px; }
    .totals .grand-total td { border-top: 2px solid #166534; font-weight: bold; font-size: 16px; }
    .project-info { padding: 12px; background: #f0f7f0; border-radius: 4px; margin-bottom: 30px; font-size: 12px; }
    .project-info strong { color: #166534; }
    .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
    .sig-block { width: 44%; }
    .sig-block h4 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 40px; }
    .sig-line { border-top: 1px solid #333; padding-top: 6px; margin-bottom: 12px; font-size: 12px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
    .terms { margin-top: 20px; padding: 12px; background: #f9f9f9; border-radius: 4px; font-size: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div class="company">${company.name}</div>
      ${company.tradingAs ? `<div class="company-sub">Trading as ${company.tradingAs}</div>` : ''}
      <div class="company-sub">${company.city ? [company.city, company.province, 'South Africa'].filter(Boolean).join(', ') : 'Midrand, Gauteng, South Africa'}</div>
      ${company.vatNumber ? `<div class="company-sub">VAT: ${company.vatNumber}</div>` : ''}
      ${company.phone ? `<div class="company-sub">Tel: ${company.phone}</div>` : ''}
      ${company.email ? `<div class="company-sub">Email: ${company.email}</div>` : ''}
    </div>
    <div>
      <div class="doc-title">STATEMENT OF WORK</div>
      <div class="doc-meta">
        <strong>${data.number}</strong><br>
        Version: ${data.version}<br>
        Date: ${formatDate(data.date)}<br>
        Valid Until: ${formatDate(data.validUntil)}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Company</h3>
      <p><strong>${company.name}</strong></p>
      <div class="company-sub">${company.city ? [company.city, company.province, 'South Africa'].filter(Boolean).join(', ') : 'Midrand, Gauteng, South Africa'}</div>
      ${company.email ? `<p>${company.email}</p>` : ''}
    </div>
    <div class="party">
      <h3>Contractor</h3>
      <p><strong>${data.contractor.name}</strong></p>
      ${data.contractor.contactName ? `<p>${data.contractor.contactName}</p>` : ''}
      ${data.contractor.address ? `<p>${data.contractor.address}</p>` : ''}
      ${data.contractor.contactEmail ? `<p>${data.contractor.contactEmail}</p>` : ''}
    </div>
  </div>

  <div class="project-info">
    <strong>Project:</strong> ${data.project.name} (${data.project.number})
    ${data.project.titleName ? `<br><strong>Title:</strong> ${data.project.titleName}` : ''}
    ${data.project.authorName ? `<br><strong>Author:</strong> ${data.project.authorName}` : ''}
  </div>

  <div class="section">
    <div class="section-title">Scope of Work</div>
    <div class="scope-text">${data.scope}</div>
  </div>

  <div class="section">
    <div class="section-title">Deliverables</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th>Description</th>
          <th style="width:120px">Due Date</th>
          <th>Acceptance Criteria</th>
        </tr>
      </thead>
      <tbody>
        ${deliverablesHtml}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Timeline</div>
    <p><strong>Start Date:</strong> ${formatDate(data.timeline.startDate)} &nbsp;&nbsp; <strong>End Date:</strong> ${formatDate(data.timeline.endDate)}</p>
    ${data.timeline.milestones.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Milestone</th>
          <th style="width:140px">Date</th>
        </tr>
      </thead>
      <tbody>
        ${milestonesHtml}
      </tbody>
    </table>
    ` : ''}
  </div>

  <div class="section">
    <div class="section-title">Cost Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Hours</th>
          <th style="text-align:right">Rate</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${costHtml}
      </tbody>
    </table>

    <table class="totals">
      <tr class="grand-total">
        <td>Total Amount</td>
        <td style="text-align:right">${formatCurrency(data.totalAmount)}</td>
      </tr>
    </table>
  </div>

  ${data.terms ? `
  <div class="section">
    <div class="section-title">Terms &amp; Conditions</div>
    <div class="terms">${data.terms}</div>
  </div>
  ` : ''}

  <div class="signatures">
    <div class="sig-block">
      <h4>${company.name}</h4>
      <div class="sig-line">Signature</div>
      <div class="sig-line">Name</div>
      <div class="sig-line">Title</div>
      <div class="sig-line">Date</div>
    </div>
    <div class="sig-block">
      <h4>${data.contractor.name}</h4>
      <div class="sig-line">Signature</div>
      <div class="sig-line">Name</div>
      <div class="sig-line">Title</div>
      <div class="sig-line">Date</div>
    </div>
  </div>

  <div class="footer">
    <p>${company.name}${company.registrationNumber ? ` (Reg: ${company.registrationNumber})` : ''}</p>
  </div>
</body>
</html>`;
}
