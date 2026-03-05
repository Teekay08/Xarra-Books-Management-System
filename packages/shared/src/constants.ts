// === Enums & Constants ===

export const AUTHOR_TYPES = ['HYBRID', 'TRADITIONAL'] as const;
export type AuthorType = (typeof AUTHOR_TYPES)[number];

export const ROYALTY_TRIGGER_TYPES = ['DATE', 'UNITS', 'REVENUE'] as const;
export type RoyaltyTriggerType = (typeof ROYALTY_TRIGGER_TYPES)[number];

export const PAYMENT_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'] as const;
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];

export const ROYALTY_STATUSES = ['CALCULATED', 'APPROVED', 'PAID', 'VOIDED'] as const;
export type RoyaltyStatus = (typeof ROYALTY_STATUSES)[number];

export const AUTHOR_PAYMENT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED'] as const;
export type AuthorPaymentStatus = (typeof AUTHOR_PAYMENT_STATUSES)[number];

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
  PURCHASE_ORDER: 'PO',
  CASH_SALE: 'CS',
  EXPENSE_CLAIM: 'EC',
  REQUISITION: 'REQ',
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

/** Round to 2 decimal places — use for all monetary calculations */
export function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const STATEMENT_TYPES = ['PARTNER', 'BRANCH', 'CONSOLIDATED'] as const;
export type StatementType = (typeof STATEMENT_TYPES)[number];

export const PAYMENT_METHODS = ['BANK_TRANSFER', 'EFT', 'CASH', 'CHEQUE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REMITTANCE_STATUSES = ['PENDING', 'MATCHED', 'DISPUTED'] as const;
export type RemittanceStatus = (typeof REMITTANCE_STATUSES)[number];

export const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CONVERTED'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = ['DRAFT', 'ISSUED', 'RECEIVED', 'PARTIAL', 'CLOSED', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const CASH_SALE_PAYMENT_METHODS = ['CASH', 'CARD', 'EFT', 'MOBILE'] as const;
export type CashSalePaymentMethod = (typeof CASH_SALE_PAYMENT_METHODS)[number];

export const EXPENSE_CLAIM_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'] as const;
export type ExpenseClaimStatus = (typeof EXPENSE_CLAIM_STATUSES)[number];

export const REQUISITION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDERED'] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Office Supplies', 'Printing & Production', 'Shipping & Courier',
  'Marketing & Advertising', 'Software & Subscriptions', 'Travel',
  'Professional Services', 'Utilities', 'Rent', 'Other',
] as const;
