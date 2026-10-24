-- Multi-country medicine catalog: structured composition keys, ATC classification, provenance,
-- data-source registry. Idempotent — re-applied on every deploy (see IDEMPOTENT).

ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "dosageFormDetail" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "route" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "atcCode" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "therapeuticClass" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "ingredientKey" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "compositionKey" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "dataSource" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "sourceRetrievedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Medicine_ingredientKey_idx" ON "Medicine" ("ingredientKey");
CREATE INDEX IF NOT EXISTS "Medicine_compositionKey_idx" ON "Medicine" ("compositionKey");
CREATE INDEX IF NOT EXISTS "Medicine_atcCode_idx" ON "Medicine" ("atcCode");
CREATE UNIQUE INDEX IF NOT EXISTS "Medicine_dataSource_sourceRef_key" ON "Medicine" ("dataSource", "sourceRef");

ALTER TABLE "MedicineComposition" ADD COLUMN IF NOT EXISTS "salt" TEXT;

-- Oral, topical and nebuliser solutions were previously forced into SYRUP / OTHER.
ALTER TYPE "DosageForm" ADD VALUE IF NOT EXISTS 'SOLUTION';

CREATE TABLE IF NOT EXISTS "MedicineDataSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "publisher" TEXT NOT NULL,
  "country" TEXT,
  "url" TEXT NOT NULL,
  "license" TEXT NOT NULL,
  "licenseUrl" TEXT,
  "attribution" TEXT NOT NULL,
  "version" TEXT,
  "retrievedAt" TIMESTAMP(3),
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicineDataSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IngredientClass" (
  "ingredientKey" TEXT NOT NULL,
  "atcCode" TEXT NOT NULL,
  "className" TEXT,
  "source" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IngredientClass_pkey" PRIMARY KEY ("ingredientKey")
);
CREATE INDEX IF NOT EXISTS "IngredientClass_atcCode_idx" ON "IngredientClass" ("atcCode");

-- The ten Indian rows seeded as demo data were never checked against a register, and some brand /
-- manufacturer pairs conflict. Label them honestly (only rows still unlabelled are touched).
UPDATE "Medicine" SET "dataSource" = 'DEMO_SEED', "isVerified" = false
WHERE "dataSource" IS NULL AND "ownerTenantId" IS NULL AND "country" = 'IN'
  AND "name" IN ('Dolo 650', 'Crocin 500', 'Azithral 500', 'Pantop 40', 'Asthalin Inhaler', 'Metformin 500',
                 'Amoxicillin 500', 'Atorvastatin 10', 'Azithromycin 500', 'Pan-D 40');
-- Rows tenants created themselves are manual entries.
UPDATE "Medicine" SET "dataSource" = 'MANUAL' WHERE "dataSource" IS NULL AND "ownerTenantId" IS NOT NULL;
