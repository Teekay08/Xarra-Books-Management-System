ALTER TABLE "titles" ADD COLUMN IF NOT EXISTS "woocommerce_product_id" integer;
CREATE INDEX IF NOT EXISTS "idx_titles_woocommerce_product_id" ON "titles"("woocommerce_product_id");
