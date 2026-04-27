-- Migration 0031: Product-level access control on the user table
-- Adds xarra_access, billetterie_access, and billetterie_system_role.
-- Idempotent: uses IF NOT EXISTS / DO $$ guards.

-- ─── Product access columns ───────────────────────────────────────────────────
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "xarraAccess"            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "billetterieAccess"       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "billetterieSystemRole"   TEXT;

-- Existing users (created before this migration) already have accounts in Xarra,
-- so xarraAccess defaults TRUE. Billetterie access is explicitly opt-in.

-- ─── Indexes for quick access checks ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_xarra_access        ON "user"("xarraAccess");
CREATE INDEX IF NOT EXISTS idx_user_billetterie_access  ON "user"("billetterieAccess");
