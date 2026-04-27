-- Migration 0024: Billetterie project team
-- Idempotent: IF NOT EXISTS / DO $$ EXCEPTION guards

DO $$ BEGIN
  CREATE TYPE bil_team_role AS ENUM ('SPONSOR', 'PM', 'BA', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Project team members table
CREATE TABLE IF NOT EXISTS billetterie_project_team (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID          NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  staff_member_id UUID          NOT NULL REFERENCES staff_members(id),
  role            bil_team_role NOT NULL,
  added_by        TEXT          REFERENCES "user"(id),
  added_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, staff_member_id)
);

CREATE INDEX IF NOT EXISTS idx_bil_team_project ON billetterie_project_team(project_id);

-- Add manager and sponsor shortcut columns to projects
ALTER TABLE billetterie_projects ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES staff_members(id);
ALTER TABLE billetterie_projects ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES staff_members(id);
