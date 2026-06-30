-- ════════════════════════════════════════════════════════════════════════
-- RxFlow · consolidated production schema sync
-- Run this ONCE in the Neon SQL editor to bring the database in line with
-- schema.prisma. Every statement is idempotent (safe to re-run).
-- ════════════════════════════════════════════════════════════════════════

-- ─── 2026-05-10-add-sales-rep.sql ───────────────────────────────────────────
-- Manual additive migration: SalesRep model + commission columns on Order
-- Safe to re-run (uses IF NOT EXISTS).

-- 1. SalesRep table
CREATE TABLE IF NOT EXISTS "SalesRep" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "employeeCode" TEXT,
  "territory" TEXT,
  "defaultCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "flatBonusAmount" DOUBLE PRECISION,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesRep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesRep_tenantId_phone_key" ON "SalesRep"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "SalesRep_tenantId_idx" ON "SalesRep"("tenantId");
CREATE INDEX IF NOT EXISTS "SalesRep_isActive_idx" ON "SalesRep"("isActive");

-- FK to Tenant (drop if exists for re-runs)
DO $$ BEGIN
  ALTER TABLE "SalesRep" ADD CONSTRAINT "SalesRep_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Commission columns on Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "salesRepId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "commissionPercent" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "commissionAmount" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "commissionStatus" TEXT DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS "Order_salesRepId_idx" ON "Order"("salesRepId");

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_salesRepId_fkey"
    FOREIGN KEY ("salesRepId") REFERENCES "SalesRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2026-05-10-batch-writeoff.sql ───────────────────────────────────────────
-- Track expiry write-offs on batches.
-- Cumulative writeOffQuantity = how many units of this batch have been written off.
-- writeOffReason / writtenOffAt capture latest action for audit display.
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "writeOffQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "writeOffReason" TEXT;
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "writtenOffAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Batch_writtenOffAt_idx" ON "Batch"("writtenOffAt");

-- ─── 2026-05-10-customer-gstin.sql ───────────────────────────────────────────
-- Add GSTIN to Customer to enable B2B GSTR-1 + IGST routing.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gstin" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_gstin_idx" ON "Customer"("gstin");

-- ─── 2026-05-10-invoice-original-ref.sql ───────────────────────────────────────────
-- Add self-reference so credit notes can point back to original invoice.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "originalInvoiceId" TEXT;
CREATE INDEX IF NOT EXISTS "Invoice_originalInvoiceId_idx" ON "Invoice"("originalInvoiceId");

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey"
    FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2026-05-10-stock-take-and-multi-user.sql ───────────────────────────────────────────
-- ───────────────────────────────────────────────────────────────────────────
-- Stock take, negative-stock toggle, user invite enhancements
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Tenant flag — allow negative stock (let pharmacies sell before stocking)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false;

-- 2) StockTake header
DO $$ BEGIN
  CREATE TYPE "StockTakeStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockTake" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "StockTakeStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "completedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockTake_tenantId_code_key" ON "StockTake"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "StockTake_tenantId_idx" ON "StockTake"("tenantId");
CREATE INDEX IF NOT EXISTS "StockTake_storeId_idx" ON "StockTake"("storeId");
CREATE INDEX IF NOT EXISTS "StockTake_status_idx" ON "StockTake"("status");

DO $$ BEGIN
  ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) StockTakeLine — one row per (medicine, batch?) snapshot
CREATE TABLE IF NOT EXISTS "StockTakeLine" (
  "id" TEXT NOT NULL,
  "stockTakeId" TEXT NOT NULL,
  "medicineId" TEXT NOT NULL,
  "batchId" TEXT,
  "systemQty" INTEGER NOT NULL,
  "actualQty" INTEGER,
  "variance" INTEGER,
  "notes" TEXT,
  "countedAt" TIMESTAMP(3),
  CONSTRAINT "StockTakeLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockTakeLine_stockTakeId_idx" ON "StockTakeLine"("stockTakeId");
CREATE INDEX IF NOT EXISTS "StockTakeLine_medicineId_idx" ON "StockTakeLine"("medicineId");
CREATE INDEX IF NOT EXISTS "StockTakeLine_batchId_idx" ON "StockTakeLine"("batchId");

DO $$ BEGIN
  ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_stockTakeId_fkey"
    FOREIGN KEY ("stockTakeId") REFERENCES "StockTake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_medicineId_fkey"
    FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2026-05-10-supplier-csv-preset.sql ───────────────────────────────────────────
-- Per-supplier CSV column mapping preset for purchase imports.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "csvPreset" JSONB;

-- ─── 2026-05-10-tenant-address.sql ───────────────────────────────────────────
-- Add address fields to Tenant for proper invoice headers + GST inter-state detection.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "pincode" TEXT;

-- Seed demo tenant with Maharashtra address (matches GSTIN 27 prefix)
UPDATE "Tenant"
   SET "addressLine1" = COALESCE("addressLine1", '12 Linking Road'),
       "city"         = COALESCE("city", 'Mumbai'),
       "state"        = COALESCE("state", 'Maharashtra'),
       "pincode"      = COALESCE("pincode", '400050')
 WHERE "slug" = 'rxflow-demo';

-- ─── 2026-05-11-accounts-expense.sql ───────────────────────────────────────────
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

-- ─── 2026-05-11-license-expiry.sql ───────────────────────────────────────────
-- Drug license expiry tracking
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "drugLicenseExpiryDate" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "drugLicenseExpiryDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Supplier_drugLicenseExpiryDate_idx" ON "Supplier"("drugLicenseExpiryDate");

-- ─── 2026-05-11-stock-transfer-and-parked.sql ───────────────────────────────────────────
-- ───────────────────────────────────────────────────────────────────────────
-- Stock transfer between stores + parked-sale support
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Stock transfer
DO $$ BEGIN
  CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockTransfer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "fromStoreId" TEXT NOT NULL,
  "toStoreId" TEXT NOT NULL,
  "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "completedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransfer_tenantId_code_key" ON "StockTransfer"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "StockTransfer_tenantId_idx" ON "StockTransfer"("tenantId");
CREATE INDEX IF NOT EXISTS "StockTransfer_status_idx" ON "StockTransfer"("status");

DO $$ BEGIN
  ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromStoreId_fkey"
    FOREIGN KEY ("fromStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toStoreId_fkey"
    FOREIGN KEY ("toStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockTransferItem" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "medicineId" TEXT NOT NULL,
  "fromBatchId" TEXT,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockTransferItem_transferId_idx" ON "StockTransferItem"("transferId");
DO $$ BEGIN
  ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_medicineId_fkey"
    FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_fromBatchId_fkey"
    FOREIGN KEY ("fromBatchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Parked-sale support — Order already has DRAFT status, just add a label + parkedAt
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "parkedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "parkedLabel" TEXT;
CREATE INDEX IF NOT EXISTS "Order_parkedAt_idx" ON "Order"("parkedAt") WHERE "parkedAt" IS NOT NULL;

-- ─── 2026-06-04-category-rack-poreturn.sql ───────────────────────────────────────────
-- ───────────────────────────────────────────────────────────────────────────
-- Category management, rack/shelf location, PO-return wiring
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Medicine category (global classification field)
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "category" TEXT;
CREATE INDEX IF NOT EXISTS "Medicine_category_idx" ON "Medicine"("category");

-- 2) Tenant-scoped category list (for managing the dropdown)
CREATE TABLE IF NOT EXISTS "MedicineCategory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicineCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MedicineCategory_tenantId_name_key" ON "MedicineCategory"("tenantId","name");
CREATE INDEX IF NOT EXISTS "MedicineCategory_tenantId_idx" ON "MedicineCategory"("tenantId");
DO $$ BEGIN ALTER TABLE "MedicineCategory" ADD CONSTRAINT "MedicineCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Rack / shelf location on inventory item (per-store physical location)
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "rackNumber" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "shelfNumber" TEXT;
CREATE INDEX IF NOT EXISTS "InventoryItem_rackNumber_idx" ON "InventoryItem"("rackNumber");

-- 4) PO-return reference on Invoice (DEBIT_NOTE points back to original purchase invoice)
--    Invoice already has originalInvoiceId from the credit-note work — reused as-is.

-- ─── 2026-06-04-hr-payroll.sql ───────────────────────────────────────────
-- ───────────────────────────────────────────────────────────────────────────
-- HR module: Employees, Attendance, Payroll
-- ───────────────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE "SalaryType" AS ENUM ('MONTHLY', 'DAILY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT','ABSENT','HALF_DAY','PAID_LEAVE','UNPAID_LEAVE','HOLIDAY','WEEK_OFF'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT','FINALIZED','PAID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PayslipStatus" AS ENUM ('PENDING','PAID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Employee ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "storeId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "employeeCode" TEXT,
  "designation" TEXT,
  "department" TEXT,
  "joiningDate" TIMESTAMP(3),
  "salaryType" "SalaryType" NOT NULL DEFAULT 'MONTHLY',
  "monthlySalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dailyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bankAccount" TEXT,
  "bankIfsc" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenantId_phone_key" ON "Employee"("tenantId","phone");
CREATE INDEX IF NOT EXISTS "Employee_tenantId_idx" ON "Employee"("tenantId");
CREATE INDEX IF NOT EXISTS "Employee_userId_idx" ON "Employee"("userId");
CREATE INDEX IF NOT EXISTS "Employee_isActive_idx" ON "Employee"("isActive");
DO $$ BEGIN ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Attendance ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Attendance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "checkIn" TEXT,
  "checkOut" TEXT,
  "workedHours" DOUBLE PRECISION,
  "notes" TEXT,
  "markedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_employeeId_date_key" ON "Attendance"("employeeId","date");
CREATE INDEX IF NOT EXISTS "Attendance_tenantId_idx" ON "Attendance"("tenantId");
CREATE INDEX IF NOT EXISTS "Attendance_date_idx" ON "Attendance"("date");
DO $$ BEGIN ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Payroll run (monthly batch) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PayrollRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
  "totalGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes" TEXT,
  "generatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_tenantId_period_key" ON "PayrollRun"("tenantId","period");
CREATE INDEX IF NOT EXISTS "PayrollRun_tenantId_idx" ON "PayrollRun"("tenantId");
DO $$ BEGIN ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Payslip (per employee per run) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Payslip" (
  "id" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "baseSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalDays" INTEGER NOT NULL DEFAULT 0,
  "presentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "absentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "leaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lopDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "earnedSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "allowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "deductionNote" TEXT,
  "netPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "PayslipStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "paymentMethod" "PaymentMethod",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Payslip_payrollRunId_idx" ON "Payslip"("payrollRunId");
CREATE INDEX IF NOT EXISTS "Payslip_employeeId_idx" ON "Payslip"("employeeId");
DO $$ BEGIN ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2026-06-24-medicine-master.sql ───────────────────────────────────────────
-- Medicine master expansion (MARG-style attributes + 7-tab fields)
DO $$ BEGIN CREATE TYPE "MedicineStatus" AS ENUM ('CONTINUE','DISCONTINUE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MedicineType" AS ENUM ('NORMAL','CONTROLLED','OTC','PRESCRIPTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "status" "MedicineStatus" NOT NULL DEFAULT 'CONTINUE';
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "medicineType" "MedicineType" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "shortName" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "fastSearchName" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "composition" TEXT;
-- Units & packaging
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "packing" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "primaryUnit" TEXT NOT NULL DEFAULT 'PCS';
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "secondaryUnit" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "boxQuantity" INTEGER;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "decimalAllowed" BOOLEAN NOT NULL DEFAULT false;
-- Pricing
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "rateA" DOUBLE PRECISION;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "rateB" DOUBLE PRECISION;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "rateC" DOUBLE PRECISION;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "defaultPurchasePrice" DOUBLE PRECISION;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "defaultCostPrice" DOUBLE PRECISION;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "marginPercent" DOUBLE PRECISION;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "taxType" TEXT NOT NULL DEFAULT 'TAXABLE';
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "cess" DOUBLE PRECISION NOT NULL DEFAULT 0;
-- Inventory defaults
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "defaultReorderLevel" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "minStock" INTEGER;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "maxStock" INTEGER;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "negativeAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Medicine_status_idx" ON "Medicine"("status");

-- ─── 2026-06-24-otp-token.sql ───────────────────────────────────────────
-- OTP tokens for password reset + passwordless OTP login
DO $$ BEGIN CREATE TYPE "OtpPurpose" AS ENUM ('PASSWORD_RESET','LOGIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OtpToken" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,      -- email (lowercased)
  "codeHash" TEXT NOT NULL,        -- bcrypt hash of the 6-digit code
  "purpose" "OtpPurpose" NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OtpToken_identifier_purpose_idx" ON "OtpToken"("identifier","purpose");
CREATE INDEX IF NOT EXISTS "OtpToken_expiresAt_idx" ON "OtpToken"("expiresAt");


-- ─── 2026-06-28-purchase-commission.sql ───────────────────────────────────────────
-- Purchase commission, transport charge, and batch-wise purchase discount.
-- Sales/purchase salesman commission columns already exist on "Order".
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "transportCharge" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "purchaseDiscountPercent" DOUBLE PRECISION;
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ─── 2026-06-29-supplier-gst-type.sql ───────────────────────────────────────────
-- Supplier GST registration type (Regular / Composite / Non-GST)
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "gstRegistrationType" TEXT DEFAULT 'REGULAR';

-- ─── 2026-06-29-medicine-division.sql ───────────────────────────────────────────
-- Medicine division (marketing division within a manufacturer)
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "division" TEXT;

-- ─── 2026-06-29-customer-salesrep.sql ───────────────────────────────────────────
-- Link sales rep to customers (shops). Selecting a shop at billing suggests the rep.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "salesRepId" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_salesRepId_idx" ON "Customer"("salesRepId");

-- ─── 2026-06-29-temporary-purchase.sql ───────────────────────────────────────────
-- Temporary purchase flag on batches (goods received before invoice)
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "isTemporary" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Batch_isTemporary_idx" ON "Batch"("isTemporary");
