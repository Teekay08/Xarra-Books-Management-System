CREATE TYPE "public"."print_run_status" AS ENUM('ORDERED', 'IN_PRODUCTION', 'SHIPPED', 'RECEIVED', 'PARTIAL', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "title_print_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"print_run_number" integer DEFAULT 1 NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"token" varchar(100) NOT NULL,
	"invited_by" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "customer_po_number" varchar(50);--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "returns_auth_id" uuid;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "low_stock_threshold" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "sor_alert_days" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "exchange_rate_source" varchar(50) DEFAULT 'MANUAL';--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "email_settings" jsonb;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "document_series" jsonb;--> statement-breakpoint
ALTER TABLE "title_print_runs" ADD CONSTRAINT "title_print_runs_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_print_runs_title_id" ON "title_print_runs" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_print_runs_status" ON "title_print_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_user_invitations_email" ON "user_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_user_invitations_token" ON "user_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_user_invitations_status" ON "user_invitations" USING btree ("status");