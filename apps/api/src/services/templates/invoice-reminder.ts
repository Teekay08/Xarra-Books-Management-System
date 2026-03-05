interface InvoiceReminderData {
  partnerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  daysUntilDue: number; // negative = overdue
  companyName: string;
  companyEmail?: string | null;
  companyPhone?: string | null;
}

function formatCurrency(value: string | number): string {
  return `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function renderInvoiceReminderHtml(data: InvoiceReminderData): string {
  const isOverdue = data.daysUntilDue < 0;
  const daysAbs = Math.abs(data.daysUntilDue);

  let urgencyText: string;
  let urgencyColor: string;
  let headerBg: string;

  if (data.daysUntilDue < 0) {
    urgencyText = `This invoice is ${daysAbs} day${daysAbs !== 1 ? 's' : ''} overdue`;
    urgencyColor = '#b91c1c';
    headerBg = '#991b1b';
  } else if (data.daysUntilDue === 0) {
    urgencyText = 'This invoice is due today';
    urgencyColor = '#b45309';
    headerBg = '#92400e';
  } else {
    urgencyText = `This invoice is due in ${daysAbs} day${daysAbs !== 1 ? 's' : ''}`;
    urgencyColor = '#15803d';
    headerBg = '#15803d';
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; margin: 0; padding: 0; background: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="background: ${headerBg}; padding: 20px 24px; border-radius: 8px 8px 0 0;">
      <h1 style="margin: 0; color: white; font-size: 20px;">${data.companyName}</h1>
      <p style="margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">
        ${isOverdue ? 'Overdue Invoice Reminder' : 'Invoice Payment Reminder'}
      </p>
    </div>

    <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #4b5563;">
        Dear ${data.partnerName},
      </p>

      <p style="margin: 0 0 20px; font-size: 14px; color: #4b5563;">
        This is a friendly reminder regarding the following invoice:
      </p>

      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Invoice Number:</td>
            <td style="padding: 4px 0; font-weight: 600;">${data.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Invoice Date:</td>
            <td style="padding: 4px 0;">${formatDate(data.invoiceDate)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Due Date:</td>
            <td style="padding: 4px 0; font-weight: 600;">${formatDate(data.dueDate)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Amount Due:</td>
            <td style="padding: 4px 0; font-weight: 700; font-size: 18px;">${formatCurrency(data.total)}</td>
          </tr>
        </table>
      </div>

      <div style="background: ${isOverdue ? '#fef2f2' : data.daysUntilDue === 0 ? '#fffbeb' : '#f0fdf4'}; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 14px; font-weight: 600; color: ${urgencyColor};">
          ${urgencyText}
        </p>
      </div>

      ${isOverdue ? `
      <p style="margin: 0 0 16px; font-size: 14px; color: #4b5563;">
        Please arrange payment at your earliest convenience. If payment has already been made, kindly disregard this reminder and send us proof of payment.
      </p>` : `
      <p style="margin: 0 0 16px; font-size: 14px; color: #4b5563;">
        Please ensure payment is made by the due date. If payment has already been arranged, kindly disregard this reminder.
      </p>`}

      <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">Kind regards,</p>
      <p style="margin: 0 0 0; font-size: 13px; font-weight: 600; color: #1f2937;">${data.companyName}</p>
      ${data.companyEmail ? `<p style="margin: 2px 0 0; font-size: 12px; color: #9ca3af;">${data.companyEmail}</p>` : ''}
      ${data.companyPhone ? `<p style="margin: 2px 0 0; font-size: 12px; color: #9ca3af;">Tel: ${data.companyPhone}</p>` : ''}

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      <p style="margin: 0; font-size: 11px; color: #9ca3af;">
        This is an automated reminder from ${data.companyName}. If you have any queries, please contact us directly.
      </p>
    </div>
  </div>
</body>
</html>`;
}
