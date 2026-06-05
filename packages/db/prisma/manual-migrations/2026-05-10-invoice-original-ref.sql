-- Add self-reference so credit notes can point back to original invoice.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "originalInvoiceId" TEXT;
CREATE INDEX IF NOT EXISTS "Invoice_originalInvoiceId_idx" ON "Invoice"("originalInvoiceId");

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey"
    FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
