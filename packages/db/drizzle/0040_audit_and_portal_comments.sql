-- Migration 0040: Extend audit_action enum + Billetterie client portal comments

-- ─── Extended audit actions ───────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PERMISSION_GRANT';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PERMISSION_REVOKE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PHASE_ADVANCE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SPRINT_SIGNOFF';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SPRINT_APPROVED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'LESSONS_LEARNED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ADAPTIVE_EXTENSION';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'CR_APPROVED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'CR_REJECTED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'TICKET_RESOLVED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'TIMESHEET_APPROVED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'TIMESHEET_REJECTED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'USER_ACCESS_CHANGED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Billetterie Client Portal Comments ──────────────────────────────────────
-- Allows the external client to leave comments on the portal,
-- and PM/BA team members to respond. Separate from internal ticket comments.

CREATE TABLE IF NOT EXISTS billetterie_portal_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  -- Either token_id (client comment) or author_user_id (team response) is set, not both
  token_id        UUID REFERENCES billetterie_client_tokens(id) ON DELETE SET NULL,
  author_user_id  TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  -- Optional: link comment to a specific item
  item_type       VARCHAR(50),   -- 'deliverable' | 'milestone' | 'issue' | 'general'
  item_id         UUID,
  -- Thread: a reply has parent_id pointing to the root comment
  parent_id       UUID REFERENCES billetterie_portal_comments(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  is_team_response BOOLEAN NOT NULL DEFAULT FALSE,  -- true when author_user_id is a PM/BA
  is_internal     BOOLEAN NOT NULL DEFAULT FALSE,   -- if true, client cannot see it
  is_edited       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_comments_project  ON billetterie_portal_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_portal_comments_token    ON billetterie_portal_comments(token_id);
CREATE INDEX IF NOT EXISTS idx_portal_comments_item     ON billetterie_portal_comments(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_portal_comments_parent   ON billetterie_portal_comments(parent_id);
