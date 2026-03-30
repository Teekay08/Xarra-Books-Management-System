CREATE TYPE "public"."staff_availability_type" AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT');--> statement-breakpoint
CREATE TYPE "public"."staff_payment_status" AS ENUM('PENDING', 'APPROVED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."task_assignment_status" AS ENUM('DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."time_extension_status" AS ENUM('PENDING', 'APPROVED', 'DECLINED');--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"role" varchar(100) NOT NULL,
	"skills" jsonb DEFAULT '[]' NOT NULL,
	"availability_type" "staff_availability_type" DEFAULT 'FULL_TIME' NOT NULL,
	"max_hours_per_week" integer DEFAULT 40 NOT NULL,
	"hourly_rate" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'ZAR' NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"project_id" uuid,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"total_hours" numeric(10, 2) NOT NULL,
	"hourly_rate" numeric(10, 2) NOT NULL,
	"gross_amount" numeric(12, 2) NOT NULL,
	"status" "staff_payment_status" DEFAULT 'PENDING' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_reference" varchar(100),
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_project_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role" varchar(100) NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"total_allocated_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_logged_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"staff_member_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "task_assignment_status" DEFAULT 'DRAFT' NOT NULL,
	"priority" varchar(10) DEFAULT 'MEDIUM' NOT NULL,
	"allocated_hours" numeric(10, 2) NOT NULL,
	"logged_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"remaining_hours" numeric(10, 2) NOT NULL,
	"hourly_rate" numeric(10, 2) NOT NULL,
	"total_cost" numeric(12, 2) NOT NULL,
	"start_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"sow_document_id" uuid,
	"deliverables" jsonb DEFAULT '[]',
	"assigned_by" text,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"time_exhausted" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignments_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "task_time_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_assignment_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"work_date" timestamp with time zone NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"description" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'LOGGED' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_extension_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_assignment_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"requested_hours" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" time_extension_status DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_payments" ADD CONSTRAINT "staff_payments_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_payments" ADD CONSTRAINT "staff_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_project_assignments" ADD CONSTRAINT "staff_project_assignments_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_project_assignments" ADD CONSTRAINT "staff_project_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_task_assignment_id_task_assignments_id_fk" FOREIGN KEY ("task_assignment_id") REFERENCES "public"."task_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_extension_requests" ADD CONSTRAINT "time_extension_requests_task_assignment_id_task_assignments_id_fk" FOREIGN KEY ("task_assignment_id") REFERENCES "public"."task_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_extension_requests" ADD CONSTRAINT "time_extension_requests_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_staff_user_id" ON "staff_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_staff_email" ON "staff_members" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_staff_role" ON "staff_members" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_staff_active" ON "staff_members" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_staff_payments_staff" ON "staff_payments" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "idx_staff_payments_project" ON "staff_payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_staff_payments_status" ON "staff_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_staff_project_staff" ON "staff_project_assignments" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "idx_staff_project_project" ON "staff_project_assignments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_staff_project_active" ON "staff_project_assignments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_task_assign_project" ON "task_assignments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_task_assign_milestone" ON "task_assignments" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "idx_task_assign_staff" ON "task_assignments" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "idx_task_assign_status" ON "task_assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_time_logs_task" ON "task_time_logs" USING btree ("task_assignment_id");--> statement-breakpoint
CREATE INDEX "idx_time_logs_staff" ON "task_time_logs" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "idx_time_logs_date" ON "task_time_logs" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "idx_time_logs_status" ON "task_time_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ext_requests_task" ON "time_extension_requests" USING btree ("task_assignment_id");--> statement-breakpoint
CREATE INDEX "idx_ext_requests_staff" ON "time_extension_requests" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "idx_ext_requests_status" ON "time_extension_requests" USING btree ("status");