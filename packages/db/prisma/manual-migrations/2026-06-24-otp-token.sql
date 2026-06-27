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
