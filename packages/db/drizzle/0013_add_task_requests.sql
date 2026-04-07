-- Task Requests: staff/contractors can ask PM to add a task; PM approves/rejects.
DO $$ BEGIN
  CREATE TYPE "public"."task_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "task_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "requested_by_staff_id" uuid NOT NULL,
  "linked_task_id" uuid,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "justification" text NOT NULL,
  "estimated_hours" numeric(10, 2) NOT NULL,
  "status" "task_request_status" DEFAULT 'PENDING' NOT NULL,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "review_notes" text,
  "created_task_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_requested_by_staff_id_staff_members_id_fk"
    FOREIGN KEY ("requested_by_staff_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_linked_task_id_task_assignments_id_fk"
    FOREIGN KEY ("linked_task_id") REFERENCES "public"."task_assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_created_task_id_task_assignments_id_fk"
    FOREIGN KEY ("created_task_id") REFERENCES "public"."task_assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "idx_task_requests_project" ON "task_requests" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_task_requests_staff" ON "task_requests" ("requested_by_staff_id");
CREATE INDEX IF NOT EXISTS "idx_task_requests_status" ON "task_requests" ("status");
