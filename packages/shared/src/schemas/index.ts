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
  PROJECT_STATUSES,
  PROJECT_TYPES,
  CONTRACT_TYPES,
  MILESTONE_STATUSES,
  SOURCE_TYPES,
  COST_CLASSIFICATIONS,
  RATE_CARD_TYPES,
  TIMESHEET_STATUSES,
  SOW_STATUSES,
  ORDER_PIPELINE_STEPS,
} from '../constants.js';

// === Author Schemas ===

export const createAuthorSchema = z.object({
  legalName: z.string().min(1, 'Legal name is required'),
  penName: z.string().optional().nullable(),
  type: z.enum(AUTHOR_TYPES),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().optional().nullable(),
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
  sorDays: z.number().int().positive().optional().nullable(),
  paymentTermsDays: z.number().int().positive().optional().nullable(),
  paymentDay: z.number().int().min(1).max(31).optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  remittanceEmail: z.string().email().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().optional().nullable(),
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
  adjustmentType: z.enum(['RESTOCK', 'WRITEOFF', 'TRANSFER', 'COMPLIMENTARY']).default('RESTOCK'),
  location: z.string(),
  toLocation: z.string().optional(),
  quantity: z.number().int().positive('Quantity must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

// === Pagination ===

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(2000).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// === Company Settings Schemas ===

export const companySettingsSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  tradingAs: z.string().optional().nullable(),
  registrationNumber: z.string().optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.preprocess((v) => (v === '' ? undefined : v), z.string().email().optional().nullable()),
  website: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional().nullable()),
  bankDetails: z.object({
    bankName: z.string(),
    accountNumber: z.string(),
    branchCode: z.string(),
    accountType: z.string(),
  }).optional(),
  invoiceFooterText: z.string().optional(),
  statementFooterText: z.string().optional(),
  minimumOrderQty: z.coerce.number().int().min(1).optional().nullable(),
});

// === Partner Branch Schemas ===

export const createPartnerBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  code: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().optional().nullable(),
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
  branchId: z.string().uuid().or(z.literal('')).nullable().optional().transform(v => v === '' ? null : (v ?? undefined)),
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
  customerPoNumber: z.string().max(50).optional(),
  deliveryAddress: z.string().optional(),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1, 'At least one title is required'),
  notes: z.string().optional(),
});

export const createPartnerReturnRequestSchema = z.object({
  branchId: z.string().uuid().optional(),
  consignmentId: z.string().uuid('Consignment / SOR pro-forma invoice is required'),
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

// === Budgeting Schemas ===

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  titleId: z.string().uuid().optional().nullable(),
  authorId: z.string().uuid().optional().nullable(),
  projectManager: z.string().optional().nullable(),
  projectType: z.enum(PROJECT_TYPES).default('NEW_TITLE'),
  contractType: z.enum(CONTRACT_TYPES).default('TRADITIONAL'),
  authorContribution: z.number().min(0).default(0),
  description: z.string().optional().nullable(),
  startDate: z.string().or(z.date()).optional().nullable(),
  targetCompletionDate: z.string().or(z.date()).optional().nullable(),
  currency: z.string().max(3).default('ZAR'),
  notes: z.string().optional().nullable(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(PROJECT_STATUSES).optional(),
});

export const createMilestoneSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  sortOrder: z.number().int().min(0).default(0),
  plannedStartDate: z.string().or(z.date()).optional().nullable(),
  plannedEndDate: z.string().or(z.date()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateMilestoneSchema = createMilestoneSchema.partial().extend({
  status: z.enum(MILESTONE_STATUSES).optional(),
  actualStartDate: z.string().or(z.date()).optional().nullable(),
  actualEndDate: z.string().or(z.date()).optional().nullable(),
});

export const createBudgetLineItemSchema = z.object({
  milestoneId: z.string().uuid().optional().nullable(),
  category: z.string().min(1, 'Category is required'),
  costClassification: z.enum(COST_CLASSIFICATIONS).default('PUBLISHING'),
  customCategory: z.string().optional().nullable(),
  description: z.string().min(1, 'Description is required'),
  sourceType: z.enum(SOURCE_TYPES).default('INTERNAL'),
  estimatedHours: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().min(0).nullable()).optional(),
  hourlyRate: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().min(0).nullable()).optional(),
  estimatedAmount: z.preprocess((v) => Number(v), z.number().positive('Amount must be positive')),
  rateCardId: z.string().uuid().optional().nullable(),
  staffUserId: z.string().optional().nullable(),
  contractorId: z.string().uuid().optional().nullable(),
  externalQuote: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().min(0).nullable()).optional(),
  notes: z.string().optional().nullable(),
});

export const updateBudgetLineItemSchema = createBudgetLineItemSchema.partial();

export const createActualCostSchema = z.object({
  milestoneId: z.string().uuid().optional().nullable(),
  budgetLineItemId: z.string().uuid().optional().nullable(),
  category: z.string().min(1, 'Category is required'),
  costClassification: z.enum(COST_CLASSIFICATIONS).default('PUBLISHING'),
  customCategory: z.string().optional().nullable(),
  description: z.string().min(1, 'Description is required'),
  sourceType: z.enum(SOURCE_TYPES).default('INTERNAL'),
  amount: z.preprocess((v) => Number(v), z.number().positive('Amount must be positive')),
  vendor: z.string().optional().nullable(),
  invoiceRef: z.string().optional().nullable(),
  paidDate: z.string().or(z.date()).optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  staffUserId: z.string().optional().nullable(),
  contractorId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createRateCardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(RATE_CARD_TYPES),
  role: z.string().min(1, 'Role is required'),
  hourlyRateZar: z.number().positive('Hourly rate must be positive'),
  dailyRateZar: z.number().positive().optional().nullable(),
  staffUserId: z.string().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  effectiveFrom: z.string().or(z.date()),
  effectiveTo: z.string().or(z.date()).optional().nullable(),
  currency: z.string().max(3).default('ZAR'),
  notes: z.string().optional().nullable(),
});

export const updateRateCardSchema = createRateCardSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createTimesheetSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string(),
  periodFrom: z.string().or(z.date()),
  periodTo: z.string().or(z.date()),
  entries: z.array(z.object({
    milestoneId: z.string().uuid(),
    budgetLineItemId: z.string().uuid().optional().nullable(),
    workDate: z.string().or(z.date()),
    hours: z.number().positive().max(24),
    description: z.string().min(1),
  })).optional(),
  notes: z.string().optional().nullable(),
});

export const updateTimesheetSchema = z.object({
  entries: z.array(z.object({
    id: z.string().uuid().optional(), // existing entry to update
    milestoneId: z.string().uuid(),
    budgetLineItemId: z.string().uuid().optional().nullable(),
    workDate: z.string().or(z.date()),
    hours: z.number().positive().max(24),
    description: z.string().min(1),
  })),
  notes: z.string().optional().nullable(),
});

export const createSowSchema = z.object({
  projectId: z.string().uuid(),
  contractorId: z.string().uuid().optional().nullable(),
  staffUserId: z.string().optional().nullable(),
  scope: z.string().min(1, 'Scope is required'),
  deliverables: z.array(z.object({
    description: z.string().min(1),
    dueDate: z.string().or(z.date()),
    acceptanceCriteria: z.string().min(1),
  })).min(1, 'At least one deliverable is required'),
  timeline: z.object({
    startDate: z.string().or(z.date()),
    endDate: z.string().or(z.date()),
    milestones: z.array(z.object({
      name: z.string(),
      date: z.string().or(z.date()),
    })).default([]),
  }),
  costBreakdown: z.array(z.object({
    description: z.string().min(1),
    hours: z.number().min(0),
    rate: z.number().min(0),
    total: z.number().positive(),
  })).min(1, 'At least one cost line is required'),
  totalAmount: z.number().positive(),
  terms: z.string().optional().nullable(),
  validUntil: z.string().or(z.date()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateSowSchema = createSowSchema.partial();

// === AI Cost Estimation Schemas ===

export const costEstimateRequestSchema = z.object({
  pageCount: z.number().int().positive().max(10000).optional(),
  wordCount: z.number().int().positive().optional(),
  complexityScore: z.number().int().min(1).max(5).optional(),
});

export const applyEstimatesSchema = z.object({
  estimates: z.array(z.object({
    milestoneId: z.string().uuid(),
    estimatedHours: z.number().min(0),
    hourlyRate: z.number().min(0),
    estimatedAmount: z.number().positive(),
    sourceType: z.enum(SOURCE_TYPES),
    rateCardId: z.string().uuid().optional().nullable(),
    description: z.string().min(1),
    category: z.string().min(1),
  })).min(1, 'At least one estimate is required'),
});

// === SOW/Email Validation Schemas ===

export const sendSowEmailSchema = z.object({
  sentTo: z.string().min(1),
});

export const sendDocumentEmailSchema = z.object({
  recipientEmail: z.string().email('Valid email is required'),
  message: z.string().optional(),
});

export const rejectTimesheetSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

export const voidActualCostSchema = z.object({
  reason: z.string().min(1, 'Void reason is required'),
});

export const applyMilestoneTemplateSchema = z.object({
  templateType: z.enum(PROJECT_TYPES),
});

// === Order Tracking Schemas ===

export const pipelineStepSchema = z.object({
  step: z.enum(ORDER_PIPELINE_STEPS as unknown as [string, ...string[]]),
  notes: z.string().optional(),
});

export const createOrderOnBehalfSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  customerPoNumber: z.string().optional().nullable(),
  deliveryAddress: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1, 'At least one line item is required'),
});

export const generateMagicLinkSchema = z.object({
  partnerId: z.string().uuid(),
  purpose: z.string().min(1),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  expiresInHours: z.number().positive().default(72),
});

export const sendPartnerDocumentSchema = z.object({
  documentType: z.string().min(1),
  documentId: z.string().uuid(),
  recipientEmail: z.string().email().optional(),
});

export const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  preferences: z.record(z.any()).default({}),
  digestFrequency: z.string().default('IMMEDIATE'),
  dailyDigestHour: z.number().int().min(0).max(23).default(7),
  weeklyDigestDay: z.number().int().min(0).max(6).default(1),
});
