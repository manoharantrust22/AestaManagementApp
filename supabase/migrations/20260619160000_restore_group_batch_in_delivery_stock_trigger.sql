-- Fix: group/advance PO installment deliveries land in the WRONG stock batch.
--
-- ROOT CAUSE: update_stock_on_verified_delivery() (AFTER INSERT on delivery_items)
-- lost its GROUP-STOCK BATCH BRANCH. The function was re-emitted three times on
-- 2026-06-18, each from a stale Feb-4 base that never had the branch:
--   1. 20260618140100_stock_prefer_delivery_weight  — dropped group branch + received_qty + enum
--   2. 20260619140000_fix_delivery_stock_transaction_type — restored only the enum
--   3. 20260619150000_restore_delivery_received_qty_increment — restored only received_qty
-- Result: the live body finds/creates stock_inventory by (site, material, brand) with NO
-- batch_code filter. For a group PO, the per-installment stock no longer lands in the PO's
-- own batch — it merges into whatever cement row happens to match first. Confirmed on prod:
-- PO-MP7YYJGX-7EVN's later installments landed in the UNRELATED batch MAT-260613-11C1 instead
-- of its own MAT-260516-7A41, so the Hub's per-batch stock + the inter-site ledger went wrong.
--
-- This RESTORES the group branch from the canonical 20260613150000_fix_group_delivery_stock_upsert
-- (lines 62-178), merged onto the CURRENT live body — i.e. it KEEPS:
--   • the delivery-line weight-preferring logic (COALESCE(NEW.pricing_mode/actual_weight, poi.*)),
--   • the received_qty bump (20260619150000),
--   • the stock_transactions enum invariant ('purchase','delivery',NEW.delivery_id).
-- Only the find/create of the stock_inventory row gains back the batch_code awareness.
--
-- ─── INVARIANT — DO NOT CHANGE WHEN REWRITING THIS FUNCTION ───────────────────────────
-- 1. GROUP BRANCH: when the PO has a group_stock material_purchase_expenses ref_code, the
--    stock_inventory row MUST be matched/created keyed on batch_code = that ref_code, so each
--    advance/group PO accumulates into ONE per-site batch row across installments.
-- 2. NON-GROUP BRANCH: the find/create MUST include "AND batch_code IS NULL" so a plain
--    delivery never merges into a batch-coded group row.
-- 3. The stock_transactions row MUST be transaction_type='purchase', reference_type='delivery',
--    reference_id=NEW.delivery_id (depended on by reverse_stock_on_delivery_item_delete,
--    fn_stock_delivery_items, reverse_delivery).
-- 4. The received_qty bump MUST stay (the mutation's PO-status step + over-receipt guard read it).
-- NEVER re-emit this function from a pre-20260613150000 body — that is exactly what regressed it
-- three times. Copy the CURRENT live body and keep all four invariants above.
-- ──────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_stock_on_verified_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_site_id UUID;
  v_location_id UUID;
  v_delivery_date DATE;
  v_verification_status TEXT;
  v_requires_verification BOOLEAN;
  v_inv_id UUID;
  v_pricing_mode TEXT;
  v_item_weight NUMERIC;
  v_existing_pricing_mode TEXT;
  v_existing_weight NUMERIC;
  v_batch_code TEXT;
  v_po_id UUID;
BEGIN
  -- Get delivery details
  SELECT d.site_id, d.location_id, d.delivery_date, d.verification_status, d.requires_verification
  INTO v_site_id, v_location_id, v_delivery_date, v_verification_status, v_requires_verification
  FROM deliveries d
  WHERE d.id = NEW.delivery_id;

  -- Only update stock if verified OR doesn't require verification
  IF v_verification_status != 'verified' AND v_requires_verification = TRUE THEN
    RETURN NEW;
  END IF;

  -- Prefer the delivery line's own pricing/weight (the bill actual for THIS installment);
  -- fall back to the PO item for legacy rows with no line weight. Always resolve v_po_id here
  -- (needed for the group batch_code lookup) when the line is linked to a PO item.
  v_pricing_mode := COALESCE(NEW.pricing_mode, 'per_piece');
  v_item_weight  := NEW.actual_weight;
  v_po_id := NULL;

  IF NEW.po_item_id IS NOT NULL THEN
    SELECT
      COALESCE(NEW.pricing_mode, poi.pricing_mode, 'per_piece'),
      COALESCE(NEW.actual_weight, poi.actual_weight, poi.calculated_weight),
      poi.po_id
    INTO v_pricing_mode, v_item_weight, v_po_id
    FROM purchase_order_items poi
    WHERE poi.id = NEW.po_item_id;
  END IF;

  -- Group-stock batch code: an advance/group PO has a material_purchase_expenses(group_stock)
  -- ref_code that all its installments share. NULL for ordinary (non-group) deliveries.
  v_batch_code := NULL;
  IF v_po_id IS NOT NULL THEN
    SELECT mpe.ref_code INTO v_batch_code
    FROM material_purchase_expenses mpe
    WHERE mpe.purchase_order_id = v_po_id
      AND mpe.purchase_type = 'group_stock'
    LIMIT 1;
  END IF;

  IF v_batch_code IS NOT NULL THEN
    -- GROUP BRANCH: ONE stock_inventory row per (site, material, brand, batch_code).
    -- Installments all share v_batch_code — find the existing batch row at this site and ADD
    -- to it; create it only on the first installment. (A blind INSERT here would dup-key on the
    -- stock_inventory unique tuple; a batch-blind find would merge into a foreign batch.)
    SELECT id, pricing_mode, total_weight
    INTO v_inv_id, v_existing_pricing_mode, v_existing_weight
    FROM stock_inventory
    WHERE site_id = v_site_id
      AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL))
      AND material_id = NEW.material_id
      AND (brand_id = NEW.brand_id OR (brand_id IS NULL AND NEW.brand_id IS NULL))
      AND batch_code = v_batch_code
    LIMIT 1;

    IF v_inv_id IS NULL THEN
      INSERT INTO stock_inventory (
        site_id, location_id, material_id, brand_id,
        current_qty, avg_unit_cost, last_received_date,
        pricing_mode, total_weight, batch_code
      ) VALUES (
        v_site_id, v_location_id, NEW.material_id, NEW.brand_id,
        COALESCE(NEW.accepted_qty, NEW.received_qty),
        COALESCE(NEW.unit_price, 0),
        v_delivery_date,
        v_pricing_mode,
        v_item_weight,
        v_batch_code
      )
      RETURNING id INTO v_inv_id;
    ELSE
      UPDATE stock_inventory
      SET
        current_qty = current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty),
        avg_unit_cost = CASE
          WHEN current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty) > 0 THEN
            ((current_qty * COALESCE(avg_unit_cost, 0)) +
             (COALESCE(NEW.accepted_qty, NEW.received_qty) * COALESCE(NEW.unit_price, 0)))
            / (current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty))
          ELSE 0
        END,
        last_received_date = v_delivery_date,
        updated_at = NOW(),
        pricing_mode = CASE
          WHEN v_pricing_mode = 'per_kg' OR v_existing_pricing_mode = 'per_kg' THEN 'per_kg'
          ELSE 'per_piece'
        END,
        total_weight = CASE
          WHEN v_pricing_mode = 'per_kg' OR v_existing_pricing_mode = 'per_kg' THEN
            COALESCE(v_existing_weight, 0) + COALESCE(v_item_weight, 0)
          ELSE NULL
        END
      WHERE id = v_inv_id;
    END IF;
  ELSE
    -- NON-GROUP BRANCH: ordinary pooled stock. "AND batch_code IS NULL" keeps it from merging
    -- into a batch-coded group row.
    SELECT id, pricing_mode, total_weight
    INTO v_inv_id, v_existing_pricing_mode, v_existing_weight
    FROM stock_inventory
    WHERE site_id = v_site_id
      AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL))
      AND material_id = NEW.material_id
      AND (brand_id = NEW.brand_id OR (brand_id IS NULL AND NEW.brand_id IS NULL))
      AND batch_code IS NULL
    LIMIT 1;

    IF v_inv_id IS NULL THEN
      INSERT INTO stock_inventory (
        site_id, location_id, material_id, brand_id,
        current_qty, avg_unit_cost, last_received_date,
        pricing_mode, total_weight
      ) VALUES (
        v_site_id, v_location_id, NEW.material_id, NEW.brand_id,
        COALESCE(NEW.accepted_qty, NEW.received_qty),
        COALESCE(NEW.unit_price, 0),
        v_delivery_date,
        v_pricing_mode,
        v_item_weight
      )
      RETURNING id INTO v_inv_id;
    ELSE
      UPDATE stock_inventory
      SET
        current_qty = current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty),
        avg_unit_cost = CASE
          WHEN current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty) > 0 THEN
            ((current_qty * COALESCE(avg_unit_cost, 0)) +
             (COALESCE(NEW.accepted_qty, NEW.received_qty) * COALESCE(NEW.unit_price, 0)))
            / (current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty))
          ELSE 0
        END,
        last_received_date = v_delivery_date,
        updated_at = NOW(),
        pricing_mode = CASE
          WHEN v_pricing_mode = 'per_kg' OR v_existing_pricing_mode = 'per_kg' THEN 'per_kg'
          ELSE 'per_piece'
        END,
        total_weight = CASE
          WHEN v_pricing_mode = 'per_kg' OR v_existing_pricing_mode = 'per_kg' THEN
            COALESCE(v_existing_weight, 0) + COALESCE(v_item_weight, 0)
          ELSE NULL
        END
      WHERE id = v_inv_id;
    END IF;
  END IF;

  -- Create stock transaction.
  -- INVARIANT (see header): transaction_type='purchase', reference_type='delivery',
  -- reference_id=NEW.delivery_id. Required by reverse_stock_on_delivery_item_delete,
  -- fn_stock_delivery_items, and reverse_delivery.
  INSERT INTO stock_transactions (
    site_id, inventory_id, transaction_type, transaction_date,
    quantity, unit_cost, total_cost, reference_type, reference_id
  ) VALUES (
    v_site_id, v_inv_id, 'purchase', v_delivery_date,
    COALESCE(NEW.accepted_qty, NEW.received_qty),
    COALESCE(NEW.unit_price, 0),
    COALESCE(NEW.accepted_qty, NEW.received_qty) * COALESCE(NEW.unit_price, 0),
    'delivery', NEW.delivery_id
  );

  -- Bump the PO line's received qty. The record-and-verify mutation, the over-receipt guard,
  -- and the PO-status advance ALL read purchase_order_items.received_qty.
  IF NEW.po_item_id IS NOT NULL THEN
    UPDATE purchase_order_items
    SET received_qty = received_qty + COALESCE(NEW.accepted_qty, NEW.received_qty)
    WHERE id = NEW.po_item_id;
  END IF;

  RETURN NEW;
END;
$function$;
