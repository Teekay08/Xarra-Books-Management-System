-- Link timesheet entries back to the task assignment + task time log they came from.
-- Allows generating timesheets directly from approved task time logs.
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "task_assignment_id" uuid;
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "task_time_log_id" uuid;
CREATE INDEX IF NOT EXISTS "idx_timesheet_entries_task_assignment" ON "timesheet_entries" ("task_assignment_id");
CREATE INDEX IF NOT EXISTS "idx_timesheet_entries_task_time_log" ON "timesheet_entries" ("task_time_log_id");
