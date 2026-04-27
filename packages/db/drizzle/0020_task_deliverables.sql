-- ============================================================
-- 0020_task_deliverables.sql
-- Structured deliverable tracking per task.
-- Migrates legacy JSONB deliverables and drops the old column.
-- ============================================================

-- 1. New deliverable_status enum
DO $$ BEGIN
  CREATE TYPE "public"."deliverable_status" AS ENUM(
    'NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. New notification enum values
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'DELIVERABLE_SUBMITTED'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'DELIVERABLE_APPROVED';  EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'DELIVERABLE_REJECTED';  EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "notification_type" ADD VALUE 'PROJECT_READY_TO_CLOSE'; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Create task_deliverables table
CREATE TABLE IF NOT EXISTS "task_deliverables" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_assignment_id"   uuid NOT NULL,
  "title"                varchar(255) NOT NULL,
  "description"          text,
  "estimated_hours"      numeric(10, 2),
  "status"               "deliverable_status" DEFAULT 'NOT_STARTED' NOT NULL,
  "sort_order"           integer DEFAULT 0 NOT NULL,
  "rejection_reason"     text,
  "reviewed_by"          text,
  "reviewed_at"          timestamp with time zone,
  "submitted_at"         timestamp with time zone,
  "created_by"           text,
  "created_at"           timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"           timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. FKs for task_deliverables
DO $$ BEGIN
  ALTER TABLE "task_deliverables" ADD CONSTRAINT "task_deliverables_task_fk"
    FOREIGN KEY ("task_assignment_id") REFERENCES "task_assignments"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "task_deliverables" ADD CONSTRAINT "task_deliverables_reviewed_by_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "task_deliverables" ADD CONSTRAINT "task_deliverables_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 5. Indexes for task_deliverables
CREATE INDEX IF NOT EXISTS "idx_deliverables_task"   ON "task_deliverables" ("task_assignment_id");
CREATE INDEX IF NOT EXISTS "idx_deliverables_status" ON "task_deliverables" ("status");

-- 6. Create deliverable_logs table
CREATE TABLE IF NOT EXISTS "deliverable_logs" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deliverable_id"      uuid NOT NULL,
  "task_assignment_id"  uuid NOT NULL,
  "staff_member_id"     uuid NOT NULL,
  "work_date"           date NOT NULL,
  "hours"               numeric(5, 2) NOT NULL,
  "description"         text NOT NULL,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. FKs for deliverable_logs
DO $$ BEGIN
  ALTER TABLE "deliverable_logs" ADD CONSTRAINT "deliverable_logs_deliverable_fk"
    FOREIGN KEY ("deliverable_id") REFERENCES "task_deliverables"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "deliverable_logs" ADD CONSTRAINT "deliverable_logs_task_fk"
    FOREIGN KEY ("task_assignment_id") REFERENCES "task_assignments"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "deliverable_logs" ADD CONSTRAINT "deliverable_logs_staff_fk"
    FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 8. Indexes for deliverable_logs
CREATE INDEX IF NOT EXISTS "idx_del_logs_deliverable" ON "deliverable_logs" ("deliverable_id");
CREATE INDEX IF NOT EXISTS "idx_del_logs_task"        ON "deliverable_logs" ("task_assignment_id");
CREATE INDEX IF NOT EXISTS "idx_del_logs_staff"       ON "deliverable_logs" ("staff_member_id");
CREATE INDEX IF NOT EXISTS "idx_del_logs_date"        ON "deliverable_logs" ("work_date");

-- 9. Migrate existing JSONB deliverables → task_deliverables rows (guarded)
DO $$
DECLARE col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_assignments' AND column_name = 'deliverables'
  ) INTO col_exists;

  IF col_exists THEN
    INSERT INTO task_deliverables (
      task_assignment_id, title, status, sort_order, created_by, created_at, updated_at
    )
    SELECT
      ta.id,
      COALESCE(d->>'description', 'Deliverable'),
      CASE WHEN (d->>'completed')::boolean THEN 'APPROVED'::deliverable_status
           ELSE 'NOT_STARTED'::deliverable_status END,
      (ROW_NUMBER() OVER (PARTITION BY ta.id ORDER BY ordinality))::int - 1,
      ta.assigned_by,
      ta.created_at,
      now()
    FROM task_assignments ta,
         jsonb_array_elements(COALESCE(ta.deliverables, '[]'::jsonb))
           WITH ORDINALITY AS d(d, ordinality)
    WHERE jsonb_array_length(COALESCE(ta.deliverables, '[]'::jsonb)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM task_deliverables td WHERE td.task_assignment_id = ta.id
      );
  END IF;
END $$;

-- 10. Drop the JSONB column (guarded)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_assignments' AND column_name = 'deliverables'
  ) THEN
    ALTER TABLE "task_assignments" DROP COLUMN "deliverables";
  END IF;
END $$;
