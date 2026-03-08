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
  PARTNER_ORDER: 'POR',
  PARTNER_RETURN_REQUEST: 'PRR',
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

export const PARTNER_USER_ROLES = ['ADMIN', 'BRANCH_MANAGER', 'STAFF'] as const;
export type PartnerUserRole = (typeof PARTNER_USER_ROLES)[number];

export const PARTNER_ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const;
export type PartnerOrderStatus = (typeof PARTNER_ORDER_STATUSES)[number];

export const PARTNER_RETURN_REQUEST_STATUSES = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'AUTHORIZED', 'REJECTED',
  'AWAITING_PICKUP', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'CREDIT_ISSUED',
] as const;
export type PartnerReturnRequestStatus = (typeof PARTNER_RETURN_REQUEST_STATUSES)[number];

export const COURIER_STATUSES = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'] as const;
export type CourierStatus = (typeof COURIER_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'PARTNER_ORDER_SUBMITTED', 'PARTNER_ORDER_CANCELLED',
  'PARTNER_RETURN_SUBMITTED',
  'INVOICE_OVERDUE', 'INVOICE_PAID', 'INVOICE_ISSUED', 'INVOICE_VOIDED',
  'PAYMENT_RECEIVED',
  'INVENTORY_LOW_STOCK', 'INVENTORY_RECEIVED',
  'CONSIGNMENT_DISPATCHED', 'CONSIGNMENT_EXPIRING', 'CONSIGNMENT_RETURNS_PROCESSED',
  'EXPENSE_CLAIM_SUBMITTED', 'EXPENSE_CLAIM_APPROVED', 'EXPENSE_CLAIM_REJECTED', 'EXPENSE_CLAIM_PAID',
  'REQUISITION_SUBMITTED', 'REQUISITION_APPROVED',
  'QUOTATION_EXPIRED', 'QUOTATION_CONVERTED',
  'CASH_SALE_CREATED',
  'CREDIT_NOTE_CREATED', 'DEBIT_NOTE_CREATED',
  'PURCHASE_ORDER_ISSUED', 'PURCHASE_ORDER_RECEIVED', 'PURCHASE_ORDER_CANCELLED',
  'REMITTANCE_MATCHED',
  'RETURN_PROCESSED',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  PARTNER_ORDER_SUBMITTED: 'New Partner Order',
  PARTNER_ORDER_CANCELLED: 'Partner Order Cancelled',
  PARTNER_RETURN_SUBMITTED: 'Partner Return Request',
  INVOICE_OVERDUE: 'Invoice Overdue',
  INVOICE_PAID: 'Invoice Paid',
  INVOICE_ISSUED: 'Invoice Issued',
  INVOICE_VOIDED: 'Invoice Voided',
  PAYMENT_RECEIVED: 'Payment Received',
  INVENTORY_LOW_STOCK: 'Low Stock Alert',
  INVENTORY_RECEIVED: 'Stock Received',
  CONSIGNMENT_DISPATCHED: 'Consignment Dispatched',
  CONSIGNMENT_EXPIRING: 'Consignment Expiring',
  CONSIGNMENT_RETURNS_PROCESSED: 'Consignment Returns Processed',
  EXPENSE_CLAIM_SUBMITTED: 'Expense Claim Submitted',
  EXPENSE_CLAIM_APPROVED: 'Expense Claim Approved',
  EXPENSE_CLAIM_REJECTED: 'Expense Claim Rejected',
  EXPENSE_CLAIM_PAID: 'Expense Claim Paid',
  REQUISITION_SUBMITTED: 'Requisition Submitted',
  REQUISITION_APPROVED: 'Requisition Approved',
  QUOTATION_EXPIRED: 'Quotation Expired',
  QUOTATION_CONVERTED: 'Quotation Converted',
  CASH_SALE_CREATED: 'Cash Sale',
  CREDIT_NOTE_CREATED: 'Credit Note Created',
  DEBIT_NOTE_CREATED: 'Debit Note Created',
  PURCHASE_ORDER_ISSUED: 'Purchase Order Issued',
  PURCHASE_ORDER_RECEIVED: 'Goods Received',
  PURCHASE_ORDER_CANCELLED: 'Purchase Order Cancelled',
  REMITTANCE_MATCHED: 'Remittance Matched',
  RETURN_PROCESSED: 'Return Processed',
  SYSTEM: 'System Notification',
};

export const PARTNER_NOTIFICATION_TYPES = [
  'ORDER_STATUS_CHANGED', 'SHIPMENT_UPDATE', 'RETURN_STATUS_CHANGED',
  'INVOICE_ISSUED', 'STATEMENT_AVAILABLE', 'CONSIGNMENT_DISPATCHED',
  'PAYMENT_CONFIRMED', 'CREDIT_NOTE_ISSUED', 'SYSTEM',
] as const;
export type PartnerNotificationType = (typeof PARTNER_NOTIFICATION_TYPES)[number];

export const PARTNER_NOTIFICATION_TYPE_LABELS: Record<PartnerNotificationType, string> = {
  ORDER_STATUS_CHANGED: 'Order Update',
  SHIPMENT_UPDATE: 'Shipment Update',
  RETURN_STATUS_CHANGED: 'Return Update',
  INVOICE_ISSUED: 'New Invoice',
  STATEMENT_AVAILABLE: 'Statement Available',
  CONSIGNMENT_DISPATCHED: 'Consignment Dispatched',
  PAYMENT_CONFIRMED: 'Payment Confirmed',
  CREDIT_NOTE_ISSUED: 'Credit Note Issued',
  SYSTEM: 'System Notification',
};

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Office Supplies', 'Printing & Production', 'Shipping & Courier',
  'Marketing & Advertising', 'Software & Subscriptions', 'Travel',
  'Professional Services', 'Utilities', 'Rent', 'Other',
] as const;
