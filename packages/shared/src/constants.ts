// === Enums & Constants ===

export const AUTHOR_TYPES = ['HYBRID', 'TRADITIONAL'] as const;
export type AuthorType = (typeof AUTHOR_TYPES)[number];

export const ROYALTY_TRIGGER_TYPES = ['DATE', 'UNITS', 'REVENUE'] as const;
export type RoyaltyTriggerType = (typeof ROYALTY_TRIGGER_TYPES)[number];

export const TITLE_FORMATS = ['PRINT', 'EBOOK', 'PDF'] as const;
export type TitleFormat = (typeof TITLE_FORMATS)[number];

export const TITLE_STATUSES = ['PRODUCTION', 'ACTIVE', 'OUT_OF_PRINT'] as const;
export type TitleStatus = (typeof TITLE_STATUSES)[number];

export const CHANNELS = [
  'XARRA_WEBSITE',
  'XARRA_STORE',
  'AMAZON_KDP',
  'TAKEALOT',
  'PARTNER',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const SALE_SOURCES = ['WEBHOOK', 'CSV_IMPORT', 'MANUAL', 'POLLING', 'HISTORICAL_IMPORT'] as const;
export type SaleSource = (typeof SALE_SOURCES)[number];

export const CONSIGNMENT_STATUSES = ['DRAFT', 'DISPATCHED', 'DELIVERED', 'PARTIAL', 'CLOSED'] as const;
export type ConsignmentStatus = (typeof CONSIGNMENT_STATUSES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'VOIDED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVENTORY_LOCATIONS = [
  'XARRA_WAREHOUSE',
  'XARRA_STORE',
  'IN_TRANSIT',
  'IN_TRANSIT_TAKEALOT',
  'TAKEALOT_WAREHOUSE',
  'DAMAGED',
  'RETURNS_PENDING',
] as const;
export type InventoryLocation = (typeof INVENTORY_LOCATIONS)[number];

export const MOVEMENT_TYPES = ['IN', 'CONSIGN', 'SELL', 'RETURN', 'ADJUST', 'WRITEOFF'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const USER_ROLES = ['ADMIN', 'FINANCE', 'OPERATIONS', 'EDITORIAL', 'AUTHOR', 'REPORTS_ONLY'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DOCUMENT_PREFIXES = {
  INVOICE: 'INV',
  CREDIT_NOTE: 'CN',
  DEBIT_NOTE: 'DN',
  PRO_FORMA: 'PF',
  STATEMENT: 'SOA',
  RECEIPT: 'RCP',
  AUTHOR_INVOICE: 'AINV',
  ADVANCE: 'ADV',
  CONSIGNMENT_NOTE: 'CON',
  SOR_AGREEMENT: 'SOR',
  RETURNS_AUTH: 'RA',
  GOODS_RECEIVED: 'GRN',
  STOCK_ADJUSTMENT: 'SAJ',
  PACKING_LIST: 'PKL',
} as const;

export const VAT_RATE = 0.15; // South Africa VAT rate
export const DEFAULT_CURRENCY = 'ZAR';
