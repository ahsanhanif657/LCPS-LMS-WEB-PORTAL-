ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employmentType" text CHECK ("employmentType" IS NULL OR "employmentType" IN ('Visiting','Permanent'));
