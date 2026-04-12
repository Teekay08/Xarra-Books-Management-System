import type { NormalizedSale, PlatformAdapter } from './types.js';

interface WooCommerceConfig {
  baseUrl: string;        // e.g., https://xarrabooks.com
  consumerKey: string;     // WooCommerce REST API consumer key
  consumerSecret: string;  // WooCommerce REST API consumer secret
}

interface WooOrder {
  id: number;
  number: string;
  date_created: string;
  status: string;
  total: string;
  billing: { first_name: string; last_name: string; email: string };
  line_items: {
    id: number;
    product_id: number;
    sku: string;
    name: string;
    quantity: number;
    total: string;
  }[];
}

export class WooCommerceAdapter implements PlatformAdapter {
  readonly platform = 'WOOCOMMERCE' as const;

  constructor(private config: WooCommerceConfig) {}

  private get authHeader() {
    return 'Basic ' + btoa(`${this.config.consumerKey}:${this.config.consumerSecret}`);
  }

  async pushInventoryStock(productId: number, stockQty: number): Promise<void> {
    const url = `${this.config.baseUrl}/wp-json/wc/v3/products/${productId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stock_quantity: stockQty, manage_stock: true }),
    });
    if (!response.ok) {
      throw new Error(`WooCommerce stock push failed for product ${productId}: ${response.status} ${response.statusText}`);
    }
  }

  async fetchSales(since: Date, until?: Date): Promise<NormalizedSale[]> {
    const sales: NormalizedSale[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        after: since.toISOString(),
        status: 'completed',
        per_page: '100',
        page: String(page),
        orderby: 'date',
        order: 'asc',
      });
      if (until) params.set('before', until.toISOString());

      const url = `${this.config.baseUrl}/wp-json/wc/v3/orders?${params}`;
      const response = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
      }

      const orders: WooOrder[] = await response.json();
      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      for (const order of orders) {
        for (const item of order.line_items) {
          sales.push({
            externalId: `woo-${order.id}-${item.id}`,
            channel: 'XARRA_WEBSITE',
            isbn13: item.sku.length === 13 ? item.sku : undefined,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: Number(item.total) / item.quantity,
            netRevenue: Number(item.total),
            currency: 'ZAR',
            orderRef: order.number,
            customerName: `${order.billing.first_name} ${order.billing.last_name}`.trim(),
            saleDate: new Date(order.date_created),
            fulfilmentType: 'SHIP',
            source: 'POLLING',
          });
        }
      }

      const totalPages = Number(response.headers.get('X-WP-TotalPages') ?? 1);
      hasMore = page < totalPages;
      page++;
    }

    return sales;
  }
}
