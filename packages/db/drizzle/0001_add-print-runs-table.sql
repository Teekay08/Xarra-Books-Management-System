CREATE TYPE "public"."print_run_status" AS ENUM('ORDERED', 'IN_PRODUCTION', 'SHIPPED', 'RECEIVED', 'PARTIAL', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "title_print_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"number" varchar(50) NOT NULL,
	"printer_name" varchar(255) NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"total_cost" numeric(12, 2) NOT NULL,
	"expected_delivery_date" timestamp with time zone,
	"status" "print_run_status" DEFAULT 'ORDERED' NOT NULL,
	"quantity_received" integer,
	"received_at" timestamp with time zone,
	"received_by" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_print_runs_number_unique" UNIQUE("number")
);--> statement-breakpoint
ALTER TABLE "title_print_runs" ADD CONSTRAINT "title_print_runs_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_print_runs_title_id" ON "title_print_runs" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_print_runs_status" ON "title_print_runs" USING btree ("status");
