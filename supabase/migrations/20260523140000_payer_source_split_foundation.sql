-- Multi-Source Payer Split — Foundation
-- Spec: docs/superpowers/specs/2026-05-23-payer-source-split-design.md
--
-- Adds payer_source_split JSONB to every payer-source-bearing table.
-- Phase 1 only wires settlement_groups end-to-end; the other 7 columns
-- ship now so Phase 2/3 don't have to add them piecemeal.
--
-- Semantics:
--   payer_source_split IS NULL     -> single source, read payer_source column (unchanged)
--   payer_source_split IS NOT NULL -> multi-source split, payer_source = 'split' sentinel

-- 1. Add column to every domain table.
-- Note: material_purchase_expenses uses column name `settlement_payer_source`
-- (not `payer_source`); its sentinel write target is therefore
-- settlement_payer_source='split'. The new column on that table is still
-- named `payer_source_split` for cross-table consistency.
ALTER TABLE settlement_groups            ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE misc_expenses                ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE tea_shop_settlements         ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE tea_shop_group_settlements   ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE material_purchase_expenses   ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE rental_settlements           ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE rental_advances              ADD COLUMN IF NOT EXISTS payer_source_split jsonb;
ALTER TABLE site_engineer_transactions   ADD COLUMN IF NOT EXISTS payer_source_split jsonb;

-- 2. CHECK constraint: array length 2 or 3 when present
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'settlement_groups',
    'misc_expenses',
    'tea_shop_settlements',
    'tea_shop_group_settlements',
    'material_purchase_expenses',
    'rental_settlements',
    'rental_advances',
    'site_engineer_transactions'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      tbl, tbl || '_payer_source_split_len_chk'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (payer_source_split IS NULL OR (jsonb_typeof(payer_source_split) = ''array'' AND jsonb_array_length(payer_source_split) BETWEEN 2 AND 3))',
      tbl, tbl || '_payer_source_split_len_chk'
    );
  END LOOP;
END $$;

-- 3. Guard against a registry row colliding with the 'split' sentinel
ALTER TABLE payer_sources DROP CONSTRAINT IF EXISTS payer_sources_no_split_key_chk;
ALTER TABLE payer_sources
  ADD CONSTRAINT payer_sources_no_split_key_chk
  CHECK (key <> 'split');

-- 4. Shared validator
CREATE OR REPLACE FUNCTION validate_payer_source_split(
  p_split jsonb,
  p_total numeric
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_sum   numeric;
BEGIN
  IF jsonb_typeof(p_split) <> 'array' THEN
    RAISE EXCEPTION 'payer_source_split must be a JSON array' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_split);
  IF v_count NOT BETWEEN 2 AND 3 THEN
    RAISE EXCEPTION 'payer_source_split must have 2 or 3 rows (got %)', v_count USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(SUM((row->>'amount')::numeric), 0)
    INTO v_sum
    FROM jsonb_array_elements(p_split) row;
  IF abs(v_sum - p_total) > 1 THEN
    RAISE EXCEPTION 'payer_source_split sum % does not equal total %', v_sum, p_total
      USING ERRCODE = '22023';
  END IF;
  PERFORM 1
    FROM jsonb_array_elements(p_split) row
   WHERE NOT EXISTS (
     SELECT 1 FROM payer_sources ps WHERE ps.key = row->>'source'
   );
  IF FOUND THEN
    RAISE EXCEPTION 'unknown payer source in payer_source_split' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT COUNT(DISTINCT row->>'source')
      FROM jsonb_array_elements(p_split) row
  ) <> v_count THEN
    RAISE EXCEPTION 'payer_source_split cannot repeat the same source twice'
      USING ERRCODE = '22023';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION validate_payer_source_split TO authenticated;
GRANT EXECUTE ON FUNCTION validate_payer_source_split TO service_role;

COMMENT ON FUNCTION validate_payer_source_split IS
  'Asserts a payer_source_split JSONB matches the spec: array length 2-3, sum within 1 of total, every source key exists in payer_sources registry, no duplicate sources within a single split.';
