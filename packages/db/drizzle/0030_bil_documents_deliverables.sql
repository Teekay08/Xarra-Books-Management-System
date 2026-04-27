-- Migration 0030: Billetterie project documents + phase deliverables
-- Idempotent: IF NOT EXISTS guards throughout

-- ─── Deliverable status enum ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE bil_deliverable_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Phase deliverables ───────────────────────────────────────────────────────
-- Tracks discrete work items that MUST be completed before a phase can advance.
-- Pre-seeded per project on creation; additional ones can be added by PM/BA.
CREATE TABLE IF NOT EXISTS billetterie_phase_deliverables (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID         NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  phase_key    bil_phase_key NOT NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  status       bil_deliverable_status NOT NULL DEFAULT 'PENDING',
  assigned_to  UUID         REFERENCES staff_members(id),
  due_date     VARCHAR(20),
  is_required  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by   TEXT         REFERENCES "user"(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_deliverables_project ON billetterie_phase_deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_deliverables_phase   ON billetterie_phase_deliverables(project_id, phase_key);
CREATE INDEX IF NOT EXISTS idx_bil_deliverables_status  ON billetterie_phase_deliverables(status);

-- ─── Project documents ────────────────────────────────────────────────────────
-- Stores uploaded files (S3 key in prod, local path in dev).
-- A document can be linked to a specific phase and optionally to a deliverable.
CREATE TABLE IF NOT EXISTS billetterie_project_documents (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID         NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  phase_key       bil_phase_key,              -- NULL = project-level document
  deliverable_id  UUID         REFERENCES billetterie_phase_deliverables(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,      -- display name
  file_key        VARCHAR(500) NOT NULL,      -- S3 object key or local disk path
  file_name       VARCHAR(255) NOT NULL,      -- original filename from upload
  file_size       INTEGER      NOT NULL,      -- bytes
  mime_type       VARCHAR(100) NOT NULL,
  uploaded_by     TEXT         REFERENCES "user"(id),
  uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_docs_project   ON billetterie_project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_docs_phase     ON billetterie_project_documents(project_id, phase_key);
CREATE INDEX IF NOT EXISTS idx_bil_docs_deliverable ON billetterie_project_documents(deliverable_id);
