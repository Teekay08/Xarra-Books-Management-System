import { describe, it, expect } from 'vitest';
import { TakealotAdapter } from './takealot.js';

describe('TakealotAdapter', () => {
  const adapter = new TakealotAdapter({ apiKey: '' });

  it('parses a valid Takealot CSV report', () => {
    const csv = `Order ID,Date,Product Title,TSIN,Offer ID,Quantity,Selling Price,Total Fees,Net Payment
"TAK-001","2026-01-15","Ubuntu Rising","TSIN123","OFF456",2,299.00,89.70,508.30
"TAK-002","2026-01-16","The Veld","TSIN789","OFF101",1,199.00,59.70,139.30`;

    const sales = adapter.parseCsvReport(csv);

    expect(sales).toHaveLength(2);

    expect(sales[0].externalId).toBe('tak-TAK-001-TSIN123');
    expect(sales[0].channel).toBe('TAKEALOT');
    expect(sales[0].quantity).toBe(2);
    expect(sales[0].unitPrice).toBe(299);
    expect(sales[0].commission).toBe(89.70);
    expect(sales[0].currency).toBe('ZAR');
    expect(sales[0].source).toBe('CSV_IMPORT');

    expect(sales[1].quantity).toBe(1);
    expect(sales[1].sku).toBe('OFF101');
  });

  it('skips empty rows', () => {
    const csv = `Order ID,Date,Product Title,TSIN,Offer ID,Quantity,Selling Price,Total Fees,Net Payment
"TAK-001","2026-01-15","Book","TSIN1","OFF1",1,100.00,30.00,70.00
,,,,,,,,`;

    const sales = adapter.parseCsvReport(csv);
    expect(sales).toHaveLength(1);
  });

  it('returns empty array for header-only CSV', () => {
    const csv = 'Order ID,Date,TSIN,Quantity';
    const sales = adapter.parseCsvReport(csv);
    expect(sales).toHaveLength(0);
  });

  it('throws on fetchSales (not supported)', async () => {
    await expect(adapter.fetchSales(new Date())).rejects.toThrow('does not support API polling');
  });
});
