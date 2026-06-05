-- Per-supplier CSV column mapping preset for purchase imports.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "csvPreset" JSONB;
