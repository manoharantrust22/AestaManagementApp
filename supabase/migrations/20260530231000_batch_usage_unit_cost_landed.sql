-- =====================================================
-- Inter-site usage / settlement amount = usage% × actual amount paid
-- =====================================================
-- Problem: each batch_usage_records.unit_cost was stored from the item-line
-- unit_price, which EXCLUDES transport/loading that ends up only in
-- material_purchase_expenses.amount_paid. A one-shot trigger
-- (adjust_batch_costs_on_payment) was meant to scale costs to the real paid
-- amount, but it only fired when amount_paid *changed* on an UPDATE — so any
-- usage recorded AFTER payment never got scaled and stayed on the item basis
-- (e.g. batch MAT-260303-A895 showed ₹11,400 instead of the ₹12,900 actually
-- paid). The Hub RPC and the inter-site settlement math both sum total_cost,
-- so they all under-report by the transport/extra delta.
--
-- Fix (canonical, transport-inclusive, usage-proportional):
--   items_total(b)  = SUM(material_purchase_expense_items.total_price)
--   final_payment(b)= COALESCE(b.amount_paid, b.total_amount)   -- real cash out
--   ratio(b)        = final_payment / NULLIF(items_total, 0)
--   unit_cost(r)    = variant.unit_price * ratio(b)             -- normal path
--                   = final_payment / NULLIF(original_qty, 0)   -- fallback
-- This preserves multi-variant proportions while absorbing the batch-level
-- transport/bargain delta. total_cost (GENERATED = quantity*unit_cost) follows.

-- =====================================================
-- 1. record_batch_usage: scale unit_cost to the actual paid amount at INSERT
--    (so usage-after-payment is correct without depending on a later trigger).
--    Supersedes 20260525120000_record_batch_usage_variant_aware.sql; only the
--    unit_cost derivation changes.
-- =====================================================

CREATE OR REPLACE FUNCTION record_batch_usage(
  p_batch_ref_code TEXT,
  p_usage_site_id UUID,
  p_material_id UUID,
  p_brand_id UUID,
  p_quantity NUMERIC,
  p_usage_date DATE,
  p_work_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_batch RECORD;
  v_variant_item RECORD;
  v_variant_used NUMERIC;
  v_variant_remaining NUMERIC;
  v_is_self_use BOOLEAN;
  v_settlement_status TEXT;
  v_usage_id UUID;
  v_unit_cost NUMERIC;
  v_unit TEXT;
  v_items_total NUMERIC;
  v_items_qty NUMERIC;
  v_final_payment NUMERIC;
BEGIN
  -- Get batch details
  SELECT mpe.*
  INTO v_batch
  FROM material_purchase_expenses mpe
  WHERE mpe.ref_code = p_batch_ref_code
    AND mpe.purchase_type = 'group_stock';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found: %', p_batch_ref_code;
  END IF;

  IF v_batch.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot add usage to completed batch: %', p_batch_ref_code;
  END IF;

  -- Validate variant belongs to this batch & fetch its row + unit
  SELECT mpei.*, m.unit AS material_unit
  INTO v_variant_item
  FROM material_purchase_expense_items mpei
  JOIN materials m ON m.id = mpei.material_id
  WHERE mpei.purchase_expense_id = v_batch.id
    AND mpei.material_id = p_material_id
    AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant (material=%, brand=%) not in batch %',
      p_material_id, p_brand_id, p_batch_ref_code;
  END IF;

  -- Sum prior usage on the SAME variant (not the whole batch)
  SELECT COALESCE(SUM(bur.quantity), 0)
  INTO v_variant_used
  FROM batch_usage_records bur
  WHERE bur.batch_ref_code = p_batch_ref_code
    AND bur.material_id = p_material_id
    AND COALESCE(bur.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_variant_remaining := v_variant_item.quantity - v_variant_used;

  IF v_variant_remaining < p_quantity THEN
    RAISE EXCEPTION 'Insufficient variant qty in batch %. Variant available: %, Requested: %',
      p_batch_ref_code, v_variant_remaining, p_quantity;
  END IF;

  -- Landed unit cost: scale the variant's item-line price up/down to the actual
  -- amount paid for the whole batch (which includes transport/loading), keeping
  -- per-variant proportions. Falls back to a flat per-unit split if item lines
  -- are missing.
  SELECT SUM(mpei.total_price), SUM(mpei.quantity)
  INTO v_items_total, v_items_qty
  FROM material_purchase_expense_items mpei
  WHERE mpei.purchase_expense_id = v_batch.id;

  v_final_payment := COALESCE(v_batch.amount_paid, v_batch.total_amount);

  IF COALESCE(v_items_total, 0) > 0 AND v_variant_item.unit_price IS NOT NULL THEN
    v_unit_cost := v_variant_item.unit_price * (v_final_payment / v_items_total);
  ELSE
    v_unit_cost := v_final_payment
      / NULLIF(COALESCE(v_batch.original_qty, v_items_qty), 0);
  END IF;

  v_unit := COALESCE(v_variant_item.material_unit, 'nos');

  -- Determine self-use
  v_is_self_use := (p_usage_site_id = v_batch.paying_site_id);
  v_settlement_status := CASE WHEN v_is_self_use THEN 'self_use' ELSE 'pending' END;

  -- Insert usage record tagged with the correct variant
  INSERT INTO batch_usage_records (
    batch_ref_code,
    site_group_id,
    usage_site_id,
    material_id,
    brand_id,
    quantity,
    unit,
    unit_cost,
    usage_date,
    work_description,
    is_self_use,
    settlement_status,
    created_by
  ) VALUES (
    p_batch_ref_code,
    v_batch.site_group_id,
    p_usage_site_id,
    p_material_id,
    p_brand_id,
    p_quantity,
    v_unit,
    v_unit_cost,
    p_usage_date,
    p_work_description,
    v_is_self_use,
    v_settlement_status,
    p_created_by
  )
  RETURNING id INTO v_usage_id;

  -- Update batch-level aggregates (these remain whole-batch totals)
  UPDATE material_purchase_expenses
  SET
    used_qty = COALESCE(used_qty, 0) + p_quantity,
    remaining_qty = COALESCE(remaining_qty,
      original_qty,
      (SELECT SUM(quantity) FROM material_purchase_expense_items WHERE purchase_expense_id = material_purchase_expenses.id)
    ) - p_quantity,
    self_used_qty = CASE WHEN v_is_self_use THEN COALESCE(self_used_qty, 0) + p_quantity ELSE self_used_qty END,
    self_used_amount = CASE WHEN v_is_self_use THEN COALESCE(self_used_amount, 0) + (p_quantity * v_unit_cost) ELSE self_used_amount END,
    status = CASE
      WHEN COALESCE(remaining_qty, original_qty, 0) - p_quantity <= 0 THEN 'partial_used'
      ELSE status
    END,
    updated_at = now()
  WHERE ref_code = p_batch_ref_code;

  RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_batch_usage(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID) IS
'Records per-variant usage against a group-stock batch. unit_cost is the
landed cost: the variant item-line price scaled to COALESCE(amount_paid,
total_amount) (the real cash out, incl. transport), preserving multi-variant
proportions. Supersedes 20260525120000 which stored the bare item-line price.';

-- =====================================================
-- 2. adjust_batch_costs_on_payment: RESET usage costs to the canonical landed
--    basis whenever payment fields change (idempotent — fixes usage recorded
--    before OR after the payment). Replaces the fragile multiply-by-ratio body.
-- =====================================================

CREATE OR REPLACE FUNCTION adjust_batch_costs_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_items_total NUMERIC;
  v_items_qty NUMERIC;
  v_orig_qty NUMERIC;
  v_final_payment NUMERIC;
BEGIN
  -- Only recompute when a payment-relevant field actually changed; avoids
  -- write amplification (and any re-entry) on unrelated expense updates such
  -- as used_qty / status churn from record_batch_usage.
  IF NEW.amount_paid IS NOT DISTINCT FROM OLD.amount_paid
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.is_paid IS NOT DISTINCT FROM OLD.is_paid THEN
    RETURN NEW;
  END IF;

  SELECT SUM(mpei.total_price), SUM(mpei.quantity)
  INTO v_items_total, v_items_qty
  FROM material_purchase_expense_items mpei
  WHERE mpei.purchase_expense_id = NEW.id;

  v_final_payment := COALESCE(NEW.amount_paid, NEW.total_amount);
  v_orig_qty := COALESCE(NEW.original_qty, v_items_qty);

  -- Re-derive every usage row's unit_cost from the variant item-line price
  -- (correlated lookup; avg fallback for any row whose variant item is absent),
  -- scaled to the actual amount paid. total_cost is GENERATED, so it follows.
  UPDATE batch_usage_records bur
  SET
    unit_cost = CASE
      WHEN COALESCE(v_items_total, 0) > 0 THEN
        COALESCE(
          (SELECT mpei.unit_price
             FROM material_purchase_expense_items mpei
            WHERE mpei.purchase_expense_id = NEW.id
              AND mpei.material_id = bur.material_id
              AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  = COALESCE(bur.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
            LIMIT 1),
          v_items_total / NULLIF(v_orig_qty, 0)
        ) * (v_final_payment / v_items_total)
      ELSE v_final_payment / NULLIF(v_orig_qty, 0)
    END,
    updated_at = NOW()
  WHERE bur.batch_ref_code = NEW.ref_code;

  -- Mirror onto the legacy group_stock_transactions usage rows (its total_cost
  -- is a stored, non-generated column — keep both in sync so the transaction
  -- history view matches). Not a source of truth for balances.
  UPDATE group_stock_transactions gst
  SET
    unit_cost = CASE
      WHEN COALESCE(v_items_total, 0) > 0 THEN
        COALESCE(
          (SELECT mpei.unit_price
             FROM material_purchase_expense_items mpei
            WHERE mpei.purchase_expense_id = NEW.id
              AND mpei.material_id = gst.material_id
              AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  = COALESCE(gst.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
            LIMIT 1),
          v_items_total / NULLIF(v_orig_qty, 0)
        ) * (v_final_payment / v_items_total)
      ELSE v_final_payment / NULLIF(v_orig_qty, 0)
    END,
    updated_at = NOW()
  WHERE gst.batch_ref_code = NEW.ref_code
    AND gst.transaction_type = 'usage';

  UPDATE group_stock_transactions
  SET total_cost = quantity * unit_cost
  WHERE batch_ref_code = NEW.ref_code
    AND transaction_type = 'usage';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION adjust_batch_costs_on_payment() IS
'Resets batch_usage_records (and legacy group_stock_transactions) usage costs to
the canonical landed basis — variant item-line price scaled to
COALESCE(amount_paid, total_amount) — whenever a payment-relevant field changes.
Idempotent; supersedes the multiply-by-ratio body from 20260124100000 that
missed usage recorded after payment.';

-- Recreate the trigger so it passes OLD into the function (no WHEN filter — the
-- function self-guards via IS DISTINCT FROM so it also fires when amount_paid
-- transitions from NULL).
DROP TRIGGER IF EXISTS trigger_adjust_batch_costs_on_payment ON material_purchase_expenses;

CREATE TRIGGER trigger_adjust_batch_costs_on_payment
AFTER UPDATE ON material_purchase_expenses
FOR EACH ROW
EXECUTE FUNCTION adjust_batch_costs_on_payment();

-- =====================================================
-- 3. get_batch_settlement_summary: return the actual paid amount as the batch
--    header total so it matches the (now landed) per-site allocations that sum
--    from total_cost. Per-site amount still = SUM(total_cost) — single source
--    of truth, correct after the backfill in the next migration.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_batch_settlement_summary(p_batch_ref_code TEXT)
RETURNS TABLE (
  batch_ref_code TEXT,
  paying_site_id UUID,
  paying_site_name TEXT,
  total_amount NUMERIC,
  original_qty NUMERIC,
  used_qty NUMERIC,
  remaining_qty NUMERIC,
  site_allocations JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mpe.ref_code,
    mpe.paying_site_id,
    ps.name::text AS paying_site_name,
    COALESCE(mpe.amount_paid, mpe.total_amount) AS total_amount,
    COALESCE(mpe.original_qty, (SELECT SUM(quantity) FROM material_purchase_expense_items WHERE purchase_expense_id = mpe.id)),
    COALESCE(mpe.used_qty, 0),
    COALESCE(mpe.remaining_qty, mpe.original_qty, (SELECT SUM(quantity) FROM material_purchase_expense_items WHERE purchase_expense_id = mpe.id)),
    COALESCE(
      (
        SELECT jsonb_agg(site_data ORDER BY is_payer DESC, site_name)
        FROM (
          SELECT
            bur.usage_site_id as site_id,
            s.name as site_name,
            SUM(bur.quantity) as quantity_used,
            SUM(bur.total_cost) as amount,
            bur.is_self_use as is_payer,
            MAX(bur.settlement_status) as settlement_status
          FROM batch_usage_records bur
          JOIN sites s ON s.id = bur.usage_site_id
          WHERE bur.batch_ref_code = mpe.ref_code
          GROUP BY bur.usage_site_id, s.name, bur.is_self_use
        ) site_data
      ),
      '[]'::JSONB
    )
  FROM material_purchase_expenses mpe
  LEFT JOIN sites ps ON ps.id = mpe.paying_site_id
  WHERE mpe.ref_code = p_batch_ref_code
    AND mpe.purchase_type = 'group_stock';
END;
$$ LANGUAGE plpgsql;
