interface RoyaltyReportLine {
  bookTitle: string;
  authorName: string;
  retailPrice: number;
  salesPeriod: string;
  printRoyaltyRate?: number;
  ebookRoyaltyRate?: number;
  qtySorSupplied: number;
  qtySold: number;
  qtyReturned: number;
  kindleSalesQty: number;
  randAmountReceived: number;
  totalEbookSalesAmount: number;
  totalPhysicalSalesAmount: number;
  royaltyPayoutPhysical: number;
  royaltyPayoutEbook: number;
  lessOwingAdvance: number;
  disbursement: number;
}

interface BalanceSummary {
  lifetimeGrossRoyalty: number;
  lifetimeAdvanceDeducted: number;
  lifetimeNetPayable: number;
  totalPaid: number;
  totalUnpaid: number;
  totalAdvanceOriginal: number;
  totalAdvanceRecovered: number;
}

interface PaymentHistoryItem {
  id: string;
  number: string;
  periodFrom: string;
  periodTo: string;
  grossRoyalty: number;
  advanceDeducted: number;
  netPayable: number;
  previouslyPaid: number;
  amountDue: number;
  amountPaid: number;
  status: string;
  paymentMethod?: string | null;
  bankReference?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

interface PaymentScheduleItem {
  titleId: string;
  bookTitle: string;
  frequency: string;
  minimumPayment: number;
  nextPeriodFrom: string;
  nextPeriodTo: string;
  nextDueDate: string;
  isOverdue: boolean;
}

interface AuthorRoyaltyReportData {
  authorName: string;
  reportDate: string;
  periodFrom: string;
  periodTo: string;
  lines: RoyaltyReportLine[];
  totals: {
    qtySorSupplied: number;
    qtySold: number;
    qtyReturned: number;
    kindleSalesQty: number;
    randAmountReceived: number;
    totalEbookSalesAmount: number;
    totalPhysicalSalesAmount: number;
    royaltyPayoutPhysical: number;
    royaltyPayoutEbook: number;
    lessOwingAdvance: number;
    disbursement: number;
  };
  balanceSummary?: BalanceSummary;
  paymentHistory?: PaymentHistoryItem[];
  paymentSchedule?: PaymentScheduleItem[];
  company?: {
    name: string;
    logoUrl?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

function fmt(v: number): string {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtShortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    COMPLETED: '#166534', PAID: '#166534',
    PENDING: '#d97706', PROCESSING: '#2563eb',
    FAILED: '#dc2626', REVERSED: '#dc2626',
    APPROVED: '#2563eb', CALCULATED: '#6b7280',
  };
  const color = colors[status] || '#6b7280';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${color}15;color:${color};font-size:9px;font-weight:600;text-transform:uppercase">${status}</span>`;
}

export function renderAuthorRoyaltyReportHtml(data: AuthorRoyaltyReportData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:50px;max-width:180px;margin-bottom:6px">`
    : '';

  const rows = data.lines.map(line => `
    <tr>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px">${line.bookTitle}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px">${line.authorName}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.retailPrice)}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px">${line.salesPeriod}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${line.qtySorSupplied}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${line.qtySold}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${line.qtyReturned}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${line.kindleSalesQty}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.randAmountReceived)}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.totalEbookSalesAmount)}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.totalPhysicalSalesAmount)}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.royaltyPayoutPhysical)} (${line.printRoyaltyRate ? fmtPct(line.printRoyaltyRate) : '5%'})</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.royaltyPayoutEbook)} (${line.ebookRoyaltyRate ? fmtPct(line.ebookRoyaltyRate) : '25%'})</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.lessOwingAdvance)}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right;font-weight:600">${fmt(line.disbursement)}</td>
    </tr>
  `).join('');

  const t = data.totals;

  // Balance Summary section
  const bal = data.balanceSummary;
  const balanceSummaryHtml = bal ? `
  <div style="margin-top:28px;page-break-inside:avoid">
    <h2 style="font-size:16px;color:#166534;margin:0 0 12px;border-bottom:2px solid #166534;padding-bottom:6px">LIFETIME BALANCE SUMMARY</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:8px 12px;background:#f0fdf4;border:1px solid #e5e7eb;width:50%">
          <div style="font-size:10px;color:#555;text-transform:uppercase">Lifetime Gross Royalty</div>
          <div style="font-size:18px;font-weight:700;color:#166534">${fmt(bal.lifetimeGrossRoyalty)}</div>
        </td>
        <td style="padding:8px 12px;background:#f0fdf4;border:1px solid #e5e7eb;width:50%">
          <div style="font-size:10px;color:#555;text-transform:uppercase">Lifetime Net Payable</div>
          <div style="font-size:18px;font-weight:700;color:#166534">${fmt(bal.lifetimeNetPayable)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">
          <div style="font-size:10px;color:#555;text-transform:uppercase">Total Paid to Date</div>
          <div style="font-size:16px;font-weight:700;color:#2563eb">${fmt(bal.totalPaid)}</div>
        </td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">
          <div style="font-size:10px;color:#555;text-transform:uppercase">Outstanding / Unpaid</div>
          <div style="font-size:16px;font-weight:700;color:${bal.totalUnpaid > 0 ? '#d97706' : '#166534'}">${fmt(bal.totalUnpaid)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">
          <div style="font-size:10px;color:#555;text-transform:uppercase">Original Advance</div>
          <div style="font-size:14px;font-weight:600">${fmt(bal.totalAdvanceOriginal)}</div>
        </td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">
          <div style="font-size:10px;color:#555;text-transform:uppercase">Advance Recovered</div>
          <div style="font-size:14px;font-weight:600">${fmt(bal.totalAdvanceRecovered)}
            <span style="font-size:10px;color:#555;margin-left:4px">(${bal.totalAdvanceOriginal > 0 ? Math.round(bal.totalAdvanceRecovered / bal.totalAdvanceOriginal * 100) : 100}% recovered)</span>
          </div>
        </td>
      </tr>
    </table>
  </div>` : '';

  // Payment History section
  const payments = data.paymentHistory || [];
  const paymentHistoryHtml = payments.length > 0 ? `
  <div style="margin-top:28px;page-break-inside:avoid">
    <h2 style="font-size:16px;color:#166534;margin:0 0 12px;border-bottom:2px solid #166534;padding-bottom:6px">PAYMENT HISTORY</h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Payment #</th>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Period</th>
          <th style="text-align:right;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Gross Royalty</th>
          <th style="text-align:right;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Advance Deducted</th>
          <th style="text-align:right;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Net Payable</th>
          <th style="text-align:right;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Amount Paid</th>
          <th style="text-align:center;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Status</th>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Bank Ref</th>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Paid Date</th>
        </tr>
      </thead>
      <tbody>
        ${payments.map(p => `
        <tr>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:600">${p.number}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:10px">${fmtShortDate(p.periodFrom)} — ${fmtShortDate(p.periodTo)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(p.grossRoyalty)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(p.advanceDeducted)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(p.netPayable)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right;font-weight:600">${fmt(p.amountPaid)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center">${statusBadge(p.status)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:10px">${p.bankReference || '—'}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:10px">${p.paidAt ? fmtShortDate(p.paidAt) : '—'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>` : '';

  // Payment Schedule section
  const schedule = data.paymentSchedule || [];
  const paymentScheduleHtml = schedule.length > 0 ? `
  <div style="margin-top:28px;page-break-inside:avoid">
    <h2 style="font-size:16px;color:#166534;margin:0 0 12px;border-bottom:2px solid #166534;padding-bottom:6px">UPCOMING PAYMENT SCHEDULE</h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Title</th>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Frequency</th>
          <th style="text-align:right;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Min. Payment</th>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Next Period</th>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Due Date</th>
          <th style="text-align:center;padding:6px 4px;border-bottom:2px solid #166534;font-size:9px;text-transform:uppercase;color:#555">Status</th>
        </tr>
      </thead>
      <tbody>
        ${schedule.map(s => `
        <tr>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px">${s.bookTitle}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px">${s.frequency.replace('_', ' ')}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(s.minimumPayment)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:10px">${fmtShortDate(s.nextPeriodFrom)} — ${fmtShortDate(s.nextPeriodTo)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;${s.isOverdue ? 'color:#dc2626;font-weight:700' : ''}">${fmtShortDate(s.nextDueDate)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center">${s.isOverdue
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#dc262615;color:#dc2626;font-size:9px;font-weight:600">OVERDUE</span>'
            : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#16653415;color:#166534;font-size:9px;font-weight:600">UPCOMING</span>'
          }</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.4; }
    @page { size: A4 landscape; margin: 12mm; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .company-name { font-size: 20px; font-weight: bold; color: #166534; }
    .report-title { font-size: 22px; font-weight: bold; color: #166534; text-align: right; }
    .meta { text-align: right; font-size: 11px; color: #555; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 4px; border-bottom: 2px solid #166534; font-size: 9px; text-transform: uppercase; color: #555; letter-spacing: 0.5px; }
    .totals td { border-top: 2px solid #166534; font-weight: 700; padding: 8px 4px; font-size: 11px; }
    .notes { margin-top: 24px; padding: 16px; background: #f9f9f9; border-radius: 6px; font-size: 11px; line-height: 1.6; }
    .notes h3 { margin: 0 0 10px; font-size: 13px; color: #166534; }
    .notes p { margin: 0 0 8px; }
    .notes .clause { margin-bottom: 12px; }
    .notes .clause-num { font-weight: 700; color: #166534; }
    .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 10px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div class="company-name">${company.name}</div>
    </div>
    <div>
      <div class="report-title">AUTHOR SALES &amp; ROYALTY REPORT</div>
      <div class="meta">
        Author: <strong>${data.authorName}</strong><br>
        Period: ${fmtDate(data.periodFrom)} — ${fmtDate(data.periodTo)}<br>
        Generated: ${fmtDate(data.reportDate)}
      </div>
    </div>
  </div>

  ${balanceSummaryHtml}

  <div style="margin-top:24px">
    <h2 style="font-size:16px;color:#166534;margin:0 0 12px;border-bottom:2px solid #166534;padding-bottom:6px">SALES &amp; ROYALTY BREAKDOWN — CURRENT PERIOD</h2>
  </div>

  <table>
    <thead>
      <tr>
        <th>Book Title</th>
        <th>Author</th>
        <th style="text-align:right">Retail Price</th>
        <th>Sales Period</th>
        <th style="text-align:right">Qty Supplied SOR</th>
        <th style="text-align:right">Qty Sold</th>
        <th style="text-align:right">Qty Returned</th>
        <th style="text-align:right">Kindle Sales Qty</th>
        <th style="text-align:right">Rand Amount Received</th>
        <th style="text-align:right">Total Ebook Sales</th>
        <th style="text-align:right">Total Physical Sales</th>
        <th style="text-align:right">Royalty Physical</th>
        <th style="text-align:right">Royalty E-Book</th>
        <th style="text-align:right">Less Advance</th>
        <th style="text-align:right">Disbursement</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr class="totals">
        <td colspan="4"><strong>TOTALS</strong></td>
        <td style="text-align:right">${t.qtySorSupplied}</td>
        <td style="text-align:right">${t.qtySold}</td>
        <td style="text-align:right">${t.qtyReturned}</td>
        <td style="text-align:right">${t.kindleSalesQty}</td>
        <td style="text-align:right">${fmt(t.randAmountReceived)}</td>
        <td style="text-align:right">${fmt(t.totalEbookSalesAmount)}</td>
        <td style="text-align:right">${fmt(t.totalPhysicalSalesAmount)}</td>
        <td style="text-align:right">${fmt(t.royaltyPayoutPhysical)}</td>
        <td style="text-align:right">${fmt(t.royaltyPayoutEbook)}</td>
        <td style="text-align:right">${fmt(t.lessOwingAdvance)}</td>
        <td style="text-align:right;font-size:13px">${fmt(t.disbursement)}</td>
      </tr>
    </tfoot>
  </table>

  ${paymentHistoryHtml}

  ${paymentScheduleHtml}

  <div class="notes">
    <h3>Notes — Royalty Terms</h3>

    <div class="clause">
      <span class="clause-num">7.1</span> The Author shall receive a royalty of <strong>5%</strong> (five percent) of the Total Sales of each copy of the Work sold in print format for the first 2,000 copies sold. For the next tranche, the royalty increases to <strong>10%</strong>, and thereafter to <strong>15%</strong> of Total Sales.
    </div>

    <div class="clause">
      <span class="clause-num">7.2</span> The Author shall receive a royalty of <strong>25%</strong> (twenty-five percent) of Net Receipts from E-Book sales. The e-book royalty rate shall be subject to annual review.
    </div>

    <div class="clause">
      <span class="clause-num">7.3</span> The Advance (if applicable) is payable in three equal parts: upon signature of the Agreement, upon delivery of the final manuscript, and upon publication. Royalties shall not be payable until the Advance has been fully recouped from earned royalties.
    </div>

    <div class="clause">
      <span class="clause-num">7.4</span> No royalty shall be payable on copies used for promotional purposes, review copies, or copies lost or damaged in transit or storage.
    </div>
  </div>

  <div class="footer">
    <p>${company.name} — Author Royalty Report</p>
    <p>This report is generated for informational purposes. Royalty payments are subject to the terms of the publishing agreement between the Author and ${company.name}.</p>
    ${company.email ? `<p>Contact: ${company.email}</p>` : ''}
  </div>
</body>
</html>`;
}
