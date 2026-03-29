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

interface TimesheetEntry {
  milestoneName: string;
  workDate: string;
  hours: number;
  description: string;
}

interface TimesheetData {
  number: string;
  periodFrom: string;
  periodTo: string;
  company?: CompanyInfo;
  worker: {
    name: string;
    role: string;
  };
  project: {
    name: string;
    number: string;
  };
  entries: TimesheetEntry[];
  totalHours: number;
  status: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatShortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(status: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: '#f3f4f6', text: '#374151' },
    SUBMITTED: { bg: '#dbeafe', text: '#1e40af' },
    APPROVED: { bg: '#dcfce7', text: '#166534' },
    REJECTED: { bg: '#fee2e2', text: '#991b1b' },
  };
  const c = colors[status] ?? colors.DRAFT;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${c.bg};color:${c.text}">${status}</span>`;
}

export function renderTimesheetHtml(data: TimesheetData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const entriesHtml = data.entries.map((e) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${formatShortDate(e.workDate)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${e.milestoneName}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${e.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${Number(e.hours).toFixed(1)}</td>
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
    .info-grid { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .info-box { width: 48%; }
    .info-box h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 8px; }
    .info-box p { margin: 2px 0; }
    .period-bar { padding: 10px 14px; background: #f0f7f0; border-radius: 4px; margin-bottom: 24px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
    .period-bar strong { color: #166534; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #166534; font-size: 11px; text-transform: uppercase; color: #555; }
    .total-row td { padding: 10px 8px; border-top: 2px solid #166534; font-weight: bold; font-size: 14px; }
    .approval { margin-top: 30px; padding: 12px; background: #f9f9f9; border-radius: 4px; font-size: 12px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
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
      <div class="doc-title">TIMESHEET</div>
      <div class="doc-meta">
        <strong>${data.number}</strong><br>
        ${statusBadge(data.status)}
      </div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <h3>Worker</h3>
      <p><strong>${data.worker.name}</strong></p>
      <p>${data.worker.role}</p>
    </div>
    <div class="info-box">
      <h3>Project</h3>
      <p><strong>${data.project.name}</strong></p>
      <p>${data.project.number}</p>
    </div>
  </div>

  <div class="period-bar">
    <span><strong>Period:</strong> ${formatDate(data.periodFrom)} &mdash; ${formatDate(data.periodTo)}</span>
    <span><strong>Total Hours:</strong> ${Number(data.totalHours).toFixed(1)}</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:110px">Date</th>
        <th>Milestone</th>
        <th>Description</th>
        <th style="text-align:right;width:80px">Hours</th>
      </tr>
    </thead>
    <tbody>
      ${entriesHtml}
      <tr class="total-row">
        <td colspan="3">Total Hours</td>
        <td style="text-align:right">${Number(data.totalHours).toFixed(1)}</td>
      </tr>
    </tbody>
  </table>

  ${data.approvedBy ? `
  <div class="approval">
    <strong>Approved by:</strong> ${data.approvedBy}
    ${data.approvedAt ? ` &nbsp;&mdash;&nbsp; ${formatDate(data.approvedAt)}` : ''}
  </div>
  ` : ''}

  <div class="footer">
    <p>${company.name}${company.registrationNumber ? ` (Reg: ${company.registrationNumber})` : ''}</p>
  </div>
</body>
</html>`;
}
