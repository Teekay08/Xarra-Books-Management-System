-- Span model for staff planner entries: a single entry can cover multiple days.
-- planned_date stays as the span start; new end_date column is the inclusive end (null = single day).
ALTER TABLE "staff_task_planner_entries" ADD COLUMN IF NOT EXISTS "end_date" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "idx_staff_planner_end_date" ON "staff_task_planner_entries" ("end_date");
