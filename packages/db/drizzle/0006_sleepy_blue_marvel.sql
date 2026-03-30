CREATE TYPE "public"."suspense_status" AS ENUM('SUSPENSE', 'CONFIRMED', 'REFUND_DUE', 'REFUNDED', 'WRITTEN_OFF');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'SUSPENSE_CONFIRMED' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'SUSPENSE_REFUND_DUE' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'SUSPENSE_DAILY_SUMMARY' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'PREDICTION_HIGH_RISK' BEFORE 'SYSTEM';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CASHFLOW_RISK_CHANGE' BEFORE 'SYSTEM';--> statement-breakpoint
CREATE TABLE "cash_flow_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"forecast_date" date NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"projected_inflows" jsonb NOT NULL,
	"projected_outflows" jsonb NOT NULL,
	"net_forecast" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sell_through_actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consignment_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"dispatch_date" date,
	"sor_expiry_date" date,
	"qty_dispatched" integer NOT NULL,
	"qty_sold" integer NOT NULL,
	"qty_returned" integer NOT NULL,
	"qty_damaged" integer DEFAULT 0 NOT NULL,
	"sell_through_pct" numeric(5, 2) NOT NULL,
	"unit_rrp" numeric(10, 2) NOT NULL,
	"discount_pct" numeric(5, 2) NOT NULL,
	"days_on_shelf" integer,
	"dispatch_month" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sell_through_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consignment_id" uuid NOT NULL,
	"consignment_line_id" uuid,
	"title_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"predicted_sell_through_pct" numeric(5, 2) NOT NULL,
	"predicted_qty_sold" integer NOT NULL,
	"predicted_qty_returned" integer NOT NULL,
	"predicted_revenue" numeric(12, 2) NOT NULL,
	"confidence_level" varchar(10) NOT NULL,
	"confidence_score" numeric(5, 4),
	"risk_level" varchar(10) NOT NULL,
	"factors" jsonb NOT NULL,
	"model_version" varchar(20) DEFAULT 'v1-rules' NOT NULL,
	"predicted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suspense_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_allocation_id" uuid,
	"invoice_id" uuid,
	"consignment_id" uuid,
	"partner_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "suspense_status" DEFAULT 'SUSPENSE' NOT NULL,
	"sor_expiry_date" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" text,
	"refund_amount" numeric(12, 2),
	"credit_note_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suspense_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_suspense" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_confirmed" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_refund_due" numeric(12, 2) DEFAULT '0' NOT NULL,
	"partner_breakdown" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suspense_snapshots_snapshot_date_unique" UNIQUE("snapshot_date")
);
--> statement-breakpoint
ALTER TABLE "sell_through_actuals" ADD CONSTRAINT "sell_through_actuals_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_through_actuals" ADD CONSTRAINT "sell_through_actuals_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_through_actuals" ADD CONSTRAINT "sell_through_actuals_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_through_predictions" ADD CONSTRAINT "sell_through_predictions_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_through_predictions" ADD CONSTRAINT "sell_through_predictions_consignment_line_id_consignment_lines_id_fk" FOREIGN KEY ("consignment_line_id") REFERENCES "public"."consignment_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_through_predictions" ADD CONSTRAINT "sell_through_predictions_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_through_predictions" ADD CONSTRAINT "sell_through_predictions_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspense_ledger" ADD CONSTRAINT "suspense_ledger_payment_allocation_id_payment_allocations_id_fk" FOREIGN KEY ("payment_allocation_id") REFERENCES "public"."payment_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspense_ledger" ADD CONSTRAINT "suspense_ledger_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspense_ledger" ADD CONSTRAINT "suspense_ledger_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspense_ledger" ADD CONSTRAINT "suspense_ledger_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspense_ledger" ADD CONSTRAINT "suspense_ledger_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cashflow_forecast_date" ON "cash_flow_forecasts" USING btree ("forecast_date");--> statement-breakpoint
CREATE INDEX "idx_actuals_partner_title" ON "sell_through_actuals" USING btree ("partner_id","title_id");--> statement-breakpoint
CREATE INDEX "idx_actuals_title" ON "sell_through_actuals" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_actuals_dispatch_month" ON "sell_through_actuals" USING btree ("dispatch_month");--> statement-breakpoint
CREATE INDEX "idx_actuals_consignment" ON "sell_through_actuals" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "idx_predictions_consignment" ON "sell_through_predictions" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "idx_predictions_title" ON "sell_through_predictions" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_predictions_partner" ON "sell_through_predictions" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_predictions_risk" ON "sell_through_predictions" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "idx_suspense_consignment" ON "suspense_ledger" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "idx_suspense_partner" ON "suspense_ledger" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_suspense_status" ON "suspense_ledger" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_suspense_expiry" ON "suspense_ledger" USING btree ("sor_expiry_date");--> statement-breakpoint
CREATE INDEX "idx_suspense_snapshots_date" ON "suspense_snapshots" USING btree ("snapshot_date");