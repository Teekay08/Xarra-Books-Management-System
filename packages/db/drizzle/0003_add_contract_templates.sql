-- Contract Templates table for storing standard terms by author type
CREATE TABLE IF NOT EXISTS "contract_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "author_type" "author_type" NOT NULL,
  "content" text NOT NULL,
  "version" varchar(50) NOT NULL DEFAULT '1.0',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_contract_templates_author_type" ON "contract_templates" USING btree ("author_type");
CREATE INDEX IF NOT EXISTS "idx_contract_templates_is_active" ON "contract_templates" USING btree ("is_active");

-- Add contract template reference and signing fields to author_contracts
ALTER TABLE "author_contracts" ADD COLUMN IF NOT EXISTS "contract_template_id" uuid REFERENCES "contract_templates"("id");
ALTER TABLE "author_contracts" ADD COLUMN IF NOT EXISTS "contract_terms_snapshot" text;
ALTER TABLE "author_contracts" ADD COLUMN IF NOT EXISTS "signed_at" timestamp with time zone;
ALTER TABLE "author_contracts" ADD COLUMN IF NOT EXISTS "signed_by_ip" varchar(50);

CREATE INDEX IF NOT EXISTS "idx_author_contracts_template_id" ON "author_contracts" USING btree ("contract_template_id");
