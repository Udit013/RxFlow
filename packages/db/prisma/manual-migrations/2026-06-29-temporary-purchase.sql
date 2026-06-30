-- Temporary purchase flag on batches (goods received before invoice)
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "isTemporary" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Batch_isTemporary_idx" ON "Batch"("isTemporary");
