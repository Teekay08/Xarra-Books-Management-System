-- Order Management: add new statuses, backorder fields, order line status enum

-- 1. Add new values to partner_order_status enum
ALTER TYPE "partner_order_status" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "partner_order_status" ADD VALUE IF NOT EXISTS 'BACK_ORDER';

-- 2. Create order_line_status enum
DO $$ BEGIN
  CREATE TYPE "order_line_status" AS ENUM ('CONFIRMED', 'BACKORDERED', 'REMOVED', 'OUT_OF_PRINT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Add backorder fields to partner_orders
ALTER TABLE "partner_orders"
  ADD COLUMN IF NOT EXISTS "backorder_eta" date,
  ADD COLUMN IF NOT EXISTS "hold_reason" text,
  ADD COLUMN IF NOT EXISTS "backorder_notes" text;

-- 4. Add backorder + line status fields to partner_order_lines
ALTER TABLE "partner_order_lines"
  ADD COLUMN IF NOT EXISTS "line_status" "order_line_status" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS "backorder_qty" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "backorder_eta" date;
