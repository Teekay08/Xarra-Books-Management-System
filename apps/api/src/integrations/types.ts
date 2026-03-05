/** Normalized sale record from any external platform */
export interface NormalizedSale {
  externalId: string;
  channel: string;
  isbn13?: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  commission?: number;
  netRevenue?: number;
  currency: string;
  exchangeRate?: number;
  orderRef?: string;
  customerName?: string;
  saleDate: Date;
  fulfilmentType?: string;
  source: string;
}

export interface SyncResult {
  platform: string;
  recordsProcessed: number;
  recordsCreated: number;
  recordsSkipped: number;
  errors: { message: string; detail?: string }[];
}

/** All platform adapters implement this interface */
export interface PlatformAdapter {
  readonly platform: string;
  fetchSales(since: Date, until?: Date): Promise<NormalizedSale[]>;
}
