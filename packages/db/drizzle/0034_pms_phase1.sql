-- Migration 0034: Billetterie PMS Phase 1
-- Adds: RACI matrix, Risk matrix, Sprint/Iteration management,
--       project health R/A/G, project type, adaptive-project gate,
--       lessons-learned closure gate, and sprint linkage on tasks.

-- ─── New enums ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE bil_risk_status AS ENUM ('OPEN','MITIGATED','ACCEPTED','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_sprint_status AS ENUM ('PLANNING','ACTIVE','DEMO_PENDING','SIGNED_OFF','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_project_type AS ENUM ('ADAPTIVE','CORRECTIVE','PERFECTIVE','STRATEGIC','GLOBAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_health_status AS ENUM ('R','A','G');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Extend billetterie_projects ─────────────────────────────────────────────

ALTER TABLE billetterie_projects
  ADD COLUMN IF NOT EXISTS project_type             bil_project_type,
  ADD COLUMN IF NOT EXISTS is_adaptive              BOOLEAN NOT NULL DEFAULT FALSE,
  -- Health R/A/G (manually set by PM, auto-checked at query time)
  ADD COLUMN IF NOT EXISTS health_status            bil_health_status,
  ADD COLUMN IF NOT EXISTS health_notes             TEXT,
  ADD COLUMN IF NOT EXISTS health_updated_at        TIMESTAMPTZ,
  -- Adaptive project Day-20 extension gate
  ADD COLUMN IF NOT EXISTS adaptive_extension_approved     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS adaptive_extension_approved_by  TEXT,
  ADD COLUMN IF NOT EXISTS adaptive_extension_approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adaptive_extension_reason       TEXT,
  -- Lessons Learned (required before project can be archived)
  ADD COLUMN IF NOT EXISTS ll_submitted             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ll_what_went_well        TEXT,
  ADD COLUMN IF NOT EXISTS ll_what_didnt            TEXT,
  ADD COLUMN IF NOT EXISTS ll_recommendations       TEXT,
  ADD COLUMN IF NOT EXISTS ll_submitted_by          TEXT,
  ADD COLUMN IF NOT EXISTS ll_submitted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ll_acknowledged_by       TEXT,
  ADD COLUMN IF NOT EXISTS ll_acknowledged_at       TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bil_projects_health  ON billetterie_projects(health_status);
CREATE INDEX IF NOT EXISTS idx_bil_projects_type    ON billetterie_projects(project_type);

-- ─── RACI Matrix ─────────────────────────────────────────────────────────────
-- One row = one responsibility area within a project.
-- responsible  = does the work
-- accountable  = owns the outcome (exactly one per area)
-- consulted    = consulted before action (array of staff_member UUIDs)
-- informed     = notified after action   (array of staff_member UUIDs)

CREATE TABLE IF NOT EXISTS billetterie_project_raci (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  area              VARCHAR(255) NOT NULL,  -- e.g. "Requirements sign-off", "Code review"
  responsible_id    UUID REFERENCES staff_members(id),
  accountable_id    UUID REFERENCES staff_members(id),
  consulted         JSONB NOT NULL DEFAULT '[]',  -- string[] of staff_member UUIDs
  informed          JSONB NOT NULL DEFAULT '[]',  -- string[] of staff_member UUIDs
  phase_key         bil_phase_key,               -- optional: which phase this applies to
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_raci_project ON billetterie_project_raci(project_id);

-- ─── Risk Matrix ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_risks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  category        VARCHAR(100),   -- e.g. Technical, Commercial, Resource, Timeline
  probability     SMALLINT NOT NULL DEFAULT 1 CHECK(probability BETWEEN 1 AND 5),
  impact          SMALLINT NOT NULL DEFAULT 1 CHECK(impact BETWEEN 1 AND 5),
  mitigation      TEXT,
  owner_id        UUID REFERENCES staff_members(id),
  review_date     DATE,
  status          bil_risk_status NOT NULL DEFAULT 'OPEN',
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_risks_project ON billetterie_risks(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_risks_status  ON billetterie_risks(status);

-- ─── Sprints / Iterations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_sprints (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL,   -- "Sprint 1", "Iteration Alpha"
  goal                  TEXT,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  status                bil_sprint_status NOT NULL DEFAULT 'PLANNING',
  -- Demo gate
  demo_recorded_at      TIMESTAMPTZ,
  demo_attachment_url   VARCHAR(500),
  demo_notes            TEXT,
  -- Sign-off (PM)
  signed_off_by         TEXT,
  signed_off_at         TIMESTAMPTZ,
  -- Sponsor approval
  sponsor_approved      BOOLEAN NOT NULL DEFAULT FALSE,
  sponsor_approved_by   TEXT,
  sponsor_approved_at   TIMESTAMPTZ,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_sprints_project ON billetterie_sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_sprints_status  ON billetterie_sprints(status);

-- ─── Link tasks to sprints ────────────────────────────────────────────────────

ALTER TABLE billetterie_tasks
  ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES billetterie_sprints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bil_tasks_sprint ON billetterie_tasks(sprint_id);
