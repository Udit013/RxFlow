-- ───────────────────────────────────────────────────────────────────────────
-- Stock take, negative-stock toggle, user invite enhancements
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Tenant flag — allow negative stock (let pharmacies sell before stocking)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false;

-- 2) StockTake header
DO $$ BEGIN
  CREATE TYPE "StockTakeStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockTake" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "StockTakeStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "completedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockTake_tenantId_code_key" ON "StockTake"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "StockTake_tenantId_idx" ON "StockTake"("tenantId");
CREATE INDEX IF NOT EXISTS "StockTake_storeId_idx" ON "StockTake"("storeId");
CREATE INDEX IF NOT EXISTS "StockTake_status_idx" ON "StockTake"("status");

DO $$ BEGIN
  ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) StockTakeLine — one row per (medicine, batch?) snapshot
CREATE TABLE IF NOT EXISTS "StockTakeLine" (
  "id" TEXT NOT NULL,
  "stockTakeId" TEXT NOT NULL,
  "medicineId" TEXT NOT NULL,
  "batchId" TEXT,
  "systemQty" INTEGER NOT NULL,
  "actualQty" INTEGER,
  "variance" INTEGER,
  "notes" TEXT,
  "countedAt" TIMESTAMP(3),
  CONSTRAINT "StockTakeLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockTakeLine_stockTakeId_idx" ON "StockTakeLine"("stockTakeId");
CREATE INDEX IF NOT EXISTS "StockTakeLine_medicineId_idx" ON "StockTakeLine"("medicineId");
CREATE INDEX IF NOT EXISTS "StockTakeLine_batchId_idx" ON "StockTakeLine"("batchId");

DO $$ BEGIN
  ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_stockTakeId_fkey"
    FOREIGN KEY ("stockTakeId") REFERENCES "StockTake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_medicineId_fkey"
    FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
