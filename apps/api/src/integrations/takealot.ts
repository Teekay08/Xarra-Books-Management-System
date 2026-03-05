import type { NormalizedSale, PlatformAdapter } from './types.js';

interface TakealotConfig {
  apiKey: string;
}

interface TakealotSaleItem {
  order_id: number;
  order_item_id: number;
  order_date: string;
  product_title: string;
  tsin_id: number;
  offer_id: number;
  sku: string;
  quantity: number;
  selling_price: number;
  dc: string;
  takealot_url_mobi: string;
  success_fee: number;
  fulfillment_fee: number;
  courier_collection_fee: number;
  auto_ibt_fee: number;
  total_fee: number;
  status: string;
}

interface TakealotApiResponse {
  total_results: number;
  page_number: number;
  page_size: number;
  sales: TakealotSaleItem[];
}

/**
 * Takealot integration supporting both CSV import and Seller API polling.
 *
 * API mode: Uses the Takealot Seller API to fetch orders within a date range.
 * CSV mode: Parses downloaded CSV sales reports.
 */
export class TakealotAdapter implements PlatformAdapter {
  readonly platform = 'TAKEALOT' as const;

  constructor(private config: TakealotConfig) {}

  /**
   * Fetch sales from the Takealot Seller API.
   * Requires a valid API key configured in config.
   */
  async fetchSales(since: Date, until?: Date): Promise<NormalizedSale[]> {
    if (!this.config.apiKey) {
      throw new Error(
        'Takealot API key not configured. Use TakealotAdapter.parseCsvReport(csvContent) for CSV imports.'
      );
    }

    const allSales: NormalizedSale[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    const sinceStr = since.toISOString().split('T')[0];
    const untilStr = until ? until.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    while (hasMore) {
      const url = `https://seller-api.takealot.com/v2/sales?start_date=${sinceStr}&end_date=${untilStr}&page_number=${page}&page_size=${pageSize}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Key ${this.config.apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Takealot API error (${response.status}): ${text}`);
      }

      const data = (await response.json()) as TakealotApiResponse;

      for (const item of data.sales) {
        if (item.status === 'Cancelled') continue;

        allSales.push({
          externalId: `tak-${item.order_id}-${item.order_item_id}`,
          channel: 'TAKEALOT',
          sku: item.sku || String(item.offer_id) || String(item.tsin_id),
          quantity: item.quantity,
          unitPrice: item.selling_price,
          commission: item.total_fee,
          netRevenue: item.selling_price * item.quantity - item.total_fee,
          currency: 'ZAR',
          orderRef: String(item.order_id),
          saleDate: new Date(item.order_date),
          fulfilmentType: 'LEAD_TIME',
          source: 'API',
        });
      }

      hasMore = data.sales.length === pageSize;
      page++;
    }

    return allSales;
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
