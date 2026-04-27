-- Migration 0032: Allow time logs to be linked to phase deliverables (not just tasks)
-- Makes task_id nullable so a time entry can belong to either a task or a deliverable.

-- Drop NOT NULL constraint on task_id
ALTER TABLE billetterie_time_logs ALTER COLUMN task_id DROP NOT NULL;

-- Add optional deliverable link
ALTER TABLE billetterie_time_logs
  ADD COLUMN IF NOT EXISTS deliverable_id UUID
  REFERENCES billetterie_phase_deliverables(id) ON DELETE CASCADE;

-- Enforce that every time log is attached to at least one entity
ALTER TABLE billetterie_time_logs
  ADD CONSTRAINT bil_time_log_entity_check
  CHECK (task_id IS NOT NULL OR deliverable_id IS NOT NULL);

-- Index for deliverable-based queries
CREATE INDEX IF NOT EXISTS idx_bil_timelogs_deliverable
  ON billetterie_time_logs(deliverable_id);
