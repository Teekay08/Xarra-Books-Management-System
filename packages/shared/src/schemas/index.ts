import { z } from 'zod';
import {
  AUTHOR_TYPES,
  ROYALTY_TRIGGER_TYPES,
  PAYMENT_FREQUENCIES,
  TITLE_FORMATS,
  TITLE_STATUSES,
  CHANNELS,
  CONSIGNMENT_STATUSES,
  INVOICE_STATUSES,
  MOVEMENT_TYPES,
  USER_ROLES,
  DISCOUNT_TYPES,
  REMITTANCE_STATUSES,
} from '../constants.js';

// === Author Schemas ===

export const createAuthorSchema = z.object({
  legalName: z.string().min(1, 'Legal name is required'),
  penName: z.string().optional(),
  type: z.enum(AUTHOR_TYPES),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  taxNumber: z.string().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

export const updateAuthorSchema = createAuthorSchema.partial();

// === Author Contract Schemas ===

export const createAuthorContractSchema = z.object({
  authorId: z.string().uuid(),
  titleId: z.string().uuid(),
  royaltyRatePrint: z.number().min(0).max(1),
  royaltyRateEbook: z.number().min(0).max(1),
  triggerType: z.enum(ROYALTY_TRIGGER_TYPES),
  triggerValue: z.number().optional(),
  advanceAmount: z.number().min(0).default(0),
  paymentFrequency: z.enum(PAYMENT_FREQUENCIES).default('QUARTERLY'),
  minimumPayment: z.number().min(0).default(100),
  isSigned: z.boolean().default(false),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()).optional(),
});

// === Royalty Payment Schemas ===

export const createAuthorPaymentRunSchema = z.object({
  authorId: z.string().uuid(),
  periodFrom: z.string().or(z.date()),
  periodTo: z.string().or(z.date()),
  royaltyLedgerIds: z.array(z.string().uuid()).min(1, 'Select at least one royalty entry'),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const processAuthorPaymentSchema = z.object({
  paymentMethod: z.enum(['EFT', 'BANK_TRANSFER', 'CHEQUE']).default('EFT'),
  bankReference: z.string().min(1, 'Bank reference is required'),
  notes: z.string().optional(),
});

// === Title Schemas ===

export const createTitleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  isbn13: z.string().regex(/^\d{13}$/, 'ISBN-13 must be 13 digits').optional(),
  asin: z.string().optional(),
  primaryAuthorId: z.string().uuid().optional(),
  rrpZar: z.number().positive('RRP must be positive'),
  costPriceZar: z.number().positive().optional(),
  formats: z.array(z.enum(TITLE_FORMATS)).min(1),
  status: z.enum(TITLE_STATUSES).default('PRODUCTION'),
  description: z.string().optional(),
  publishDate: z.string().or(z.date()).optional(),
  pageCount: z.number().int().positive().optional(),
  weightGrams: z.number().int().positive().optional(),
  coverImageUrl: z.string().url().optional(),
});

export const updateTitleSchema = createTitleSchema.partial();

// === Channel Partner Schemas ===

export const createChannelPartnerSchema = z.object({
  name: z.string().min(1, 'Partner name is required'),
  discountPct: z.number().min(0).max(100),
  sorDays: z.number().int().positive().optional(),
  paymentTermsDays: z.number().int().positive().optional(),
  paymentDay: z.number().int().min(1).max(31).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  remittanceEmail: z.string().email().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

export const updateChannelPartnerSchema = createChannelPartnerSchema.partial();

// === Consignment Schemas ===

export const createConsignmentSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  partnerPoNumber: z.string().max(50).optional(),
  dispatchDate: z.string().or(z.date()),
  courierCompany: z.string().optional(),
  courierWaybill: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    qtyDispatched: z.number().int().positive(),
  })).min(1, 'At least one title is required'),
});

// === Invoice Schemas ===

export const createInvoiceSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  consignmentId: z.string().uuid().optional(),
  invoiceDate: z.string().or(z.date()),
  taxInclusive: z.boolean().default(false),
  purchaseOrderNumber: z.string().max(50).optional(),
  customerReference: z.string().max(100).optional(),
  paymentTermsText: z.string().optional(),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    description: z.string().optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    discountPct: z.number().min(0).max(100),
    discountType: z.enum(DISCOUNT_TYPES).default('PERCENT'),
  })).min(1),
  notes: z.string().optional(),
});

// === Payment Schemas ===

export const recordPaymentSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  amount: z.number().positive(),
  paymentDate: z.string().or(z.date()),
  paymentMethod: z.string().optional(),
  bankReference: z.string().min(1, 'Bank reference is required'),
  invoiceAllocations: z.array(z.object({
    invoiceId: z.string().uuid(),
    amount: z.number().positive(),
  })).optional(),
  notes: z.string().optional(),
});

// === Inventory Schemas ===

export const stockAdjustmentSchema = z.object({
  titleId: z.string().uuid(),
  location: z.string(),
  quantity: z.number().int(),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

// === Pagination ===

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// === Company Settings Schemas ===

export const companySettingsSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  tradingAs: z.string().optional(),
  registrationNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  bankDetails: z.object({
    bankName: z.string(),
    accountNumber: z.string(),
    branchCode: z.string(),
    accountType: z.string(),
  }).optional(),
  invoiceFooterText: z.string().optional(),
  statementFooterText: z.string().optional(),
});

// === Partner Branch Schemas ===

export const createPartnerBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  code: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

export const updatePartnerBranchSchema = createPartnerBranchSchema.partial();

// === Statement Schemas ===

export const generateStatementSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  branchIds: z.array(z.string().uuid()).optional(),
  periodFrom: z.string().or(z.date()),
  periodTo: z.string().or(z.date()),
  consolidated: z.boolean().default(false),
});

// === Remittance Schemas ===

export const createRemittanceSchema = z.object({
  partnerId: z.string().uuid(),
  partnerRef: z.string().optional(),
  periodFrom: z.string().or(z.date()).optional(),
  periodTo: z.string().or(z.date()).optional(),
  totalAmount: z.number().positive(),
  parseMethod: z.enum(['PDF_TEXT', 'OCR', 'CSV', 'MANUAL']).default('MANUAL'),
  invoiceAllocations: z.array(z.object({
    invoiceId: z.string().uuid(),
    amount: z.number().positive(),
  })).optional(),
  creditNoteAllocations: z.array(z.object({
    creditNoteId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    amount: z.number().positive(),
  })).optional(),
  notes: z.string().optional(),
});

// === User Profile Schemas ===

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark']).optional(),
    dateFormat: z.string().optional(),
    itemsPerPage: z.number().int().min(10).max(100).optional(),
  }).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// === Debit Note Schemas ===

export const createDebitNoteSchema = z.object({
  partnerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    discountPct: z.number().min(0).max(100).default(0),
  })).min(1),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

// === Expense Schemas ===

export const createExpenseCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive(),
  taxAmount: z.number().min(0).default(0),
  taxInclusive: z.boolean().default(false),
  expenseDate: z.string().or(z.date()),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

// === Quotation Schemas ===

export const createQuotationSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  quotationDate: z.string().or(z.date()),
  validUntil: z.string().or(z.date()).optional(),
  taxInclusive: z.boolean().default(false),
  customerReference: z.string().max(100).optional(),
  lines: z.array(z.object({
    titleId: z.string().uuid().optional(),
    description: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    discountPct: z.number().min(0).max(100).default(0),
  })).min(1),
  notes: z.string().optional(),
});

// === Purchase Order Schemas ===

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid().optional(),
  supplierName: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  orderDate: z.string().or(z.date()),
  expectedDeliveryDate: z.string().or(z.date()).optional(),
  deliveryAddress: z.string().optional(),
  taxInclusive: z.boolean().default(false),
  lines: z.array(z.object({
    titleId: z.string().uuid().optional(),
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    discountPct: z.number().min(0).max(100).default(0),
  })).min(1),
  notes: z.string().optional(),
});

// === Cash Sale Schemas ===

export const createCashSaleSchema = z.object({
  saleDate: z.string().or(z.date()),
  customerName: z.string().optional(),
  taxInclusive: z.boolean().default(true),
  paymentMethod: z.string().min(1),
  paymentReference: z.string().optional(),
  lines: z.array(z.object({
    titleId: z.string().uuid().optional(),
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    discountPct: z.number().min(0).max(100).default(0),
  })).min(1),
  notes: z.string().optional(),
});

// === Expense Claim Schemas ===

export const createExpenseClaimSchema = z.object({
  claimDate: z.string().or(z.date()),
  lines: z.array(z.object({
    categoryId: z.string().uuid().optional(),
    description: z.string().min(1),
    amount: z.number().positive(),
    taxAmount: z.number().min(0).default(0),
    receiptUrl: z.string().optional(),
    expenseDate: z.string().or(z.date()),
  })).min(1),
  notes: z.string().optional(),
});

// === Requisition Schemas ===

export const createRequisitionSchema = z.object({
  department: z.string().optional(),
  requiredByDate: z.string().or(z.date()).optional(),
  lines: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    estimatedUnitPrice: z.number().positive(),
    notes: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
});

// === Document Send Schema ===

export const sendDocumentSchema = z.object({
  recipientEmail: z.string().email(),
  subject: z.string().optional(),
  message: z.string().optional(),
});

// === Partner Portal Schemas ===

export const createPartnerUserSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  email: z.string().email(),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'BRANCH_MANAGER', 'STAFF']).default('STAFF'),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updatePartnerUserSchema = createPartnerUserSchema
  .omit({ password: true, partnerId: true })
  .partial()
  .extend({ password: z.string().min(8).optional() });

export const partnerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createPartnerOrderSchema = z.object({
  branchId: z.string().uuid().optional(),
  deliveryAddress: z.string().optional(),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1, 'At least one title is required'),
  notes: z.string().optional(),
});

export const createPartnerReturnRequestSchema = z.object({
  branchId: z.string().uuid().optional(),
  consignmentId: z.string().uuid().optional(),
  reason: z.string().min(1, 'Reason is required'),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    quantity: z.number().int().positive(),
    condition: z.enum(['GOOD', 'DAMAGED', 'UNSALEABLE']).default('GOOD'),
    reason: z.string().optional(),
  })).min(1, 'At least one title is required'),
  notes: z.string().optional(),
});

export const reviewPartnerReturnRequestSchema = z.object({
  action: z.enum(['authorize', 'reject']),
  reviewNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export const createCourierShipmentSchema = z.object({
  courierCompany: z.string().default('FASTWAY'),
  waybillNumber: z.string().min(1, 'Waybill number is required'),
  trackingUrl: z.string().url().optional(),
  consignmentId: z.string().uuid().optional(),
  partnerOrderId: z.string().uuid().optional(),
  returnRequestId: z.string().uuid().optional(),
  recipientName: z.string().optional(),
  recipientAddress: z.string().optional(),
  recipientPhone: z.string().optional(),
  packageCount: z.number().int().positive().default(1),
  totalWeightKg: z.number().positive().optional(),
  estimatedDelivery: z.string().or(z.date()).optional(),
});
