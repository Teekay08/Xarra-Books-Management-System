-- Migration 0027: Billetterie issues + issue comments
-- Idempotent: IF NOT EXISTS / DO $$ EXCEPTION guards

DO $$ BEGIN
  CREATE TYPE bil_issue_type AS ENUM ('BUG', 'FEATURE', 'IMPROVEMENT', 'QUESTION', 'TASK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_issue_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Issues table (replaces billetterie_bugs in UI; old table retained for data integrity)
CREATE TABLE IF NOT EXISTS billetterie_issues (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID              NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  issue_number        INTEGER           NOT NULL,
  title               VARCHAR(500)      NOT NULL,
  body                TEXT,
  type                bil_issue_type    NOT NULL DEFAULT 'BUG',
  severity            bil_bug_severity,
  status              bil_issue_status  NOT NULL DEFAULT 'OPEN',
  milestone_id        UUID              REFERENCES billetterie_milestones(id) ON DELETE SET NULL,
  assignees           JSONB             NOT NULL DEFAULT '[]',
  labels              JSONB             NOT NULL DEFAULT '[]',
  steps_to_reproduce  TEXT,
  linked_task_id      UUID              REFERENCES billetterie_tasks(id) ON DELETE SET NULL,
  reported_by         TEXT              REFERENCES "user"(id),
  closed_at           TIMESTAMPTZ,
  closed_by           TEXT              REFERENCES "user"(id),
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_bil_issues_project   ON billetterie_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_issues_status    ON billetterie_issues(status);
CREATE INDEX IF NOT EXISTS idx_bil_issues_milestone ON billetterie_issues(milestone_id);

-- Issue comments
CREATE TABLE IF NOT EXISTS billetterie_issue_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    UUID        NOT NULL REFERENCES billetterie_issues(id) ON DELETE CASCADE,
  author_id   TEXT        NOT NULL REFERENCES "user"(id),
  body        TEXT        NOT NULL,
  is_edited   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_issue_comments_issue ON billetterie_issue_comments(issue_id);
