-- Migration 0022: Billetterie Software project management tables
-- Idempotent: uses IF NOT EXISTS guards throughout

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE bil_project_status AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_phase_key AS ENUM (
    'INITIATION', 'ELICITATION', 'ARCHITECTURE',
    'DEVELOPMENT', 'TESTING', 'SIGN_OFF', 'CLOSURE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_phase_status AS ENUM ('LOCKED', 'ACTIVE', 'APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Sequence for BIL-YYYY-NNNN numbers ──────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS billetterie_project_seq START 1;

-- ─── billetterie_projects ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_projects (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  number          VARCHAR(20)           NOT NULL UNIQUE,
  name            VARCHAR(255)          NOT NULL,
  client          VARCHAR(255),
  description     TEXT,
  status          bil_project_status    NOT NULL DEFAULT 'ACTIVE',
  current_phase   bil_phase_key         NOT NULL DEFAULT 'INITIATION',

  start_date      VARCHAR(20),
  target_end_date VARCHAR(20),
  completed_at    TIMESTAMPTZ,

  budget          DECIMAL(14,2),

  contact_name    VARCHAR(255),
  contact_email   VARCHAR(255),
  contact_phone   VARCHAR(50),

  notes           TEXT,
  created_by      TEXT REFERENCES "user"(id),
  created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_projects_status ON billetterie_projects(status);
CREATE INDEX IF NOT EXISTS idx_bil_projects_phase  ON billetterie_projects(current_phase);

-- ─── billetterie_project_phases ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_project_phases (
  id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID              NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  phase_key        bil_phase_key     NOT NULL,
  status           bil_phase_status  NOT NULL DEFAULT 'LOCKED',
  gate_documents   JSONB             NOT NULL DEFAULT '[]',
  approved_at      TIMESTAMPTZ,
  approved_by      TEXT REFERENCES "user"(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_phases_project ON billetterie_project_phases(project_id);

-- ─── billetterie_meetings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_meetings (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID          NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  phase_key    bil_phase_key,
  title        VARCHAR(255)  NOT NULL,
  meeting_date VARCHAR(20)   NOT NULL,
  attendees    JSONB         NOT NULL DEFAULT '[]',
  agenda       TEXT,
  minutes      TEXT,
  action_items JSONB         NOT NULL DEFAULT '[]',
  recorded_by  TEXT REFERENCES "user"(id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_meetings_project ON billetterie_meetings(project_id);
