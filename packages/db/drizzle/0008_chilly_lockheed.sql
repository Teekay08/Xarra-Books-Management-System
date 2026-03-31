CREATE TABLE "contractor_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(100) NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_access_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "contractor_access_tokens" ADD CONSTRAINT "contractor_access_tokens_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_access_tokens" ADD CONSTRAINT "contractor_access_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contractor_tokens_token" ON "contractor_access_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_contractor_tokens_staff" ON "contractor_access_tokens" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "idx_contractor_tokens_expires" ON "contractor_access_tokens" USING btree ("expires_at");