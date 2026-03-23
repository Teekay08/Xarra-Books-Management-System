-- Add delivery condition and notes fields to partner_orders
-- Partners can now record the condition of goods when confirming delivery

ALTER TABLE partner_orders
  ADD COLUMN IF NOT EXISTS delivery_condition VARCHAR(20),
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
