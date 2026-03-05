import { describe, it, expect } from 'vitest';
import { KdpAdapter } from './kdp.js';

describe('KdpAdapter', () => {
  const adapter = new KdpAdapter(18.0);

  it('parses a KDP royalty report CSV', () => {
    const csv = `Title,Author Name,ASIN,Marketplace,Royalty Date,Units Sold,Units Returned,Net Units Sold,Royalty,Currency,Transaction Type
"Ubuntu Rising","Thandi Mokoena","B0EXAMPLE1","Amazon.com","2026-01-01",10,1,9,18.00,USD,Sale
"The Veld","John Smith","B0EXAMPLE2","Amazon.co.uk","2026-01-01",3,0,3,4.50,USD,Sale`;

    const sales = adapter.parseCsvReport(csv, 18.0);

    expect(sales).toHaveLength(2);

    expect(sales[0].externalId).toBe('kdp-B0EXAMPLE1-2026-01-01-Amazon.com');
    expect(sales[0].channel).toBe('AMAZON_KDP');
    expect(sales[0].quantity).toBe(9);
    expect(sales[0].currency).toBe('USD');
    expect(sales[0].exchangeRate).toBe(18.0);
    expect(sales[0].netRevenue).toBe(18.0 * 18.0); // 324 ZAR
    expect(sales[0].fulfilmentType).toBe('DIGITAL');

    expect(sales[1].quantity).toBe(3);
    expect(sales[1].sku).toBe('B0EXAMPLE2');
  });

  it('skips returns/refunds', () => {
    const csv = `Title,ASIN,Marketplace,Royalty Date,Net Units Sold,Royalty,Currency,Transaction Type
"Book","B0X","Amazon.com","2026-01-01",5,10.00,USD,Sale
"Book","B0X","Amazon.com","2026-01-02",-2,-4.00,USD,Return`;

    const sales = adapter.parseCsvReport(csv);
    expect(sales).toHaveLength(1);
  });

  it('uses default exchange rate if none provided', () => {
    const defaultAdapter = new KdpAdapter(20.0);
    const csv = `Title,ASIN,Marketplace,Royalty Date,Net Units Sold,Royalty,Currency,Transaction Type
"Book","B0X","Amazon.com","2026-01-01",1,5.00,USD,Sale`;

    const sales = defaultAdapter.parseCsvReport(csv);
    expect(sales[0].exchangeRate).toBe(20.0);
    expect(sales[0].netRevenue).toBe(100.0); // 5 * 20
  });

  it('throws on fetchSales', async () => {
    await expect(adapter.fetchSales(new Date())).rejects.toThrow('does not support API polling');
  });
});
