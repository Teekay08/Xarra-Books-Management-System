import type { NormalizedSale, PlatformAdapter } from './types.js';

/**
 * Amazon KDP (Kindle Direct Publishing) integration via CSV import.
 *
 * KDP provides sales data through monthly royalty reports downloaded
 * from the KDP dashboard. Amazon pays in USD, so we capture the
 * exchange rate at import time.
 *
 * Expected CSV columns from KDP Royalty Report:
 *   Title, Author Name, ASIN, Marketplace, Royalty Date, Units Sold,
 *   Units Returned, Net Units Sold, Royalty, Currency, Transaction Type
 */
export class KdpAdapter implements PlatformAdapter {
  readonly platform = 'AMAZON_KDP' as const;

  constructor(private defaultExchangeRate: number = 18.5) {} // USD → ZAR

  /**
   * KDP does not have a real-time API for indie publishers.
   * Use `parseCsvReport` to import downloaded reports.
   */
  async fetchSales(_since: Date, _until?: Date): Promise<NormalizedSale[]> {
    throw new Error(
      'KDP does not support API polling. Use KdpAdapter.parseCsvReport(csvContent, exchangeRate) to import downloaded reports.'
    );
  }

  /**
   * Parse a KDP royalty report CSV into normalized sale records.
   */
  parseCsvReport(csvContent: string, exchangeRate?: number): NormalizedSale[] {
    const rate = exchangeRate ?? this.defaultExchangeRate;
    const lines = csvContent.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1'));
    const sales: NormalizedSale[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim(); });

      const asin = row['ASIN'] || row['asin'];
      const netUnits = parseInt(row['Net Units Sold'] || row['Units Sold'] || '0');
      const royaltyUsd = parseFloat(row['Royalty'] || '0');
      const marketplace = row['Marketplace'] || 'Amazon.com';
      const royaltyDate = row['Royalty Date'] || row['Date'];
      const transactionType = row['Transaction Type'] || 'Sale';

      if (!asin || netUnits <= 0) continue;
      if (transactionType === 'Return' || transactionType === 'Refund') continue;

      const royaltyPerUnit = netUnits > 0 ? royaltyUsd / netUnits : 0;

      sales.push({
        externalId: `kdp-${asin}-${royaltyDate}-${marketplace}`,
        channel: 'AMAZON_KDP',
        sku: asin,
        quantity: netUnits,
        unitPrice: royaltyPerUnit, // KDP only reports royalty, not list price
        netRevenue: royaltyUsd * rate, // Convert to ZAR
        currency: 'USD',
        exchangeRate: rate,
        orderRef: `KDP-${marketplace}-${royaltyDate}`,
        saleDate: royaltyDate ? new Date(royaltyDate) : new Date(),
        fulfilmentType: 'DIGITAL',
        source: 'CSV_IMPORT',
      });
    }

    return sales;
  }

  private parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (inQuotes) {
        if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { result.push(current); current = ''; }
        else current += ch;
      }
    }
    result.push(current);
    return result;
  }
}
