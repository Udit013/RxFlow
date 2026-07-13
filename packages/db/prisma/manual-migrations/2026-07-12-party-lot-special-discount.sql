-- Customer party fields (drug license + GST registration type)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gstRegistrationType" TEXT DEFAULT 'REGULAR';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "drugLicenseNumber" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "drugLicenseExpiryDate" TIMESTAMP(3);
-- Supplier lot number on batches
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;
-- Bill-level special discount on orders
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "specialDiscountType" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "specialDiscountValue" DOUBLE PRECISION;
