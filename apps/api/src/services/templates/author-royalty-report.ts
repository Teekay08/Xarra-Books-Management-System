interface RoyaltyReportLine {
  bookTitle: string;
  authorName: string;
  retailPrice: number;
  salesPeriod: string;
  qtySorSupplied: number;
  qtySold: number;
  qtyReturned: number;
  kindleSalesQty: number;
  randAmountReceived: number;
  totalEbookSalesAmount: number;
  totalPhysicalSalesAmount: number;
  royaltyPayoutPhysical: number; // 5%
  royaltyPayoutEbook: number; // 25%
  lessOwingAdvance: number;
  disbursement: number;
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
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.royaltyPayoutPhysical)}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.royaltyPayoutEbook)}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right">${fmt(line.lessOwingAdvance)}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:right;font-weight:600">${fmt(line.disbursement)}</td>
    </tr>
  `).join('');

  const t = data.totals;

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
        <th style="text-align:right">Royalty Physical (5%)</th>
        <th style="text-align:right">Royalty E-Book (25%)</th>
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
