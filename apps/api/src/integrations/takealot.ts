import type { NormalizedSale, PlatformAdapter } from './types.js';

interface TakealotConfig {
  apiKey: string;  // Takealot Seller Portal API key
}

/**
 * Takealot integration via CSV import.
 *
 * Takealot does not currently provide a real-time sales API.
 * Sellers download sales reports from the Seller Portal as CSV files.
 * This adapter parses those CSV reports into normalized sales.
 *
 * Expected CSV columns from Takealot:
 *   Order ID, Date, Product Title, TSIN, Offer ID, Quantity, Selling Price,
 *   Success Fee, Fulfilment Fee, Total Fees, Net Payment
 */
export class TakealotAdapter implements PlatformAdapter {
  readonly platform = 'TAKEALOT' as const;

  constructor(private _config: TakealotConfig) {}

  /**
   * For Takealot, `since` and `until` are ignored — we parse a pre-downloaded CSV.
   * Call `parseCsvReport` instead for actual imports.
   */
  async fetchSales(_since: Date, _until?: Date): Promise<NormalizedSale[]> {
    throw new Error(
      'Takealot does not support API polling. Use TakealotAdapter.parseCsvReport(csvContent) to import downloaded reports.'
    );
  }

  /**
   * Parse a Takealot sales report CSV into normalized sale records.
   */
  parseCsvReport(csvContent: string): NormalizedSale[] {
    const lines = csvContent.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1'));
    const sales: NormalizedSale[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim(); });

      const orderId = row['Order ID'] || row['order_id'];
      const tsin = row['TSIN'] || row['tsin'];
      const offerId = row['Offer ID'] || row['offer_id'];
      const quantity = parseInt(row['Quantity'] || row['quantity'] || '1');
      const sellingPrice = parseFloat(row['Selling Price'] || row['selling_price'] || '0');
      const totalFees = parseFloat(row['Total Fees'] || row['total_fees'] || '0');
      const netPayment = parseFloat(row['Net Payment'] || row['net_payment'] || '0');
      const dateStr = row['Date'] || row['date'] || row['Order Date'];

      if (!orderId || !tsin) continue;

      sales.push({
        externalId: `tak-${orderId}-${tsin}`,
        channel: 'TAKEALOT',
        sku: offerId || tsin,
        quantity,
        unitPrice: sellingPrice,
        commission: totalFees,
        netRevenue: netPayment || (sellingPrice * quantity - totalFees),
        currency: 'ZAR',
        orderRef: orderId,
        saleDate: dateStr ? new Date(dateStr) : new Date(),
        fulfilmentType: 'LEAD_TIME',
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
