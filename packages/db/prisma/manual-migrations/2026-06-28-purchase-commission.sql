-- Purchase commission, transport charge, and batch-wise purchase discount.
-- Sales/purchase salesman commission columns already exist on "Order".
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "transportCharge" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "purchaseDiscountPercent" DOUBLE PRECISION;
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
