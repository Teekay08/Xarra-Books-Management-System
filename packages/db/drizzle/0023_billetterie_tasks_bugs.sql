-- Migration 0023: Billetterie task register and bug register
-- Idempotent: uses IF NOT EXISTS / DO $$ EXCEPTION guards

DO $$ BEGIN
  CREATE TYPE bil_task_status AS ENUM ('TODO','IN_PROGRESS','REVIEW','DONE','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_task_priority AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_bug_severity AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_bug_status AS ENUM ('OPEN','IN_PROGRESS','RESOLVED','CLOSED','WONT_FIX');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── billetterie_tasks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_tasks (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID               NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  phase_key        bil_phase_key      NOT NULL DEFAULT 'DEVELOPMENT',
  title            VARCHAR(255)       NOT NULL,
  description      TEXT,
  status           bil_task_status    NOT NULL DEFAULT 'TODO',
  priority         bil_task_priority  NOT NULL DEFAULT 'MEDIUM',
  assigned_to      UUID               REFERENCES staff_members(id),
  estimated_hours  DECIMAL(6,2),
  logged_hours     DECIMAL(6,2)       NOT NULL DEFAULT 0,
  due_date         VARCHAR(20),
  completed_at     TIMESTAMPTZ,
  created_by       TEXT               REFERENCES "user"(id),
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_tasks_project ON billetterie_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_tasks_status  ON billetterie_tasks(status);

-- ─── billetterie_bugs ─────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS billetterie_bug_seq START 1;

CREATE TABLE IF NOT EXISTS billetterie_bugs (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID              NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  bug_number        INTEGER           NOT NULL,
  title             VARCHAR(255)      NOT NULL,
  description       TEXT,
  steps_to_reproduce TEXT,
  severity          bil_bug_severity  NOT NULL DEFAULT 'MEDIUM',
  status            bil_bug_status    NOT NULL DEFAULT 'OPEN',
  assigned_to       UUID              REFERENCES staff_members(id),
  reported_by       TEXT              REFERENCES "user"(id),
  resolved_at       TIMESTAMPTZ,
  resolution        TEXT,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_bugs_project ON billetterie_bugs(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_bugs_status  ON billetterie_bugs(status);
