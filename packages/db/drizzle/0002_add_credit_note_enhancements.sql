-- Add credit note status enum
CREATE TYPE "public"."credit_note_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'VOIDED');--> statement-breakpoint

-- Add status and review workflow columns to credit_notes
ALTER TABLE "credit_notes" ADD COLUMN "status" "credit_note_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "sent_to" varchar(255);--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- Create index on status
CREATE INDEX "idx_credit_notes_status" ON "credit_notes" USING btree ("status");--> statement-breakpoint

-- Create credit_note_lines table
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
);--> statement-breakpoint

-- Add foreign keys
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Create index on credit_note_id for performance
CREATE INDEX "idx_credit_note_lines_credit_note_id" ON "credit_note_lines" USING btree ("credit_note_id");--> statement-breakpoint

-- Update existing credit notes to APPROVED status (they were auto-generated and already in use)
UPDATE "credit_notes" SET "status" = 'APPROVED', "approved_at" = "created_at", "approved_by" = "created_by" WHERE "status" = 'DRAFT';
