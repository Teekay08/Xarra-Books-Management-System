-- Migration 0025: Billetterie milestones + task column enhancements
-- Idempotent: IF NOT EXISTS / DO $$ EXCEPTION guards

DO $$ BEGIN
  CREATE TYPE bil_milestone_status AS ENUM ('PENDING', 'MET', 'MISSED', 'DEFERRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Milestones table
CREATE TABLE IF NOT EXISTS billetterie_milestones (
  id          UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID                  NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  phase_key   bil_phase_key         NOT NULL,
  title       VARCHAR(255)          NOT NULL,
  description TEXT,
  due_date    VARCHAR(20),
  status      bil_milestone_status  NOT NULL DEFAULT 'PENDING',
  created_by  TEXT                  REFERENCES "user"(id),
  created_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_milestones_project ON billetterie_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_milestones_status  ON billetterie_milestones(status);

-- Extend billetterie_tasks with new columns
ALTER TABLE billetterie_tasks ADD COLUMN IF NOT EXISTS start_date     VARCHAR(20);
ALTER TABLE billetterie_tasks ADD COLUMN IF NOT EXISTS milestone_id   UUID REFERENCES billetterie_milestones(id) ON DELETE SET NULL;
ALTER TABLE billetterie_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES billetterie_tasks(id) ON DELETE CASCADE;
ALTER TABLE billetterie_tasks ADD COLUMN IF NOT EXISTS labels         JSONB NOT NULL DEFAULT '[]';
ALTER TABLE billetterie_tasks ADD COLUMN IF NOT EXISTS position       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billetterie_tasks ADD COLUMN IF NOT EXISTS story_points   INTEGER;

CREATE INDEX IF NOT EXISTS idx_bil_tasks_position ON billetterie_tasks(project_id, status, position);
