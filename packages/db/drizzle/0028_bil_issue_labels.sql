-- Migration 0028: Billetterie issue labels
-- Idempotent: IF NOT EXISTS / DO $$ EXCEPTION guards

CREATE TABLE IF NOT EXISTS billetterie_issue_labels (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  color       VARCHAR(7)  NOT NULL DEFAULT '#6b7280',
  description TEXT,
  created_by  TEXT        REFERENCES "user"(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_bil_labels_project ON billetterie_issue_labels(project_id);
