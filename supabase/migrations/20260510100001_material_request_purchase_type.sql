ALTER TABLE material_requests
  ADD COLUMN IF NOT EXISTS purchase_type text NOT NULL DEFAULT 'own_site'
    CHECK (purchase_type IN ('own_site', 'group_stock'));
