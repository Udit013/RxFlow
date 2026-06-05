-- Track expiry write-offs on batches.
-- Cumulative writeOffQuantity = how many units of this batch have been written off.
-- writeOffReason / writtenOffAt capture latest action for audit display.
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "writeOffQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "writeOffReason" TEXT;
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "writtenOffAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Batch_writtenOffAt_idx" ON "Batch"("writtenOffAt");
