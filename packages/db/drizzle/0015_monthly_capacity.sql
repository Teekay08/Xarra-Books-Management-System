-- Switch staff capacity from weekly to monthly.
-- Convert existing weekly values: monthly ≈ weekly × 4.
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "max_hours_per_month" integer;
UPDATE "staff_members" SET "max_hours_per_month" = COALESCE("max_hours_per_week", 40) * 4
  WHERE "max_hours_per_month" IS NULL;
ALTER TABLE "staff_members" ALTER COLUMN "max_hours_per_month" SET NOT NULL;
ALTER TABLE "staff_members" ALTER COLUMN "max_hours_per_month" SET DEFAULT 160;
ALTER TABLE "staff_members" DROP COLUMN IF EXISTS "max_hours_per_week";
