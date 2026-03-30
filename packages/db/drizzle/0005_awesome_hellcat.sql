CREATE TABLE "notification_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_type" varchar(20) NOT NULL,
	"recipient_id" text NOT NULL,
	"notification_id" uuid,
	"partner_notification_id" uuid,
	"digest_frequency" varchar(20) NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid,
	"partner_notification_id" uuid,
	"recipient_email" varchar(255) NOT NULL,
	"recipient_type" varchar(20) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'QUEUED' NOT NULL,
	"resend_email_id" varchar(100),
	"error_message" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_email_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"preferences" jsonb DEFAULT '{}' NOT NULL,
	"digest_frequency" varchar(20) DEFAULT 'IMMEDIATE' NOT NULL,
	"daily_digest_hour" integer DEFAULT 7 NOT NULL,
	"weekly_digest_day" integer DEFAULT 1 NOT NULL,
	"unsubscribe_token" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_email_preferences_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "notification_email_preferences_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30) NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" text,
	"changed_by_partner_user_id" uuid,
	"source" varchar(20) DEFAULT 'MANUAL' NOT NULL,
	"notes" text,
	"courier_status" varchar(30),
	"courier_location" varchar(255),
	"courier_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_document_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"document_id" uuid NOT NULL,
	"delivery_method" varchar(20) NOT NULL,
	"recipient_email" varchar(255),
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(100) NOT NULL,
	"partner_id" uuid NOT NULL,
	"partner_user_id" uuid,
	"purpose" varchar(30) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_magic_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "partner_notification_email_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_user_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"preferences" jsonb DEFAULT '{}' NOT NULL,
	"unsubscribe_token" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_notification_email_preferences_partner_user_id_unique" UNIQUE("partner_user_id"),
	CONSTRAINT "partner_notification_email_preferences_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "partner_onboarding_funnel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"stage" varchar(30) DEFAULT 'UNAWARE' NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"magic_links_clicked" integer DEFAULT 0 NOT NULL,
	"portal_logins" integer DEFAULT 0 NOT NULL,
	"portal_orders_placed" integer DEFAULT 0 NOT NULL,
	"last_magic_link_click_at" timestamp with time zone,
	"last_portal_login_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_onboarding_funnel_partner_id_unique" UNIQUE("partner_id")
);
--> statement-breakpoint
CREATE TABLE "partner_uploaded_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_url" varchar(500) NOT NULL,
	"file_size_bytes" integer,
	"mime_type" varchar(50),
	"linked_entity_type" varchar(30),
	"linked_entity_id" uuid,
	"processing_status" varchar(20) DEFAULT 'UPLOADED' NOT NULL,
	"parsed_data" jsonb,
	"uploaded_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_partners" ADD COLUMN "portal_mode" varchar(20) DEFAULT 'SELF_SERVICE' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_partners" ADD COLUMN "statement_delivery" varchar(20) DEFAULT 'PORTAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_partners" ADD COLUMN "invoice_delivery" varchar(20) DEFAULT 'PORTAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_partners" ADD COLUMN "finance_contact_email" varchar(255);--> statement-breakpoint
ALTER TABLE "channel_partners" ADD COLUMN "order_contact_email" varchar(255);--> statement-breakpoint
ALTER TABLE "channel_partners" ADD COLUMN "auto_send_invoices" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_partners" ADD COLUMN "auto_send_statements" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "source" varchar(20) DEFAULT 'PORTAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "entered_by_id" text;--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "original_po_doc_url" varchar(500);--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "magic_link_token" varchar(100);--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "picking_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "packing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partner_orders" ADD COLUMN "current_pipeline_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_partner_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."partner_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_partner_user_id_partner_users_id_fk" FOREIGN KEY ("changed_by_partner_user_id") REFERENCES "public"."partner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_document_deliveries" ADD CONSTRAINT "partner_document_deliveries_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_magic_links" ADD CONSTRAINT "partner_magic_links_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_magic_links" ADD CONSTRAINT "partner_magic_links_partner_user_id_partner_users_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."partner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_notification_email_preferences" ADD CONSTRAINT "partner_notification_email_preferences_partner_user_id_partner_users_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."partner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_notification_email_preferences" ADD CONSTRAINT "partner_notification_email_preferences_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_onboarding_funnel" ADD CONSTRAINT "partner_onboarding_funnel_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_uploaded_documents" ADD CONSTRAINT "partner_uploaded_documents_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notif_digests_schedule" ON "notification_digests" USING btree ("digest_frequency","scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_notif_digests_recipient" ON "notification_digests" USING btree ("recipient_type","recipient_id");--> statement-breakpoint
CREATE INDEX "idx_notif_email_log_notification" ON "notification_email_log" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "idx_notif_email_log_partner_notif" ON "notification_email_log" USING btree ("partner_notification_id");--> statement-breakpoint
CREATE INDEX "idx_notif_email_log_status" ON "notification_email_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notif_prefs_user" ON "notification_email_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_order_status_history_order" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_status_history_order_date" ON "order_status_history" USING btree ("order_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_order_status_history_status" ON "order_status_history" USING btree ("to_status");--> statement-breakpoint
CREATE INDEX "idx_doc_deliveries_partner" ON "partner_document_deliveries" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_doc_deliveries_status" ON "partner_document_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_doc_deliveries_doc" ON "partner_document_deliveries" USING btree ("document_type","document_id");--> statement-breakpoint
CREATE INDEX "idx_magic_links_partner" ON "partner_magic_links" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_magic_links_expires" ON "partner_magic_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_partner_notif_prefs_user" ON "partner_notification_email_preferences" USING btree ("partner_user_id");--> statement-breakpoint
CREATE INDEX "idx_partner_notif_prefs_partner" ON "partner_notification_email_preferences" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_onboarding_partner" ON "partner_onboarding_funnel" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_onboarding_stage" ON "partner_onboarding_funnel" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_uploaded_docs_partner" ON "partner_uploaded_documents" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_uploaded_docs_type" ON "partner_uploaded_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "idx_uploaded_docs_linked" ON "partner_uploaded_documents" USING btree ("linked_entity_type","linked_entity_id");--> statement-breakpoint
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_magic_link_token_unique" UNIQUE("magic_link_token");