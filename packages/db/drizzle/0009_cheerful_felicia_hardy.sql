CREATE TABLE "task_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF'::text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'FINANCE', 'PROJECT_MANAGER', 'AUTHOR', 'STAFF', 'OPERATIONS', 'EDITORIAL', 'REPORTS_ONLY');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'staff';--> statement-breakpoint
ALTER TABLE "task_assignments" ADD COLUMN "task_code_id" uuid;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD COLUMN "estimated_hours" numeric(10, 2);--> statement-breakpoint
CREATE INDEX "idx_task_codes_code" ON "task_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_task_codes_active" ON "task_codes" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_code_id_task_codes_id_fk" FOREIGN KEY ("task_code_id") REFERENCES "public"."task_codes"("id") ON DELETE no action ON UPDATE no action;