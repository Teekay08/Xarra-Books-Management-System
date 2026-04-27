-- Migration 0026: Billetterie time logs
-- Idempotent: IF NOT EXISTS / DO $$ EXCEPTION guards

DO $$ BEGIN
  CREATE TYPE bil_time_log_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS billetterie_time_logs (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID                  NOT NULL REFERENCES billetterie_tasks(id) ON DELETE CASCADE,
  staff_member_id UUID                  NOT NULL REFERENCES staff_members(id),
  work_date       DATE                  NOT NULL,
  hours           DECIMAL(5,2)          NOT NULL CHECK (hours > 0 AND hours <= 24),
  description     TEXT,
  status          bil_time_log_status   NOT NULL DEFAULT 'DRAFT',
  approved_by     TEXT                  REFERENCES "user"(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_timelogs_task       ON billetterie_time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_bil_timelogs_staff_date ON billetterie_time_logs(staff_member_id, work_date);
CREATE INDEX IF NOT EXISTS idx_bil_timelogs_status     ON billetterie_time_logs(status);
