-- Refresh-token reuse detection: remember the previous token's hash. Idempotent (see IDEMPOTENT).
ALTER TABLE "AuthSession" ADD COLUMN IF NOT EXISTS "prevTokenHash" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN IF NOT EXISTS "rotatedAt" TIMESTAMP(3);
