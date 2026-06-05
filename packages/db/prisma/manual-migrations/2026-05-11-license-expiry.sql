-- Drug license expiry tracking
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "drugLicenseExpiryDate" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "drugLicenseExpiryDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Supplier_drugLicenseExpiryDate_idx" ON "Supplier"("drugLicenseExpiryDate");
