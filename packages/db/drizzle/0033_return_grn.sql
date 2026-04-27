-- Migration 0033: Goods Return Note (GRN) on returns_authorizations
-- Adds a GRN number and issue timestamp to track when returned goods
-- are formally receipted at the warehouse.

ALTER TABLE returns_authorizations
  ADD COLUMN IF NOT EXISTS grn_number VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS grn_issued_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_auth_grn_number
  ON returns_authorizations(grn_number)
  WHERE grn_number IS NOT NULL;
