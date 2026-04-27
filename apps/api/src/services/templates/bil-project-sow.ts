// ─── Billetterie Project — Statement of Work PDF ─────────────────────────────
// Generated on demand from the project's live data (phases, team, milestones,
// risks). Served as a professional client-facing document.

interface BilSowCompany {
  name: string;
  tradingAs: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  accentColor?: string | null;
}

interface BilSowTeamMember {
  name: string;
  role: 'PM' | 'SPONSOR' | 'BA' | 'ADMIN' | string;
  memberRole: string | null; // staff job title
}

interface BilSowPhase {
  phaseKey: string;
  status: 'LOCKED' | 'ACTIVE' | 'APPROVED';
  gateDocs: string[];
}

interface BilSowMilestone {
  title: string;
  phaseKey: string;
  dueDate: string | null;
  status: string;
}

interface BilSowRisk {
  title: string;
  probability: number;
  impact: number;
  score: number;
  status: string;
  category: string | null;
}

interface BilSowData {
  project: {
    number: string;
    name: string;
    client: string | null;
    description: string | null;
    startDate: string | null;
    targetEndDate: string | null;
    budget: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    currentPhase: string;
    status: string;
    projectType: string | null;
    healthStatus: string | null;
  };
  company: BilSowCompany;
  team: BilSowTeamMember[];
  phases: BilSowPhase[];
  milestones: BilSowMilestone[];
  risks: BilSowRisk[];
  generatedAt: string;
}

const PHASE_LABELS: Record<string, string> = {
  INITIATION:   'Initiation',
  ELICITATION:  'Requirements Elicitation',
  ARCHITECTURE: 'Architecture & Design',
  DEVELOPMENT:  'Development',
  TESTING:      'Testing & QA',
  SIGN_OFF:     'Client Sign-off',
  CLOSURE:      'Project Closure',
};

const ROLE_LABELS: Record<string, string> = {
  SPONSOR: 'Project Sponsor',
  PM:      'Project Manager',
  BA:      'Business Analyst',
  ADMIN:   'Project Administrator',
};

const RISK_LEVEL = (score: number) =>
  score >= 15 ? 'Critical' : score >= 10 ? 'High' : score >= 5 ? 'Medium' : 'Low';

const RISK_COLOR = (score: number) =>
  score >= 15 ? '#dc2626' : score >= 10 ? '#ea580c' : score >= 5 ? '#d97706' : '#16a34a';

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtCurrency(v: string | null) {
  if (!v) return '—';
  return `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

export function renderBilProjectSowHtml(data: BilSowData): string {
  const { project, company, team, phases, milestones, risks, generatedAt } = data;
  const accent = company.accentColor ?? '#1d4ed8';

  const logo = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:55px;max-width:180px;">`
    : '';

  const addr = [company.addressLine1, company.city, company.province, company.postalCode].filter(Boolean).join(', ');

  // Team table rows
  const teamRows = team.map(m => `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">${m.name}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">${ROLE_LABELS[m.role] ?? m.role}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${m.memberRole ?? '—'}</td>
    </tr>
  `).join('');

  // Phase rows
  const phaseRows = phases.map((ph, idx) => {
    const statusBg = ph.status === 'APPROVED' ? '#d1fae5' : ph.status === 'ACTIVE' ? '#dbeafe' : '#f3f4f6';
    const statusColor = ph.status === 'APPROVED' ? '#065f46' : ph.status === 'ACTIVE' ? '#1d4ed8' : '#6b7280';
    const statusLabel = ph.status === 'APPROVED' ? 'Complete' : ph.status === 'ACTIVE' ? 'In Progress' : 'Pending';
    return `
      <tr>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111827;">${idx + 1}. ${PHASE_LABELS[ph.phaseKey] ?? ph.phaseKey}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">
          <span style="background:${statusBg};color:${statusColor};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">${statusLabel}</span>
        </td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;">${ph.gateDocs.join(', ')}</td>
      </tr>
    `;
  }).join('');

  // Milestone rows
  const milestoneRows = milestones.length
    ? milestones.map(m => `
        <tr>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">${m.title}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;">${PHASE_LABELS[m.phaseKey] ?? m.phaseKey}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">${fmtDate(m.dueDate)}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;
              background:${m.status === 'MET' ? '#d1fae5' : m.status === 'MISSED' ? '#fee2e2' : '#f3f4f6'};
              color:${m.status === 'MET' ? '#065f46' : m.status === 'MISSED' ? '#991b1b' : '#374151'}">
              ${m.status}
            </span>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" style="padding:12px;color:#9ca3af;text-align:center;font-size:11px;">No milestones defined</td></tr>`;

  // Risk rows (open + mitigated only, sorted by score desc)
  const visibleRisks = risks.filter(r => r.status !== 'CLOSED').sort((a, b) => b.score - a.score);
  const riskRows = visibleRisks.length
    ? visibleRisks.map(r => `
        <tr>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-weight:500;">${r.title}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;">${r.category ?? '—'}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.probability}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.impact}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
            <span style="font-size:11px;font-weight:800;color:${RISK_COLOR(r.score)}">${r.score} — ${RISK_LEVEL(r.score)}</span>
          </td>
          <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:#f3f4f6;color:#374151;">${r.status}</span>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="padding:12px;color:#9ca3af;text-align:center;font-size:11px;">No open risks recorded</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #111827; background: #fff; padding: 36px; }
  h1 { font-size: 26px; font-weight: 900; color: ${accent}; letter-spacing: -0.5px; }
  h2 { font-size: 13px; font-weight: 800; color: ${accent}; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid ${accent}; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${accent}; color: #fff; text-align: left; padding: 8px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .section { margin-bottom: 28px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .meta-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; }
  .meta-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 3px; }
  .meta-value { font-size: 13px; font-weight: 600; color: #0f172a; }
  .sig-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; min-height: 70px; background: #fafafa; }
  .sig-line { margin-top: 40px; border-top: 1px solid #9ca3af; padding-top: 4px; font-size: 9px; color: #9ca3af; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<!-- ═══ HEADER ═══ -->
<table style="margin-bottom:28px;">
  <tr>
    <td style="width:50%;vertical-align:top;">
      ${logo}
      <div style="margin-top:6px;">
        <div style="font-weight:700;font-size:13px;">${company.name}${company.tradingAs ? ` (${company.tradingAs})` : ''}</div>
        ${addr ? `<div style="color:#6b7280;font-size:11px;margin-top:2px;">${addr}</div>` : ''}
        ${company.phone ? `<div style="color:#6b7280;font-size:11px;">T: ${company.phone}</div>` : ''}
        ${company.email ? `<div style="color:#6b7280;font-size:11px;">${company.email}</div>` : ''}
      </div>
    </td>
    <td style="width:50%;text-align:right;vertical-align:top;">
      <h1>STATEMENT OF WORK</h1>
      <div style="margin-top:6px;">
        <div style="font-size:20px;font-weight:800;font-family:monospace;color:${accent};">${project.number}</div>
        <div style="color:#6b7280;font-size:11px;margin-top:2px;">Generated: ${fmtDate(generatedAt)}</div>
      </div>
    </td>
  </tr>
</table>

<!-- ═══ PROJECT OVERVIEW ═══ -->
<div class="section">
  <h2>1. Project Overview</h2>
  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">Project Name</div><div class="meta-value">${project.name}</div></div>
    <div class="meta-item"><div class="meta-label">Client</div><div class="meta-value">${project.client ?? '—'}</div></div>
    <div class="meta-item"><div class="meta-label">Start Date</div><div class="meta-value">${fmtDate(project.startDate)}</div></div>
    <div class="meta-item"><div class="meta-label">Target End Date</div><div class="meta-value">${fmtDate(project.targetEndDate)}</div></div>
    <div class="meta-item"><div class="meta-label">Budget</div><div class="meta-value">${fmtCurrency(project.budget)}</div></div>
    <div class="meta-item"><div class="meta-label">Current Phase</div><div class="meta-value">${PHASE_LABELS[project.currentPhase] ?? project.currentPhase}</div></div>
  </div>
  ${project.description ? `
  <div style="background:#f8fafc;border-left:3px solid ${accent};padding:10px 14px;border-radius:0 6px 6px 0;margin-top:6px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Project Description</div>
    <div style="font-size:12px;color:#374151;line-height:1.6;">${project.description}</div>
  </div>` : ''}
</div>

<!-- ═══ CLIENT CONTACT ═══ -->
${(project.contactName || project.contactEmail) ? `
<div class="section">
  <h2>2. Client Contact</h2>
  <div class="meta-grid">
    ${project.contactName ? `<div class="meta-item"><div class="meta-label">Contact Person</div><div class="meta-value">${project.contactName}</div></div>` : ''}
    ${project.contactEmail ? `<div class="meta-item"><div class="meta-label">Email</div><div class="meta-value">${project.contactEmail}</div></div>` : ''}
    ${project.contactPhone ? `<div class="meta-item"><div class="meta-label">Phone</div><div class="meta-value">${project.contactPhone}</div></div>` : ''}
  </div>
</div>` : ''}

<!-- ═══ PROJECT TEAM ═══ -->
<div class="section">
  <h2>3. Project Team</h2>
  <table>
    <thead><tr><th>Name</th><th>Project Role</th><th>Position</th></tr></thead>
    <tbody>${teamRows || '<tr><td colspan="3" style="padding:12px;color:#9ca3af;text-align:center;">No team members assigned</td></tr>'}</tbody>
  </table>
</div>

<!-- ═══ SCOPE — PHASES ═══ -->
<div class="section">
  <h2>4. Project Scope &amp; Phase Plan</h2>
  <table>
    <thead><tr><th>Phase</th><th>Status</th><th>Gate Documents Required</th></tr></thead>
    <tbody>${phaseRows}</tbody>
  </table>
</div>

<!-- ═══ MILESTONES ═══ -->
<div class="section">
  <h2>5. Key Milestones</h2>
  <table>
    <thead><tr><th>Milestone</th><th>Phase</th><th>Due Date</th><th>Status</th></tr></thead>
    <tbody>${milestoneRows}</tbody>
  </table>
</div>

<!-- ═══ RISKS ═══ -->
<div class="section">
  <h2>6. Risk Register Summary</h2>
  <table>
    <thead><tr><th>Risk</th><th>Category</th><th style="text-align:center;">P</th><th style="text-align:center;">I</th><th style="text-align:center;">Score</th><th>Status</th></tr></thead>
    <tbody>${riskRows}</tbody>
  </table>
  <div style="font-size:9px;color:#9ca3af;margin-top:6px;">P = Probability (1–5) · I = Impact (1–5) · Score = P × I</div>
</div>

<!-- ═══ SIGN-OFF ═══ -->
<div class="page-break"></div>
<div class="section">
  <h2>7. Agreement &amp; Sign-off</h2>
  <p style="font-size:11px;color:#374151;margin-bottom:16px;line-height:1.7;">
    This Statement of Work sets out the scope, deliverables, timeline and responsibilities agreed between
    <strong>${company.name}</strong> and <strong>${project.client ?? 'the Client'}</strong>
    for the project <strong>${project.name}</strong> (${project.number}).
    By signing below, both parties confirm they have read, understood, and accept the terms of this document.
  </p>
  <table style="margin-top:16px;">
    <tr>
      <td style="width:48%;padding-right:20px;vertical-align:top;">
        <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;">For ${company.name}</div>
        <div class="sig-box">
          <div class="sig-line">Name / Title / Date</div>
        </div>
      </td>
      <td style="width:4%"></td>
      <td style="width:48%;vertical-align:top;">
        <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;">For ${project.client ?? 'Client'}</div>
        <div class="sig-box">
          <div class="sig-line">Name / Title / Date</div>
        </div>
      </td>
    </tr>
  </table>
</div>

<!-- ═══ FOOTER ═══ -->
<div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:10px;color:#9ca3af;font-size:9px;text-align:center;">
  ${project.number} · ${project.name} · Statement of Work · Generated ${fmtDate(generatedAt)} by ${company.name}
  · This document is confidential and intended solely for the named parties.
</div>

</body>
</html>`;
}
