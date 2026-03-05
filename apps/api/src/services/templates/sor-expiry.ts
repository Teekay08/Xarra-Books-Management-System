interface SorExpiryItem {
  consignmentId: string;
  partnerName: string;
  sorExpiryDate: string;
  daysRemaining: number;
  totalDispatched: number;
  totalSold: number;
  totalOutstanding: number;
}

export function renderSorExpiryAlert(items: SorExpiryItem[]): string {
  const rows = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${item.partnerName}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${new Date(item.sorExpiryDate).toLocaleDateString('en-ZA')}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <span style="background: ${item.daysRemaining <= 7 ? '#fee2e2' : item.daysRemaining <= 14 ? '#fef3c7' : '#dcfce7'}; color: ${item.daysRemaining <= 7 ? '#b91c1c' : item.daysRemaining <= 14 ? '#92400e' : '#15803d'}; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600;">
          ${item.daysRemaining} days
        </span>
      </td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${item.totalDispatched}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${item.totalSold}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${item.totalOutstanding}</td>
    </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; margin: 0; padding: 0; background: #f9fafb;">
  <div style="max-width: 640px; margin: 0 auto; padding: 24px;">
    <div style="background: #15803d; padding: 20px 24px; border-radius: 8px 8px 0 0;">
      <h1 style="margin: 0; color: white; font-size: 20px;">Xarra Books</h1>
      <p style="margin: 4px 0 0; color: #bbf7d0; font-size: 14px;">SOR Expiry Alert</p>
    </div>

    <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #4b5563;">
        The following consignments have SOR expiry dates approaching. Please review and take action.
      </p>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #d1d5db;">Partner</th>
            <th style="padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #d1d5db;">Expiry Date</th>
            <th style="padding: 8px 12px; text-align: center; font-weight: 600; border-bottom: 2px solid #d1d5db;">Days Left</th>
            <th style="padding: 8px 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #d1d5db;">Dispatched</th>
            <th style="padding: 8px 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #d1d5db;">Sold</th>
            <th style="padding: 8px 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #d1d5db;">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <p style="margin: 20px 0 0; font-size: 12px; color: #9ca3af;">
        This is an automated alert from Xarra Books Management System.
      </p>
    </div>
  </div>
</body>
</html>`;
}
