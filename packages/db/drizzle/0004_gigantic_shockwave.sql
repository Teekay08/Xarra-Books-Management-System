ALTER TABLE "cost_estimation_history" DROP CONSTRAINT "cost_estimation_history_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "sow_documents" DROP CONSTRAINT "sow_documents_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "timesheets" DROP CONSTRAINT "timesheets_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "idx_milestones_project_code";--> statement-breakpoint
ALTER TABLE "cost_estimation_history" ADD CONSTRAINT "cost_estimation_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_documents" ADD CONSTRAINT "sow_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sow_versions_doc_version" ON "sow_document_versions" USING btree ("sow_document_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_milestones_project_code" ON "project_milestones" USING btree ("project_id","code");