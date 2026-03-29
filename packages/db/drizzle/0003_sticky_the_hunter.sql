CREATE TYPE "public"."credit_note_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('TRADITIONAL', 'HYBRID');--> statement-breakpoint
CREATE TYPE "public"."cost_classification" AS ENUM('PUBLISHING', 'OPERATIONAL', 'LAUNCH', 'MARKETING');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('PLANNING', 'BUDGETED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('NEW_TITLE', 'REPRINT', 'REVISED_EDITION', 'TRANSLATION', 'ANTHOLOGY', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."rate_card_type" AS ENUM('INTERNAL', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('INTERNAL', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "public"."sow_status" AS ENUM('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."timesheet_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'PROJECT_CREATED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'PROJECT_BUDGET_APPROVED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'PROJECT_OVER_BUDGET' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'TIMESHEET_SUBMITTED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'TIMESHEET_APPROVED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'TIMESHEET_REJECTED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'SOW_SENT' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'SOW_ACCEPTED' BEFORE 'SYSTEM';--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"author_type" "author_type" NOT NULL,
	"content" text NOT NULL,
	"version" varchar(50) DEFAULT '1.0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"title_id" uuid,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"line_tax" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actual_cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"budget_line_item_id" uuid,
	"category" varchar(50) NOT NULL,
	"cost_classification" "cost_classification" DEFAULT 'PUBLISHING' NOT NULL,
	"custom_category" varchar(100),
	"description" varchar(500) NOT NULL,
	"source_type" "source_type" DEFAULT 'INTERNAL' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"vendor" varchar(255),
	"invoice_ref" varchar(100),
	"paid_date" timestamp with time zone,
	"receipt_url" varchar(500),
	"staff_user_id" text,
	"contractor_id" uuid,
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" text,
	"idempotency_key" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actual_cost_entries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "budget_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"category" varchar(50) NOT NULL,
	"cost_classification" "cost_classification" DEFAULT 'PUBLISHING' NOT NULL,
	"custom_category" varchar(100),
	"description" varchar(500) NOT NULL,
	"source_type" "source_type" DEFAULT 'INTERNAL' NOT NULL,
	"estimated_hours" numeric(10, 2),
	"hourly_rate" numeric(10, 2),
	"estimated_amount" numeric(12, 2) NOT NULL,
	"rate_card_id" uuid,
	"staff_user_id" text,
	"contractor_id" uuid,
	"external_quote" numeric(12, 2),
	"notes" text,
	"created_by" text,
	"idempotency_key" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_line_items_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "cost_estimation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_code" varchar(50) NOT NULL,
	"task_category" varchar(50) NOT NULL,
	"page_count" integer,
	"word_count" integer,
	"complexity_score" integer,
	"estimated_hours" numeric(10, 2),
	"actual_hours" numeric(10, 2),
	"estimated_cost" numeric(12, 2),
	"actual_cost" numeric(12, 2),
	"source_type" "source_type",
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "milestone_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"planned_start_date" timestamp with time zone,
	"planned_end_date" timestamp with time zone,
	"actual_start_date" timestamp with time zone,
	"actual_end_date" timestamp with time zone,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"title_id" uuid,
	"author_id" uuid,
	"project_manager" text,
	"project_type" "project_type" DEFAULT 'NEW_TITLE' NOT NULL,
	"contract_type" "contract_type" DEFAULT 'TRADITIONAL' NOT NULL,
	"author_contribution" numeric(12, 2) DEFAULT '0',
	"status" "project_status" DEFAULT 'PLANNING' NOT NULL,
	"description" text,
	"start_date" timestamp with time zone,
	"target_completion_date" timestamp with time zone,
	"actual_completion_date" timestamp with time zone,
	"total_budget" numeric(12, 2) DEFAULT '0',
	"total_actual" numeric(12, 2) DEFAULT '0',
	"currency" varchar(3) DEFAULT 'ZAR' NOT NULL,
	"notes" text,
	"created_by" text,
	"idempotency_key" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_number_unique" UNIQUE("number"),
	CONSTRAINT "projects_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "rate_card_type" NOT NULL,
	"role" varchar(100) NOT NULL,
	"hourly_rate_zar" numeric(10, 2) NOT NULL,
	"daily_rate_zar" numeric(10, 2),
	"staff_user_id" text,
	"supplier_id" uuid,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"currency" varchar(3) DEFAULT 'ZAR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sow_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sow_document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"changed_by" text,
	"change_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sow_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"project_id" uuid NOT NULL,
	"contractor_id" uuid,
	"staff_user_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "sow_status" DEFAULT 'DRAFT' NOT NULL,
	"scope" text NOT NULL,
	"deliverables" jsonb NOT NULL,
	"timeline" jsonb NOT NULL,
	"cost_breakdown" jsonb NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"terms" text,
	"valid_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"sent_to" varchar(255),
	"accepted_at" timestamp with time zone,
	"pdf_url" varchar(500),
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sow_documents_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "timesheet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timesheet_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"budget_line_item_id" uuid,
	"work_date" timestamp with time zone NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"description" varchar(500) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"status" timesheet_status DEFAULT 'DRAFT' NOT NULL,
	"total_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timesheets_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "author_contracts" ADD COLUMN "contract_template_id" uuid;--> statement-breakpoint
ALTER TABLE "author_contracts" ADD COLUMN "contract_terms_snapshot" text;--> statement-breakpoint
ALTER TABLE "author_contracts" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "author_contracts" ADD COLUMN "signed_by_ip" varchar(50);--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "delivery_condition" varchar(20);--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "delivery_notes" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "status" "credit_note_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "sent_to" varchar(255);--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "minimum_order_qty" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_cost_entries" ADD CONSTRAINT "actual_cost_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_cost_entries" ADD CONSTRAINT "actual_cost_entries_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_cost_entries" ADD CONSTRAINT "actual_cost_entries_budget_line_item_id_budget_line_items_id_fk" FOREIGN KEY ("budget_line_item_id") REFERENCES "public"."budget_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_cost_entries" ADD CONSTRAINT "actual_cost_entries_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_cost_entries" ADD CONSTRAINT "actual_cost_entries_contractor_id_suppliers_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_cost_entries" ADD CONSTRAINT "actual_cost_entries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_rate_card_id_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_contractor_id_suppliers_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_estimation_history" ADD CONSTRAINT "cost_estimation_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_user_id_fk" FOREIGN KEY ("project_manager") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_document_versions" ADD CONSTRAINT "sow_document_versions_sow_document_id_sow_documents_id_fk" FOREIGN KEY ("sow_document_id") REFERENCES "public"."sow_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_document_versions" ADD CONSTRAINT "sow_document_versions_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_documents" ADD CONSTRAINT "sow_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_documents" ADD CONSTRAINT "sow_documents_contractor_id_suppliers_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_documents" ADD CONSTRAINT "sow_documents_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_documents" ADD CONSTRAINT "sow_documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_budget_line_item_id_budget_line_items_id_fk" FOREIGN KEY ("budget_line_item_id") REFERENCES "public"."budget_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contract_templates_author_type" ON "contract_templates" USING btree ("author_type");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_is_active" ON "contract_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_credit_note_lines_credit_note_id" ON "credit_note_lines" USING btree ("credit_note_id");--> statement-breakpoint
CREATE INDEX "idx_actual_costs_project_id" ON "actual_cost_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_actual_costs_milestone_id" ON "actual_cost_entries" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "idx_actual_costs_budget_line_id" ON "actual_cost_entries" USING btree ("budget_line_item_id");--> statement-breakpoint
CREATE INDEX "idx_budget_lines_project_id" ON "budget_line_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_budget_lines_milestone_id" ON "budget_line_items" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "idx_budget_lines_classification" ON "budget_line_items" USING btree ("cost_classification");--> statement-breakpoint
CREATE INDEX "idx_estimation_history_milestone" ON "cost_estimation_history" USING btree ("milestone_code","task_category");--> statement-breakpoint
CREATE INDEX "idx_estimation_history_project" ON "cost_estimation_history" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_milestones_project_id" ON "project_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_milestones_project_code" ON "project_milestones" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "idx_projects_title_id" ON "projects" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_projects_author_id" ON "projects" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_projects_status" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_projects_project_type" ON "projects" USING btree ("project_type");--> statement-breakpoint
CREATE INDEX "idx_rate_cards_type" ON "rate_cards" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_rate_cards_role" ON "rate_cards" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_rate_cards_active" ON "rate_cards" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_sow_versions_document_id" ON "sow_document_versions" USING btree ("sow_document_id");--> statement-breakpoint
CREATE INDEX "idx_sow_documents_project_id" ON "sow_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_sow_documents_contractor_id" ON "sow_documents" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_sow_documents_status" ON "sow_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_timesheet_entries_timesheet_id" ON "timesheet_entries" USING btree ("timesheet_id");--> statement-breakpoint
CREATE INDEX "idx_timesheet_entries_milestone_id" ON "timesheet_entries" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "idx_timesheet_entries_work_date" ON "timesheet_entries" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "idx_timesheets_project_id" ON "timesheets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_timesheets_user_id" ON "timesheets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_timesheets_status" ON "timesheets" USING btree ("status");--> statement-breakpoint
ALTER TABLE "author_contracts" ADD CONSTRAINT "author_contracts_contract_template_id_contract_templates_id_fk" FOREIGN KEY ("contract_template_id") REFERENCES "public"."contract_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_author_contracts_template_id" ON "author_contracts" USING btree ("contract_template_id");--> statement-breakpoint
CREATE INDEX "idx_credit_notes_status" ON "credit_notes" USING btree ("status");