-- ───────────────────────────────────────────────────────────────────────────
-- Stock transfer between stores + parked-sale support
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Stock transfer
DO $$ BEGIN
  CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockTransfer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "fromStoreId" TEXT NOT NULL,
  "toStoreId" TEXT NOT NULL,
  "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "completedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransfer_tenantId_code_key" ON "StockTransfer"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "StockTransfer_tenantId_idx" ON "StockTransfer"("tenantId");
CREATE INDEX IF NOT EXISTS "StockTransfer_status_idx" ON "StockTransfer"("status");

DO $$ BEGIN
  ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromStoreId_fkey"
    FOREIGN KEY ("fromStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toStoreId_fkey"
    FOREIGN KEY ("toStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockTransferItem" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "medicineId" TEXT NOT NULL,
  "fromBatchId" TEXT,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockTransferItem_transferId_idx" ON "StockTransferItem"("transferId");
DO $$ BEGIN
  ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_medicineId_fkey"
    FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_fromBatchId_fkey"
    FOREIGN KEY ("fromBatchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Parked-sale support — Order already has DRAFT status, just add a label + parkedAt
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "parkedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "parkedLabel" TEXT;
CREATE INDEX IF NOT EXISTS "Order_parkedAt_idx" ON "Order"("parkedAt") WHERE "parkedAt" IS NOT NULL;
