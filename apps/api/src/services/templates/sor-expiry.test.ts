import { describe, it, expect } from 'vitest';
import { renderSorExpiryAlert } from './sor-expiry.js';

describe('SOR Expiry Email Template', () => {
  it('renders HTML with all consignment items', () => {
    const items = [
      {
        consignmentId: 'abc',
        partnerName: 'Bargain Books',
        sorExpiryDate: '2026-04-01T00:00:00Z',
        daysRemaining: 5,
        totalDispatched: 100,
        totalSold: 60,
        totalOutstanding: 40,
      },
      {
        consignmentId: 'def',
        partnerName: 'Exclusive Books',
        sorExpiryDate: '2026-04-15T00:00:00Z',
        daysRemaining: 19,
        totalDispatched: 50,
        totalSold: 30,
        totalOutstanding: 20,
      },
    ];

    const html = renderSorExpiryAlert(items);

    expect(html).toContain('Xarra Books');
    expect(html).toContain('SOR Expiry Alert');
    expect(html).toContain('Bargain Books');
    expect(html).toContain('Exclusive Books');
    expect(html).toContain('5 days');
    expect(html).toContain('19 days');
    expect(html).toContain('40'); // outstanding
  });

  it('applies urgent styling for items expiring within 7 days', () => {
    const items = [
      {
        consignmentId: 'xyz',
        partnerName: 'Test Partner',
        sorExpiryDate: '2026-03-10T00:00:00Z',
        daysRemaining: 3,
        totalDispatched: 20,
        totalSold: 5,
        totalOutstanding: 15,
      },
    ];

    const html = renderSorExpiryAlert(items);
    expect(html).toContain('#fee2e2'); // red background
    expect(html).toContain('#b91c1c'); // red text
  });
});
