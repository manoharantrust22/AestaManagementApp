-- Historical Material Backfill — schema + RPC for back-dated bulk entry
--
-- Adds is_historical + used_qty_at_entry columns to material_purchase_expenses
-- and the record_historical_batch RPC, which accepts an ARRAY of historical
-- records and inserts everything (drafts, expense rows, items, allocations)
-- atomically.
--
-- Mode of operation:
--   * purchase_type = 'own_site' or 'group_stock' (NOT 'spot' — historical
--     records pre-date the spot-purchase workflow; they collapse the full
--     request/PO/delivery/settle chain)
--   * is_historical = true
--   * is_paid + paid_date set when payment_status = 'settled'
--   * status = 'completed'
--   * Group allocations: spot_purchase_allocations rows with is_final = true,
--     finalized_at = now(), finalized_by = auth.uid(). The table name is
--     historical (carried from the spot flow) but the schema is general; the
--     existing interSiteDebt() reader walks all rows regardless of the parent
--     batch's purchase_type.
--
-- Intentionally OMITTED:
--   * Wallet integration. paid_by='wallet' tags payment_channel='engineer_wallet'
--     for traceability only; we do NOT debit the wallet via
--     atomic_record_wallet_spend. The wallet's current balance is today's
--     truth — back-dated spends would corrupt the running ledger.
--   * stock_inventory / stock_transactions writes. Historical entries weren't
--     tracked in inventory at the time; retroactively adding them would
--     inflate current stock. Today's inventory should be set via a separate
--     one-time process if needed. The expense items table preserves what was
--     bought; used_qty_at_entry preserves what was consumed at backfill time.
--
-- Date range: 2025-11-09 (project start) to 2026-05-09 (cutover). Validated
-- server-side AND UI-side.
--
-- Role: office-only. site_engineer cannot back-date records.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Columns on material_purchase_expenses
-- ----------------------------------------------------------------------------

ALTER TABLE material_purchase_expenses
  ADD COLUMN IF NOT EXISTS is_historical     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_qty_at_entry numeric(12,3);

COMMENT ON COLUMN material_purchase_expenses.is_historical IS
  'true = back-dated record entered via Backfill flow (record_historical_batch RPC). Skips the request/PO/delivery chain. Nov 9 2025 – May 9 2026 backfill window only.';
COMMENT ON COLUMN material_purchase_expenses.used_qty_at_entry IS
  'For is_historical rows. Total quantity consumed at backfill time, summed across items. NULL = unknown. Drives stage=exhausted (qty == used) vs in-use in the Hub.';

CREATE INDEX IF NOT EXISTS idx_mpe_historical
  ON material_purchase_expenses(site_id, is_historical)
  WHERE is_historical = true;

-- ----------------------------------------------------------------------------
-- 2. RLS — extend INSERT policy so site_engineer cannot set is_historical
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS material_purchase_expenses_insert ON material_purchase_expenses;

CREATE POLICY material_purchase_expenses_insert ON material_purchase_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Admin / office can insert anything (including is_historical=true)
    get_user_role() = ANY (ARRAY['admin'::user_role, 'office'::user_role])
    OR (
      -- site_engineer: only spot purchases via wallet, never historical
      get_user_role() = 'site_engineer'::user_role
      AND purchase_type = 'spot'
      AND payment_channel = 'engineer_wallet'
      AND is_historical = false
      AND can_access_site(site_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. RPC — record_historical_batch
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_historical_batch(payload jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  -- Top-level
  v_site_id              uuid;
  v_records              jsonb;
  v_record               jsonb;
  v_record_count         int := 0;
  v_drafts_vendors       int := 0;
  v_drafts_materials     int := 0;
  v_batch_ids            uuid[] := ARRAY[]::uuid[];
  v_role                 user_role;
  v_site_group_id        uuid;
  v_min_date  constant   date := DATE '2025-11-09';
  v_max_date  constant   date := DATE '2026-05-09';

  -- Per-record
  v_vendor_id            uuid;
  v_purchase_date        date;
  v_kind                 text;
  v_purchase_type        text;
  v_payment_status       text;
  v_paid_by              text;
  v_payment_channel      text;
  v_total_amount         numeric;
  v_used_qty_total       numeric;
  v_split_sum            numeric;
  v_batch_id             uuid;
  v_ref_code             text;
  v_attempts             int;

  -- Per-item
  v_item                 jsonb;
  v_material_id          uuid;
  v_qty                  numeric;
  v_rate                 numeric;
  v_unit                 text;

  -- Per-allocation
  v_alloc                jsonb;
BEGIN
  v_site_id := (payload->>'site_id')::uuid;
  v_records := payload->'records';

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'site_id is required';
  END IF;
  IF v_records IS NULL OR jsonb_typeof(v_records) <> 'array' THEN
    RAISE EXCEPTION 'records must be a JSON array';
  END IF;
  IF jsonb_array_length(v_records) = 0 THEN
    RAISE EXCEPTION 'records array must contain at least one entry';
  END IF;

  -- Role guard: backfill is office-only
  v_role := get_user_role();
  IF v_role NOT IN ('admin'::user_role, 'office'::user_role) THEN
    RAISE EXCEPTION 'Only admin or office users can run record_historical_batch (got %)', v_role
      USING ERRCODE = '42501';
  END IF;

  IF NOT can_access_site(v_site_id) THEN
    RAISE EXCEPTION 'access denied for site %', v_site_id USING ERRCODE = '42501';
  END IF;

  SELECT site_group_id INTO v_site_group_id FROM sites WHERE id = v_site_id;

  -- Process each record (the entire FOR loop is one transaction — any
  -- RAISE EXCEPTION rolls back all prior records in the batch).
  FOR v_record IN SELECT * FROM jsonb_array_elements(v_records) LOOP
    v_record_count := v_record_count + 1;

    -- Extract + validate required fields
    v_purchase_date  := (v_record->>'purchase_date')::date;
    v_total_amount   := COALESCE((v_record->>'amount')::numeric, 0);
    v_kind           := COALESCE(v_record->>'kind', 'own');
    v_payment_status := COALESCE(v_record->>'payment_status', 'settled');
    v_paid_by        := v_record->>'paid_by';
    v_used_qty_total := COALESCE((v_record->>'used_qty')::numeric, 0);

    IF v_purchase_date IS NULL THEN
      RAISE EXCEPTION 'record %: purchase_date is required', v_record_count;
    END IF;
    IF v_purchase_date < v_min_date OR v_purchase_date > v_max_date THEN
      RAISE EXCEPTION 'record %: purchase_date must be between % and %, got %',
        v_record_count, v_min_date, v_max_date, v_purchase_date
        USING ERRCODE = '22023';
    END IF;
    IF v_total_amount <= 0 THEN
      RAISE EXCEPTION 'record %: amount must be > 0', v_record_count;
    END IF;
    IF v_kind NOT IN ('own', 'group') THEN
      RAISE EXCEPTION 'record %: kind must be own or group, got %', v_record_count, v_kind;
    END IF;
    IF v_payment_status NOT IN ('settled', 'pending') THEN
      RAISE EXCEPTION 'record %: payment_status must be settled or pending, got %',
        v_record_count, v_payment_status;
    END IF;
    IF v_kind = 'group' AND v_site_group_id IS NULL THEN
      RAISE EXCEPTION 'record %: kind=group requires the site to be in a group', v_record_count;
    END IF;

    v_purchase_type := CASE WHEN v_kind = 'group' THEN 'group_stock' ELSE 'own_site' END;

    -- payment_channel derivation
    v_payment_channel := CASE
      WHEN v_payment_status = 'pending'  THEN 'direct'
      WHEN v_paid_by = 'wallet'          THEN 'engineer_wallet'
      ELSE 'direct'  -- 'office' / 'site' / unknown → direct
    END;

    -- Resolve or create vendor (draft if name-only)
    IF (v_record->'vendor') ? 'id' AND (v_record->'vendor'->>'id') IS NOT NULL THEN
      v_vendor_id := (v_record->'vendor'->>'id')::uuid;
    ELSE
      INSERT INTO vendors (name, vendor_type, is_draft, created_by, created_at)
      VALUES (
        COALESCE(v_record->'vendor'->>'name', 'Unknown Vendor (historical)'),
        'individual'::vendor_type,
        true,
        auth.uid(),
        now()
      )
      RETURNING id INTO v_vendor_id;
      v_drafts_vendors := v_drafts_vendors + 1;
    END IF;

    -- Unique ref_code: HIST-YYMMDD-XXXXX (date of the purchase, not today)
    v_attempts := 0;
    LOOP
      v_ref_code := 'HIST-' || to_char(v_purchase_date, 'YYMMDD') || '-' ||
        upper(substr(md5(random()::text || v_site_id::text || clock_timestamp()::text), 1, 5));
      IF NOT EXISTS (SELECT 1 FROM material_purchase_expenses WHERE ref_code = v_ref_code) THEN
        EXIT;
      END IF;
      v_attempts := v_attempts + 1;
      IF v_attempts > 50 THEN
        RAISE EXCEPTION 'Could not generate unique historical ref_code after 50 attempts';
      END IF;
    END LOOP;

    -- Insert the expense row
    INSERT INTO material_purchase_expenses (
      site_id, ref_code, purchase_type, vendor_id, vendor_name, purchase_date,
      total_amount, payment_mode, is_paid, paid_date, status, payment_channel,
      site_group_id, notes, created_by, is_historical, used_qty_at_entry
    ) VALUES (
      v_site_id,
      v_ref_code,
      v_purchase_type,
      v_vendor_id,
      v_record->'vendor'->>'name',
      v_purchase_date,
      v_total_amount,
      COALESCE(v_record->>'payment_mode', 'cash'),
      (v_payment_status = 'settled'),
      CASE WHEN v_payment_status = 'settled' THEN v_purchase_date ELSE NULL END,
      'completed',
      v_payment_channel,
      CASE WHEN v_kind = 'group' THEN v_site_group_id ELSE NULL END,
      v_record->>'notes',
      auth.uid(),
      true,
      NULLIF(v_used_qty_total, 0)
    )
    RETURNING id INTO v_batch_id;

    v_batch_ids := array_append(v_batch_ids, v_batch_id);

    -- Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_record->'items') LOOP
      v_qty  := COALESCE((v_item->>'qty')::numeric, 0);
      v_rate := CASE
        WHEN v_qty > 0 THEN COALESCE((v_item->>'amount')::numeric, 0) / v_qty
        ELSE 0
      END;

      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'record %: item qty must be > 0', v_record_count;
      END IF;

      -- Resolve or create material (draft if new_material payload)
      IF v_item ? 'material_id' AND (v_item->>'material_id') IS NOT NULL THEN
        v_material_id := (v_item->>'material_id')::uuid;
      ELSE
        v_unit := COALESCE(v_item->'new_material'->>'unit', 'piece');
        BEGIN
          PERFORM v_unit::material_unit;
        EXCEPTION WHEN others THEN
          v_unit := 'piece';
        END;

        INSERT INTO materials (name, category_id, unit, is_draft, created_by, created_at)
        VALUES (
          COALESCE(v_item->'new_material'->>'name', 'Unknown Material (historical)'),
          NULLIF(v_item->'new_material'->>'category_id', '')::uuid,
          v_unit::material_unit,
          true,
          auth.uid(),
          now()
        )
        RETURNING id INTO v_material_id;
        v_drafts_materials := v_drafts_materials + 1;
      END IF;

      -- Item row (total_price is GENERATED — omit)
      INSERT INTO material_purchase_expense_items (
        purchase_expense_id, material_id, quantity, unit_price
      ) VALUES (
        v_batch_id, v_material_id, v_qty, v_rate
      );

      -- Price history (so vendor price trends include historical data)
      PERFORM record_price_entry(
        v_vendor_id,
        v_material_id,
        NULL,                 -- brand_id
        v_rate,
        false,                -- price_includes_gst
        NULL, NULL, NULL, NULL,
        'historical_backfill',
        v_ref_code,
        v_qty,
        NULL,                 -- unit
        auth.uid(),
        NULL
      );
    END LOOP;

    -- Group allocations: one-shot final (no provisional → finalize 2-step)
    IF v_kind = 'group' AND (v_record ? 'group_split') THEN
      SELECT COALESCE(SUM((value->>'pct')::numeric), 0)
        INTO v_split_sum
        FROM jsonb_array_elements(v_record->'group_split');
      IF abs(v_split_sum - 100) > 0.01 THEN
        RAISE EXCEPTION 'record %: group_split must sum to 100 (got %)',
          v_record_count, v_split_sum;
      END IF;

      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_record->'group_split') LOOP
        INSERT INTO spot_purchase_allocations (
          batch_id, site_id, percentage, is_final, finalized_at, finalized_by
        ) VALUES (
          v_batch_id,
          (v_alloc->>'site_id')::uuid,
          (v_alloc->>'pct')::numeric,
          true,
          now(),
          auth.uid()
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_ids', to_jsonb(v_batch_ids),
    'drafts_created', jsonb_build_object(
      'vendors',   v_drafts_vendors,
      'materials', v_drafts_materials
    ),
    'count', v_record_count
  );
END $$;

GRANT EXECUTE ON FUNCTION record_historical_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION record_historical_batch(jsonb) IS
  'Atomic back-dated material entry. Accepts {site_id, records:[...]} where each record collapses the request/PO/delivery/settle chain into one row tagged is_historical=true. Office/admin only. Date range: 2025-11-09 to 2026-05-09. For kind=group, inserts spot_purchase_allocations with is_final=true. Does NOT touch engineer wallet (payment_channel is informational). Does NOT write stock_inventory / stock_transactions (back-dated inventory would corrupt today''s running totals). Returns {batch_ids, drafts_created:{vendors,materials}, count}.';

COMMIT;
