-- Expense + other-income tracking for the Accounts module.
DO $$ BEGIN
  CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Expense" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT,
  "direction" "CashDirection" NOT NULL DEFAULT 'OUT',
  "category" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "paidTo" TEXT,
  "reference" TEXT,
  "notes" TEXT,
  "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Expense_tenantId_idx" ON "Expense"("tenantId");
CREATE INDEX IF NOT EXISTS "Expense_incurredAt_idx" ON "Expense"("incurredAt");
CREATE INDEX IF NOT EXISTS "Expense_category_idx" ON "Expense"("category");
CREATE INDEX IF NOT EXISTS "Expense_direction_idx" ON "Expense"("direction");

DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
