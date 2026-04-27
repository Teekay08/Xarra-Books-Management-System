-- Migration 0036: Billetterie Change Advisory Board (CAB) / Change Requests
-- Adds: change_requests table with full CAB approval workflow

DO $$ BEGIN
  CREATE TYPE bil_change_type AS ENUM ('SCOPE','TIMELINE','BUDGET','TECHNICAL','PROCESS','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_change_status AS ENUM ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','IMPLEMENTED','WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_change_impact AS ENUM ('NONE','LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS billetterie_change_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  cr_number             INTEGER NOT NULL,
  title                 VARCHAR(500) NOT NULL,
  description           TEXT NOT NULL,
  type                  bil_change_type NOT NULL DEFAULT 'OTHER',
  status                bil_change_status NOT NULL DEFAULT 'DRAFT',
  -- Impact assessment
  impact_scope          bil_change_impact NOT NULL DEFAULT 'NONE',
  impact_timeline       bil_change_impact NOT NULL DEFAULT 'NONE',
  impact_budget         bil_change_impact NOT NULL DEFAULT 'NONE',
  impact_risk           bil_change_impact NOT NULL DEFAULT 'NONE',
  -- Details
  justification         TEXT,
  alternatives          TEXT,
  rollback_plan         TEXT,
  estimated_effort_days DECIMAL(6,1),
  estimated_cost        DECIMAL(14,2),
  -- Timeline
  proposed_start        DATE,
  proposed_end          DATE,
  -- Submitted by
  requested_by          TEXT NOT NULL REFERENCES "user"(id),
  -- CAB review
  reviewed_by           TEXT REFERENCES "user"(id),
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  -- Approval
  approved_by           TEXT REFERENCES "user"(id),
  approved_at           TIMESTAMPTZ,
  approval_notes        TEXT,
  -- Implementation
  implemented_by        TEXT REFERENCES "user"(id),
  implemented_at        TIMESTAMPTZ,
  implementation_notes  TEXT,
  -- Linked items
  linked_sprint_id      UUID REFERENCES billetterie_sprints(id) ON DELETE SET NULL,
  linked_risk_id        UUID REFERENCES billetterie_risks(id) ON DELETE SET NULL,
  -- Metadata
  tags                  JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, cr_number)
);

CREATE INDEX IF NOT EXISTS idx_bil_cr_project ON billetterie_change_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_cr_status  ON billetterie_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_bil_cr_type    ON billetterie_change_requests(type);
