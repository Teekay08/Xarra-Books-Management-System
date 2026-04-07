CREATE TABLE "staff_task_planner_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"task_assignment_id" uuid NOT NULL,
	"planned_date" timestamp with time zone NOT NULL,
	"slot_start" timestamp with time zone,
	"slot_end" timestamp with time zone,
	"planned_hours" numeric(5, 2),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_task_planner_entries" ADD CONSTRAINT "staff_task_planner_entries_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_task_planner_entries" ADD CONSTRAINT "staff_task_planner_entries_task_assignment_id_task_assignments_id_fk" FOREIGN KEY ("task_assignment_id") REFERENCES "public"."task_assignments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_staff_planner_staff_date" ON "staff_task_planner_entries" USING btree ("staff_member_id","planned_date");
--> statement-breakpoint
CREATE INDEX "idx_staff_planner_task" ON "staff_task_planner_entries" USING btree ("task_assignment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_staff_planner_staff_task_day" ON "staff_task_planner_entries" USING btree ("staff_member_id","task_assignment_id","planned_date");
