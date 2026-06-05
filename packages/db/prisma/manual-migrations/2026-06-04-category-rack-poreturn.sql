-- ───────────────────────────────────────────────────────────────────────────
-- Category management, rack/shelf location, PO-return wiring
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Medicine category (global classification field)
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "category" TEXT;
CREATE INDEX IF NOT EXISTS "Medicine_category_idx" ON "Medicine"("category");

-- 2) Tenant-scoped category list (for managing the dropdown)
CREATE TABLE IF NOT EXISTS "MedicineCategory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicineCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MedicineCategory_tenantId_name_key" ON "MedicineCategory"("tenantId","name");
CREATE INDEX IF NOT EXISTS "MedicineCategory_tenantId_idx" ON "MedicineCategory"("tenantId");
DO $$ BEGIN ALTER TABLE "MedicineCategory" ADD CONSTRAINT "MedicineCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Rack / shelf location on inventory item (per-store physical location)
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "rackNumber" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "shelfNumber" TEXT;
CREATE INDEX IF NOT EXISTS "InventoryItem_rackNumber_idx" ON "InventoryItem"("rackNumber");

-- 4) PO-return reference on Invoice (DEBIT_NOTE points back to original purchase invoice)
--    Invoice already has originalInvoiceId from the credit-note work — reused as-is.
