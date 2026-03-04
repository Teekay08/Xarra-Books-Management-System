import type { z } from 'zod';
import type {
  createAuthorSchema,
  createTitleSchema,
  createChannelPartnerSchema,
  createConsignmentSchema,
  createInvoiceSchema,
  recordPaymentSchema,
} from '../schemas/index.js';

// Inferred types from Zod schemas
export type CreateAuthorInput = z.infer<typeof createAuthorSchema>;
export type CreateTitleInput = z.infer<typeof createTitleSchema>;
export type CreateChannelPartnerInput = z.infer<typeof createChannelPartnerSchema>;
export type CreateConsignmentInput = z.infer<typeof createConsignmentSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
