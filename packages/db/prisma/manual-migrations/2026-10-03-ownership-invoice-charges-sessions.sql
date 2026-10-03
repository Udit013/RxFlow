-- Medicine ownership (per-tenant catalog copies), invoice other charges, per-device auth sessions.
-- Idempotent: safe to run on every deploy.

ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "ownerTenantId" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "forkedFromId" TEXT;
CREATE INDEX IF NOT EXISTS "Medicine_ownerTenantId_idx" ON "Medicine" ("ownerTenantId");
CREATE INDEX IF NOT EXISTS "Medicine_forkedFromId_idx" ON "Medicine" ("forkedFromId");
DO $$ BEGIN
  ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_forkedFromId_fkey"
    FOREIGN KEY ("forkedFromId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "otherCharges" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: user-created (unverified) medicines stocked by exactly one tenant become private
-- to that tenant. Verified/seeded rows and anything shared by 2+ tenants stay in the shared catalog.
UPDATE "Medicine" m
SET "ownerTenantId" = owners."tenantId"
FROM (
  SELECT "medicineId", MIN("tenantId") AS "tenantId"
  FROM "InventoryItem"
  GROUP BY "medicineId"
  HAVING COUNT(DISTINCT "tenantId") = 1
) owners
WHERE m."id" = owners."medicineId"
  AND m."ownerTenantId" IS NULL
  AND m."isVerified" = false;

-- Per-device refresh sessions (replaces the single User.refreshToken slot).
CREATE TABLE IF NOT EXISTS "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuthSession_userId_idx" ON "AuthSession" ("userId");
DO $$ BEGIN
  ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
