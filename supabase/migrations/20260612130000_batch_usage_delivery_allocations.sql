-- Exact per-GRN usage tracking (Hub round 3, Wave B).
--
-- Usage is recorded against a batch (batch_usage_records.batch_ref_code) and
-- decrements one stock_inventory row — there is no link from a usage event to
-- the delivery (GRN) it drew from. This adds a persisted allocation: each usage
-- record is split across the batch's deliveries at the usage site, oldest first
-- (FIFO), so the Hub can show "used X / received Y" per delivery and the numbers
-- reconcile to each site's total. The DB can't know which physical bags were
-- poured; FIFO oldest-delivery-first is the attribution rule, persisted at write
-- time so it is stable and auditable rather than a volatile display estimate.
--
-- Wiring is an AFTER trigger on batch_usage_records (not edits to the much-
-- revised usage RPCs) so every path — record_batch_usage, the waterfall, and
-- reassign_batch_usage's UPDATE — maintains allocations uniformly. Deletes
-- cascade via the FK.

CREATE TABLE IF NOT EXISTS public.batch_usage_delivery_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_record_id uuid NOT NULL REFERENCES public.batch_usage_records(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buda_usage_record ON public.batch_usage_delivery_allocations(usage_record_id);
CREATE INDEX IF NOT EXISTS idx_buda_delivery ON public.batch_usage_delivery_allocations(delivery_id);

-- Derived, non-sensitive rows. Reads are already gated by the batch_usage_records
-- the caller can see; writes only ever happen via the SECURITY DEFINER function
-- below (which bypasses RLS), so a read-only policy is all that's needed.
ALTER TABLE public.batch_usage_delivery_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buda_select ON public.batch_usage_delivery_allocations;
CREATE POLICY buda_select ON public.batch_usage_delivery_allocations
  FOR SELECT USING (true);
GRANT SELECT ON public.batch_usage_delivery_allocations TO authenticated;

-- ----------------------------------------------------------------------------
-- allocate_usage_to_deliveries: (re)build one usage record's FIFO split.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_usage_to_deliveries(
  p_usage_id uuid,
  p_batch_ref text,
  p_usage_site_id uuid,
  p_material_id uuid,
  p_brand_id uuid,
  p_qty numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_po_id uuid;
  v_remaining numeric := p_qty;
  v_del RECORD;
  v_delivered numeric;
  v_already numeric;
  v_cap numeric;
  v_alloc numeric;
BEGIN
  -- Re-runnable: clear this record's prior split first.
  DELETE FROM batch_usage_delivery_allocations WHERE usage_record_id = p_usage_id;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;

  -- Only group-stock batches have PO deliveries to attribute to.
  SELECT mpe.purchase_order_id INTO v_po_id
  FROM material_purchase_expenses mpe
  WHERE mpe.ref_code = p_batch_ref
    AND mpe.purchase_type = 'group_stock'
  LIMIT 1;

  IF v_po_id IS NULL THEN
    RETURN;
  END IF;

  -- This PO's verified deliveries of this material at the usage site, oldest
  -- first, with the delivered qty per delivery.
  FOR v_del IN
    SELECT d.id AS delivery_id,
           SUM(COALESCE(di.accepted_qty, di.received_qty)) AS delivered
    FROM deliveries d
    JOIN delivery_items di ON di.delivery_id = d.id
    WHERE d.po_id = v_po_id
      AND d.site_id = p_usage_site_id
      AND di.material_id = p_material_id
      AND (d.verification_status = 'verified' OR d.requires_verification = false)
    GROUP BY d.id, d.delivery_date, d.created_at
    ORDER BY d.delivery_date, d.created_at
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_delivered := COALESCE(v_del.delivered, 0);

    -- Capacity = delivered − already allocated for THIS material on THIS
    -- delivery (across every usage record; this record's own rows were just
    -- deleted, so they never double-count).
    SELECT COALESCE(SUM(a.quantity), 0) INTO v_already
    FROM batch_usage_delivery_allocations a
    JOIN batch_usage_records bur ON bur.id = a.usage_record_id
    WHERE a.delivery_id = v_del.delivery_id
      AND bur.material_id = p_material_id;

    v_cap := v_delivered - v_already;
    IF v_cap <= 0 THEN
      CONTINUE;
    END IF;

    v_alloc := LEAST(v_remaining, v_cap);
    INSERT INTO batch_usage_delivery_allocations (usage_record_id, delivery_id, quantity)
    VALUES (p_usage_id, v_del.delivery_id, v_alloc);

    v_remaining := v_remaining - v_alloc;
  END LOOP;
  -- Any leftover (usage exceeding delivered, e.g. own-stock entries) stays
  -- unallocated — the per-GRN bars then sum to less than the total used, which
  -- is the honest signal.
END;
$function$;

-- ----------------------------------------------------------------------------
-- Trigger: keep allocations in sync on every insert / relevant update.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_allocate_batch_usage()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM allocate_usage_to_deliveries(
    NEW.id, NEW.batch_ref_code, NEW.usage_site_id,
    NEW.material_id, NEW.brand_id, NEW.quantity
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_allocate_batch_usage ON public.batch_usage_records;
CREATE TRIGGER trg_allocate_batch_usage
AFTER INSERT OR UPDATE OF usage_site_id, quantity, material_id, brand_id, batch_ref_code
ON public.batch_usage_records
FOR EACH ROW
EXECUTE FUNCTION trg_allocate_batch_usage();

-- ----------------------------------------------------------------------------
-- Backfill: replay chronologically so FIFO capacity depletes in record order.
-- ----------------------------------------------------------------------------
TRUNCATE public.batch_usage_delivery_allocations;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, batch_ref_code, usage_site_id, material_id, brand_id, quantity
    FROM batch_usage_records
    ORDER BY created_at, id
  LOOP
    PERFORM allocate_usage_to_deliveries(
      r.id, r.batch_ref_code, r.usage_site_id, r.material_id, r.brand_id, r.quantity
    );
  END LOOP;
END $$;
