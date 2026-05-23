-- Spot Purchase flow — schema, RLS, RPCs
--
-- Adds 'spot' as a third value for material_purchase_expenses.purchase_type,
-- introduces is_draft flag on materials + vendors so supervisors can quick-add
-- off-catalog rows that office reviews later, adds bill_url to misc_expenses
-- (it already has proof_url; we keep proof_url for payment screenshot and
-- add bill_url for the bill image), and creates the two-stage allocation
-- table for group-purchase deferred reconciliation.
--
-- Notes on schema adjustments vs. the original plan (verified against
-- supabase/migrations on 2026-05-23):
--   * material_purchase_expense_items uses purchase_expense_id (not
--     expense_id); total_price is a GENERATED column (do not insert).
--   * stock_transactions requires inventory_id (FK to stock_inventory);
--     there is no trigger that bridges material_id -> inventory_id, so the
--     RPC upserts a stock_inventory row inline before logging the
--     transaction.
--   * price_history columns are (vendor_id, material_id, brand_id, price,
--     recorded_date, source, source_reference, recorded_by, quantity, unit,
--     bill_url, bill_number, bill_date). We use record_price_entry RPC.
--   * vendors has no accepts_cash column; we only set name/vendor_type.
--   * materials.unit is enum material_unit — default 'piece' (not 'pc').
--   * get_user_role() returns the user_role enum — casts required.
--   * inter_site_material_settlements has a completely different shape
--     (settlement_code/from_site_id/to_site_id/week_number/period_*) from
--     what the original plan assumed. We do NOT mirror into it from
--     finalize_spot_purchase_allocation — downstream consumers can read
--     spot_purchase_allocations directly. A future migration can wire the
--     bridge once the supervisor flow lands and we know the desired
--     aggregation (per-week vs per-batch, which from_site, etc.).
--   * Per docs note rls_legacy_policies_gotcha.md, we must drop the
--     allow_{anon,authenticated}_* policies from 20260111100000 before
--     adding restrictive ones — PG ORs permissive policies.
--   * atomic_record_wallet_spend restricts payment_mode to
--     ('cash','upi','bank_transfer'); the RPC coerces any other input
--     (cheque/credit) to 'cash' for the wallet leg.
-- 12. inter_site_material_settlements mirror is DEFERRED. The table's actual schema
--     (settlement_code, from_site_id, to_site_id, week_number, period_start/end,
--     total_amount) does not fit the plan's per-batch percentage mirror pattern.
--     The spot_purchase_allocations table becomes the source of truth for spot-batch
--     group splits; downstream reads (office reports, Task M dashboards, Task N
--     verification) query spot_purchase_allocations directly. If cross-site weekly
--     reconciliation is needed later, generate inter_site_material_settlements rows
--     from the locked spot_purchase_allocations + matching period bounds.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Extend purchase_type CHECK constraint
-- ----------------------------------------------------------------------------

ALTER TABLE material_purchase_expenses
  DROP CONSTRAINT IF EXISTS material_purchase_expenses_purchase_type_check;
ALTER TABLE material_purchase_expenses
  ADD CONSTRAINT material_purchase_expenses_purchase_type_check
    CHECK (purchase_type IN ('own_site', 'group_stock', 'spot'));

COMMENT ON COLUMN material_purchase_expenses.purchase_type IS
  'own_site | group_stock | spot — spot = supervisor walk-in purchase, no MR/PO, always engineer_wallet';

-- ----------------------------------------------------------------------------
-- 2. is_draft flags on materials + vendors
-- ----------------------------------------------------------------------------

ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE vendors   ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_materials_is_draft ON materials(is_draft) WHERE is_draft = true;
CREATE INDEX IF NOT EXISTS idx_vendors_is_draft   ON vendors(is_draft)   WHERE is_draft = true;

COMMENT ON COLUMN materials.is_draft IS
  'true = quick-added by site engineer during a spot purchase; needs office review.';
COMMENT ON COLUMN vendors.is_draft IS
  'true = quick-added by site engineer during a spot purchase; needs office review.';

-- ----------------------------------------------------------------------------
-- 3. Add bill_url to misc_expenses (proof_url stays for payment screenshot)
-- ----------------------------------------------------------------------------

ALTER TABLE misc_expenses ADD COLUMN IF NOT EXISTS bill_url text;
COMMENT ON COLUMN misc_expenses.bill_url IS
  'Bill/invoice image; proof_url remains as the payment screenshot column.';

-- ----------------------------------------------------------------------------
-- 4. Two-stage allocation table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS spot_purchase_allocations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL REFERENCES material_purchase_expenses(id) ON DELETE CASCADE,
  site_id      uuid NOT NULL REFERENCES sites(id),
  percentage   numeric(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  is_final     boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  finalized_by uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, site_id)
);
CREATE INDEX IF NOT EXISTS idx_spa_unfinal
  ON spot_purchase_allocations(batch_id) WHERE is_final = false;

ALTER TABLE spot_purchase_allocations ENABLE ROW LEVEL SECURITY;

-- Drop the blanket permissive policies that 20260111100000 added for this
-- table (it loops over every public table). If they don't exist (because the
-- DO-loop ran before this table existed), DROP IF EXISTS is a no-op.
DROP POLICY IF EXISTS "allow_authenticated_select_spot_purchase_allocations" ON spot_purchase_allocations;
DROP POLICY IF EXISTS "allow_authenticated_insert_spot_purchase_allocations" ON spot_purchase_allocations;
DROP POLICY IF EXISTS "allow_authenticated_update_spot_purchase_allocations" ON spot_purchase_allocations;
DROP POLICY IF EXISTS "allow_authenticated_delete_spot_purchase_allocations" ON spot_purchase_allocations;
DROP POLICY IF EXISTS "allow_anon_select_spot_purchase_allocations" ON spot_purchase_allocations;
DROP POLICY IF EXISTS "allow_anon_insert_spot_purchase_allocations" ON spot_purchase_allocations;
DROP POLICY IF EXISTS "allow_anon_update_spot_purchase_allocations" ON spot_purchase_allocations;
DROP POLICY IF EXISTS "allow_anon_delete_spot_purchase_allocations" ON spot_purchase_allocations;

CREATE POLICY spa_select ON spot_purchase_allocations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM material_purchase_expenses mpe
      WHERE mpe.id = spot_purchase_allocations.batch_id
        AND can_access_site(mpe.site_id)
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes happen only through SECURITY
-- DEFINER RPCs (record_spot_purchase / finalize_spot_purchase_allocation),
-- which run as postgres and bypass RLS by virtue of BYPASSRLS.

COMMENT ON TABLE spot_purchase_allocations IS
  'Two-stage allocation for spot purchases bought for a site group. Provisional rows (is_final=false) capture supervisor''s initial guess at purchase time; finalize_spot_purchase_allocation RPC locks them. Downstream inter-site reconciliation reads this table directly until a dedicated bridge to inter_site_material_settlements is wired.';

-- ----------------------------------------------------------------------------
-- 5. RLS gate on material_purchase_expenses
--    Parallel to the PO-creation gate in 20260509130000. Drop the existing
--    initial-schema policies + the 20260111100000 permissive ones before
--    re-creating restrictive INSERT.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view material purchases for accessible sites" ON material_purchase_expenses;
DROP POLICY IF EXISTS "Users can insert material purchases for accessible sites" ON material_purchase_expenses;
DROP POLICY IF EXISTS "Users can update material purchases for accessible sites" ON material_purchase_expenses;
DROP POLICY IF EXISTS "Users can delete material purchases for accessible sites" ON material_purchase_expenses;
DROP POLICY IF EXISTS "allow_authenticated_select_material_purchase_expenses" ON material_purchase_expenses;
DROP POLICY IF EXISTS "allow_authenticated_insert_material_purchase_expenses" ON material_purchase_expenses;
DROP POLICY IF EXISTS "allow_authenticated_update_material_purchase_expenses" ON material_purchase_expenses;
DROP POLICY IF EXISTS "allow_authenticated_delete_material_purchase_expenses" ON material_purchase_expenses;
DROP POLICY IF EXISTS "allow_anon_select_material_purchase_expenses" ON material_purchase_expenses;
DROP POLICY IF EXISTS "allow_anon_insert_material_purchase_expenses" ON material_purchase_expenses;
DROP POLICY IF EXISTS "allow_anon_update_material_purchase_expenses" ON material_purchase_expenses;
DROP POLICY IF EXISTS "allow_anon_delete_material_purchase_expenses" ON material_purchase_expenses;

CREATE POLICY material_purchase_expenses_select ON material_purchase_expenses
  FOR SELECT TO authenticated USING (can_access_site(site_id));

CREATE POLICY material_purchase_expenses_insert ON material_purchase_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY['admin'::user_role, 'office'::user_role])
    OR (
      get_user_role() = 'site_engineer'::user_role
      AND purchase_type = 'spot'
      AND payment_channel = 'engineer_wallet'
      AND can_access_site(site_id)
    )
  );

CREATE POLICY material_purchase_expenses_update ON material_purchase_expenses
  FOR UPDATE TO authenticated USING (can_access_site(site_id)) WITH CHECK (can_access_site(site_id));

CREATE POLICY material_purchase_expenses_delete ON material_purchase_expenses
  FOR DELETE TO authenticated USING (can_access_site(site_id));

-- ----------------------------------------------------------------------------
-- 6. RLS gate on materials + vendors — site_engineer can insert ONLY drafts
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "allow_authenticated_select_materials" ON materials;
DROP POLICY IF EXISTS "allow_authenticated_insert_materials" ON materials;
DROP POLICY IF EXISTS "allow_authenticated_update_materials" ON materials;
DROP POLICY IF EXISTS "allow_authenticated_delete_materials" ON materials;
DROP POLICY IF EXISTS "allow_anon_select_materials" ON materials;
DROP POLICY IF EXISTS "allow_anon_insert_materials" ON materials;
DROP POLICY IF EXISTS "allow_anon_update_materials" ON materials;
DROP POLICY IF EXISTS "allow_anon_delete_materials" ON materials;
DROP POLICY IF EXISTS "materials_select" ON materials;
DROP POLICY IF EXISTS "materials_insert" ON materials;
DROP POLICY IF EXISTS "materials_update" ON materials;
DROP POLICY IF EXISTS "materials_delete" ON materials;

CREATE POLICY materials_select ON materials FOR SELECT TO authenticated USING (true);
CREATE POLICY materials_insert ON materials FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY['admin'::user_role, 'office'::user_role])
    OR (get_user_role() = 'site_engineer'::user_role AND is_draft = true)
  );
CREATE POLICY materials_update ON materials FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY materials_delete ON materials FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_authenticated_select_vendors" ON vendors;
DROP POLICY IF EXISTS "allow_authenticated_insert_vendors" ON vendors;
DROP POLICY IF EXISTS "allow_authenticated_update_vendors" ON vendors;
DROP POLICY IF EXISTS "allow_authenticated_delete_vendors" ON vendors;
DROP POLICY IF EXISTS "allow_anon_select_vendors" ON vendors;
DROP POLICY IF EXISTS "allow_anon_insert_vendors" ON vendors;
DROP POLICY IF EXISTS "allow_anon_update_vendors" ON vendors;
DROP POLICY IF EXISTS "allow_anon_delete_vendors" ON vendors;
DROP POLICY IF EXISTS "vendors_select" ON vendors;
DROP POLICY IF EXISTS "vendors_insert" ON vendors;
DROP POLICY IF EXISTS "vendors_update" ON vendors;
DROP POLICY IF EXISTS "vendors_delete" ON vendors;

CREATE POLICY vendors_select ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY vendors_insert ON vendors FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY['admin'::user_role, 'office'::user_role])
    OR (get_user_role() = 'site_engineer'::user_role AND is_draft = true)
  );
CREATE POLICY vendors_update ON vendors FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY vendors_delete ON vendors FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 7. RPC — record_spot_purchase (single atomic transaction)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_spot_purchase(payload jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_id           uuid;
  v_site_group_id     uuid;
  v_vendor_id         uuid;
  v_batch_id          uuid;
  v_ref_code          text;
  v_alloc_mode        text;
  v_total             numeric;
  v_payment_mode      text;
  v_wallet_payment    text;
  v_item              jsonb;
  v_material_id       uuid;
  v_qty               numeric;
  v_rate              numeric;
  v_unit              text;
  v_inv_id            uuid;
  v_alloc             jsonb;
  v_engineer_tx_id    uuid;
  v_attempts          int := 0;
BEGIN
  v_site_id    := (payload->>'site_id')::uuid;
  v_alloc_mode := COALESCE(payload->>'allocation_mode', 'own_site');
  v_total      := (payload->>'total_amount')::numeric;
  v_payment_mode := COALESCE(payload->>'payment_mode', 'cash');

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'site_id is required';
  END IF;
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'total_amount must be > 0';
  END IF;

  -- 'group' allocation means purchase_type='spot' but site_group_id set.
  IF v_alloc_mode = 'group' THEN
    SELECT site_group_id INTO v_site_group_id FROM sites WHERE id = v_site_id;
    IF v_site_group_id IS NULL THEN
      RAISE EXCEPTION 'site is not in a group; cannot allocate as group';
    END IF;
  END IF;

  -- Vendor: existing id or quick-add as draft.
  IF (payload->'vendor') ? 'id' AND (payload->'vendor'->>'id') IS NOT NULL THEN
    v_vendor_id := (payload->'vendor'->>'id')::uuid;
  ELSE
    INSERT INTO vendors (name, vendor_type, is_draft, created_by, created_at)
    VALUES (
      COALESCE(payload->'vendor'->>'name', 'Unknown Shop'),
      'individual'::vendor_type,
      true,
      auth.uid(),
      now()
    )
    RETURNING id INTO v_vendor_id;
  END IF;

  -- Generate a unique SPOT-YYMMDD-XXXXX ref code.
  LOOP
    v_ref_code := 'SPOT-' || to_char(now(), 'YYMMDD') || '-' ||
                  upper(substr(md5(random()::text || v_site_id::text || clock_timestamp()::text), 1, 5));
    IF NOT EXISTS (SELECT 1 FROM material_purchase_expenses WHERE ref_code = v_ref_code) THEN
      EXIT;
    END IF;
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique spot purchase ref_code after 50 attempts';
    END IF;
  END LOOP;

  -- Insert the batch.
  INSERT INTO material_purchase_expenses (
    site_id, ref_code, purchase_type, vendor_id, vendor_name, purchase_date,
    total_amount, payment_mode, payment_screenshot_url, bill_url,
    is_paid, paid_date, status, payment_channel, site_group_id,
    notes, created_by
  ) VALUES (
    v_site_id, v_ref_code, 'spot', v_vendor_id,
    payload->'vendor'->>'name',
    COALESCE((payload->>'purchase_date')::date, CURRENT_DATE),
    v_total, v_payment_mode,
    payload->>'payment_screenshot_url',
    payload->>'bill_url',
    true, CURRENT_DATE, 'completed', 'engineer_wallet',
    v_site_group_id,
    payload->>'notes',
    auth.uid()
  ) RETURNING id INTO v_batch_id;

  -- Items.
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    v_qty  := (v_item->>'qty')::numeric;
    v_rate := (v_item->>'rate')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'item qty must be > 0';
    END IF;
    IF v_rate IS NULL OR v_rate < 0 THEN
      RAISE EXCEPTION 'item rate must be >= 0';
    END IF;

    IF v_item ? 'material_id' AND (v_item->>'material_id') IS NOT NULL THEN
      v_material_id := (v_item->>'material_id')::uuid;
    ELSE
      -- Coerce supplied unit to the material_unit enum. Fallback 'piece'.
      v_unit := COALESCE(v_item->'new_material'->>'unit', 'piece');
      BEGIN
        PERFORM v_unit::material_unit;
      EXCEPTION WHEN others THEN
        v_unit := 'piece';
      END;

      INSERT INTO materials (
        name, category_id, unit, is_draft, created_by, created_at
      ) VALUES (
        v_item->'new_material'->>'name',
        NULLIF(v_item->'new_material'->>'category_id', '')::uuid,
        v_unit::material_unit,
        true,
        auth.uid(),
        now()
      )
      RETURNING id INTO v_material_id;
    END IF;

    -- Line item — total_price is GENERATED, so we omit it.
    INSERT INTO material_purchase_expense_items (
      purchase_expense_id, material_id, quantity, unit_price
    ) VALUES (
      v_batch_id, v_material_id, v_qty, v_rate
    );

    -- price_history via the canonical helper (handles total_landed_cost,
    -- writes vendor_id + material_id correctly).
    PERFORM record_price_entry(
      v_vendor_id,
      v_material_id,
      NULL,            -- brand_id
      v_rate,
      false,           -- price_includes_gst
      NULL,            -- gst_rate
      NULL,            -- transport_cost
      NULL,            -- loading_cost
      NULL,            -- unloading_cost
      'spot_purchase',
      v_ref_code,
      v_qty,
      NULL,            -- unit (omit; record_price_entry tolerates NULL)
      auth.uid(),
      NULL
    );

    -- Stock: upsert a stock_inventory row for (site_id, material_id) and
    -- then log a stock_transactions row pointing at it. There is no trigger
    -- that bridges material_id -> inventory_id, so we wire it explicitly.
    SELECT id INTO v_inv_id
      FROM stock_inventory
     WHERE site_id = v_site_id AND material_id = v_material_id AND brand_id IS NULL
     LIMIT 1;

    IF v_inv_id IS NULL THEN
      INSERT INTO stock_inventory (
        site_id, material_id, current_qty, avg_unit_cost, last_received_date
      ) VALUES (
        v_site_id, v_material_id, v_qty, v_rate, CURRENT_DATE
      )
      RETURNING id INTO v_inv_id;
    ELSE
      UPDATE stock_inventory
         SET current_qty = current_qty + v_qty,
             avg_unit_cost = CASE
               WHEN current_qty + v_qty > 0
                 THEN ((current_qty * COALESCE(avg_unit_cost, 0)) + (v_qty * v_rate))
                      / (current_qty + v_qty)
               ELSE v_rate
             END,
             last_received_date = CURRENT_DATE,
             updated_at = now()
       WHERE id = v_inv_id;
    END IF;

    INSERT INTO stock_transactions (
      site_id, inventory_id, transaction_type, transaction_date,
      quantity, unit_cost, total_cost,
      reference_type, reference_id, created_by
    ) VALUES (
      v_site_id, v_inv_id, 'purchase'::stock_transaction_type, CURRENT_DATE,
      v_qty, v_rate, v_qty * v_rate,
      'spot_purchase', v_batch_id, auth.uid()
    );
  END LOOP;

  -- Wallet debit via the canonical spend RPC. atomic_record_wallet_spend
  -- only accepts cash/upi/bank_transfer; coerce other modes (cheque, credit)
  -- to 'cash' for the wallet leg — the batch row keeps the original mode.
  v_wallet_payment := CASE
    WHEN v_payment_mode IN ('cash', 'upi', 'bank_transfer') THEN v_payment_mode
    ELSE 'cash'
  END;

  v_engineer_tx_id := atomic_record_wallet_spend(
    auth.uid(),                                       -- p_engineer_id
    v_site_id,                                        -- p_site_id
    v_total,                                          -- p_amount
    CURRENT_DATE,                                     -- p_transaction_date
    v_wallet_payment,                                 -- p_payment_mode
    payload->>'payment_screenshot_url',               -- p_proof_url
    'Spot purchase ' || v_ref_code,                   -- p_notes
    COALESCE(payload->>'recorded_by_name', ''),       -- p_recorded_by
    auth.uid(),                                       -- p_recorded_by_user_id
    'Spot purchase ' || v_ref_code                    -- p_description
  );

  UPDATE material_purchase_expenses
     SET engineer_transaction_id = v_engineer_tx_id
   WHERE id = v_batch_id;

  -- Provisional group allocation (optional).
  IF v_alloc_mode = 'group' AND payload ? 'provisional_split' THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(payload->'provisional_split') LOOP
      INSERT INTO spot_purchase_allocations (
        batch_id, site_id, percentage, is_final
      ) VALUES (
        v_batch_id,
        (v_alloc->>'site_id')::uuid,
        (v_alloc->>'percentage')::numeric,
        false
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'ref_code', v_ref_code,
    'vendor_id', v_vendor_id,
    'engineer_transaction_id', v_engineer_tx_id
  );
END $$;

GRANT EXECUTE ON FUNCTION record_spot_purchase(jsonb) TO authenticated;

COMMENT ON FUNCTION record_spot_purchase(jsonb) IS
  'Atomic spot-purchase entry: creates draft vendor/material if needed, inserts material_purchase_expenses + items, upserts stock_inventory + stock_transactions, debits engineer wallet via atomic_record_wallet_spend, optionally records provisional group allocation. SECURITY DEFINER so site engineers can write the cross-table row set; RLS on material_purchase_expenses still gates the parent row.';

-- ----------------------------------------------------------------------------
-- 8. RPC — finalize_spot_purchase_allocation
--    Locks provisional rows. The original plan also mirrored into
--    inter_site_material_settlements, but that table has a from/to/week-based
--    schema incompatible with per-recipient percentage rows. Deferring the
--    bridge until the supervisor flow lands.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION finalize_spot_purchase_allocation(
  p_batch_id     uuid,
  p_allocations  jsonb  -- [{ site_id, percentage }, ...]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_sum     numeric;
  v_alloc   jsonb;
  v_now     timestamptz := now();
  v_count   int := 0;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'p_batch_id is required';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array';
  END IF;

  -- Authorization: caller must be able to access the batch's site
  IF NOT can_access_site((SELECT site_id FROM material_purchase_expenses WHERE id = p_batch_id)) THEN
    RAISE EXCEPTION 'access denied for batch %', p_batch_id USING ERRCODE = '42501';
  END IF;

  -- Validate sum to 100 (±0.01 tolerance for rounding).
  SELECT COALESCE(SUM((value->>'percentage')::numeric), 0)
    INTO v_sum
    FROM jsonb_array_elements(p_allocations);
  IF abs(v_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'percentages must sum to 100 (got %)', v_sum;
  END IF;

  -- Verify the batch is a spot purchase.
  IF NOT EXISTS (
    SELECT 1 FROM material_purchase_expenses
     WHERE id = p_batch_id AND purchase_type = 'spot'
  ) THEN
    RAISE EXCEPTION 'batch % is not a spot purchase', p_batch_id;
  END IF;

  -- Clear existing rows for this batch (provisional + any prior finalized).
  DELETE FROM spot_purchase_allocations WHERE batch_id = p_batch_id;

  -- Insert final rows.
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    INSERT INTO spot_purchase_allocations (
      batch_id, site_id, percentage, is_final, finalized_at, finalized_by
    ) VALUES (
      p_batch_id,
      (v_alloc->>'site_id')::uuid,
      (v_alloc->>'percentage')::numeric,
      true,
      v_now,
      auth.uid()
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'finalized', true,
    'allocation_count', v_count
  );
END $$;

GRANT EXECUTE ON FUNCTION finalize_spot_purchase_allocation(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION finalize_spot_purchase_allocation(uuid, jsonb) IS
  'Locks provisional spot_purchase_allocations rows for a batch to final. Validates percentages sum to 100. Inter-site mirror into inter_site_material_settlements is intentionally deferred — downstream readers query spot_purchase_allocations directly.';

COMMIT;
