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
  PROJECT: 'PRJ',
  SOW: 'SOW',
  TIMESHEET: 'TS',
} as const;

export const VAT_RATE = 0.15; // South Africa VAT rate
export const DEFAULT_CURRENCY = 'ZAR';

// Business rule constants — change here to propagate everywhere
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;
export const DEFAULT_SOR_DAYS = 90;
export const DELETION_REQUEST_EXPIRY_HOURS = 72;
export const PARTNER_ACTIVITY_LOOKBACK_DAYS = 30;

/** Round to 2 decimal places — use for all monetary calculations */
export function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Calculate the discount amount for a line item. Shared across invoices, credit notes, and quotations. */
export function calculateLineDiscount(lineSubtotal: number, discountPct: number, discountType: 'PERCENT' | 'FIXED'): number {
  return roundAmount(
    discountType === 'FIXED'
      ? Math.min(discountPct, lineSubtotal) // FIXED: discount amount capped at line subtotal
      : lineSubtotal * (discountPct / 100),
  );
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
  'PROJECT_CREATED', 'PROJECT_BUDGET_APPROVED', 'PROJECT_OVER_BUDGET',
  'TIMESHEET_SUBMITTED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED',
  'SOW_SENT', 'SOW_ACCEPTED',
  'SUSPENSE_CONFIRMED', 'SUSPENSE_REFUND_DUE', 'SUSPENSE_DAILY_SUMMARY',
  'PREDICTION_HIGH_RISK', 'CASHFLOW_RISK_CHANGE',
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
  PROJECT_CREATED: 'Project Created',
  PROJECT_BUDGET_APPROVED: 'Project Budget Approved',
  PROJECT_OVER_BUDGET: 'Project Over Budget',
  TIMESHEET_SUBMITTED: 'Timesheet Submitted',
  TIMESHEET_APPROVED: 'Timesheet Approved',
  TIMESHEET_REJECTED: 'Timesheet Rejected',
  SOW_SENT: 'SOW Sent',
  SOW_ACCEPTED: 'SOW Accepted',
  SUSPENSE_CONFIRMED: 'Suspense Revenue Confirmed',
  SUSPENSE_REFUND_DUE: 'Suspense Refund Due',
  SUSPENSE_DAILY_SUMMARY: 'Suspense Daily Summary',
  PREDICTION_HIGH_RISK: 'High Return Risk Alert',
  CASHFLOW_RISK_CHANGE: 'Cash Flow Risk Level Change',
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

// === Budgeting Constants ===

export const PROJECT_STATUSES = ['PLANNING', 'BUDGETED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_TYPES = ['NEW_TITLE', 'REPRINT', 'REVISED_EDITION', 'TRANSLATION', 'ANTHOLOGY', 'CUSTOM'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const CONTRACT_TYPES = ['TRADITIONAL', 'HYBRID'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const MILESTONE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const SOURCE_TYPES = ['INTERNAL', 'EXTERNAL'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const COST_CLASSIFICATIONS = ['PUBLISHING', 'OPERATIONAL', 'LAUNCH', 'MARKETING'] as const;
export type CostClassification = (typeof COST_CLASSIFICATIONS)[number];

export const RATE_CARD_TYPES = ['INTERNAL', 'EXTERNAL'] as const;
export type RateCardType = (typeof RATE_CARD_TYPES)[number];

export const TIMESHEET_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const SOW_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED'] as const;
export type SowStatus = (typeof SOW_STATUSES)[number];

export const BUDGET_CATEGORIES = [
  'EDITORIAL', 'TYPESETTING', 'COVER_DESIGN', 'PROOFREADING',
  'PRINTING', 'ISBN', 'LABOR', 'LICENSING', 'MISCELLANEOUS',
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const LAUNCH_SUB_CATEGORIES = [
  'VENUE_CATERING', 'INVITATIONS_PRINTING', 'MEDIA_PR',
  'PHOTOGRAPHY_VIDEO', 'AUTHOR_TRAVEL', 'COMPLIMENTARY_COPIES',
  'DECOR_BRANDING', 'ENTERTAINMENT', 'OTHER',
] as const;
export type LaunchSubCategory = (typeof LAUNCH_SUB_CATEGORIES)[number];

/** Default milestone templates by project type */
export const MILESTONE_TEMPLATES = {
  NEW_TITLE: [
    { code: 'EDITING', name: 'Editing', sortOrder: 1 },
    { code: 'TYPESETTING', name: 'Typesetting & Layout', sortOrder: 2 },
    { code: 'COVER_DESIGN', name: 'Cover Design', sortOrder: 3 },
    { code: 'PROOFREADING', name: 'Proofreading', sortOrder: 4 },
    { code: 'ISBN_REGISTRATION', name: 'ISBN Registration', sortOrder: 5 },
    { code: 'PRINTING', name: 'Printing', sortOrder: 6 },
    { code: 'LAUNCH', name: 'Book Launch', sortOrder: 7 },
    { code: 'MARKETING', name: 'Marketing & Distribution', sortOrder: 8 },
  ],
  REPRINT: [
    { code: 'PRINTING', name: 'Printing', sortOrder: 1 },
    { code: 'DISTRIBUTION', name: 'Distribution', sortOrder: 2 },
  ],
  REVISED_EDITION: [
    { code: 'EDITING', name: 'Editing (Revisions)', sortOrder: 1 },
    { code: 'TYPESETTING', name: 'Typesetting & Layout', sortOrder: 2 },
    { code: 'COVER_DESIGN', name: 'Cover Design Update', sortOrder: 3 },
    { code: 'PROOFREADING', name: 'Proofreading', sortOrder: 4 },
    { code: 'PRINTING', name: 'Printing', sortOrder: 5 },
    { code: 'LAUNCH', name: 'Book Launch', sortOrder: 6 },
    { code: 'MARKETING', name: 'Marketing & Distribution', sortOrder: 7 },
  ],
  TRANSLATION: [
    { code: 'TRANSLATION', name: 'Translation', sortOrder: 1 },
    { code: 'EDITING', name: 'Editing', sortOrder: 2 },
    { code: 'TYPESETTING', name: 'Typesetting & Layout', sortOrder: 3 },
    { code: 'COVER_DESIGN', name: 'Cover Design', sortOrder: 4 },
    { code: 'PROOFREADING', name: 'Proofreading', sortOrder: 5 },
    { code: 'PRINTING', name: 'Printing', sortOrder: 6 },
    { code: 'LAUNCH', name: 'Book Launch', sortOrder: 7 },
    { code: 'MARKETING', name: 'Marketing & Distribution', sortOrder: 8 },
  ],
  ANTHOLOGY: [
    { code: 'RIGHTS_CLEARANCE', name: 'Rights Clearance', sortOrder: 1 },
    { code: 'EDITING', name: 'Editing & Compilation', sortOrder: 2 },
    { code: 'TYPESETTING', name: 'Typesetting & Layout', sortOrder: 3 },
    { code: 'COVER_DESIGN', name: 'Cover Design', sortOrder: 4 },
    { code: 'PROOFREADING', name: 'Proofreading', sortOrder: 5 },
    { code: 'PRINTING', name: 'Printing', sortOrder: 6 },
    { code: 'LAUNCH', name: 'Book Launch', sortOrder: 7 },
    { code: 'MARKETING', name: 'Marketing & Distribution', sortOrder: 8 },
  ],
  CUSTOM: [],
} as const;

// === Order Tracking Pipeline ===

export const ORDER_PIPELINE_STEPS = [
  'ORDER_RECEIVED', 'CONFIRMED', 'PICKING', 'PACKING', 'DISPATCHED',
  'WITH_COURIER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
] as const;
export type OrderPipelineStep = (typeof ORDER_PIPELINE_STEPS)[number];

export const ORDER_PIPELINE_STEP_LABELS: Record<OrderPipelineStep, string> = {
  ORDER_RECEIVED: 'Order Received',
  CONFIRMED: 'Confirmed',
  PICKING: 'Picking',
  PACKING: 'Packing',
  DISPATCHED: 'Dispatched',
  WITH_COURIER: 'With Courier',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
};

// === Partner Management ===

export const PARTNER_PORTAL_MODES = ['SELF_SERVICE', 'XARRA_MANAGED', 'HYBRID'] as const;
export type PartnerPortalMode = (typeof PARTNER_PORTAL_MODES)[number];

export const PARTNER_ORDER_SOURCES = ['PORTAL', 'ADMIN_ENTRY', 'EMAIL_PO', 'MAGIC_LINK'] as const;
export type PartnerOrderSource = (typeof PARTNER_ORDER_SOURCES)[number];

export const DOCUMENT_DELIVERY_METHODS = ['PORTAL', 'EMAIL', 'BOTH'] as const;
export type DocumentDeliveryMethod = (typeof DOCUMENT_DELIVERY_METHODS)[number];

export const MAGIC_LINK_PURPOSES = [
  'ORDER_VIEW', 'ORDER_CONFIRM', 'TRACK_ORDER', 'STATEMENT_VIEW',
  'INVOICE_VIEW', 'PORTAL_ONBOARD',
] as const;
export type MagicLinkPurpose = (typeof MAGIC_LINK_PURPOSES)[number];

export const ONBOARDING_STAGES = [
  'UNAWARE', 'EMAIL_ONLY', 'MAGIC_LINK_USED', 'ACCOUNT_CREATED', 'FIRST_LOGIN', 'ACTIVE_USER',
] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

// === Notification Email ===

// === SOR Suspense Accounting ===

export const SUSPENSE_STATUSES = ['SUSPENSE', 'CONFIRMED', 'REFUND_DUE', 'REFUNDED', 'WRITTEN_OFF'] as const;
export type SuspenseStatus = (typeof SUSPENSE_STATUSES)[number];

export const SAFE_SPENDING_METHODS = ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'] as const;
export type SafeSpendingMethod = (typeof SAFE_SPENDING_METHODS)[number];

export const PREDICTION_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type PredictionConfidenceLevel = (typeof PREDICTION_CONFIDENCE_LEVELS)[number];

export const PREDICTION_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type PredictionRiskLevel = (typeof PREDICTION_RISK_LEVELS)[number];

export const DIGEST_FREQUENCIES = ['IMMEDIATE', 'DAILY', 'WEEKLY', 'NONE'] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Office Supplies', 'Printing & Production', 'Shipping & Courier',
  'Marketing & Advertising', 'Software & Subscriptions', 'Travel',
  'Professional Services', 'Utilities', 'Rent', 'Other',
] as const;
