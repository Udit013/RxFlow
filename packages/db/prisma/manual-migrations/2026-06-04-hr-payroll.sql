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
