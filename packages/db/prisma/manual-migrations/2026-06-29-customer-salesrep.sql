-- Link sales rep to customers (shops). Selecting a shop at billing suggests the rep.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "salesRepId" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_salesRepId_idx" ON "Customer"("salesRepId");
