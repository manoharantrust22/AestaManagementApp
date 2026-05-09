-- AI-Assisted Catalog Ingestion — Warranty fields on material purchases
-- Spec: C:\Users\Haribabu\.claude\plans\so-since-this-application-vectorized-church.md
--
-- Materials/consumables had no warranty storage (only equipment.warranty_expiry_date).
-- The Microtek I-Lithium UPS case (60-month warranty + serial number) needs these
-- columns so the AI Warranty mode can attach to an existing purchase row.
--
-- Design notes:
--   * warranty_months is the source of truth; expiry = warranty_start_date + months.
--     Storing both start and end would drift on edits.
--   * warranty_serial_numbers is JSONB array because a single bill can carry multiple
--     items (UPS + battery + stabilizer) each with its own serial. Array element shape:
--       { "item_index": 0, "serial": "899-IL1-1500", "model": "I-Lithium 1500 SW" }
--   * warranty_doc_url is distinct from bill_url — the warranty card is a separate document.

ALTER TABLE material_purchase_expenses
  ADD COLUMN IF NOT EXISTS warranty_months INTEGER NULL,
  ADD COLUMN IF NOT EXISTS warranty_start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS warranty_serial_numbers JSONB NULL,
  ADD COLUMN IF NOT EXISTS warranty_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS warranty_doc_url TEXT NULL;

-- Validate non-negative warranty period
ALTER TABLE material_purchase_expenses
  DROP CONSTRAINT IF EXISTS material_purchase_expenses_warranty_months_check;

ALTER TABLE material_purchase_expenses
  ADD CONSTRAINT material_purchase_expenses_warranty_months_check
  CHECK (warranty_months IS NULL OR warranty_months >= 0);

-- Partial index — only purchases with active warranty info, scanned by vendor + start date
CREATE INDEX IF NOT EXISTS idx_mpe_warranty_active
  ON material_purchase_expenses (vendor_id, warranty_start_date)
  WHERE warranty_months IS NOT NULL;

COMMENT ON COLUMN material_purchase_expenses.warranty_months IS
  'Warranty length in months. Expiry = warranty_start_date + months.';
COMMENT ON COLUMN material_purchase_expenses.warranty_start_date IS
  'Date warranty begins. Defaults to purchase_date but can differ (delivery delay).';
COMMENT ON COLUMN material_purchase_expenses.warranty_serial_numbers IS
  'JSONB array: [{"item_index": int, "serial": text, "model": text}]. item_index aligns with material_purchase_expense_items insertion order.';
COMMENT ON COLUMN material_purchase_expenses.warranty_doc_url IS
  'Public URL for warranty card photo in purchase-documents bucket. Distinct from bill_url.';
