-- One-shot multi-site usage against a SINGLE group-stock batch.
--
-- WHY: the Material Hub "Log usage" dialog (This batch scope) needs to record a
-- per-site split in one go — e.g. a 50-bag Chettinad batch where Srinivasan used
-- 30 and Padmavathy used 20. record_batch_usage_waterfall takes a SINGLE
-- consuming site + many batches; this is the mirror: a SINGLE batch + many
-- consuming sites. Recording each site separately is non-atomic and clumsy.
--
-- This is a THIN, INSERT-ONLY wrapper that loops the entries and calls the
-- existing, well-tested record_batch_usage_waterfall once per site (single-batch
-- allocation each). Because it is one plpgsql function with no exception handler,
-- any per-site failure (oversubscribed remaining, non-member site) RAISEs and
-- rolls back the WHOLE call — all-or-nothing, with nothing partially written.
-- The inner function re-reads each variant's remaining INSIDE the transaction, so
-- the cumulative total across sites is naturally capped at the batch's remaining
-- (Srini 30 then Padma 20 → second call sees 20 left → fits; a 60 total aborts).
--
-- INVOKER rights (NOT security definer) — identical to record_batch_usage_waterfall,
-- which the dialog already uses to record another cluster site's consumption today
-- (cluster RLS permits it). No privilege escalation, and the delete/refill class of
-- bug that wiped PPC usage is impossible here (this only INSERTs).

DROP FUNCTION IF EXISTS public.record_batch_usage_multi_site(
  text, uuid, uuid, date, text, uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.record_batch_usage_multi_site(
  p_batch_ref_code text,
  p_material_id uuid,
  p_brand_id uuid,
  p_usage_date date,
  p_work_description text DEFAULT NULL::text,
  p_section_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid,
  p_entries jsonb DEFAULT '[]'::jsonb  -- [{ usage_site_id, quantity }]
)
RETURNS uuid[]
LANGUAGE plpgsql
AS $function$
DECLARE
  v_entry jsonb;
  v_site uuid;
  v_qty numeric;
  v_sub uuid[];
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array'
     OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'No site entries provided';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_site := (v_entry->>'usage_site_id')::uuid;
    v_qty  := (v_entry->>'quantity')::numeric;

    IF v_site IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;  -- skip blank / zero rows
    END IF;

    -- Reuse the tested per-site engine; single-batch allocation per call. Any
    -- RAISE here aborts the whole multi-site submit (no partial writes).
    v_sub := public.record_batch_usage_waterfall(
      v_site,
      p_material_id,
      p_brand_id,
      p_usage_date,
      p_work_description,
      p_created_by,
      jsonb_build_array(
        jsonb_build_object('batch_ref_code', p_batch_ref_code, 'quantity', v_qty)
      ),
      p_section_id
    );
    v_ids := v_ids || v_sub;
  END LOOP;

  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No usable site entries (every quantity was zero)';
  END IF;

  RETURN v_ids;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_batch_usage_multi_site(
  text, uuid, uuid, date, text, uuid, uuid, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.record_batch_usage_multi_site(
  text, uuid, uuid, date, text, uuid, uuid, jsonb
) IS
'Atomic, insert-only per-site usage split against ONE group-stock batch. Loops
p_entries [{usage_site_id, quantity}] and reuses record_batch_usage_waterfall per
site; all-or-nothing. Powers the Hub "This batch" log-usage dialog.';
