-- Migration 0039: Per-user permission overrides + structured job_function on staff_members
-- This implements the base-role + override model agreed in planning:
--   Effective permissions = role defaults + explicit admin grants/denies per user

-- ─── Job Function enum ────────────────────────────────────────────────────────
-- Separate from the free-text staff_members.role column (job title/display name).
-- Controls the suggested Billetterie project role when adding someone to a project.

DO $$ BEGIN
  CREATE TYPE staff_job_function AS ENUM (
    -- Executive / Sponsor-level
    'ceo', 'cto', 'coo', 'finance_director', 'managing_director',
    -- Project management
    'project_manager', 'programme_manager', 'portfolio_manager',
    -- Technical
    'developer', 'senior_developer', 'tech_lead', 'architect', 'devops_engineer',
    -- Analysis
    'business_analyst', 'systems_analyst', 'data_analyst',
    -- QA / Testing
    'qa_engineer', 'test_analyst', 'uat_coordinator',
    -- Design
    'ux_designer', 'ui_designer', 'graphic_designer',
    -- Content / Publishing (Xarra-specific)
    'editor', 'typesetter', 'copywriter', 'proofreader', 'cover_designer',
    -- Administration
    'project_admin', 'executive_assistant',
    -- External
    'client_representative', 'consultant', 'contractor',
    -- Catch-all
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS job_function staff_job_function,
  ADD COLUMN IF NOT EXISTS display_title VARCHAR(100); -- free-text label shown in UI (e.g. "Senior Software Developer")

CREATE INDEX IF NOT EXISTS idx_staff_job_function ON staff_members(job_function);

-- ─── User Permission Overrides ───────────────────────────────────────────────
-- Supplement or restrict a user's base-role permissions on specific module+action pairs.
-- type=GRANT adds a permission the role doesn't have.
-- type=DENY removes a permission the role normally grants.
-- Managed only by admin users. Changes are audit-logged.

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  module        VARCHAR(50) NOT NULL,    -- e.g. 'reports', 'invoices', 'royalties'
  permission    VARCHAR(20) NOT NULL,    -- e.g. 'read', 'create', 'export'
  type          VARCHAR(10) NOT NULL DEFAULT 'GRANT' CHECK (type IN ('GRANT', 'DENY')),
  granted_by    TEXT NOT NULL REFERENCES "user"(id),
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, module, permission)   -- one override per user/module/permission pair
);

CREATE INDEX IF NOT EXISTS idx_perm_overrides_user ON user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_perm_overrides_module ON user_permission_overrides(module);
