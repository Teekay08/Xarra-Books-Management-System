-- Migration 0035: Billetterie Support Desk with SLA Engine
-- Adds: support_tickets, ticket_comments, sla_policies tables

-- ─── New enums ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE bil_ticket_status AS ENUM ('OPEN','IN_PROGRESS','PENDING_CLIENT','RESOLVED','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_ticket_priority AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_ticket_category AS ENUM ('BUG','FEATURE_REQUEST','QUESTION','CHANGE_REQUEST','INCIDENT','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── SLA Policies ─────────────────────────────────────────────────────────────
-- One policy per project (or system-wide default with project_id NULL)

CREATE TABLE IF NOT EXISTS billetterie_sla_policies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID REFERENCES billetterie_projects(id) ON DELETE CASCADE,  -- NULL = global default
  priority           bil_ticket_priority NOT NULL,
  response_hours     INTEGER NOT NULL DEFAULT 8,   -- time to first response
  resolution_hours   INTEGER NOT NULL DEFAULT 48,  -- time to resolution
  is_business_hours  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes to enforce uniqueness treating NULL project_id as a value
-- (project-specific policies: one per priority per project)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bil_sla_project_priority
  ON billetterie_sla_policies(project_id, priority)
  WHERE project_id IS NOT NULL;

-- Global defaults: one per priority where project_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_bil_sla_global_priority
  ON billetterie_sla_policies(priority)
  WHERE project_id IS NULL;

-- Seed global defaults
INSERT INTO billetterie_sla_policies (project_id, priority, response_hours, resolution_hours) VALUES
  (NULL, 'CRITICAL', 1,  8),
  (NULL, 'HIGH',     4,  24),
  (NULL, 'MEDIUM',   8,  48),
  (NULL, 'LOW',      24, 120)
ON CONFLICT DO NOTHING;

-- ─── Support Tickets ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_support_tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  ticket_number       INTEGER NOT NULL,
  title               VARCHAR(500) NOT NULL,
  description         TEXT NOT NULL,
  category            bil_ticket_category NOT NULL DEFAULT 'OTHER',
  priority            bil_ticket_priority NOT NULL DEFAULT 'MEDIUM',
  status              bil_ticket_status NOT NULL DEFAULT 'OPEN',
  -- SLA tracking
  sla_response_due    TIMESTAMPTZ,    -- calculated on creation from policy
  sla_resolution_due  TIMESTAMPTZ,   -- calculated on creation from policy
  first_responded_at  TIMESTAMPTZ,   -- set when first comment added by assignee
  resolved_at         TIMESTAMPTZ,
  sla_breached        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Parties
  reported_by         TEXT NOT NULL REFERENCES "user"(id),
  assigned_to_staff   UUID REFERENCES staff_members(id),
  -- Linking
  linked_issue_id     UUID REFERENCES billetterie_issues(id) ON DELETE SET NULL,
  -- Metadata
  tags                JSONB NOT NULL DEFAULT '[]',
  resolution_notes    TEXT,
  closed_by           TEXT REFERENCES "user"(id),
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_bil_tickets_project  ON billetterie_support_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_tickets_status   ON billetterie_support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_bil_tickets_priority ON billetterie_support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_bil_tickets_reporter ON billetterie_support_tickets(reported_by);
CREATE INDEX IF NOT EXISTS idx_bil_tickets_assignee ON billetterie_support_tickets(assigned_to_staff);
CREATE INDEX IF NOT EXISTS idx_bil_tickets_sla_due  ON billetterie_support_tickets(sla_resolution_due);

-- ─── Ticket Comments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_ticket_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES billetterie_support_tickets(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES "user"(id),
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,  -- internal notes hidden from client portal
  is_edited   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_ticket_comments_ticket ON billetterie_ticket_comments(ticket_id);
