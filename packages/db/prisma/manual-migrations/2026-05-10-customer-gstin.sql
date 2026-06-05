-- Add GSTIN to Customer to enable B2B GSTR-1 + IGST routing.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gstin" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_gstin_idx" ON "Customer"("gstin");
