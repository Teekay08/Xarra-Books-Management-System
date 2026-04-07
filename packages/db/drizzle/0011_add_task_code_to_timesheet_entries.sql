-- Link timesheet entries to task codes for unified category reporting
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "task_code_id" uuid;
CREATE INDEX IF NOT EXISTS "idx_timesheet_entries_task_code" ON "timesheet_entries" ("task_code_id");
