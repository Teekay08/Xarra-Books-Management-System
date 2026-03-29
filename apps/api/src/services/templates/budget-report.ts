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

interface ClassificationRow {
  classification: string;
  budgeted: number;
  actual: number;
  variance: number;
}

interface MilestoneRow {
  milestone: string;
  budgeted: number;
  actual: number;
  variance: number;
}

interface LineItem {
  milestone: string;
  description: string;
  category: string;
  classification: string;
  source: string;
  estimatedHours: number;
  hourlyRate: number;
  estimated: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

interface BudgetReportData {
  project: {
    name: string;
    number: string;
    type: string;
    contractType: string;
    authorName: string;
    titleName: string;
    startDate: string;
    targetDate: string;
  };
  company?: CompanyInfo;
  summary: {
    totalBudget: number;
    totalActual: number;
    variance: number;
    authorContribution: number;
    xarraNet: number;
  };
  byClassification: ClassificationRow[];
  byMilestone: MilestoneRow[];
  lineItems: LineItem[];
}

function formatCurrency(value: string | number): string {
  return `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function varianceColor(value: number): string {
  if (value > 0) return '#166534';
  if (value < 0) return '#991b1b';
  return '#1a1a1a';
}

function varianceCell(value: number): string {
  const color = varianceColor(value);
  return `<td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:${color}">${formatCurrency(value)}</td>`;
}

export function renderBudgetReportHtml(data: BudgetReportData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const classificationHtml = data.byClassification.map((r) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${r.classification}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(r.budgeted)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(r.actual)}</td>
      ${varianceCell(r.variance)}
    </tr>
  `).join('');

  const milestoneHtml = data.byMilestone.map((r) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${r.milestone}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(r.budgeted)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(r.actual)}</td>
      ${varianceCell(r.variance)}
    </tr>
  `).join('');

  const lineItemsHtml = data.lineItems.map((li) => `
    <tr>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px">${li.milestone}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px">${li.description}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px">${li.category}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px">${li.classification}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px">${li.source}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;text-align:right">${li.estimatedHours.toFixed(1)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;text-align:right">${formatCurrency(li.hourlyRate)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;text-align:right">${formatCurrency(li.estimated)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;text-align:right">${formatCurrency(li.actual)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;text-align:right;color:${varianceColor(li.variance)}">${formatCurrency(li.variance)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-size:11px;text-align:right;color:${varianceColor(li.variancePercent)}">${li.variancePercent.toFixed(1)}%</td>
    </tr>
  `).join('');

  const variancePct = data.summary.totalBudget !== 0
    ? ((data.summary.variance / data.summary.totalBudget) * 100).toFixed(1)
    : '0.0';

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
    .project-info { padding: 14px; background: #f0f7f0; border-radius: 4px; margin-bottom: 30px; font-size: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .project-info strong { color: #166534; }
    .summary-cards { display: flex; gap: 12px; margin-bottom: 30px; }
    .summary-card { flex: 1; padding: 14px; border-radius: 6px; text-align: center; }
    .summary-card .label { font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
    .summary-card .value { font-size: 18px; font-weight: bold; }
    .card-budget { background: #f0f7f0; }
    .card-budget .value { color: #166534; }
    .card-actual { background: #eff6ff; }
    .card-actual .value { color: #1e40af; }
    .card-variance { background: #fef9ee; }
    .card-author { background: #f5f3ff; }
    .card-author .value { color: #5b21b6; }
    .card-net { background: #f0fdf4; }
    .card-net .value { color: #166534; }
    .section { margin-bottom: 28px; }
    .section-title { font-size: 14px; font-weight: bold; color: #166534; border-bottom: 2px solid #166534; padding-bottom: 4px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #166534; font-size: 11px; text-transform: uppercase; color: #555; }
    .total-row td { padding: 8px; border-top: 2px solid #166534; font-weight: bold; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
    @media print { .page-break { page-break-before: always; } }
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
      <div class="doc-title">BUDGET REPORT</div>
      <div class="doc-meta">
        <strong>${data.project.number}</strong><br>
        Generated: ${formatDate(new Date().toISOString())}
      </div>
    </div>
  </div>

  <div class="project-info">
    <div><strong>Project:</strong> ${data.project.name}</div>
    <div><strong>Project #:</strong> ${data.project.number}</div>
    <div><strong>Title:</strong> ${data.project.titleName}</div>
    <div><strong>Author:</strong> ${data.project.authorName}</div>
    <div><strong>Type:</strong> ${data.project.type}</div>
    <div><strong>Contract:</strong> ${data.project.contractType}</div>
    <div><strong>Start Date:</strong> ${formatDate(data.project.startDate)}</div>
    <div><strong>Target Date:</strong> ${formatDate(data.project.targetDate)}</div>
  </div>

  <div class="summary-cards">
    <div class="summary-card card-budget">
      <div class="label">Total Budget</div>
      <div class="value">${formatCurrency(data.summary.totalBudget)}</div>
    </div>
    <div class="summary-card card-actual">
      <div class="label">Total Actual</div>
      <div class="value">${formatCurrency(data.summary.totalActual)}</div>
    </div>
    <div class="summary-card card-variance">
      <div class="label">Variance (${variancePct}%)</div>
      <div class="value" style="color:${varianceColor(data.summary.variance)}">${formatCurrency(data.summary.variance)}</div>
    </div>
    <div class="summary-card card-author">
      <div class="label">Author Contribution</div>
      <div class="value">${formatCurrency(data.summary.authorContribution)}</div>
    </div>
    <div class="summary-card card-net">
      <div class="label">Xarra Net</div>
      <div class="value">${formatCurrency(data.summary.xarraNet)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">By Classification</div>
    <table>
      <thead>
        <tr>
          <th>Classification</th>
          <th style="text-align:right">Budgeted</th>
          <th style="text-align:right">Actual</th>
          <th style="text-align:right">Variance</th>
        </tr>
      </thead>
      <tbody>
        ${classificationHtml}
        <tr class="total-row">
          <td>Total</td>
          <td style="text-align:right">${formatCurrency(data.summary.totalBudget)}</td>
          <td style="text-align:right">${formatCurrency(data.summary.totalActual)}</td>
          <td style="text-align:right;color:${varianceColor(data.summary.variance)}">${formatCurrency(data.summary.variance)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">By Milestone</div>
    <table>
      <thead>
        <tr>
          <th>Milestone</th>
          <th style="text-align:right">Budgeted</th>
          <th style="text-align:right">Actual</th>
          <th style="text-align:right">Variance</th>
        </tr>
      </thead>
      <tbody>
        ${milestoneHtml}
      </tbody>
    </table>
  </div>

  <div class="section page-break">
    <div class="section-title">Line Items</div>
    <table>
      <thead>
        <tr>
          <th>Milestone</th>
          <th>Description</th>
          <th>Category</th>
          <th>Class.</th>
          <th>Source</th>
          <th style="text-align:right">Hours</th>
          <th style="text-align:right">Rate</th>
          <th style="text-align:right">Estimated</th>
          <th style="text-align:right">Actual</th>
          <th style="text-align:right">Variance</th>
          <th style="text-align:right">Var %</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>${company.name}${company.registrationNumber ? ` (Reg: ${company.registrationNumber})` : ''} &mdash; Confidential</p>
  </div>
</body>
</html>`;
}
