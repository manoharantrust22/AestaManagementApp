-- Fix record_historical_batch — the Backfill flow could never save a record.
--
-- Two independent bugs sat in the same INSERT, so no back-dated record has ever
-- been written since the feature shipped (20260524120000): zero is_historical
-- rows exist. The RPC is atomic, so the first failure rolled back everything.
--
-- 1. source = 'historical_backfill' violated price_history_source_check, which
--    allows only ('purchase','enquiry','quotation','bill','manual').
--    vendor_inventory_price_source_check constrains the same five values, so
--    widening the constraint would have meant two schema changes AND would have
--    hidden backfilled prices from the readers that filter source = 'purchase'
--    (useVendorMaterialPrice's "last paid price") — defeating the original
--    intent of "so vendor price trends include historical data". A backfill IS a
--    real purchase, so it records as one; the HIST- ref_code in source_reference
--    still carries the provenance. This mirrors record_spot_purchase, which hit
--    this same trap and resolved it the same way.
--
-- 2. auth.uid() was passed for every *_by column, but public.users.id and
--    auth.users.id are disjoint id spaces in this database. The tables disagree
--    on which they reference, so the RPC must use both, correctly:
--      price_history.recorded_by   → public.users(id)  ⇒ v_public_user_id
--      vendors.created_by          → public.users(id)  ⇒ v_public_user_id
--      materials.created_by        → public.users(id)  ⇒ v_public_user_id
--      material_purchase_expenses.created_by    → auth.users(id) ⇒ auth.uid()
--      spot_purchase_allocations.finalized_by   → auth.users(id) ⇒ auth.uid()
--
-- Price dating: record_price_entry hardcodes recorded_date = CURRENT_DATE and
-- unconditionally overwrites vendor_inventory.current_price. For a back-dated
-- buy that is wrong — a May purchase would post as today's price and become the
-- vendor's "last paid price", dragging future auto-fills backwards across a
-- six-month bulk backfill. This is the same class of corruption the original
-- migration already refused for the wallet and stock ledgers. So the price rows
-- are written inline here, dated at the purchase date, and the vendor's current
-- price is only refreshed when the backfilled buy is genuinely newer than what
-- is already on record. record_price_entry is left untouched — a live trigger on
-- purchase_order_items depends on it.
--
-- vendor_inventory is matched with an explicit brand_id IS NULL lookup rather
-- than ON CONFLICT (vendor_id, material_id, brand_id): that unique index treats
-- NULL brands as distinct, so ON CONFLICT never fires for brandless rows and
-- silently accumulates duplicates (27 such groups already exist in prod).

BEGIN;

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
  v_public_user_id       uuid;
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
  v_transport_cost       numeric;
  v_items_sum            numeric;
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

  -- Caller's PUBLIC user id. vendors/materials/price_history reference
  -- public.users(id); auth.uid() is the auth id and FK-fails there.
  SELECT id INTO v_public_user_id FROM users WHERE auth_id = auth.uid();
  IF v_public_user_id IS NULL THEN
    RAISE EXCEPTION 'No public user profile for the current auth user; cannot record historical entries';
  END IF;

  SELECT site_group_id INTO v_site_group_id FROM sites WHERE id = v_site_id;

  -- Process each record (the entire FOR loop is one transaction — any
  -- RAISE EXCEPTION rolls back all prior records in the batch).
  FOR v_record IN SELECT * FROM jsonb_array_elements(v_records) LOOP
    v_record_count := v_record_count + 1;

    -- Extract + validate required fields
    v_purchase_date  := (v_record->>'purchase_date')::date;
    v_kind           := COALESCE(v_record->>'kind', 'own');
    v_payment_status := COALESCE(v_record->>'payment_status', 'settled');
    v_paid_by        := v_record->>'paid_by';
    v_used_qty_total := COALESCE((v_record->>'used_qty')::numeric, 0);

    -- Transport + derived items sum → robust grand total.
    v_transport_cost := COALESCE((v_record->>'transport_cost')::numeric, 0);
    SELECT COALESCE(SUM((it->>'amount')::numeric), 0)
      INTO v_items_sum
      FROM jsonb_array_elements(v_record->'items') it;

    -- Honour client-sent grand total (override or derived); fall back to sum.
    v_total_amount := COALESCE(
      (v_record->>'amount')::numeric,
      v_items_sum + v_transport_cost
    );

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
        v_public_user_id,
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

    -- Insert the expense row (created_by references auth.users here)
    INSERT INTO material_purchase_expenses (
      site_id, ref_code, purchase_type, vendor_id, vendor_name, purchase_date,
      total_amount, transport_cost, payment_mode, is_paid, paid_date, status,
      payment_channel, site_group_id, notes, created_by, is_historical,
      used_qty_at_entry
    ) VALUES (
      v_site_id,
      v_ref_code,
      v_purchase_type,
      v_vendor_id,
      v_record->'vendor'->>'name',
      v_purchase_date,
      v_total_amount,
      v_transport_cost,
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
          v_public_user_id,
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

      -- Price history, dated at the purchase date so trends place it correctly
      -- rather than posting a months-old rate as today's price.
      INSERT INTO price_history (
        vendor_id, material_id, brand_id,
        price, price_includes_gst, total_landed_cost,
        recorded_date, source, source_reference,
        quantity, recorded_by
      ) VALUES (
        v_vendor_id, v_material_id, NULL,
        v_rate, false, v_rate,
        v_purchase_date,
        'purchase',
        v_ref_code,
        v_qty, v_public_user_id
      );

      -- Vendor's current price: seed it when absent, but never let a back-dated
      -- buy overwrite a fresher price.
      IF EXISTS (
        SELECT 1 FROM vendor_inventory
        WHERE vendor_id = v_vendor_id AND material_id = v_material_id AND brand_id IS NULL
      ) THEN
        UPDATE vendor_inventory
           SET current_price      = v_rate,
               price_includes_gst = false,
               last_price_update  = v_purchase_date::timestamptz,
               price_source       = 'purchase',
               updated_at         = now()
         WHERE vendor_id = v_vendor_id
           AND material_id = v_material_id
           AND brand_id IS NULL
           AND (last_price_update IS NULL
                OR last_price_update < v_purchase_date::timestamptz);
      ELSE
        INSERT INTO vendor_inventory (
          vendor_id, material_id, brand_id, current_price, price_includes_gst,
          last_price_update, price_source
        ) VALUES (
          v_vendor_id, v_material_id, NULL, v_rate, false,
          v_purchase_date::timestamptz, 'purchase'
        );
      END IF;
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
  'Atomic back-dated material entry. Accepts {site_id, records:[...]} where each record collapses the request/PO/delivery/settle chain into one row tagged is_historical=true. Office/admin only. Date range: 2025-11-09 to 2026-05-09. For kind=group, inserts spot_purchase_allocations with is_final=true. Writes price_history dated at the purchase date with source=''purchase'' (provenance via the HIST- source_reference); refreshes vendor_inventory.current_price only when the back-dated buy is newer than the stored price. Does NOT touch engineer wallet (payment_channel is informational). Does NOT write stock_inventory / stock_transactions (back-dated inventory would corrupt today''s running totals). Returns {batch_ids, drafts_created:{vendors,materials}, count}.';

COMMIT;
