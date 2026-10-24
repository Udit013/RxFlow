-- Remove the ten illustrative Indian demo medicines (replaced by the official Jan Aushadhi list).
-- Idempotent — re-applied on every deploy (see IDEMPOTENT).
-- A demo row nothing refers to is deleted. A row that stock, an order, an invoice, a stock take,
-- a transfer, a substitute link or a pharmacy's own edited copy still refers to is retired instead
-- (hidden from every catalog view), so no sale, invoice or ledger loses its medicine.
DO $$
DECLARE
  unused text[];
BEGIN
  SELECT coalesce(array_agg(m.id), '{}') INTO unused FROM "Medicine" m
  WHERE m."dataSource" = 'DEMO_SEED' AND m."ownerTenantId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "InventoryItem" x WHERE x."medicineId" = m.id)
    AND NOT EXISTS (SELECT 1 FROM "OrderItem" x WHERE x."medicineId" = m.id)
    AND NOT EXISTS (SELECT 1 FROM "InvoiceItem" x WHERE x."medicineId" = m.id)
    AND NOT EXISTS (SELECT 1 FROM "StockTakeLine" x WHERE x."medicineId" = m.id)
    AND NOT EXISTS (SELECT 1 FROM "StockTransferItem" x WHERE x."medicineId" = m.id)
    AND NOT EXISTS (SELECT 1 FROM "MedicineSubstitute" x WHERE x."medicineId" = m.id OR x."substituteId" = m.id)
    AND NOT EXISTS (SELECT 1 FROM "Medicine" f WHERE f."forkedFromId" = m.id);

  DELETE FROM "MedicineComposition" WHERE "medicineId" = ANY (unused);
  DELETE FROM "Medicine" WHERE id = ANY (unused);

  UPDATE "Medicine" SET "isActive" = false
  WHERE "dataSource" = 'DEMO_SEED' AND "ownerTenantId" IS NULL AND "isActive" = true;

  DELETE FROM "MedicineDataSource" WHERE id = 'DEMO_SEED';
END $$;
