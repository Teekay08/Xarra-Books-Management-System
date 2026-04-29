interface InvoiceLineDetail {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface StatementTransaction {
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  lines?: InvoiceLineDetail[];
}

interface StatementData {
  statementDate: string;
  periodFrom: string;
  periodTo: string;
  company?: {
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
    bankDetails?: {
      bankName: string;
      accountNumber: string;
      branchCode: string;
      accountType: string;
    };
  };
  recipient: {
    name: string;
    branchName?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    vatNumber?: string | null;
  };
  openingBalance: number;
  transactions: StatementTransaction[];
  closingBalance: number;
  totalInvoiced: number;
  totalReceived: number;
  totalCredits: number;
  totalDebits?: number;
}

function formatCurrency(value: number): string {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatShortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function renderStatementHtml(data: StatementData): string {
  const company = data.company ?? { name: 'Xarra Books' };

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:60px;max-width:200px;margin-bottom:8px">`
    : '';

  const typeLabels: Record<string, string> = {
    INVOICE: 'Invoice',
    PAYMENT: 'Payment',
    CREDIT_NOTE: 'Credit Note',
    DEBIT_NOTE: 'Debit Note',
  };

  const transactionsHtml = data.transactions.map((t) => {
    const linesHtml = t.lines && t.lines.length > 0
      ? t.lines.map((l) => `
        <tr style="background:#fafafa">
          <td style="padding:2px 8px 2px 24px;font-size:10px;color:#666" colspan="4">
            — ${l.description} (${l.quantity} x ${formatCurrency(l.unitPrice)} = ${formatCurrency(l.lineTotal)})
          </td>
          <td colspan="3"></td>
        </tr>`).join('')
      : '';

    return `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${formatShortDate(t.date)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${typeLabels[t.type] ?? t.type}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${t.reference}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${t.description}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${t.debit > 0 ? formatCurrency(t.debit) : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${t.credit > 0 ? formatCurrency(t.credit) : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:500">${formatCurrency(t.balance)}</td>
    </tr>
    ${linesHtml}`;
  }).join('');

  const bankDetailsHtml = company.bankDetails ? `
    <div style="margin-top:20px;padding:12px;background:#f0f7f0;border-radius:4px;font-size:12px">
      <strong>Banking Details for Payment</strong><br>
      Bank: ${company.bankDetails.bankName}<br>
      Account: ${company.bankDetails.accountNumber}<br>
      Branch Code: ${company.bankDetails.branchCode}<br>
      Account Type: ${company.bankDetails.accountType}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
    .company { font-size: 22px; font-weight: bold; color: #166534; }
    .company-sub { font-size: 11px; color: #666; margin-top: 2px; }
    .stmt-title { font-size: 24px; font-weight: bold; color: #166534; text-align: right; }
    .stmt-meta { text-align: right; font-size: 11px; color: #555; margin-top: 6px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .party { width: 48%; }
    .party h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 6px; }
    .party p { margin: 2px 0; }
    .summary { display: flex; gap: 16px; margin: 20px 0; }
    .summary-card { flex: 1; padding: 12px; background: #f9f9f9; border-radius: 6px; text-align: center; }
    .summary-card .label { font-size: 10px; text-transform: uppercase; color: #888; }
    .summary-card .value { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-top: 4px; }
    .summary-card.due .value { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #166534; font-size: 10px; text-transform: uppercase; color: #555; }
    .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 10px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div class="company">${company.name}</div>
      ${(company as any).addressLine1 ? `<div class="company-sub">${(company as any).addressLine1}</div>` : '<div class="company-sub">Midrand, Gauteng, South Africa</div>'}
      ${company.vatNumber ? `<div class="company-sub">VAT: ${company.vatNumber}</div>` : ''}
    </div>
    <div>
      <div class="stmt-title">STATEMENT OF ACCOUNT</div>
      <div class="stmt-meta">
        Date: ${formatDate(data.statementDate)}<br>
        Period: ${formatShortDate(data.periodFrom)} — ${formatShortDate(data.periodTo)}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Account Holder</h3>
      <p><strong>${data.recipient.name}</strong></p>
      ${data.recipient.branchName ? `<p><em>Branch: ${data.recipient.branchName}</em></p>` : ''}
      ${data.recipient.contactName ? `<p>${data.recipient.contactName}</p>` : ''}
      ${data.recipient.vatNumber ? `<p>VAT: ${data.recipient.vatNumber}</p>` : ''}
    </div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Opening Balance</div>
      <div class="value">${formatCurrency(data.openingBalance)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Invoiced</div>
      <div class="value">${formatCurrency(data.totalInvoiced)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Received</div>
      <div class="value">${formatCurrency(data.totalReceived)}</div>
    </div>
    <div class="summary-card due">
      <div class="label">Amount Due</div>
      <div class="value">${formatCurrency(data.closingBalance)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Reference</th>
        <th>Description</th>
        <th style="text-align:right">Debit</th>
        <th style="text-align:right">Credit</th>
        <th style="text-align:right">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#f5f5f5">
        <td style="padding:6px 8px" colspan="6"><strong>Opening Balance</strong></td>
        <td style="padding:6px 8px;text-align:right;font-weight:bold">${formatCurrency(data.openingBalance)}</td>
      </tr>
      ${transactionsHtml}
      <tr style="background:#f0f7f0;font-weight:bold">
        <td style="padding:8px" colspan="6"><strong>Closing Balance</strong></td>
        <td style="padding:8px;text-align:right;font-size:14px">${formatCurrency(data.closingBalance)}</td>
      </tr>
    </tbody>
  </table>

  ${bankDetailsHtml}

  <div class="footer">
    <p>${company.name} — Statement generated on ${formatDate(data.statementDate)}</p>
    <p>Please remit outstanding balance to the banking details above. For queries, contact ${company.email ?? 'accounts@xarrabooks.com'}</p>
  </div>
</body>
</html>`;
}
