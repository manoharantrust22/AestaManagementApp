-- Material Catalog Library Restructure
-- Creates parent materials for wires, cables, conduit, boxes, and PVC/UPVC fittings.
-- Wires: brand+size combos stay as variants (Model B — purchase history preserved).
-- PVC/UPVC fittings: size as variant, Finolex brand via material_brands (Model A).

-- Category UUIDs:
--   ELC = 449424d2-6d4c-44b2-a67a-5cfbb95bfcd2
--   PLB = bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f

-- =============================================================
-- STEP 1: Create new parent materials (hardcoded IDs = idempotent)
-- =============================================================

INSERT INTO materials (id, name, category_id, unit, is_active)
VALUES
  -- Electrical parents
  ('aa000001-0000-0000-0000-000000000001', 'Electrical Wire',       '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', 'rmt',   true),
  ('aa000001-0000-0000-0000-000000000002', 'H07 Flexible Cable',    '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', 'rmt',   true),
  ('aa000001-0000-0000-0000-000000000003', 'TV / Data Cable',       '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', 'rmt',   true),
  ('aa000001-0000-0000-0000-000000000004', 'Metal Box (Concealed)', '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', 'nos',   true),
  ('aa000001-0000-0000-0000-000000000005', 'L Box',                 '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', 'nos',   true),
  ('aa000001-0000-0000-0000-000000000006', 'PVC Conduit',           '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', 'rmt',   true),
  -- Plumbing parents
  ('aa000001-0000-0000-0000-000000000007', 'PVC Bend',              'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos',   true),
  ('aa000001-0000-0000-0000-000000000008', 'UPVC Bend',             'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos',   true),
  ('aa000001-0000-0000-0000-000000000009', 'PVC Shoe',              'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos',   true),
  ('aa000001-0000-0000-0000-000000000010', 'UPVC Shoe',             'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos',   true),
  ('aa000001-0000-0000-0000-000000000011', 'PVC Clamp',             'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos',   true),
  ('aa000001-0000-0000-0000-000000000012', 'PVC Coupler',           'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos',   true)
ON CONFLICT (id) DO NOTHING;


-- =============================================================
-- STEP 2: Wire variants → Electrical Wire parent
--   Existing brand-specific records keep their IDs (purchase history safe).
--   Names shortened since they are always shown in context of parent.
-- =============================================================

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '1.0 sqmm – Polycab FR 180m Drum'
WHERE id = '873c6933-acd1-4b48-a6d6-e8c23dfb0bb6';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '1.5 sqmm – Polycab FR 180m Drum'
WHERE id = 'e3ed9134-881b-4e61-ad7a-21c256f8f1b7';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '2.5 sqmm – Polycab FR 180m Drum'
WHERE id = '9fc522f9-333d-4a3f-824e-ff32735e639a';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '4.0 sqmm – Polycab FR 180m Drum'
WHERE id = 'fb24fc43-9bdb-41a3-83e4-fa52de68e913';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '1.0 sqmm – Zedex 90m Coil'
WHERE id = '2da93ea0-06aa-4f3f-8e9a-c6d218bb0417';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '1.5 sqmm – Zedex 90m Coil'
WHERE id = '3119ad38-db24-4764-9775-132e8c1d2b9a';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '2.5 sqmm – Zedex 90m Coil'
WHERE id = '6123639b-01e0-4b22-9fe7-d2ce61ff2e9a';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '4.0 sqmm – Zedex 90m Coil'
WHERE id = '431bc72b-a9f9-4aea-9db0-9d62052081c7';

-- Already-ELC generic wires: rename to short form + assign parent
UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  name = '1.5 sqmm'
WHERE id = 'dbc508d6-3ee2-4299-ad5d-efcf869f6bdf';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  name = '2.5 sqmm'
WHERE id = '21c5fbc0-3cdd-47d4-ad96-1e3aa246e09f';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  name = '4.0 sqmm'
WHERE id = 'd6107f63-8cfa-411d-acc1-eed2d5bef874';

-- "Wire 1.5 sq mm" — uncategorized generic, group under parent
UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000001',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '1.5 sqmm (generic)'
WHERE id = 'dfae861b-ee07-49b4-9a72-bdf97a836eb0';


-- =============================================================
-- STEP 3: H07 Flexible Cable variant
-- =============================================================

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000002',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = '2.5 sqmm 3-Core'
WHERE id = '66e057ba-77a6-4cf5-b91e-952ec4a19541';


-- =============================================================
-- STEP 4: TV / Data Cable variant
-- =============================================================

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000003',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2',
  name = 'Polycab RG-6 CCS 305m Drum'
WHERE id = '14bc4a6a-602a-4990-a10c-b53fa4aa1d8c';


-- =============================================================
-- STEP 5: Metal Box (Concealed) variants
-- =============================================================

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000004',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', name = '2M'
WHERE id = '6de101ac-991c-4685-b209-ae51a3aa28b0';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000004',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', name = '4M'
WHERE id = '6b489943-ff66-47e8-8a78-3afcc6e786f6';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000004',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', name = '6M'
WHERE id = '8e3dbc4d-32d3-4fe5-8339-6162647bd986';

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000004',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', name = '8M'
WHERE id = 'aaf1df48-707c-46ec-8972-1dc759ed42a8';


-- =============================================================
-- STEP 6: L Box variant
-- =============================================================

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000005',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', name = '4 inch'
WHERE id = '0d366068-2267-4dc6-8581-de71854a5a08';


-- =============================================================
-- STEP 7: PVC Conduit variants
-- =============================================================

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000006',
  name = '20mm'
WHERE id = '07178ce6-b5dc-490a-b84f-f28a18fd69a2'; -- MAT-ELC-004, already ELC

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000006',
  name = '25mm'
WHERE id = '96715efd-a837-444a-840d-f4eefda61621'; -- MAT-ELC-005, already ELC

-- Uncategorized duplicate PVC Conduit 25mm → same parent
UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000006',
  category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2', name = '25mm (B)'
WHERE id = 'aff8326a-a9e8-48d7-8b3f-ffe18898e23e';


-- =============================================================
-- STEP 8: Standalone electrical items — just assign ELC category
-- =============================================================

UPDATE materials SET category_id = '449424d2-6d4c-44b2-a67a-5cfbb95bfcd2'
WHERE id IN (
  '018b1d04-cbfc-4773-b5b7-c391cb12bd61',  -- PVC Concealed Spring Box
  '9b870122-5a47-4eb8-920a-26374b210a8f'   -- PVC Insulation Tape
);


-- =============================================================
-- STEP 9: Standalone plumbing items — assign PLB category
-- =============================================================

UPDATE materials SET category_id = 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f'
WHERE id = '932b54b9-a195-471e-9daf-eb7c52446b08'; -- Solvent PVC


-- =============================================================
-- STEP 10: PVC/UPVC fittings — set parent + PLB category + short names
-- =============================================================

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000007',
  category_id = 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', name = '1 inch'
WHERE id = '08fac521-630c-476a-b5b4-45d675d8a7a2'; -- 1 inch PVC Bend

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000008',
  category_id = 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', name = '1 inch'
WHERE id = '452221ed-37b5-48c4-9963-dc5c89d46c21'; -- 1 inch UPVC Bend

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000009',
  category_id = 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', name = '1 inch'
WHERE id = '91474da9-9a11-4388-8929-cbfd9af2375d'; -- 1 inch PVC Shoe

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000010',
  category_id = 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', name = '1 inch'
WHERE id = '38bf2b24-917e-421b-85be-c98df4a6f0a1'; -- 1 inch UPVC Shoe

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000010',
  category_id = 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', name = '4 inch'
WHERE id = 'cc95896b-b23a-4908-a417-2f460672bd35'; -- "4 inch Shoe" → UPVC Shoe 4 inch

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000012',
  category_id = 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', name = '4 inch'
WHERE id = 'de51796d-5e35-4f01-8204-fca1d6fea26c'; -- 4 inch Coupler

UPDATE materials SET parent_id = 'aa000001-0000-0000-0000-000000000011',
  category_id = 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', name = '4 inch'
WHERE id = 'a6f1c4b1-0627-4fc1-8446-1ad15e39bf67'; -- 4 inch Clamp


-- =============================================================
-- STEP 11: New size variant rows for PVC/UPVC fittings
--   Additional sizes beyond the 1 existing per product type.
--   Hardcoded IDs for idempotency.
-- =============================================================

INSERT INTO materials (id, name, parent_id, category_id, unit, is_active)
VALUES
  -- PVC Bend: ½", ¾", 1½", 2"
  ('bb000001-0000-0000-0000-000000000001', '1/2 inch', 'aa000001-0000-0000-0000-000000000007', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000002', '3/4 inch', 'aa000001-0000-0000-0000-000000000007', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000003', '1.5 inch', 'aa000001-0000-0000-0000-000000000007', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000004', '2 inch',   'aa000001-0000-0000-0000-000000000007', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  -- UPVC Bend: ½", ¾", 1½", 2"
  ('bb000001-0000-0000-0000-000000000005', '1/2 inch', 'aa000001-0000-0000-0000-000000000008', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000006', '3/4 inch', 'aa000001-0000-0000-0000-000000000008', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000007', '1.5 inch', 'aa000001-0000-0000-0000-000000000008', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000008', '2 inch',   'aa000001-0000-0000-0000-000000000008', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  -- PVC Shoe: ½", ¾"
  ('bb000001-0000-0000-0000-000000000009', '1/2 inch', 'aa000001-0000-0000-0000-000000000009', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000010', '3/4 inch', 'aa000001-0000-0000-0000-000000000009', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  -- UPVC Shoe: ½"
  ('bb000001-0000-0000-0000-000000000011', '1/2 inch', 'aa000001-0000-0000-0000-000000000010', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  -- PVC Coupler: 2", 3"
  ('bb000001-0000-0000-0000-000000000012', '2 inch',   'aa000001-0000-0000-0000-000000000012', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000013', '3 inch',   'aa000001-0000-0000-0000-000000000012', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  -- PVC Clamp: 2", 3"
  ('bb000001-0000-0000-0000-000000000014', '2 inch',   'aa000001-0000-0000-0000-000000000011', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true),
  ('bb000001-0000-0000-0000-000000000015', '3 inch',   'aa000001-0000-0000-0000-000000000011', 'bce3e0d4-5d30-4d4f-92b9-ae6c12b7aa0f', 'nos', true)
ON CONFLICT (id) DO NOTHING;


-- =============================================================
-- STEP 12: Brand entries for PVC/UPVC size variants (Model A)
--   Uses WHERE NOT EXISTS to be safe on re-runs.
-- =============================================================

-- Helper: add Finolex brand to a material if not already present
-- PVC Bend size variants
INSERT INTO material_brands (id, material_id, brand_name, is_preferred, is_active)
SELECT gen_random_uuid(), m.id, 'Finolex', true, true
FROM (VALUES
  ('08fac521-630c-476a-b5b4-45d675d8a7a2'::uuid),  -- PVC Bend 1 inch (existing)
  ('bb000001-0000-0000-0000-000000000001'::uuid),
  ('bb000001-0000-0000-0000-000000000002'::uuid),
  ('bb000001-0000-0000-0000-000000000003'::uuid),
  ('bb000001-0000-0000-0000-000000000004'::uuid)
) AS m(id)
WHERE NOT EXISTS (
  SELECT 1 FROM material_brands mb
  WHERE mb.material_id = m.id AND mb.brand_name = 'Finolex'
);

-- UPVC Bend size variants
INSERT INTO material_brands (id, material_id, brand_name, is_preferred, is_active)
SELECT gen_random_uuid(), m.id, 'Finolex', true, true
FROM (VALUES
  ('452221ed-37b5-48c4-9963-dc5c89d46c21'::uuid),  -- UPVC Bend 1 inch (existing)
  ('bb000001-0000-0000-0000-000000000005'::uuid),
  ('bb000001-0000-0000-0000-000000000006'::uuid),
  ('bb000001-0000-0000-0000-000000000007'::uuid),
  ('bb000001-0000-0000-0000-000000000008'::uuid)
) AS m(id)
WHERE NOT EXISTS (
  SELECT 1 FROM material_brands mb
  WHERE mb.material_id = m.id AND mb.brand_name = 'Finolex'
);

-- PVC Shoe size variants
INSERT INTO material_brands (id, material_id, brand_name, is_preferred, is_active)
SELECT gen_random_uuid(), m.id, 'Finolex', true, true
FROM (VALUES
  ('91474da9-9a11-4388-8929-cbfd9af2375d'::uuid),  -- PVC Shoe 1 inch (existing)
  ('bb000001-0000-0000-0000-000000000009'::uuid),
  ('bb000001-0000-0000-0000-000000000010'::uuid)
) AS m(id)
WHERE NOT EXISTS (
  SELECT 1 FROM material_brands mb
  WHERE mb.material_id = m.id AND mb.brand_name = 'Finolex'
);

-- UPVC Shoe size variants
INSERT INTO material_brands (id, material_id, brand_name, is_preferred, is_active)
SELECT gen_random_uuid(), m.id, 'Finolex', true, true
FROM (VALUES
  ('38bf2b24-917e-421b-85be-c98df4a6f0a1'::uuid),  -- UPVC Shoe 1 inch (existing)
  ('cc95896b-b23a-4908-a417-2f460672bd35'::uuid),  -- 4 inch Shoe (existing)
  ('bb000001-0000-0000-0000-000000000011'::uuid)
) AS m(id)
WHERE NOT EXISTS (
  SELECT 1 FROM material_brands mb
  WHERE mb.material_id = m.id AND mb.brand_name = 'Finolex'
);

-- PVC Coupler size variants
INSERT INTO material_brands (id, material_id, brand_name, is_preferred, is_active)
SELECT gen_random_uuid(), m.id, 'Finolex', true, true
FROM (VALUES
  ('de51796d-5e35-4f01-8204-fca1d6fea26c'::uuid),  -- Coupler 4 inch (existing)
  ('bb000001-0000-0000-0000-000000000012'::uuid),
  ('bb000001-0000-0000-0000-000000000013'::uuid)
) AS m(id)
WHERE NOT EXISTS (
  SELECT 1 FROM material_brands mb
  WHERE mb.material_id = m.id AND mb.brand_name = 'Finolex'
);

-- PVC Clamp size variants
INSERT INTO material_brands (id, material_id, brand_name, is_preferred, is_active)
SELECT gen_random_uuid(), m.id, 'Finolex', true, true
FROM (VALUES
  ('a6f1c4b1-0627-4fc1-8446-1ad15e39bf67'::uuid),  -- Clamp 4 inch (existing)
  ('bb000001-0000-0000-0000-000000000014'::uuid),
  ('bb000001-0000-0000-0000-000000000015'::uuid)
) AS m(id)
WHERE NOT EXISTS (
  SELECT 1 FROM material_brands mb
  WHERE mb.material_id = m.id AND mb.brand_name = 'Finolex'
);
