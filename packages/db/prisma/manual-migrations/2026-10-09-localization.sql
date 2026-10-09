-- Localisation: tenant regional settings, per-country medicine catalogs, generic invoice tax,
-- bank-transfer payments. Idempotent — re-applied on every deploy (see IDEMPOTENT).

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'IN';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'en-IN';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 4;

ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "country" TEXT;
CREATE INDEX IF NOT EXISTS "Medicine_country_idx" ON "Medicine" ("country");

ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "taxBreakdown" JSONB;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxBreakdown" JSONB;

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';

-- Backfills (each only touches rows that still need it):
-- 1. the shared catalog that existed before localisation is the Indian market catalog
UPDATE "Medicine" SET "country" = 'IN'
WHERE "country" IS NULL AND "ownerTenantId" IS NULL AND "createdAt" < '2026-10-10';
-- 2. generic line tax for invoices written when only the GST columns existed
UPDATE "InvoiceItem"
SET "taxAmount" = COALESCE("cgstAmount", 0) + COALESCE("sgstAmount", 0) + COALESCE("igstAmount", 0)
WHERE "taxAmount" = 0 AND (COALESCE("cgstAmount", 0) + COALESCE("sgstAmount", 0) + COALESCE("igstAmount", 0)) <> 0;
