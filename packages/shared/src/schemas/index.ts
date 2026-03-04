import { z } from 'zod';
import {
  AUTHOR_TYPES,
  ROYALTY_TRIGGER_TYPES,
  TITLE_FORMATS,
  TITLE_STATUSES,
  CHANNELS,
  CONSIGNMENT_STATUSES,
  INVOICE_STATUSES,
  MOVEMENT_TYPES,
  USER_ROLES,
} from '../constants.js';

// === Author Schemas ===

export const createAuthorSchema = z.object({
  legalName: z.string().min(1, 'Legal name is required'),
  penName: z.string().optional(),
  type: z.enum(AUTHOR_TYPES),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  taxNumber: z.string().optional(),
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
  startDate: z.string().or(z.date()),
});

// === Title Schemas ===

export const createTitleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  isbn13: z.string().regex(/^\d{13}$/, 'ISBN-13 must be 13 digits').optional(),
  asin: z.string().optional(),
  rrpZar: z.number().positive('RRP must be positive'),
  formats: z.array(z.enum(TITLE_FORMATS)).min(1),
  status: z.enum(TITLE_STATUSES).default('PRODUCTION'),
  description: z.string().optional(),
  publishDate: z.string().or(z.date()).optional(),
});

export const updateTitleSchema = createTitleSchema.partial();

// === Channel Partner Schemas ===

export const createChannelPartnerSchema = z.object({
  name: z.string().min(1, 'Partner name is required'),
  discountPct: z.number().min(0).max(100),
  sorDays: z.number().int().positive().optional(),
  paymentDay: z.number().int().min(1).max(31).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  remittanceEmail: z.string().email().optional(),
  notes: z.string().optional(),
});

export const updateChannelPartnerSchema = createChannelPartnerSchema.partial();

// === Consignment Schemas ===

export const createConsignmentSchema = z.object({
  partnerId: z.string().uuid(),
  dispatchDate: z.string().or(z.date()),
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
  consignmentId: z.string().uuid().optional(),
  lines: z.array(z.object({
    titleId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    discountPct: z.number().min(0).max(100),
  })).min(1),
  notes: z.string().optional(),
});

// === Payment Schemas ===

export const recordPaymentSchema = z.object({
  partnerId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().or(z.date()),
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
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
