-- Manual additive migration: SalesRep model + commission columns on Order
-- Safe to re-run (uses IF NOT EXISTS).

-- 1. SalesRep table
CREATE TABLE IF NOT EXISTS "SalesRep" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "employeeCode" TEXT,
  "territory" TEXT,
  "defaultCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "flatBonusAmount" DOUBLE PRECISION,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesRep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesRep_tenantId_phone_key" ON "SalesRep"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "SalesRep_tenantId_idx" ON "SalesRep"("tenantId");
CREATE INDEX IF NOT EXISTS "SalesRep_isActive_idx" ON "SalesRep"("isActive");

-- FK to Tenant (drop if exists for re-runs)
DO $$ BEGIN
  ALTER TABLE "SalesRep" ADD CONSTRAINT "SalesRep_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Commission columns on Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "salesRepId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "commissionPercent" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "commissionAmount" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "commissionStatus" TEXT DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS "Order_salesRepId_idx" ON "Order"("salesRepId");

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_salesRepId_fkey"
    FOREIGN KEY ("salesRepId") REFERENCES "SalesRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
