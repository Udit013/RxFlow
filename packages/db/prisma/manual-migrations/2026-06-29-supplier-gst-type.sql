-- Supplier GST registration type (Regular / Composite / Non-GST)
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "gstRegistrationType" TEXT DEFAULT 'REGULAR';
