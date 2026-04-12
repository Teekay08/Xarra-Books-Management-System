-- Add settlement tracking fields to consignments table

-- 1. Create settlement_status enum
DO $$ BEGIN
  CREATE TYPE "settlement_status" AS ENUM (
    'SOR_ACTIVE',
    'SOR_EXPIRED',
    'INVOICE_PENDING',
    'INVOICE_ISSUED',
    'AWAITING_PAYMENT',
    'OVERDUE',
    'PAYMENT_RECEIVED',
    'RECONCILING',
    'PARTIALLY_SETTLED',
    'SETTLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add settlement_status and invoice_id columns to consignments
ALTER TABLE "consignments"
  ADD COLUMN IF NOT EXISTS "settlement_status" "settlement_status",
  ADD COLUMN IF NOT EXISTS "invoice_id" uuid;
