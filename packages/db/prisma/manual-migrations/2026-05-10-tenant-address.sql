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
